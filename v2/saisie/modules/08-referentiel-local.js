/* PRISME — widget de saisie, module 08/31 : Référentiel des établissements conservé dans le navigateur.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Référentiel conservé dans le navigateur ----------
   La lecture complète du référentiel peut prendre plusieurs secondes au serveur : chaque navigateur le garde
   24 heures (IndexedDB) et ne le relit qu'ensuite, ou quand un établissement inconnu apparaît (créé par un
   collègue), ou avant la création d'un établissement, ou sur demande (⚙ › « Relire le référentiel »).
   Les colonnes de clé et de lien d'accès ne sont jamais conservées : elles sont lues à la demande, pour
   l'établissement affiché. Jamais utilisé en accès par lien d'établissement (une seule ligne visible). */
const DUREE_CACHE_REFERENTIEL = 24 * 3600 * 1000;
function ouvrirBaseCache() {
  return new Promise((ok, ko) => {
    if (!window.indexedDB) return ko(new Error("IndexedDB indisponible"));
    const r = indexedDB.open("signalements-grist", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("referentiels");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function cleCacheReferentiel() {
  let doc = "";
  try {
    if (grist.docApi.getAccessToken)
      doc = ((await grist.docApi.getAccessToken({ readOnly: true })).baseUrl || "").replace(/^https?:\/\//, "");
  } catch (_) {}
  if (!doc)
    try {
      doc = await grist.docApi.getDocName();
    } catch (_) {}
  return doc ? `${doc}|${ETAB.table}` : null;
}
async function lireCacheReferentiel() {
  try {
    const cle = await cleCacheReferentiel();
    if (!cle) return null;
    const db = await ouvrirBaseCache();
    const v = await new Promise((ok, ko) => {
      const r = db.transaction("referentiels").objectStore("referentiels").get(cle);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    db.close();
    return v && v.table && Date.now() - v.t < DUREE_CACHE_REFERENTIEL ? v : null;
  } catch (_) {
    return null;
  }
}
async function ecrireCacheReferentiel(t, sensibles) {
  try {
    const cle = await cleCacheReferentiel();
    if (!cle) return;
    const copie = {};
    for (const [c, v] of Object.entries(t)) copie[c] = sensibles.includes(c) ? v.map(() => null) : v;
    const db = await ouvrirBaseCache();
    await new Promise((ok, ko) => {
      const tx = db.transaction("referentiels", "readwrite");
      tx.objectStore("referentiels").put({ t: Date.now(), table: copie, sensibles }, cle);
      tx.oncomplete = ok;
      tx.onerror = () => ko(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("Référentiel non conservé dans le navigateur", e);
  }
}
// La copie du navigateur n'est reprise que si elle correspond encore à ce que ce compte peut lire :
// au moins deux lignes visibles (pas d'accès par lien d'établissement, qui ne voit que la sienne)
// et aucune colonne apparue depuis (ex. UUID et Lien ajoutés par la mise en place des liens).
async function copieEncoreValable(copie) {
  try {
    if (!grist.docApi.getAccessToken) return true;
    const j = await grist.docApi.getAccessToken({ readOnly: true });
    const r = await fetch(
      `${j.baseUrl}/tables/${encodeURIComponent(ETAB.table)}/records?limit=2&auth=${encodeURIComponent(j.token)}`,
    );
    if (!r.ok) return false;
    const recs = (await r.json()).records || [];
    if (recs.length < 2) return false;
    const cols = new Set(Object.keys(copie.table || {}));
    return recs.every((x) => Object.keys(x.fields || {}).every((k) => cols.has(k)));
  } catch (_) {
    return false;
  }
}
async function oublierCacheReferentiel() {
  try {
    const cle = await cleCacheReferentiel();
    const db = await ouvrirBaseCache();
    db.transaction("referentiels", "readwrite").objectStore("referentiels").delete(cle);
    db.close();
  } catch (_) {}
}
// Clé et lien d'accès de l'établissement affiché, quand le référentiel vient du navigateur (non conservés)
const liensDemandes = new Set();
async function completerLienEtab(e) {
  if (
    !etatSaisie.referentielDuCache ||
    !e ||
    liensDemandes.has(e.id) ||
    !(E.lien in e) ||
    (e[E.lien] != null && e[E.lien] !== "")
  )
    return;
  liensDemandes.add(e.id);
  try {
    const j = await grist.docApi.getAccessToken({ readOnly: true });
    const lire = async (filtre) => {
      const r = await fetch(
        `${j.baseUrl}/tables/${encodeURIComponent(ETAB.table)}/records?filter=${encodeURIComponent(JSON.stringify(filtre))}&auth=${encodeURIComponent(j.token)}`,
      );
      if (!r.ok) throw new Error(`erreur ${r.status}`);
      return ((await r.json()).records || []).find((x) => x.id === e.id);
    };
    // filtre sur le numéro de ligne, sinon sur l'UAI
    let rec = null;
    try {
      rec = await lire({ id: [e.id] });
    } catch (_) {}
    if (!rec && E.uai && e[E.uai]) rec = await lire({ [E.uai]: [e[E.uai]] });
    const f = (rec && rec.fields) || {};
    for (const c of [E.cle, E.lien]) if (c && c in f) e[c] = f[c];
    if (etatSaisie.etabCourant && etatSaisie.etabCourant.id === e.id) afficherEtablissement();
  } catch (err) {
    console.warn("Lien d'accès non lu", err);
    liensDemandes.delete(e.id);
  }
}

// avecCache : copie du navigateur acceptée (ouverture du widget) ; sinon relecture sur le serveur
function chargerEtabs(avecCache) {
  // Deux demandes simultanées partagent la même lecture au lieu d'en lancer deux
  if (!etatSaisie.promesseEtabs)
    etatSaisie.promesseEtabs = lireEtabs(avecCache)
      .then(() => {
        etatSaisie.etabsCharges = true;
      })
      .finally(() => {
        etatSaisie.promesseEtabs = null;
      });
  return etatSaisie.promesseEtabs;
}
async function lireEtabs(avecCache) {
  etatSaisie.dernierChargementEtabs = Date.now();
  // tables visées par les colonnes Référence du référentiel (académies…) : lues en parallèle, pas après lui
  metaColonnes(ETAB.table)
    .then((m) => {
      for (const c of Object.values(m || {})) {
        const x = String(c.type || "").match(/^Ref:(.+)$/);
        if (x && x[1] !== ETAB.table) lireTableReference(x[1]).catch(() => {});
      }
    })
    .catch(() => {});
  let copie = avecCache ? await lireCacheReferentiel() : null;
  if (copie && !(await copieEncoreValable(copie))) {
    copie = null;
    oublierCacheReferentiel();
  }
  etatSaisie.referentielDuCache = copie ? copie.t : null;
  liensDemandes.clear();
  const t = copie ? copie.table : await lireTableRapide(ETAB.table);
  cacheTables.set(ETAB.table, { t: Date.now(), p: Promise.resolve(t) }); // réutilisée par les listes de choix qui visent le référentiel
  const cols = Object.keys(t);
  etatSaisie.etabs = t.id.map((id, i) => {
    const l = {};
    cols.forEach((c) => (l[c] = t[c][i]));
    return l;
  });
  etatSaisie.indexEtabs = new Map(etatSaisie.etabs.map((e) => [e.id, e]));
  etatSaisie.idEtabMax = etatSaisie.etabs.reduce((m, e) => Math.max(m, e.id), 0);
  etatSaisie.colsEtab = cols;
  await reconnaitreColonnesEtab(t);
  appliquerColonnesForcees();
  await resoudreRefsEtab();
  // Mode établissement : une seule ligne est visible (celle de l'établissement du lien), et sa clé
  // n'est pas lisible — soit la colonne est absente du schéma transmis, soit sa valeur est censurée
  // par une règle d'accès de colonne (cas le plus courant : le rôle « colonne » sur UUID/Lien).
  const uneSeuleLigne = etatSaisie.etabs.length === 1;
  const cleLisible = uneSeuleLigne && cols.includes(E.cle) && lisible(etatSaisie.etabs[0][E.cle]);
  etatSaisie.modeEtab = uneSeuleLigne && !cleLisible;
  const colsLisibles = cols.filter((c) => c !== "id" && c !== "manualSort" && !c.startsWith("gristHelper")).join(", ");
  const devinees = [...etatSaisie.colonnesParContenu].filter((k) => ["nom", "uai"].includes(k));
  etatSaisie.alerteStructure = [
    !etatSaisie.modeEtab && devinees.length
      ? `Dans la table « ${ETAB.table} », ${devinees.map((k) => `la colonne « ${E[k]} » est utilisée comme ${k === "nom" ? "nom de l'établissement" : "UAI"}`).join(" et ")}, d'après son contenu. Renommez-la « ${devinees.map((k) => (k === "nom" ? "Nom" : "UAI")).join(" » / « ")} » si ce n'est pas la bonne.`
      : "",
    !etatSaisie.modeEtab && !cols.includes(E.nom)
      ? `Aucune colonne de nom d'établissement reconnue dans la table « ${ETAB.table} »${cols.includes(E.uai) ? "" : " (ni d'UAI)"} : la recherche porte sur toutes ses colonnes texte. Nommez la colonne du nom « Nom »${cols.includes(E.uai) ? "" : " et celle de l'UAI « UAI »"} pour une recherche fiable. Colonnes trouvées : ${colsLisibles}.`
      : "",
    !etatSaisie.modeEtab && !cols.includes(E.cle)
      ? `Colonne « ${E.cle} » introuvable dans ${ETAB.table} : les liens d'accès des établissements n'existent pas encore. Mise en place : administration, onglet Établissements.${cols.includes(E.nom) ? ` Colonnes trouvées : ${colsLisibles}.` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  // copie conservée dans le navigateur (jamais en accès par lien d'établissement), sans clé ni lien d'accès
  if (!copie && !etatSaisie.modeEtab && etatSaisie.etabs.length > 1)
    ecrireCacheReferentiel(
      t,
      [E.cle, E.lien]
        .filter((c) => c && cols.includes(c))
        .concat(cols.filter((c) => /uuid|lien_?(d_?)?acces|link_?key|cle_?(d_?)?acces|token/i.test(c))),
    );
}

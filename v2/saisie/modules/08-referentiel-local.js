/* PRISME — widget de saisie, module 08/34 : Référentiel des établissements conservé dans le navigateur.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : DUREE_CACHE_REFERENTIEL, ouvrirBaseCache, cleCacheReferentiel, lireCacheReferentiel,
     ecrireCacheReferentiel, copieEncoreValable, oublierCacheReferentiel, liensDemandes, lienEtabAcompleter,
     lireCleEtLienEtab, completerLienEtab, chargerEtabs, lireTablesReferencesDuReferentiel,
     lireCopieValideReferentiel, memoriserTableReferentiel, calculerIndexEtabs, calculerModeEtab,
     calculerTexteAlerteStructure, ecrireCopieReferentielSiBesoin, lireEtabs.
   Utilise :
     01 configuration : ETAB.
     02 utilitaires : colonnesEtab, reconnaitreColonnesEtab.
     03 variantes : appliquerColonnesForcees, lisible.
     05 etat : etatSaisie.
     06 grist : metaColonnes.
     07 formulaires : cacheTables, lireTableRapide, lireTableReference, resoudreRefsEtab.
     14 etablissement : afficherEtablissement.
   Modifie etatSaisie : alerteStructure, colsEtab, dernierChargementEtabs, etabs, etabsCharges, idEtabMax,
     indexEtabs, modeEtab, promesseEtabs, referentielDuCache. */
/* ---------- Référentiel conservé dans le navigateur ----------
   La lecture complète du référentiel peut prendre plusieurs secondes au serveur : chaque navigateur le garde
   24 heures (IndexedDB) et ne le relit qu'ensuite, ou quand un établissement inconnu apparaît (créé par un
   collègue), ou avant la création d'un établissement, ou sur demande (⚙ › « Relire le référentiel »).
   Les colonnes de clé et de lien d'accès ne sont jamais conservées : elles sont lues à la demande, pour
   l'établissement affiché. Jamais utilisé en accès par lien d'établissement (une seule ligne visible). */
const DUREE_CACHE_REFERENTIEL = 24 * 3600 * 1000;
function ouvrirBaseCache() {
  return new Promise((resoudre, rejeter) => {
    if (!window.indexedDB) return rejeter(new Error("IndexedDB indisponible"));
    const requete = indexedDB.open("signalements-grist", 1);
    requete.onupgradeneeded = () => requete.result.createObjectStore("referentiels");
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}
async function cleCacheReferentiel() {
  let doc = "";
  try {
    if (grist.docApi.getAccessToken)
      doc = ((await grist.docApi.getAccessToken({ readOnly: true })).baseUrl || "").replace(/^https?:\/\//, "");
  } catch (_) {
    // adresse du document indisponible (mode secours) : on essaie son nom
  }
  if (!doc)
    try {
      doc = await grist.docApi.getDocName();
    } catch (_) {
      // nom du document indisponible : pas de copie locale du référentiel
    }
  return doc ? `${doc}|${ETAB.table}` : null;
}
async function lireCacheReferentiel() {
  try {
    const cle = await cleCacheReferentiel();
    if (!cle) return null;
    const base = await ouvrirBaseCache();
    const copie = await new Promise((resoudre, rejeter) => {
      const requete = base.transaction("referentiels").objectStore("referentiels").get(cle);
      requete.onsuccess = () => resoudre(requete.result);
      requete.onerror = () => rejeter(requete.error);
    });
    base.close();
    return copie && copie.table && Date.now() - copie.t < DUREE_CACHE_REFERENTIEL ? copie : null;
  } catch (_) {
    return null;
  }
}
async function ecrireCacheReferentiel(table, sensibles) {
  try {
    const cle = await cleCacheReferentiel();
    if (!cle) return;
    const copie = {};
    for (const [colonne, valeurs] of Object.entries(table))
      copie[colonne] = sensibles.includes(colonne) ? valeurs.map(() => null) : valeurs;
    const base = await ouvrirBaseCache();
    await new Promise((resoudre, rejeter) => {
      const transaction = base.transaction("referentiels", "readwrite");
      transaction.objectStore("referentiels").put({ t: Date.now(), table: copie, sensibles }, cle);
      transaction.oncomplete = resoudre;
      transaction.onerror = () => rejeter(transaction.error);
    });
    base.close();
  } catch (erreur) {
    console.warn("Référentiel non conservé dans le navigateur", erreur);
  }
}
// La copie du navigateur n'est reprise que si elle correspond encore à ce que ce compte peut lire :
// au moins deux lignes visibles (pas d'accès par lien d'établissement, qui ne voit que la sienne)
// et aucune colonne apparue depuis (ex. UUID et Lien ajoutés par la mise en place des liens).
async function copieEncoreValable(copie) {
  try {
    if (!grist.docApi.getAccessToken) return true;
    const j = await grist.docApi.getAccessToken({ readOnly: true });
    const reponse = await fetch(
      `${j.baseUrl}/tables/${encodeURIComponent(ETAB.table)}/records?limit=2&auth=${encodeURIComponent(j.token)}`,
    );
    if (!reponse.ok) return false;
    const recs = (await reponse.json()).records || [];
    if (recs.length < 2) return false;
    const colonnesCopie = new Set(Object.keys(copie.table || {}));
    return recs.every((enregistrement) => Object.keys(enregistrement.fields || {}).every((k) => colonnesCopie.has(k)));
  } catch (_) {
    return false;
  }
}
async function oublierCacheReferentiel() {
  try {
    const cle = await cleCacheReferentiel();
    const base = await ouvrirBaseCache();
    base.transaction("referentiels", "readwrite").objectStore("referentiels").delete(cle);
    base.close();
  } catch (_) {
    // base déjà fermée
  }
}
// Clé et lien d'accès de l'établissement affiché, quand le référentiel vient du navigateur (non conservés)
const liensDemandes = new Set();
// Dit si le lien d'accès de l'établissement reste à lire (référentiel venu du cache, lien absent et pas déjà demandé)
function lienEtabAcompleter(etablissement) {
  return !(
    !etatSaisie.referentielDuCache ||
    !etablissement ||
    liensDemandes.has(etablissement.id) ||
    !(colonnesEtab.lien in etablissement) ||
    (etablissement[colonnesEtab.lien] != null && etablissement[colonnesEtab.lien] !== "")
  );
}
// Lit sur le serveur la clé et le lien d'accès de l'établissement et les reporte dans sa ligne
async function lireCleEtLienEtab(etablissement) {
  const j = await grist.docApi.getAccessToken({ readOnly: true });
  const lire = async (filtre) => {
    const reponse = await fetch(
      `${j.baseUrl}/tables/${encodeURIComponent(ETAB.table)}/records?filter=${encodeURIComponent(JSON.stringify(filtre))}&auth=${encodeURIComponent(j.token)}`,
    );
    if (!reponse.ok) throw new Error(`erreur ${reponse.status}`);
    return ((await reponse.json()).records || []).find((enregistrement) => enregistrement.id === etablissement.id);
  };
  // filtre sur le numéro de ligne, sinon sur l'UAI
  let rec = null;
  try {
    rec = await lire({ id: [etablissement.id] });
  } catch (_) {
    // ligne illisible (règles d'accès) : établissement non trouvé
  }
  if (!rec && colonnesEtab.uai && etablissement[colonnesEtab.uai])
    rec = await lire({ [colonnesEtab.uai]: [etablissement[colonnesEtab.uai]] });
  const champsLus = (rec && rec.fields) || {};
  for (const colonne of [colonnesEtab.cle, colonnesEtab.lien])
    if (colonne && colonne in champsLus) etablissement[colonne] = champsLus[colonne];
}
async function completerLienEtab(etablissement) {
  if (!lienEtabAcompleter(etablissement)) return;
  liensDemandes.add(etablissement.id);
  try {
    await lireCleEtLienEtab(etablissement);
    if (etatSaisie.etabCourant && etatSaisie.etabCourant.id === etablissement.id) afficherEtablissement();
  } catch (erreur) {
    console.warn("Lien d'accès non lu", erreur);
    liensDemandes.delete(etablissement.id);
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
// Lance la lecture des tables visées par les colonnes Référence du référentiel (académies…), sans l'attendre
function lireTablesReferencesDuReferentiel() {
  metaColonnes(ETAB.table)
    .then((metaTable) => {
      for (const metaColonne of Object.values(metaTable || {})) {
        const correspondance = String(metaColonne.type || "").match(/^Ref:(.+)$/);
        if (correspondance && correspondance[1] !== ETAB.table) lireTableReference(correspondance[1]).catch(() => {});
      }
    })
    .catch(() => {});
}
// Lit la copie du référentiel gardée dans le navigateur (null si absente ou périmée, et alors oubliée)
async function lireCopieValideReferentiel() {
  let copie = await lireCacheReferentiel();
  if (copie && !(await copieEncoreValable(copie))) {
    copie = null;
    oublierCacheReferentiel();
  }
  return copie;
}
// Place la table du référentiel dans le cache des tables
function memoriserTableReferentiel(tableReferentiel) {
  cacheTables.set(ETAB.table, { t: Date.now(), p: Promise.resolve(tableReferentiel) }); // réutilisée par les listes de choix qui visent le référentiel
}
// Calcule les lignes d'établissements, leur index par identifiant, le plus grand identifiant et la liste des colonnes
function calculerIndexEtabs(tableReferentiel) {
  const colonnes = Object.keys(tableReferentiel);
  const etabs = tableReferentiel.id.map((id, i) => {
    const ligne = {};
    colonnes.forEach((colonne) => (ligne[colonne] = tableReferentiel[colonne][i]));
    return ligne;
  });
  const indexEtabs = new Map(etabs.map((etablissement) => [etablissement.id, etablissement]));
  const idEtabMax = etabs.reduce((idMax, etablissement) => Math.max(idMax, etablissement.id), 0);
  return { colonnes, etabs, indexEtabs, idEtabMax };
}
// Détermine le mode établissement : une seule ligne visible et sa clé illisible (absente ou censurée)
function calculerModeEtab(colonnes) {
  // Mode établissement : une seule ligne est visible (celle de l'établissement du lien), et sa clé
  // n'est pas lisible — soit la colonne est absente du schéma transmis, soit sa valeur est censurée
  // par une règle d'accès de colonne (cas le plus courant : le rôle « colonne » sur UUID/Lien).
  const uneSeuleLigne = etatSaisie.etabs.length === 1;
  const cleLisible =
    uneSeuleLigne && colonnes.includes(colonnesEtab.cle) && lisible(etatSaisie.etabs[0][colonnesEtab.cle]);
  return uneSeuleLigne && !cleLisible;
}
// Calcule le texte d'alerte sur la structure du référentiel (colonnes devinées ou introuvables)
function calculerTexteAlerteStructure(colonnes) {
  const colsLisibles = colonnes
    .filter((colonne) => colonne !== "id" && colonne !== "manualSort" && !colonne.startsWith("gristHelper"))
    .join(", ");
  const devinees = [...etatSaisie.colonnesParContenu].filter((k) => ["nom", "uai"].includes(k));
  return [
    !etatSaisie.modeEtab && devinees.length
      ? `Dans la table « ${ETAB.table} », ${devinees.map((k) => `la colonne « ${colonnesEtab[k]} » est utilisée comme ${k === "nom" ? "nom de l'établissement" : "UAI"}`).join(" et ")}, d'après son contenu. Renommez-la « ${devinees.map((k) => (k === "nom" ? "Nom" : "UAI")).join(" » / « ")} » si ce n'est pas la bonne.`
      : "",
    !etatSaisie.modeEtab && !colonnes.includes(colonnesEtab.nom)
      ? `Aucune colonne de nom d'établissement reconnue dans la table « ${ETAB.table} »${colonnes.includes(colonnesEtab.uai) ? "" : " (ni d'UAI)"} : la recherche porte sur toutes ses colonnes texte. Nommez la colonne du nom « Nom »${colonnes.includes(colonnesEtab.uai) ? "" : " et celle de l'UAI « UAI »"} pour une recherche fiable. Colonnes trouvées : ${colsLisibles}.`
      : "",
    !etatSaisie.modeEtab && !colonnes.includes(colonnesEtab.cle)
      ? `Colonne « ${colonnesEtab.cle} » introuvable dans ${ETAB.table} : les liens d'accès des établissements n'existent pas encore. Mise en place : administration, onglet Établissements.${colonnes.includes(colonnesEtab.nom) ? ` Colonnes trouvées : ${colsLisibles}.` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
// Garde une copie du référentiel dans le navigateur (jamais en accès par lien d'établissement), sans clé ni lien d'accès
function ecrireCopieReferentielSiBesoin(copie, tableReferentiel, colonnes) {
  // copie conservée dans le navigateur (jamais en accès par lien d'établissement), sans clé ni lien d'accès
  if (!copie && !etatSaisie.modeEtab && etatSaisie.etabs.length > 1)
    ecrireCacheReferentiel(
      tableReferentiel,
      [colonnesEtab.cle, colonnesEtab.lien]
        .filter((colonne) => colonne && colonnes.includes(colonne))
        .concat(colonnes.filter((colonne) => /uuid|lien_?(d_?)?acces|link_?key|cle_?(d_?)?acces|token/i.test(colonne))),
    );
}
async function lireEtabs(avecCache) {
  etatSaisie.dernierChargementEtabs = Date.now();
  // tables visées par les colonnes Référence du référentiel (académies…) : lues en parallèle, pas après lui
  lireTablesReferencesDuReferentiel();
  const copie = avecCache ? await lireCopieValideReferentiel() : null;
  etatSaisie.referentielDuCache = copie ? copie.t : null;
  liensDemandes.clear();
  const tableReferentiel = copie ? copie.table : await lireTableRapide(ETAB.table);
  memoriserTableReferentiel(tableReferentiel);
  const { colonnes, etabs, indexEtabs, idEtabMax } = calculerIndexEtabs(tableReferentiel);
  etatSaisie.etabs = etabs;
  etatSaisie.indexEtabs = indexEtabs;
  etatSaisie.idEtabMax = idEtabMax;
  etatSaisie.colsEtab = colonnes;
  await reconnaitreColonnesEtab(tableReferentiel);
  appliquerColonnesForcees();
  await resoudreRefsEtab();
  etatSaisie.modeEtab = calculerModeEtab(colonnes);
  etatSaisie.alerteStructure = calculerTexteAlerteStructure(colonnes);
  ecrireCopieReferentielSiBesoin(copie, tableReferentiel, colonnes);
}

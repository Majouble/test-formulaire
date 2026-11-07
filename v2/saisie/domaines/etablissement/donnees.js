/* PRISME — widget de saisie, domaines/etablissement/donnees.js
   Domaine : l'établissement : référentiel (et sa copie locale), fiche, mail et lien d'accès, correction — données
   (lectures et écritures du document).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lireMetaColonnesEtab, ecrireRattachementEtabs, lireCibleEtab, lireTableEtabChoisie,
     determinerTableEtab, resoudreRefsEtab, rafraichirEtabs, DUREE_CACHE_REFERENTIEL, ouvrirBaseCache,
     cleCacheReferentiel, lireCacheReferentiel, ecrireCacheReferentiel, copieEncoreValable, oublierCacheReferentiel,
     liensDemandes, lireCleEtLienEtab, completerLienEtab, chargerEtabs, lireTablesReferencesDuReferentiel,
     lireCopieValideReferentiel, memoriserTableReferentiel, ecrireCopieReferentielSiBesoin, lireEtabs,
     creerEtablissement, etablissementPourCreation, creerEtabDepuisSuggestion.
   Utilise :
     fondations/configuration : CLE_TABLE_ETAB, ETAB, colonnesEtab.
     fondations/outils : idDe, typeBase.
     fondations/etat : etatSaisie.
     fondations/grist : cacheTables, ecrireEtape, libellesTable, lireTableRapide, lireTableReference, metaColonnes.
     fondations/reglages : PARAMETRES, reglagesDansConfig.
     domaines/formulaire/regles : varianteSaisie.
     domaines/etablissement/regles : ORIGINE, appliquerColonnesForcees, calculerCibleEtab, calculerIndexEtabs,
       calculerModeEtab, calculerTexteAlerteStructure, colonneChampFiche, colonneRegion, decisionTableEtab, etabDe,
       etabDeLigne, etabParUai, lienEtabAcompleter, reconnaitreColonnesEtab.
     domaines/etablissement/affichage : afficherEtablissement, lireSaisieNouvelEtab.
   Modifie etatSaisie : alerteStructure, alerteTableRef, colsEtab, dernierChargementEtabs, etabCourant, etabs,
     etabsCharges, idEtabMax, indexEtabs, modeEtab, promesseEtabs, referentielDuCache. */
// Lit la structure de la table des établissements (null si illisible : lien d'établissement, règles d'accès)
async function lireMetaColonnesEtab() {
  let meta = null;
  try {
    meta = await metaColonnes(ETAB.table);
  } catch (_) {
    // structure illisible (lien d'établissement, règles d'accès) : on continue sans
  }
  return meta;
}
// Écrit dans la table des réponses la référence de l'établissement des signalements à rattacher (par lots de 400)
async function ecrireRattachementEtabs(aRattacher, colonneEtablissement) {
  const acts = aRattacher.map((enregistrement) => [
    "UpdateRecord",
    etatSaisie.tableId,
    enregistrement.id,
    { [colonneEtablissement]: etabDeLigne(enregistrement).id },
  ]);
  for (let k = 0; k < acts.length; k += 400) await Donnees.ecrire(acts.slice(k, k + 400));
}
// Lit la structure de la table liée et en déduit la colonne de l'établissement et la table qu'elle vise
async function lireCibleEtab() {
  let cible = null,
    colonneEtablissement = null;
  try {
    const tid = await grist.getTable().getTableId(),
      metaTable = await metaColonnes(tid);
    ({ colonneEtablissement, cible } = calculerCibleEtab(metaTable, tid));
  } catch (_) {
    /* métadonnées illisibles */
  }
  return { colonneEtablissement, cible };
}
// Lit la table du référentiel choisie dans les réglages (Config, sinon Parametres), null si aucune
async function lireTableEtabChoisie() {
  let choisie = null;
  if (reglagesDansConfig()) {
    const reglagesResume = etatSaisie.socleConfig.valeurs.resume_auto;
    choisie = (reglagesResume && reglagesResume[CLE_TABLE_ETAB]) || null;
    if (
      !choisie &&
      etatSaisie.socleGeneral.referentiel &&
      (await metaColonnes(etatSaisie.socleGeneral.referentiel).catch(() => null))
    )
      choisie = etatSaisie.socleGeneral.referentiel;
  } else
    try {
      const tableParametres = await Donnees.lire(PARAMETRES.table);
      const brut = (tableParametres[PARAMETRES.colonne] || [])[0];
      if (typeof brut === "string" && brut.trim()) choisie = JSON.parse(brut)[CLE_TABLE_ETAB] || null;
    } catch (_) {
      /* pas de réglage lisible */
    }
  return choisie;
}
async function determinerTableEtab() {
  etatSaisie.alerteTableRef = "";
  const { colonneEtablissement, cible } = await lireCibleEtab();
  const choisie = await lireTableEtabChoisie();
  const decision = decisionTableEtab(choisie, cible, colonneEtablissement);
  ETAB.table = decision.table;
  ETAB.origineTable = decision.origine;
  if (decision.alerte) etatSaisie.alerteTableRef = decision.alerte;
}
async function resoudreRefsEtab() {
  let meta = null;
  try {
    meta = await metaColonnes(ETAB.table);
  } catch (_) {
    // structure illisible (lien d'établissement, règles d'accès) : on continue sans
  }
  if (!meta) return;
  const colsPerimetre =
    etatSaisie.perimetreBrut && !Array.isArray(etatSaisie.perimetreBrut) ? Object.keys(etatSaisie.perimetreBrut) : [];
  for (const colId of new Set(
    [
      ...Object.values(colonnesEtab),
      colonneRegion(),
      ...varianteSaisie().fiche.map((champFiche) => colonneChampFiche(champFiche.col)),
      ...colsPerimetre,
    ].filter(Boolean),
  )) {
    const metaColonne = meta[colId];
    if (!metaColonne || typeBase(metaColonne.type) !== "Ref") continue;
    let libelles;
    try {
      libelles = await libellesTable(metaColonne.type.split(":")[1], metaColonne.colAffichee);
    } catch (_) {
      continue;
    } // table illisible : numéro conservé
    for (const etablissement of etatSaisie.etabs) {
      const valeur = etablissement[colId];
      if (typeof valeur === "number") etablissement[colId] = valeur ? libelles.get(valeur) || "" : "";
    }
  }
}
async function rafraichirEtabs(forcer) {
  if (!forcer && Date.now() - etatSaisie.dernierChargementEtabs < 600000) return; // grand référentiel : lecture coûteuse pour le serveur
  if (!forcer && etatSaisie.referentielDuCache && Date.now() - etatSaisie.referentielDuCache < DUREE_CACHE_REFERENTIEL)
    return; // copie du navigateur encore valable
  try {
    await chargerEtabs();
  } catch (erreur) {
    console.warn("Référentiel illisible", erreur);
  }
}
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
    const lignesRecues = (await reponse.json()).records || [];
    if (lignesRecues.length < 2) return false;
    const colonnesCopie = new Set(Object.keys(copie.table || {}));
    return lignesRecues.every((enregistrement) =>
      Object.keys(enregistrement.fields || {}).every((k) => colonnesCopie.has(k)),
    );
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
// Crée l'établissement dans le référentiel (colonnes connues seulement), le recharge et renvoie son identifiant
async function creerEtablissement(candidats) {
  const fields = {};
  for (const [colonne, valeur] of Object.entries(candidats))
    if (etatSaisie.colsEtab.includes(colonne) && valeur !== null) fields[colonne] = valeur;
  const id = idDe(
    await ecrireEtape("Création de l'établissement dans le référentiel", ETAB.table, () =>
      grist.getTable(ETAB.table).create({ fields }),
    ),
  );
  await chargerEtabs(); // récupère la clé et le lien calculés par Grist
  return id;
}
// Retourne l'identifiant de l'établissement du signalement, en le créant si besoin
async function etablissementPourCreation() {
  if (etatSaisie.modeEtab) return etatSaisie.etabs[0] ? etatSaisie.etabs[0].id : null;
  if (etatSaisie.etabCourant) return etatSaisie.etabCourant.id;
  await chargerEtabs(); // un collègue l'a peut-être créé entre-temps
  const saisie = lireSaisieNouvelEtab();
  const existant = etabParUai(saisie.uaiBrut);
  if (existant) {
    etatSaisie.etabCourant = existant;
    return existant.id;
  }
  const uai = saisie.uai;
  // Origine « annuaire » seulement si l'établissement vient d'une suggestion et que l'UAI n'a pas été modifié
  const depuisAnnuaire =
    etatSaisie.ligneAnnuaire &&
    etatSaisie.ligneAnnuaire.uai &&
    String(etatSaisie.ligneAnnuaire.uai).toUpperCase() === uai;
  const candidats = {
    [colonnesEtab.nom]: saisie.nom,
    [colonnesEtab.uai]: uai,
    [colonnesEtab.type]: saisie.type,
    [colonnesEtab.academie]: saisie.academie,
    [colonnesEtab.departement]: saisie.departement,
    [colonnesEtab.mail]: saisie.mail,
    [colonnesEtab.commune]: depuisAnnuaire ? etatSaisie.ligneAnnuaire.commune || "" : "",
    [colonnesEtab.origine]: depuisAnnuaire
      ? ORIGINE[etatSaisie.ligneAnnuaire.source] || ORIGINE.manuel
      : ORIGINE.manuel,
    [colonnesEtab.present]: depuisAnnuaire ? true : null,
    [colonnesEtab.mailAnnuaire]: depuisAnnuaire ? etatSaisie.ligneAnnuaire.mail || "" : "",
  };
  const id = await creerEtablissement(candidats);
  etatSaisie.etabCourant = etabDe(id);
  return id;
}
async function creerEtabDepuisSuggestion(suggestion) {
  await chargerEtabs();
  const deja = etabParUai(suggestion.uai);
  if (deja) return deja.id;
  const candidats = {
    [colonnesEtab.nom]: suggestion.nom || "",
    [colonnesEtab.uai]: String(suggestion.uai || "").toUpperCase(),
    [colonnesEtab.type]: suggestion.type || "",
    [colonnesEtab.academie]: suggestion.academie || "",
    [colonnesEtab.departement]: suggestion.departement || "",
    [colonnesEtab.commune]: suggestion.commune || "",
    [colonnesEtab.mail]: suggestion.mail || "",
    [colonnesEtab.mailAnnuaire]: suggestion.mail || "",
    [colonnesEtab.origine]: (typeof ORIGINE !== "undefined" && (ORIGINE[suggestion.source] || ORIGINE.manuel)) || "",
    [colonnesEtab.present]: suggestion.source && suggestion.source !== "local" ? true : null,
  };
  const fields = {};
  for (const [colonne, valeur] of Object.entries(candidats))
    if (etatSaisie.colsEtab.includes(colonne) && valeur !== null && valeur !== "") fields[colonne] = valeur;
  const id = idDe(await grist.getTable(ETAB.table).create({ fields }));
  await chargerEtabs();
  return id;
}

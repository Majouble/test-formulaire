/* PRISME — widget de saisie, module 02/34 : Outils de base : accès aux colonnes, valeurs Grist, dates au format des colonnes.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : colonnesEtab, COLONNES_ETAB_DEFAUT, RECONNAISSANCE_ETAB, normColonne, lireMetaColonnesEtab,
     calculerColonnesEtabReconnues, reconnaitreColonnesEtab.
   Utilise :
     01 configuration : ETAB.
     05 etat : etatSaisie.
     06 grist : metaColonnes.
   Modifie etatSaisie : colonnesParContenu, colonnesReconnues. */
/* =========================================================
   Outils
   ========================================================= */
const { esc, $ } = Outils;
const colonnesEtab = ETAB.colonnes;
/* Reconnaissance des colonnes du référentiel : si une colonne attendue (Nom, UAI, Commune…) n'existe pas
   sous cet identifiant, le widget cherche une colonne équivalente d'après son identifiant ou son libellé
   (« Appellation officielle », « Numéro UAI », « Nom de l'établissement », « Code RNE »…), ou, pour l'UAI,
   d'après son contenu (7 chiffres + 1 lettre). */
const COLONNES_ETAB_DEFAUT = { ...ETAB.colonnes };
const RECONNAISSANCE_ETAB = {
  uai: {
    motifs: [/^uai$/, /(^|_)(uai|rne)(_|$)/, /^code_etab/, /identifiant.*etab/],
    sauf: /tutelle|siege|rattach|parent/,
  },
  nom: {
    motifs: [
      /^nom$/,
      /appellation/,
      /^(nom|libelle|denomination|intitule)_(de_l_|de_|d_)?etab/,
      /denomination|raison_sociale/,
      /^(nom|libelle|intitule)(_|$)/,
      /^etablissement$/,
      /etablissement/,
    ],
    sauf: /commune|ville|academi|departement|region|contact|responsable|chef|direct|president|type|sigle|uai|rne|tutelle|mail|code|^id/,
  },
  commune: {
    motifs: [/^(nom_|libelle_)?(de_la_)?commune$/, /commune/, /ville|localite/],
    sauf: /code|insee|^id|postal/,
  },
  type: {
    motifs: [/^type$/, /^type_(d_)?etab/, /^type/, /nature|categorie|typologie/],
    sauf: /code|^id|contrat/,
  },
  academie: { motifs: [/^(nom_|libelle_)?(de_l_)?academie$/, /academie/], sauf: /code|^id|region/ },
  departement: { motifs: [/^(nom_|libelle_)?(du_)?departement$/, /departement/], sauf: /code|^id|numero/ },
  mail: { motifs: [/^(mail|courriel|e_?mail)$/, /mail|courriel/], sauf: /annuaire|contact_2|secondaire/ },
};
const normColonne = (valeur) =>
  String(valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
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
// Calcule les colonnes reconnues de la table des établissements (nom des champs → colonne, et ceux trouvés par le contenu)
function calculerColonnesEtabReconnues(donneesTable, meta) {
  const colonnesCourantes = { ...colonnesEtab };
  const trouvees = {};
  const parContenu = [];
  const colonnes = Object.keys(donneesTable).filter(
    (colonne) => colonne !== "id" && colonne !== "manualSort" && !colonne.startsWith("gristHelper"),
  );
  const noms = (colonne) =>
    [normColonne(colonne), normColonne(meta && meta[colonne] && meta[colonne].libelle)].filter(Boolean);
  const pris = new Set(Object.values(COLONNES_ETAB_DEFAUT).filter((colonne) => colonnes.includes(colonne)));
  const texte = (colonne) => {
    const valeursNonVides = (donneesTable[colonne] || []).filter((valeur) => valeur != null && valeur !== "");
    return valeursNonVides.length
      ? valeursNonVides.filter((valeur) => typeof valeur === "string").length / valeursNonVides.length
      : 0;
  };
  const uaiContenu = (colonne) => {
    const valeursTexte = (donneesTable[colonne] || []).filter((valeur) => typeof valeur === "string" && valeur.trim());
    return valeursTexte.length
      ? valeursTexte.filter((valeur) => /^\d{7}[a-z]$/i.test(valeur.trim())).length / valeursTexte.length
      : 0;
  };
  for (const [k, reconnaissance] of Object.entries(RECONNAISSANCE_ETAB)) {
    if (colonnes.includes(colonnesCourantes[k])) continue;
    let trouve = null;
    for (const motif of reconnaissance.motifs) {
      const cands = colonnes.filter(
        (colonne) =>
          !pris.has(colonne) &&
          noms(colonne).some((nomNormalise) => motif.test(nomNormalise) && !reconnaissance.sauf.test(nomNormalise)),
      );
      if (cands.length) {
        trouve = cands.sort((a, b) => texte(b) - texte(a))[0];
        break;
      }
    }
    if (!trouve && k === "uai")
      trouve =
        colonnes
          .filter((colonne) => !pris.has(colonne))
          .map((colonne) => [colonne, uaiContenu(colonne)])
          .filter(([, proportionUai]) => proportionUai >= 0.6)
          .sort((a, b) => b[1] - a[1])
          .map(([colonne]) => colonne)[0] || null;
    // Nom introuvable par son intitulé : la colonne texte aux valeurs les plus longues et les plus variées
    if (!trouve && k === "nom") {
      const score = (colonne) => {
        const valeursTexte = (donneesTable[colonne] || []).filter(
          (valeur) => typeof valeur === "string" && /[a-z]/i.test(valeur),
        );
        return valeursTexte.length < (donneesTable.id || []).length * 0.6
          ? 0
          : (new Set(valeursTexte).size / valeursTexte.length) *
              (valeursTexte.reduce((somme, valeur) => somme + valeur.length, 0) / valeursTexte.length);
      };
      trouve =
        colonnes
          .filter(
            (colonne) =>
              !pris.has(colonne) &&
              colonne !== colonnesCourantes.cle &&
              colonne !== colonnesCourantes.lien &&
              !/uuid|lien|mail|url/i.test(colonne),
          )
          .map((colonne) => [colonne, score(colonne)])
          .filter(([, noteColonne]) => noteColonne > 4)
          .sort((a, b) => b[1] - a[1])
          .map(([colonne]) => colonne)[0] || null;
    }
    if (trouve && !noms(trouve).some((nomNormalise) => reconnaissance.motifs.some((motif) => motif.test(nomNormalise))))
      parContenu.push(k);
    if (trouve) {
      colonnesCourantes[k] = trouve;
      pris.add(trouve);
      trouvees[k] = trouve;
    }
  }
  return { trouvees, parContenu };
}
async function reconnaitreColonnesEtab(donneesTable) {
  Object.assign(colonnesEtab, COLONNES_ETAB_DEFAUT);
  etatSaisie.colonnesReconnues = {};
  etatSaisie.colonnesParContenu = new Set();
  const meta = await lireMetaColonnesEtab();
  const { trouvees, parContenu } = calculerColonnesEtabReconnues(donneesTable, meta);
  Object.assign(colonnesEtab, trouvees);
  Object.assign(etatSaisie.colonnesReconnues, trouvees);
  parContenu.forEach((k) => etatSaisie.colonnesParContenu.add(k));
}

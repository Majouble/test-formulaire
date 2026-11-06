/* PRISME — widget de saisie, module 02/34 : Outils de base : accès aux colonnes, valeurs Grist, dates au format des colonnes.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Outils
   ========================================================= */
const { esc, $ } = Outils;
const E = ETAB.colonnes;
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
const normColonne = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
async function reconnaitreColonnesEtab(t) {
  Object.assign(E, COLONNES_ETAB_DEFAUT);
  etatSaisie.colonnesReconnues = {};
  etatSaisie.colonnesParContenu = new Set();
  let meta = null;
  try {
    meta = await metaColonnes(ETAB.table);
  } catch (_) {}
  const cols = Object.keys(t).filter((c) => c !== "id" && c !== "manualSort" && !c.startsWith("gristHelper"));
  const noms = (c) => [normColonne(c), normColonne(meta && meta[c] && meta[c].libelle)].filter(Boolean);
  const pris = new Set(Object.values(COLONNES_ETAB_DEFAUT).filter((c) => cols.includes(c)));
  const texte = (c) => {
    const v = (t[c] || []).filter((x) => x != null && x !== "");
    return v.length ? v.filter((x) => typeof x === "string").length / v.length : 0;
  };
  const uaiContenu = (c) => {
    const v = (t[c] || []).filter((x) => typeof x === "string" && x.trim());
    return v.length ? v.filter((x) => /^\d{7}[a-z]$/i.test(x.trim())).length / v.length : 0;
  };
  for (const [k, r] of Object.entries(RECONNAISSANCE_ETAB)) {
    if (cols.includes(E[k])) continue;
    let trouve = null;
    for (const m of r.motifs) {
      const cands = cols.filter((c) => !pris.has(c) && noms(c).some((n) => m.test(n) && !r.sauf.test(n)));
      if (cands.length) {
        trouve = cands.sort((a, b) => texte(b) - texte(a))[0];
        break;
      }
    }
    if (!trouve && k === "uai")
      trouve =
        cols
          .filter((c) => !pris.has(c))
          .map((c) => [c, uaiContenu(c)])
          .filter(([, s]) => s >= 0.6)
          .sort((a, b) => b[1] - a[1])
          .map(([c]) => c)[0] || null;
    // Nom introuvable par son intitulé : la colonne texte aux valeurs les plus longues et les plus variées
    if (!trouve && k === "nom") {
      const score = (c) => {
        const v = (t[c] || []).filter((x) => typeof x === "string" && /[a-z]/i.test(x));
        return v.length < (t.id || []).length * 0.6
          ? 0
          : (new Set(v).size / v.length) * (v.reduce((s, x) => s + x.length, 0) / v.length);
      };
      trouve =
        cols
          .filter((c) => !pris.has(c) && c !== E.cle && c !== E.lien && !/uuid|lien|mail|url/i.test(c))
          .map((c) => [c, score(c)])
          .filter(([, s]) => s > 4)
          .sort((a, b) => b[1] - a[1])
          .map(([c]) => c)[0] || null;
    }
    if (trouve && !noms(trouve).some((n) => r.motifs.some((m) => m.test(n)))) etatSaisie.colonnesParContenu.add(k);
    if (trouve) {
      E[k] = trouve;
      pris.add(trouve);
      etatSaisie.colonnesReconnues[k] = trouve;
    }
  }
}

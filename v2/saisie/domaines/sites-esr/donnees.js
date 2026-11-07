/* PRISME — widget de saisie, domaines/sites-esr/donnees.js
   Domaine : le formulaire par site (enseignement supérieur) — données (lectures et écritures du document).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : preparerRefSite.
   Utilise :
     fondations/configuration : ETAB.
     fondations/outils : colonneDe, refId.
     fondations/etat : etatSaisie.
     fondations/grist : lireTableReference, metaColonnes. */
/* Colonne Référence vers un référentiel des sites (table qui renvoie elle-même vers le référentiel des établissements) :
   rattachement de chaque site à son établissement et à sa composante, commune, mots-clés, sites désactivés, et
   établissement de rattachement des composantes. Renvoie true si la colonne désigne bien un site. */
async function preparerRefSite(definitionSite) {
  try {
    const cible = definitionSite.type.split(":")[1];
    if (!cible || cible === ETAB.table || cible === etatSaisie.tableId) return false;
    // référentiel des établissements : celui de la recherche, ou celui que vise la colonne Établissement du formulaire
    const metaEtablissement = colonneDe("Etablissement") && etatSaisie.metaSig[colonneDe("Etablissement")],
      visee = metaEtablissement && ((metaEtablissement.type || "").match(/^Ref:(.+)$/) || [])[1];
    const colonnesCible = Object.values((await metaColonnes(cible)) || {}),
      versEtab = colonnesCible.filter(
        (colonne) => colonne.type === `Ref:${ETAB.table}` || (visee && colonne.type === `Ref:${visee}`),
      );
    const colonneEtablissement =
        versEtab.find((colonne) => colonne.colId === "Etablissement") ||
        versEtab.find((colonne) => !/compos/i.test(colonne.colId)),
      colonneComposante = versEtab.find((colonne) => colonne !== colonneEtablissement && /compos/i.test(colonne.colId));
    if (!colonneEtablissement) return false;
    const tableReference = await lireTableReference(cible);
    definitionSite._siteEtab = new Map(
      tableReference.id.map((id, i) => [id, refId(tableReference[colonneEtablissement.colId][i])]),
    );
    if (colonneComposante)
      definitionSite._siteComp = new Map(
        tableReference.id.map((id, i) => [id, refId(tableReference[colonneComposante.colId][i])]),
      );
    // mots-clés des sites (Mots_cles, Autres_noms…) : retrouvent le site quand l'agent tape un autre nom
    const colonnesMotsCles = colonnesCible
      .filter(
        (colonne) => /^Text/.test(colonne.type || "") && /^(mots?_?cles?|autres?_noms?|alias)/i.test(colonne.colId),
      )
      .map((colonne) => colonne.colId);
    definitionSite._motsSite = new Map(
      tableReference.id.map((id, i) => [
        id,
        colonnesMotsCles
          .map((identifiantColonne) => tableReference[identifiantColonne] && tableReference[identifiantColonne][i])
          .filter((motCle) => typeof motCle === "string" && motCle.trim())
          .join(" | "),
      ]),
    );
    const colonneCommune = colonnesCible.find((colonne) => /^commune$/i.test(colonne.colId));
    if (colonneCommune)
      definitionSite._communeSite = new Map(
        tableReference.id.map((id, i) => [id, String(tableReference[colonneCommune.colId][i] ?? "")]),
      );
    // sites désactivés (colonne Actif décochée) : plus proposés, sauf sur une ligne qui y renvoie déjà
    const colonneActif = colonnesCible.find((colonne) => /^actif$/i.test(colonne.colId) && colonne.type === "Bool");
    if (colonneActif)
      definitionSite._inactifs = new Set(
        tableReference.id.filter((id, i) => tableReference[colonneActif.colId][i] === false),
      );
    // composante (IUT, école interne…) : ses propres sites, sinon ceux de son établissement de rattachement
    const colonneParent = Object.values((await metaColonnes(ETAB.table)) || {}).find(
      (colonne) => colonne.type === `Ref:${ETAB.table}` && /rattach|parent/i.test(colonne.colId),
    );
    if (colonneParent) {
      const tableEtablissements = await lireTableReference(ETAB.table);
      definitionSite._parent = new Map(
        tableEtablissements.id.map((id, i) => [id, refId(tableEtablissements[colonneParent.colId][i])]),
      );
    }
    return true;
  } catch (_) {
    return false;
  } // illisible : menu de tous les sites
}

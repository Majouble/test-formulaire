/* PRISME — widget de saisie, domaines/enregistrement/donnees.js
   Domaine : l'enregistrement : contrôles, écriture d'une version, description automatique, doublons — données
   (lectures et écritures du document).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : ecrireSerie, reprendreSurJours, ecrireCorrection, synchroniserTableauxEtPurger, ecrireNouvelleVersion,
     placerCurseurGrist, ecrireCreation.
   Utilise :
     fondations/outils : colonneDe, idDe.
     fondations/etat : etatSaisie, idsCreesIci.
     fondations/grist : ecrireEtape.
     composants/tableaux-enregistrement : purgerSitesSupprimes, synchroniserTableaux.
     domaines/dossier/regles : planifierSerie. */
// Écrit dans la table les signalements planifiés (création, rattachement au dossier, mises à jour, tableaux liés) ;
// renvoie les identifiants créés et les erreurs des tableaux
async function ecrireSerie(creer, completer) {
  const table = grist.getTable(),
    colonneDossier = colonneDe("Dossier");
  const ids = (reponse) =>
    (Array.isArray(reponse) ? reponse : [reponse])
      .map((valeur) => (valeur && typeof valeur === "object" ? valeur.id : valeur))
      .filter((valeur) => typeof valeur === "number");
  let nouveaux = [];
  if (creer.length) {
    nouveaux = ids(
      await ecrireEtape("Création des signalements des jours suivants", etatSaisie.tableId || "réponses", () =>
        table.create(creer.map((jourACreer) => ({ fields: jourACreer.fields }))),
      ),
    );
    nouveaux.forEach((id) => idsCreesIci.add(id));
    if (colonneDossier && nouveaux.length)
      await ecrireEtape(
        "Rattachement de chaque signalement à son propre dossier",
        etatSaisie.tableId || "réponses",
        () => table.update(nouveaux.map((id) => ({ id, fields: { [colonneDossier]: id } }))),
      );
  }
  let idsCompletes = [];
  if (completer.length)
    (idsCompletes = ids(
      await ecrireEtape("Mise à jour des signalements des jours suivants", etatSaisie.tableId || "réponses", () =>
        table.create(completer.map((jourACompleter) => ({ fields: jourACompleter.fields }))),
      ),
    )).forEach((id) => idsCreesIci.add(id));
  // questions « tableau » : chaque dossier reçoit ses lignes dans la table dédiée (avec la version créée)
  const erreursTableaux = [];
  for (const idNouveau of nouveaux) erreursTableaux.push(...(await synchroniserTableaux(idNouveau, true, idNouveau)));
  for (const [k, jourACompleter] of completer.entries())
    erreursTableaux.push(...(await synchroniserTableaux(jourACompleter.d, true, idsCompletes[k] || null)));
  return { nouveaux, errT: erreursTableaux };
}
// Un signalement par jour : nouveau dossier, ou mise à jour du signalement que l'établissement a déjà ce jour-là
async function reprendreSurJours(etabId, valeurs, jours, origine) {
  const { creer, completer, inchanges } = planifierSerie(
    etabId,
    valeurs,
    jours,
    origine,
    colonneDe("Site") ? $("site").value : null,
  );
  const { nouveaux, errT: erreursTableaux } = await ecrireSerie(creer, completer);
  return {
    jours,
    crees: nouveaux.length,
    joursCrees: creer.map((jourACreer) => jourACreer.t),
    completes: completer.map((jourACompleter) => jourACompleter.t),
    inchanges,
    errT: erreursTableaux,
  };
}
// Écrit la correction sur la dernière version
async function ecrireCorrection(table, ligneId, fields) {
  await ecrireEtape("Correction de la dernière version", etatSaisie.tableId || "réponses", () =>
    table.update({ id: ligneId, fields }),
  );
}
// Écrit les lignes des tableaux du dossier (avec la version donnée), puis purge les sites supprimés ; renvoie les erreurs
async function synchroniserTableauxEtPurger(devientDerniere, ligneId) {
  return [
    ...(await synchroniserTableaux(etatSaisie.dossierId, devientDerniere, ligneId)),
    ...(await purgerSitesSupprimes(etatSaisie.dossierId)),
  ];
}
// Écrit la nouvelle version dans la table ; renvoie son identifiant
async function ecrireNouvelleVersion(table, fields) {
  const id = idDe(
    await ecrireEtape("Création de la nouvelle version", etatSaisie.tableId || "réponses", () =>
      table.create({ fields }),
    ),
  );
  if (id) idsCreesIci.add(id);
  return id;
}
// Place le curseur de Grist sur la ligne
async function placerCurseurGrist(id) {
  try {
    await grist.setCursorPos({ rowId: id });
  } catch (_) {
    // placer le curseur de Grist est un confort : sans effet si Grist le refuse
  }
}
// Écrit le premier signalement dans la table, puis le rattache à son propre dossier ; renvoie son identifiant
async function ecrireCreation(table, fields) {
  const id = idDe(
    await ecrireEtape("Création du signalement", etatSaisie.tableId || "réponses", () => table.create({ fields })),
  );
  if (id) idsCreesIci.add(id);
  if (id && colonneDe("Dossier"))
    await ecrireEtape("Rattachement du signalement à son propre dossier", etatSaisie.tableId || "réponses", () =>
      table.update({ id, fields: { [colonneDe("Dossier")]: id } }),
    );
  return id;
}

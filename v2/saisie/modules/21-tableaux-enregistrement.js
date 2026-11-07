/* PRISME — widget de saisie, module 21/34 : Questions « tableau », fin : écriture dans la table dédiée, versions, reconstruction.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : controleursTableau, synchroniserTableaux, purgerSitesSupprimes, reconstruireTableaux,
     texteErreursTableaux, confidentielsModifies, finConfidentiels.
   Utilise :
     03 variantes : refId, statut.
     05 etat : etatSaisie, idDossierDe, valeurLigne.
     06 grist : enFile.
     19 tableaux : Tableau, lireTableauJson, nouvelIdLigne, tableaux, videSous.
     24 filtres-navigation : derniereDe. */
/* Méthodes de la classe Tableau qui écrivent les lignes dans la table dédiée, puis les fonctions appelées après
   l'enregistrement d'un signalement. */
Object.assign(Tableau.prototype, {
  // ----- table dédiée : réécriture des lignes d'un dossier
  async synchroniser(dossier, complet, donneesTable, lignesSource, avecConf = true, version = null) {
    if (!this.pret || !this.colDossier) return 0;
    donneesTable = donneesTable || (await Donnees.lire(this.table));
    if (this.colVersion && donneesTable[this.colVersion])
      return this.synchroniserVersions(dossier, complet, donneesTable, lignesSource, avecConf, version);
    const lignes = lignesSource || this.lignesValides();
    const existantes = donneesTable.id
      .map((id, i) => ({
        id,
        d: donneesTable[this.colDossier][i],
        ligne: this.colLigne ? donneesTable[this.colLigne][i] : null,
      }))
      .filter((existante) => refId(existante.d) === dossier || existante.d === dossier);
    const parLigne = new Map(
      existantes.filter((existante) => existante.ligne).map((existante) => [existante.ligne, existante]),
    );
    const ops = grist.getTable(this.table);
    const champs = (ligne, k, seulementConf) => {
      const champsEcrits = {};
      for (const definition of this.sousDefs) {
        if (seulementConf && !definition.confidentiel) continue;
        const vis = this.visible(ligne, definition),
          valeur = vis ? ligne.valeurs[definition.colId] : null;
        if (definition.confidentiel && (!avecConf || (!this.confLisible && videSous(valeur)))) continue; // valeur non lue : conservée
        champsEcrits[definition.colId] = this.versGrist(definition, valeur);
      }
      if (seulementConf) return champsEcrits;
      champsEcrits[this.colDossier] = dossier;
      if (this.colLigne) champsEcrits[this.colLigne] = ligne._id;
      if (this.colOrdre) champsEcrits[this.colOrdre] = k + 1;
      return champsEcrits;
    };
    if (!complet) {
      // version qui ne devient pas la dernière : seules les données confidentielles des lignes existantes changent
      const maj = lignes
        .map((ligne) => parLigne.get(ligne._id) && { id: parLigne.get(ligne._id).id, fields: champs(ligne, 0, true) })
        .filter((operation) => operation && Object.keys(operation.fields).length);
      if (maj.length && avecConf) await ops.update(maj);
      return maj.length;
    }
    const maj = [],
      ajout = [],
      gardees = new Set();
    lignes.forEach((ligne, k) => {
      const existante = parLigne.get(ligne._id);
      if (existante && !gardees.has(existante.id)) {
        maj.push({ id: existante.id, fields: champs(ligne, k) });
        gardees.add(existante.id);
      } else ajout.push({ fields: champs(ligne, k) });
    });
    const suppr = existantes.filter((existante) => !gardees.has(existante.id)).map((existante) => existante.id);
    if (maj.length) await ops.update(maj);
    if (ajout.length) await ops.create(ajout);
    if (suppr.length) await ops.destroy(suppr);
    return maj.length + ajout.length + suppr.length;
  },
  /* ----- table historisée : copie des lignes pour une version du dossier
     version : la version écrite (création, mise à jour, correction, reconstruction) ; absente et complet = false :
     seules les données confidentielles des lignes de la version la plus récente changent (aucune nouvelle version). */
  async synchroniserVersions(dossier, complet, donneesTable, lignesSource, avecConf, version) {
    const ops = grist.getTable(this.table),
      colonneVersion = this.colVersion,
      colonneMouvement = this.colMouvement && donneesTable[this.colMouvement] ? this.colMouvement : null;
    const lignes = lignesSource || this.lignesValides();
    const lignesT = donneesTable.id
      .map((id, i) => ({
        id,
        i,
        v: refId(donneesTable[colonneVersion][i]) || 0,
        ligne: this.colLigne ? donneesTable[this.colLigne][i] : null,
        m: colonneMouvement ? donneesTable[colonneMouvement][i] : null,
      }))
      .filter(
        (ligneTable) =>
          refId(donneesTable[this.colDossier][ligneTable.i]) === dossier ||
          donneesTable[this.colDossier][ligneTable.i] === dossier,
      );
    // versions connues du dossier (ordre de création)
    const versionsDossier = etatSaisie.enregistrements
      .filter((enregistrement) => idDossierDe(enregistrement) === dossier)
      .map((enregistrement) => enregistrement.id)
      .sort((a, b) => a - b);
    const plusRecente = Math.max(0, ...versionsDossier, ...lignesT.map((ligneTable) => ligneTable.v));
    let nombreEcrites = 0;
    // lignes d'avant l'historique (sans version) : rattachées à la version qui précède celle écrite (ou à la plus récente)
    const anciennes = lignesT.filter((ligneTable) => !ligneTable.v);
    if (anciennes.length) {
      const avant = version ? Math.max(0, ...versionsDossier.filter((numeroVersion) => numeroVersion < version)) : 0;
      const cible = avant || version || plusRecente || dossier;
      await ops.update(
        anciennes.map((ligneAncienne) => ({
          id: ligneAncienne.id,
          fields: {
            [colonneVersion]: cible,
            ...(colonneMouvement && !ligneAncienne.m ? { [colonneMouvement]: "Ajout" } : {}),
          },
        })),
      );
      anciennes.forEach((ligneAncienne) => {
        ligneAncienne.v = cible;
        if (colonneMouvement && !ligneAncienne.m) ligneAncienne.m = "Ajout";
      });
      nombreEcrites += anciennes.length;
    }
    const brut = (ligneTable, definition) =>
      donneesTable[definition.colId] ? donneesTable[definition.colId][ligneTable.i] : undefined;
    const lisibleBrut = (valeurBrute) =>
      valeurBrute !== undefined && !(Array.isArray(valeurBrute) && valeurBrute[0] === "C");
    // données confidentielles seules : lignes de la version la plus récente du dossier
    if (!version && !complet) {
      const vMax = Math.max(0, ...lignesT.map((ligneTable) => ligneTable.v)),
        parLigne = new Map(
          lignesT
            .filter((ligneTable) => ligneTable.v === vMax && ligneTable.m !== "Retrait")
            .map((ligneTable) => [ligneTable.ligne, ligneTable]),
        );
      const maj = lignes
        .map(
          (ligne) =>
            parLigne.get(ligne._id) && {
              id: parLigne.get(ligne._id).id,
              fields: this.champsGrist(ligne, 0, true, avecConf),
            },
        )
        .filter((operation) => operation && Object.keys(operation.fields).length);
      if (maj.length && avecConf) await ops.update(maj);
      return nombreEcrites + maj.length;
    }
    const versionEcrite = version || plusRecente || dossier;
    const courantes = lignesT.filter((ligneTable) => ligneTable.v === versionEcrite);
    const vPrec = Math.max(
      0,
      ...lignesT.filter((ligneTable) => ligneTable.v && ligneTable.v < versionEcrite).map((ligneTable) => ligneTable.v),
    );
    const parLignePrecedente = new Map(
      lignesT
        .filter((ligneTable) => ligneTable.v === vPrec && ligneTable.m !== "Retrait")
        .map((ligneTable) => [ligneTable.ligne, ligneTable]),
    );
    const norm = (valeur) =>
      valeur == null ||
      valeur === "" ||
      (Array.isArray(valeur) && valeur.length <= 1 && (valeur[0] === "L" || !valeur.length))
        ? null
        : JSON.stringify(valeur);
    const voulues = [];
    lignes.forEach((ligne, k) => {
      const champsLigne = this.champsGrist(ligne, k, false, avecConf),
        lignePrecedente = parLignePrecedente.get(ligne._id);
      // confidentiel non lu ou non écrit : repris de la version précédente
      if (lignePrecedente)
        for (const definition of this.sousDefs)
          if (
            definition.confidentiel &&
            !(definition.colId in champsLigne) &&
            lisibleBrut(brut(lignePrecedente, definition))
          )
            champsLigne[definition.colId] = brut(lignePrecedente, definition);
      const identique =
        lignePrecedente &&
        this.sousDefs
          .filter((definition) => !definition.confidentiel)
          .every((definition) => norm(brut(lignePrecedente, definition)) === norm(champsLigne[definition.colId]));
      champsLigne[this.colDossier] = dossier;
      champsLigne[colonneVersion] = versionEcrite;
      if (colonneMouvement)
        champsLigne[colonneMouvement] = !lignePrecedente ? "Ajout" : identique ? "Inchangée" : "Modification";
      voulues.push({ ligne: ligne._id, fields: champsLigne });
    });
    // lignes retirées depuis la version précédente : recopiées avec leurs dernières valeurs
    const gardes = new Set(lignes.map((ligne) => ligne._id));
    for (const [lid, lignePrecedente] of parLignePrecedente) {
      if (gardes.has(lid)) continue;
      const champsLigne = { [this.colDossier]: dossier, [colonneVersion]: versionEcrite };
      if (this.colLigne) champsLigne[this.colLigne] = lid;
      if (this.colOrdre && donneesTable[this.colOrdre])
        champsLigne[this.colOrdre] = donneesTable[this.colOrdre][lignePrecedente.i];
      for (const definition of this.sousDefs) {
        const valeurBrute = brut(lignePrecedente, definition);
        if (lisibleBrut(valeurBrute)) champsLigne[definition.colId] = valeurBrute;
      }
      if (colonneMouvement) champsLigne[colonneMouvement] = "Retrait";
      voulues.push({ ligne: lid, fields: champsLigne });
    }
    // lignes de cette version : mises à jour (correction), ajoutées, ou supprimées si elles n'ont plus lieu d'être
    const parLigne = new Map(
        courantes.filter((ligneTable) => ligneTable.ligne).map((ligneTable) => [ligneTable.ligne, ligneTable]),
      ),
      maj = [],
      ajout = [],
      gardees = new Set();
    for (const ligneVoulue of voulues) {
      const ligneExistante = parLigne.get(ligneVoulue.ligne);
      if (ligneExistante && !gardees.has(ligneExistante.id)) {
        maj.push({ id: ligneExistante.id, fields: ligneVoulue.fields });
        gardees.add(ligneExistante.id);
      } else ajout.push({ fields: ligneVoulue.fields });
    }
    const suppr = courantes.filter((ligneTable) => !gardees.has(ligneTable.id)).map((ligneTable) => ligneTable.id);
    if (maj.length) await ops.update(maj);
    if (ajout.length) await ops.create(ajout);
    if (suppr.length) await ops.destroy(suppr);
    return nombreEcrites + maj.length + ajout.length + suppr.length;
  },
  // champs Grist d'une ligne saisie (seulementConf : les confidentiels seuls) ; un confidentiel non lu n'est pas écrit
  champsGrist(ligne, k, seulementConf, avecConf = true) {
    const champsEcrits = {};
    for (const definition of this.sousDefs) {
      if (seulementConf && !definition.confidentiel) continue;
      const vis = this.visible(ligne, definition),
        valeur = vis ? ligne.valeurs[definition.colId] : null;
      if (definition.confidentiel && (!avecConf || (!this.confLisible && videSous(valeur)))) continue;
      champsEcrits[definition.colId] = this.versGrist(definition, valeur);
    }
    if (seulementConf) return champsEcrits;
    if (this.colLigne) champsEcrits[this.colLigne] = ligne._id;
    if (this.colOrdre) champsEcrits[this.colOrdre] = k + 1;
    return champsEcrits;
  },
  lignesDepuisJson(json) {
    return lireTableauJson(json)
      .map((ligneJson) => {
        const { _id, ...valeurs } = ligneJson;
        return { _id: _id || nouvelIdLigne(), valeurs };
      })
      .filter((ligne) => !this.ligneVide(ligne));
  },
});
const controleursTableau = (prefix) =>
  Object.values(tableaux).filter((controleur) => controleur.prefix === prefix && document.body.contains(controleur.el));
// Après enregistrement d'une version : réécrit les tables dédiées pour ce dossier
// version : ligne de la version écrite (tables historisées) ; sans elle et complet = false : confidentiels seuls
async function synchroniserTableaux(dossier, complet, version = null) {
  const erreurs = [];
  for (const controleur of controleursTableau("q")) {
    try {
      await controleur.synchroniser(dossier, complet, null, null, true, version);
    } catch (erreur) {
      erreurs.push(`table « ${controleur.table} » : ${erreur.message || erreur}`);
    }
  }
  return erreurs;
}
/* Sites supprimés du dossier (saisis à tort, 2.50) : après l'enregistrement, leurs lignes sont retirées de toutes les
   versions du dossier (colonne de la question et questions des formulaires précédents) et de la table dédiée (lignes
   de toutes les versions, retraits compris). Une ligne est visée par son identifiant (même corrigée entre-temps) ou par
   la clé de son site. */
async function purgerSitesSupprimes(dossier) {
  const erreurs = [];
  for (const controleur of controleursTableau("q")) {
    const sup = controleur.supprimes || [];
    if (!sup.length || !controleur.sites) continue;
    const etab =
      refId(valeurLigne(etatSaisie.initiale, "Etablissement")) ||
      (etatSaisie.etabCourant && etatSaisie.etabCourant.id) ||
      0;
    // un site encore présent dans le tableau (ressaisi sur une autre ligne) n'est visé que par l'identifiant de la ligne supprimée
    const gardees = new Set(
      controleur
        .lignesValides()
        .map((ligne) => controleur.cleSite(etab, ligne.valeurs))
        .filter(Boolean),
    );
    const ids = new Set(sup.map((siteSupprime) => siteSupprime._id).filter(Boolean)),
      cles = new Set(sup.map((siteSupprime) => siteSupprime.cle).filter((k) => k && !gardees.has(k)));
    const vise = (ligneJson, valeursVue) =>
      (ligneJson._id && ids.has(ligneJson._id)) || cles.has(controleur.cleSite(etab, valeursVue || ligneJson));
    const maj = [];
    for (const enregistrement of etatSaisie.enregistrements.filter(
      (enregistrementBrut) => idDossierDe(enregistrementBrut) === dossier,
    )) {
      const champsModifies = {},
        filtrer = (colonne, vue) => {
          const lignesAvant = lireTableauJson(enregistrement[colonne]),
            lignesGardees = lignesAvant.filter((ligneJson) => !vise(ligneJson, vue ? vue(ligneJson) : null));
          if (lignesGardees.length !== lignesAvant.length)
            champsModifies[colonne] = lignesGardees.length ? JSON.stringify(lignesGardees) : "";
        };
      filtrer(controleur.def.colId);
      for (const historique of controleur.sites.historique || [])
        filtrer(historique.colonne, (ligneJson) => controleur.vueHistorique(historique, ligneJson));
      if (Object.keys(champsModifies).length) maj.push({ id: enregistrement.id, fields: champsModifies });
    }
    try {
      if (maj.length) await grist.getTable().update(maj);
    } catch (erreur) {
      erreurs.push(`suppression des sites dans les étapes du dossier : ${erreur.message || erreur}`);
    }
    if (controleur.pret && controleur.colDossier)
      try {
        const donneesTable = await Donnees.lire(controleur.table),
          suppr = [];
        donneesTable.id.forEach((id, i) => {
          if (
            refId(donneesTable[controleur.colDossier][i]) !== dossier &&
            donneesTable[controleur.colDossier][i] !== dossier
          )
            return;
          const valeursLigne = {};
          for (const definition of controleur.sousDefs)
            if (donneesTable[definition.colId]) valeursLigne[definition.colId] = donneesTable[definition.colId][i];
          if (
            (controleur.colLigne && ids.has(donneesTable[controleur.colLigne][i])) ||
            cles.has(controleur.cleSite(etab, valeursLigne))
          )
            suppr.push(id);
        });
        if (suppr.length) await grist.getTable(controleur.table).destroy(suppr);
      } catch (erreur) {
        erreurs.push(`table « ${controleur.table} » (sites supprimés) : ${erreur.message || erreur}`);
      }
    controleur.supprimes = [];
    controleur.dessiner();
  }
  return erreurs;
}
// Réglages : reconstruit les tables dédiées à partir de la dernière version de chaque dossier ;
// table historisée : à partir de chaque version, dans l'ordre (tout l'historique, mouvements compris)
async function reconstruireTableaux() {
  const ctrl = controleursTableau("q").filter((controleur) => controleur.pret && controleur.colDossier);
  if (!ctrl.length) {
    statut("statut-tableaux", "Aucune question « tableau » associée au widget.", "err");
    return;
  }
  let nombreLignesEcrites = 0;
  try {
    for (const controleur of ctrl) {
      const donneesTable = await Donnees.lire(controleur.table);
      if (controleur.colVersion && donneesTable[controleur.colVersion]) {
        for (const dossier of etatSaisie.dossiersInit) {
          const versionsDossier = etatSaisie.enregistrements
            .filter((enregistrement) => idDossierDe(enregistrement) === dossier.id)
            .sort((a, b) => a.id - b.id);
          for (const version of versionsDossier)
            nombreLignesEcrites += await controleur.synchroniser(
              dossier.id,
              true,
              null,
              controleur.lignesDepuisJson(version[controleur.def.colId]),
              false,
              version.id,
            );
        }
        continue;
      }
      for (const dossier of etatSaisie.dossiersInit) {
        const der = derniereDe(dossier);
        nombreLignesEcrites += await controleur.synchroniser(
          dossier.id,
          true,
          donneesTable,
          controleur.lignesDepuisJson(der[controleur.def.colId]),
          false,
        );
      }
    }
    statut(
      "statut-tableaux",
      `Tables reconstruites (${nombreLignesEcrites} ligne(s) ajoutée(s), mise(s) à jour ou supprimée(s)). Les données confidentielles déjà saisies sont conservées.`,
      "ok",
    );
  } catch (erreur) {
    statut("statut-tableaux", `Échec : ${erreur.message || erreur}`, "err");
  }
}
document.addEventListener("click", (evenement) => {
  // ferme les menus déroulants des tableaux au clic à l'extérieur
  document.querySelectorAll(".tableau-rep .multi[open]").forEach((menu) => {
    if (!menu.contains(evenement.target)) menu.open = false;
  });
});

const texteErreursTableaux = (erreurs) =>
  erreurs.length ? ` Attention, mise à jour incomplète de ${erreurs.join(" ; ")}.` : "";
const confidentielsModifies = () => controleursTableau("q").some((controleur) => controleur.confModifie);
const finConfidentiels = () =>
  controleursTableau("q").forEach((controleur) => {
    controleur.confModifie = false;
  });
$("btn-reconstruire").addEventListener("click", () => enFile(reconstruireTableaux));

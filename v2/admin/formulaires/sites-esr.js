/* PRISME — administration, onglet « Formulaires » : formulaires/sites-esr.js
   Formulaire par site (enseignement supérieur) : tableau des sites, référentiel des sites, modèle « Enseignement
   supérieur par site ».
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : modeReprise, groupeSitesHtml, controleSitesHtml, referentielSitesDuFormulaire, lierSites,
     installerModeleSites, reglesApresTableau.
   Utilise :
     fondations : $, RESERVES_TABLEAU, actionsHistoriqueTableau, esc, etatFormulaires, identifiant, maintenant,
       message, nouvelId.
     donnees : actions, ajouterColonne, colonnesDe, creerColonne, lireMeta.
     formulaire-courant : blocs, differences, libelleQuestion, sauver.
     colonnes-roles : metaCourante, rolesEffectifs.
     apercu : dessinerApercu.
     panneau-question : dessinerPanneau, majBloc.
     gestion : referentielDe.
     saisie-etablissement : confSaisie, majSaisie, tableEtablissements.
   Modifie etatFormulaires : enregistrementEnCours, meta. */
/* ---------- Tableau des sites (formulaire par site, enseignement supérieur) ----------
 reglages.tableau.sites = { site, libre, qualif, historique: [{ colonne, libre, site, qualif }], alias, avecRas, reprise } :
 une ligne par site ; reprise du dernier état connu de chaque site (reprise : "non" par défaut, "bouton" ou "auto") ; qualification de l'établissement déduite du
 site le plus grave (conf.saisie.qualificationEnBas). Voir le widget de saisie. */
// reprise du dernier état des sites : "auto" (ancien réglage true), "bouton" (à la demande), "non" (par défaut)
const modeReprise = (reglagesSites) =>
  reglagesSites && (reglagesSites.reprise === true || reglagesSites.reprise === "auto")
    ? "auto"
    : reglagesSites && reglagesSites.reprise === "bouton"
      ? "bouton"
      : "non";
function groupeSitesHtml(bloc) {
  const reglages = bloc.reglages,
    reglagesSites = reglages.tableau.sites,
    colonnes = Object.values(colonnesDe(reglages.tableau.table)).filter(
      (colonne) =>
        !colonne.formule &&
        !RESERVES_TABLEAU.includes(colonne.colId) &&
        colonne.type !== `Ref:${etatFormulaires.courant.table}`,
    );
  const optionsHtml = (filtre, valeurChoisie) =>
    `<option value="">—</option>${colonnes
      .filter(filtre)
      .map(
        (colonne) =>
          `<option value="${esc(colonne.colId)}"${valeurChoisie === colonne.colId ? " selected" : ""}>${esc(colonne.libelle)}</option>`,
      )
      .join("")}`;
  const historique = (reglagesSites && reglagesSites.historique && reglagesSites.historique[0]) || {};
  const autres = Object.values(etatFormulaires.meta).filter(
    (colonne) =>
      /^Text/.test(colonne.type) &&
      colonne.colId !== bloc.colonne &&
      !blocs().some((autreBloc) => autreBloc.colonne === colonne.colId && autreBloc.id === bloc.id),
  );
  return `<div class="groupe"><div class="t">Tableau des sites</div>
  <label class="interrupteur">Une ligne par site (formulaire par site) <input type="checkbox" id="pa-sites"${reglagesSites ? " checked" : ""}></label>
  ${
    reglagesSites &&
    (!reglagesSites.site || !/^Ref:/.test((colonnesDe(reglages.tableau.table)[reglagesSites.site] || {}).type || ""))
      ? (() => {
          const referentielSites = referentielSitesDuFormulaire();
          return referentielSites
            ? `<p class="note" style="margin:6px 0">Ce tableau n'a pas de colonne qui renvoie vers le référentiel des sites : les sites ne sont reconnus que par leur nom saisi. <button type="button" class="secondaire petit" id="pa-site-relier">Relier au référentiel des sites</button><br><span class="aide">Ajoute à ${esc(reglages.tableau.table)} une colonne « Site » (liste des sites de l'établissement, table ${esc(referentielSites)}) ; la colonne de texte reste pour les sites hors référentiel. Les noms déjà saisis se rattachent ensuite dans l'onglet Référentiel (« Compléter les saisies »).</span></p>`
            : `<p class="note" style="margin:6px 0">Aucun référentiel des sites dans le document : importez le classeur du référentiel ESR (onglet Référentiel) pour proposer la liste des sites de chaque établissement.</p>`;
        })()
      : ""
  }
  ${
    reglagesSites &&
    reglagesSites.site &&
    /^Ref:/.test((colonnesDe(reglages.tableau.table)[reglagesSites.site] || {}).type || "") &&
    !reglagesSites.libre
      ? `<p class="note" style="margin:6px 0">Les agents ne peuvent choisir qu'un site de la liste. <button type="button" class="secondaire petit" id="pa-site-libre-creer">Accepter les noms hors référentiel</button><br><span class="aide">Ajoute à ${esc(reglages.tableau.table)} une colonne « Site hors référentiel » : dans le formulaire, le champ du site propose la liste (recherche par nom et par mots-clés) et accepte un nom tapé librement.</span></p>`
      : ""
  }
  ${
    reglagesSites
      ? `<label class="l" for="pa-site-ref">Site (référentiel des sites)</label><select id="pa-site-ref">${optionsHtml((colonne) => /^(Ref|Text)/.test(colonne.type), reglagesSites.site)}</select>
    <label class="l" for="pa-site-libre">Site hors référentiel (texte libre)</label><select id="pa-site-libre">${optionsHtml((colonne) => /^Text/.test(colonne.type), reglagesSites.libre)}</select>
    <label class="l" for="pa-site-qualif">Qualification du site</label><select id="pa-site-qualif">${optionsHtml((colonne) => /^Choice/.test(colonne.type), reglagesSites.qualif)}</select>
    <label class="l" for="pa-site-hist">Reprendre aussi l'historique de la question</label><select id="pa-site-hist"><option value="">— (aucune)</option>${autres.map((colonne) => `<option value="${esc(colonne.colId)}"${historique.colonne === colonne.colId ? " selected" : ""}>${esc(libelleQuestion(colonne.colId))}</option>`).join("")}</select>
    ${historique.colonne ? `<div class="ligne-sc"><input type="text" id="pa-site-hist-libre" value="${esc(historique.libre || "")}" placeholder="champ du nom (ex. Nom_du_site)" style="flex:1"><input type="text" id="pa-site-hist-qualif" value="${esc(historique.qualif || "")}" placeholder="champ de qualification" style="flex:1"></div>` : ""}
    <label class="l" for="pa-site-alias">Table des correspondances (libellé saisi → site)</label><input type="text" id="pa-site-alias" value="${esc(reglagesSites.alias || "Sites_correspondances")}">
    <label class="l" for="pa-site-reprise">Nouveau dossier : reprise du dernier état des sites déjà signalés pour l'établissement</label>
    <select id="pa-site-reprise">${[
      ["non", "désactivée : le tableau part vide"],
      ["bouton", "à la demande : bouton « Reprendre leur dernier état »"],
      ["auto", "automatique : une ligne par site connu dès l'établissement choisi"],
    ]
      .map(
        ([valeur, libelle]) =>
          `<option value="${valeur}"${modeReprise(reglagesSites) === valeur ? " selected" : ""}>${libelle}</option>`,
      )
      .join("")}</select>
    ${modeReprise(reglagesSites) !== "non" ? `<label class="interrupteur">Reprise : une ligne par site connu, y compris ceux revenus à la normale <input type="checkbox" id="pa-site-ras"${reglagesSites.avecRas !== false ? " checked" : ""}></label>` : ""}
    <label class="interrupteur">Qualification de l'établissement en bas, déduite du site le plus grave <input type="checkbox" id="pa-qualif-bas"${confSaisie().qualificationEnBas !== false ? " checked" : ""}></label>
    ${controleSitesHtml(bloc)}
    <p class="note" style="margin:6px 0 0">${
      modeReprise(reglagesSites) === "non"
        ? "Nouveau dossier : le tableau des sites part vide, l'agent saisit les sites concernés ce jour-là (la reprise d'un signalement précédent ne reprend pas les sites)."
        : modeReprise(reglagesSites) === "auto"
          ? "Nouveau dossier : dès l'établissement choisi, le tableau se remplit d'une ligne par site déjà signalé, à son dernier état (toutes les versions précédentes de l'établissement et la question d'historique choisie) ; l'agent confirme ou modifie chaque site encore perturbé et ajoute les nouveaux."
          : "Nouveau dossier : le tableau des sites part vide ; si l'établissement a déjà des sites signalés, un bouton « Reprendre leur dernier état » le remplit à la demande (toutes les versions précédentes de l'établissement et la question d'historique choisie)."
    } La qualification de l'établissement suit le site le plus grave (ordre des choix de Qualification, du plus grave au moins grave) ; une incohérence est signalée avant l'enregistrement.</p>`
      : ""
  }
</div>`;
}
/* Contrôle du paramétrage du tableau des sites : chaque point attendu, vérifié sur la structure du document.
 Le widget de saisie filtre les sites par établissement quand la colonne du site renvoie vers une table des sites
 dont une colonne renvoie vers le référentiel des établissements visé par la colonne Établissement du formulaire. */
function controleSitesHtml(bloc) {
  const reglages = bloc.reglages,
    reglagesSites = reglages.tableau.sites,
    identifiantTable = reglages.tableau.table,
    colonnes = colonnesDe(identifiantTable),
    tableEtablissement = tableEtablissements() || referentielDe(etatFormulaires.courant.table);
  const verifs = [],
    ajouterVerification = (etat, texte) => verifs.push({ etat, txt: texte });
  const versEtab = (table) =>
    Object.values(colonnesDe(table) || {})
      .filter((colonne) => /^Ref:/.test(colonne.type) && colonne.type !== `Ref:${etatFormulaires.courant.table}`)
      .map((colonne) => window.Socle.cibleRef(colonne.type));
  ajouterVerification(
    tableEtablissement ? "ok" : "err",
    tableEtablissement
      ? `Établissement du formulaire : référentiel « ${tableEtablissement} » (colonne Établissement de ${etatFormulaires.courant.table}).`
      : `La colonne Établissement de ${etatFormulaires.courant.table} n'est pas une référence vers un référentiel des établissements.`,
  );
  ajouterVerification(
    Object.keys(colonnes).length ? "ok" : "err",
    Object.keys(colonnes).length
      ? `Sous-table « ${identifiantTable} »${colonnes.Dossier ? "" : " — colonne Dossier absente"}.`
      : `Sous-table « ${identifiantTable} » introuvable.`,
  );
  const colonneSite = reglagesSites.site && colonnes[reglagesSites.site],
    cible = colonneSite && window.Socle.cibleRef(colonneSite.type);
  if (!colonneSite) ajouterVerification("err", "Aucune colonne du site choisie (« Site (référentiel des sites) »).");
  else if (!cible)
    ajouterVerification(
      "err",
      `Colonne du site « ${colonneSite.libelle} » : colonne de texte, sans liste de sites. Utilisez « Relier au référentiel des sites ».`,
    );
  else if (!colonnesDe(cible) || !Object.keys(colonnesDe(cible)).length)
    ajouterVerification(
      "err",
      `Colonne du site « ${colonneSite.libelle} » : elle renvoie vers « ${cible} », table introuvable.`,
    );
  else if (tableEtablissement && !versEtab(cible).includes(tableEtablissement))
    ajouterVerification(
      "err",
      `Colonne du site « ${colonneSite.libelle} » : elle renvoie vers « ${cible} », dont aucune colonne ne renvoie vers « ${tableEtablissement} »${versEtab(cible).length ? ` (elle renvoie vers « ${versEtab(cible).join(" », « ")} »)` : ""} : les sites ne peuvent pas être filtrés par établissement, le formulaire les propose tous. Réimportez le classeur ESR vers « ${tableEtablissement} », ou changez la référence de la colonne Etablissement de « ${cible} » dans Grist.`,
    );
  else
    ajouterVerification(
      "ok",
      `Colonne du site « ${colonneSite.libelle} » → table « ${cible} », reliée à « ${tableEtablissement} » : seuls les sites de l'établissement sont proposés, avec recherche par nom, mot-clé et commune.`,
    );
  const colonneLibre = reglagesSites.libre && colonnes[reglagesSites.libre];
  ajouterVerification(
    colonneLibre && /^Text/.test(colonneLibre.type) ? "ok" : "warn",
    colonneLibre && /^Text/.test(colonneLibre.type)
      ? `Site hors référentiel : « ${colonneLibre.libelle} » (un nom absent de la liste est accepté, dans le même champ).`
      : "Pas de colonne hors référentiel : seuls les sites de la liste sont acceptés (bouton « Accepter les noms hors référentiel »).",
  );
  const colonneQualif = reglagesSites.qualif && colonnes[reglagesSites.qualif];
  ajouterVerification(
    colonneQualif && /^Choice/.test(colonneQualif.type) ? "ok" : "err",
    colonneQualif && /^Choice/.test(colonneQualif.type)
      ? `Qualification du site : « ${colonneQualif.libelle} » (${((colonneQualif.opts || {}).choices || []).join(", ") || "choix à définir"}).`
      : "Aucune colonne de qualification du site (type Choix).",
  );
  const doubles = Object.values(colonnes).filter(
    (colonne) =>
      colonne.colId !== reglagesSites.site &&
      /^Ref:/.test(colonne.type) &&
      window.Socle.cibleRef(colonne.type) !== etatFormulaires.courant.table &&
      tableEtablissement &&
      versEtab(window.Socle.cibleRef(colonne.type)).includes(tableEtablissement),
  );
  if (doubles.length)
    ajouterVerification(
      "warn",
      `Colonne${doubles.length > 1 ? "s" : ""} ${doubles.map((colonne) => (colonne.libelle !== colonne.colId ? `« ${colonne.libelle} » (${colonne.colId})` : `« ${colonne.colId} »`)).join(", ")} : elle désigne aussi un site, en double ; le formulaire l'écarte. Supprimez-la dans Grist si elle ne sert pas.`,
    );
  const nombreDifferences = differences();
  ajouterVerification(
    !etatFormulaires.courant.publie ? "err" : nombreDifferences ? "warn" : "ok",
    !etatFormulaires.courant.publie
      ? "Formulaire jamais publié : cliquez sur « Publier »."
      : nombreDifferences
        ? `${nombreDifferences} modification${nombreDifferences > 1 ? "s" : ""} non publiée${nombreDifferences > 1 ? "s" : ""} : cliquez sur « Publier » pour que le formulaire en tienne compte.`
        : "Formulaire publié, à jour.",
  );
  const icones = { ok: "✓", warn: "!", err: "✗" },
    couleurs = { ok: "var(--ok, #18753c)", warn: "var(--warn, #b34000)", err: "var(--err, #b42318)" };
  return `<div class="controle-sites" style="margin:8px 0;padding:6px 8px;border:1px solid var(--trait, #ddd);border-radius:4px"><div style="font-weight:600;margin-bottom:4px">Contrôle du paramétrage</div>
  <ul style="list-style:none;margin:0;padding:0;font-size:12px">${verifs.map((verification) => `<li style="margin:3px 0;display:flex;gap:6px"><span style="color:${couleurs[verification.etat]};font-weight:700;min-width:12px" aria-label="${verification.etat === "ok" ? "correct" : verification.etat === "warn" ? "à vérifier" : "à corriger"}">${icones[verification.etat]}</span><span>${esc(verification.txt)}</span></li>`).join("")}</ul></div>`;
}
// Référentiel des sites du formulaire : table « …site… » qui renvoie vers le référentiel des établissements (import ESR, modèle par site)
function referentielSitesDuFormulaire() {
  const tableEtablissement = tableEtablissements() || referentielDe(etatFormulaires.courant.table);
  if (!tableEtablissement) return null;
  return (
    etatFormulaires.metaTables[0].tableId.find(
      (identifiantTable) =>
        /site/i.test(identifiantTable) &&
        !/signal|correspond/i.test(identifiantTable) &&
        Object.values(colonnesDe(identifiantTable)).some((colonne) => colonne.type === `Ref:${tableEtablissement}`) &&
        !Object.values(colonnesDe(identifiantTable)).some(
          (colonne) => colonne.type === `Ref:${etatFormulaires.courant.table}`,
        ),
    ) || null
  );
}
function lierSites(bloc) {
  const reglages = bloc.reglages,
    miseAJour = () => {
      majBloc(bloc);
      sauver();
    };
  const boutonLibre = $("pa-site-libre-creer");
  if (boutonLibre)
    boutonLibre.addEventListener("click", async () => {
      const identifiantTable = reglages.tableau.table;
      if (!reglages.tableau.sites) return;
      boutonLibre.disabled = true;
      try {
        const id = identifiant("Site_libre", Object.keys(colonnesDe(identifiantTable)));
        await ajouterColonne(identifiantTable, id, {
          type: "Text",
          isFormula: false,
          label: "Site hors référentiel",
          untieColIdFromLabel: true,
        });
        reglages.tableau.sites.libre = id;
        miseAJour();
        dessinerPanneau();
        message(
          `Colonne « ${id} » ajoutée à ${identifiantTable} : le champ du site accepte maintenant un nom hors référentiel. Publiez le formulaire.`,
          "ok",
        );
        reglesApresTableau(identifiantTable);
      } catch (erreur) {
        boutonLibre.disabled = false;
        message(`Échec : ${erreur.message || erreur}`, "err");
      }
    });
  const boutonRelier = $("pa-site-relier");
  if (boutonRelier)
    boutonRelier.addEventListener("click", async () => {
      const referentielSites = referentielSitesDuFormulaire(),
        identifiantTable = reglages.tableau.table;
      if (!referentielSites || !reglages.tableau.sites) return;
      boutonRelier.disabled = true;
      try {
        const id = identifiant("Site", Object.keys(colonnesDe(identifiantTable)));
        await ajouterColonne(identifiantTable, id, {
          type: `Ref:${referentielSites}`,
          isFormula: false,
          label: "Site",
          untieColIdFromLabel: true,
        });
        const avant = reglages.tableau.sites.site; // ancienne colonne du site en texte : devient la colonne « hors référentiel »
        if (avant && !reglages.tableau.sites.libre) reglages.tableau.sites.libre = avant;
        reglages.tableau.sites.site = id;
        miseAJour();
        dessinerPanneau();
        message(
          `Colonne « ${id} » ajoutée à ${identifiantTable} (référence vers ${referentielSites}). Publiez le formulaire pour proposer la liste des sites.`,
          "ok",
        );
        reglesApresTableau(identifiantTable);
      } catch (erreur) {
        boutonRelier.disabled = false;
        message(`Échec : ${erreur.message || erreur}`, "err");
      }
    });
  const deviner = () => {
    const colonnes = Object.values(colonnesDe(reglages.tableau.table)),
      trouverColonne = (motif, filtre) =>
        (colonnes.find((colonne) => filtre(colonne) && motif.test(colonne.colId)) || colonnes.find(filtre) || {})
          .colId || null;
    return {
      site: trouverColonne(
        /site/i,
        (colonne) =>
          /^Ref:/.test(colonne.type) &&
          colonne.type !== `Ref:${etatFormulaires.courant.table}` &&
          colonne.colId !== "Version",
      ),
      libre: trouverColonne(
        /libre|nom/i,
        (colonne) => /^Text/.test(colonne.type) && !RESERVES_TABLEAU.includes(colonne.colId),
      ),
      qualif: trouverColonne(/qualif/i, (colonne) => /^Choice/.test(colonne.type)),
      historique: [],
      alias: "Sites_correspondances",
    };
  };
  const interrupteur = $("pa-sites");
  if (interrupteur)
    interrupteur.addEventListener("change", () => {
      if (interrupteur.checked) reglages.tableau.sites = deviner();
      else delete reglages.tableau.sites;
      miseAJour();
      dessinerPanneau();
    });
  const reglagesSites = reglages.tableau.sites;
  if (!reglagesSites) return;
  [
    ["pa-site-ref", "site"],
    ["pa-site-libre", "libre"],
    ["pa-site-qualif", "qualif"],
  ].forEach(([id, k]) => {
    const element = $(id);
    if (element)
      element.addEventListener("change", () => {
        reglagesSites[k] = element.value || null;
        miseAJour();
      });
  });
  const menuHistorique = $("pa-site-hist");
  if (menuHistorique)
    menuHistorique.addEventListener("change", () => {
      reglagesSites.historique = menuHistorique.value
        ? [{ colonne: menuHistorique.value, libre: "Nom_du_site", qualif: "Qualification" }]
        : [];
      miseAJour();
      dessinerPanneau();
    });
  [
    ["pa-site-hist-libre", "libre"],
    ["pa-site-hist-qualif", "qualif"],
  ].forEach(([id, k]) => {
    const element = $(id);
    if (element)
      element.addEventListener("input", () => {
        if (reglagesSites.historique[0]) reglagesSites.historique[0][k] = element.value.trim();
        sauver();
      });
  });
  const champAlias = $("pa-site-alias");
  if (champAlias)
    champAlias.addEventListener("input", () => {
      reglagesSites.alias = champAlias.value.trim() || "Sites_correspondances";
      sauver();
    });
  const menuReprise = $("pa-site-reprise");
  if (menuReprise)
    menuReprise.addEventListener("change", () => {
      reglagesSites.reprise = menuReprise.value;
      miseAJour();
      dessinerPanneau();
    });
  const caseRas = $("pa-site-ras");
  if (caseRas)
    caseRas.addEventListener("change", () => {
      reglagesSites.avecRas = caseRas.checked;
      miseAJour();
    });
  const caseQualifBas = $("pa-qualif-bas");
  if (caseQualifBas)
    caseQualifBas.addEventListener("change", () => {
      majSaisie((reglagesSaisie) => {
        reglagesSaisie.qualificationEnBas = caseQualifBas.checked;
      });
      dessinerApercu();
    });
}
/* ---------- Modèle « Enseignement supérieur par site » ----------
 Sur le formulaire qui vient d'être créé : référentiel des sites (repris s'il existe : table « …site… » qui renvoie
 vers le référentiel des établissements, sinon Referentiel_sites créée), table des correspondances (libellé saisi →
 site), sous-table historisée Sites_signales (Site, Site_libre, Qualification du site, Precisions), question tableau
 « Sites concernés » réglée en tableau des sites, qualification de l'établissement en bas, déduite des sites. */
async function installerModeleSites() {
  const tableReponses = etatFormulaires.courant.table,
    tableEtablissement = tableEtablissements() || referentielDe(tableReponses) || "Etablissements",
    faits = [];
  const existe = (identifiantTable) => etatFormulaires.metaTables[0].tableId.includes(identifiantTable);
  // référentiel des sites
  let referentielSites = etatFormulaires.metaTables[0].tableId.find(
    (identifiantTable) =>
      /site/i.test(identifiantTable) &&
      !/signal|correspond/i.test(identifiantTable) &&
      Object.values(colonnesDe(identifiantTable)).some((colonne) => colonne.type === `Ref:${tableEtablissement}`) &&
      !Object.values(colonnesDe(identifiantTable)).some((colonne) => colonne.type === `Ref:${tableReponses}`),
  );
  if (!referentielSites) {
    referentielSites = identifiant("Referentiel_sites", etatFormulaires.metaTables[0].tableId);
    await actions([
      [
        "AddTable",
        referentielSites,
        [
          ["Site_id", "Text"],
          ["Nom", "Text"],
          ["Etablissement", `Ref:${tableEtablissement}`],
          ["Commune", "Text"],
          ["Latitude", "Numeric"],
          ["Longitude", "Numeric"],
          ["Source", "Choice"],
          ["Actif", "Bool"],
        ].map(([id, type]) => ({ id, type, isFormula: false })),
      ],
    ]);
    await actions([
      ["ModifyColumn", referentielSites, "Source", { widgetOptions: JSON.stringify({ choices: ["OAD", "Manuel"] }) }],
    ]);
    faits.push(`référentiel des sites ${referentielSites} créé (à alimenter : export OAD, sites saisis à la main)`);
  } else faits.push(`référentiel des sites : ${referentielSites}`);
  // qualifications : celles de la table des réponses (choix d'attente remplacés par une proposition)
  await lireMeta();
  etatFormulaires.meta = metaCourante();
  const colonneQualification = rolesEffectifs().Qualification || "Qualification",
    optionsQualification =
      (etatFormulaires.meta[colonneQualification] && etatFormulaires.meta[colonneQualification].opts) || {};
  let choixQ = Array.isArray(optionsQualification.choices) ? optionsQualification.choices : [];
  if (!choixQ.length || choixQ.every((choix) => /^Catégorie \d+$/.test(choix))) {
    choixQ = ["Blocage total", "Blocage partiel", "Occupation", "Rassemblement", "RAS"];
    if (etatFormulaires.meta[colonneQualification])
      await actions([
        [
          "ModifyColumn",
          tableReponses,
          colonneQualification,
          { widgetOptions: JSON.stringify({ ...optionsQualification, choices: choixQ }) },
        ],
      ]);
    faits.push("qualifications proposées (du plus grave au moins grave) : " + choixQ.join(", "));
  }
  const optionsQualificationJson = JSON.stringify({
    choices: choixQ,
    choiceOptions: optionsQualification.choiceOptions || {},
  });
  // correspondances
  if (!existe("Sites_correspondances")) {
    await actions([
      [
        "AddTable",
        "Sites_correspondances",
        [
          ["Etablissement", `Ref:${tableEtablissement}`],
          ["Libelle", "Text"],
          ["Site", `Ref:${referentielSites}`],
          ["Occurrences", "Int"],
          ["Statut", "Choice"],
        ].map(([id, type]) => ({ id, type, isFormula: false })),
      ],
    ]);
    await actions([
      [
        "ModifyColumn",
        "Sites_correspondances",
        "Statut",
        {
          widgetOptions: JSON.stringify({
            choices: ["À valider", "Validé", "Écarté"],
            choiceOptions: { Validé: { fillColor: "#B8FEC9" }, Écarté: { fillColor: "#EEEEEE" } },
          }),
        },
      ],
    ]);
    faits.push("table Sites_correspondances créée");
  }
  // sous-table des sites
  await lireMeta();
  const tableSites = identifiant("Sites_signales", etatFormulaires.metaTables[0].tableId);
  await actions([
    [
      "AddTable",
      tableSites,
      [
        { id: "Dossier", type: `Ref:${tableReponses}`, isFormula: false },
        { id: "Ligne_id", type: "Text", isFormula: false },
        { id: "Ordre", type: "Int", isFormula: false },
        { id: "Site", type: `Ref:${referentielSites}`, isFormula: false },
        { id: "Site_libre", type: "Text", isFormula: false },
        { id: "Qualification", type: "Choice", isFormula: false },
        { id: "Precisions", type: "Text", isFormula: false },
      ],
    ],
  ]);
  // identifiants détachés des libellés d'abord : sans cela, Grist renommerait Site_libre, Qualification… d'après le libellé
  await actions([
    ...["Site", "Site_libre", "Qualification", "Precisions"].map((identifiantColonne) => [
      "ModifyColumn",
      tableSites,
      identifiantColonne,
      { untieColIdFromLabel: true },
    ]),
    ["ModifyColumn", tableSites, "Site", { label: "Site" }],
    ["ModifyColumn", tableSites, "Site_libre", { label: "Site hors référentiel", description: "[court]" }],
    [
      "ModifyColumn",
      tableSites,
      "Qualification",
      { label: "Qualification du site", widgetOptions: optionsQualificationJson, description: "*" },
    ],
    ["ModifyColumn", tableSites, "Precisions", { label: "Précisions" }],
  ]);
  await lireMeta();
  const actionsHistorique = actionsHistoriqueTableau(tableSites, "Dossier");
  if (actionsHistorique.length) {
    await actions(actionsHistorique);
    await lireMeta();
  }
  faits.push(`sous-table ${tableSites} (historisée)`);
  // question tableau des sites, qualification en bas
  etatFormulaires.meta = metaCourante();
  const colonne = await creerColonne(tableReponses, "Sites concernés", "Text", null);
  blocs().push({
    id: nouvelId(),
    section: "q",
    genre: "question",
    colonne,
    reglages: {
      libelle: "Sites concernés",
      tableau: {
        table: tableSites,
        sites: {
          site: "Site",
          libre: "Site_libre",
          qualif: "Qualification",
          historique: [],
          alias: "Sites_correspondances",
        },
      },
    },
  });
  etatFormulaires.courant.conf.saisie = {
    ...(etatFormulaires.courant.conf.saisie || {}),
    version: "esr",
    qualificationEnBas: true,
  };
  sauver();
  dessinerApercu();
  dessinerPanneau();
  reglesApresTableau(tableSites);
  return faits.join(" ; ");
}
async function reglesApresTableau(table) {
  clearTimeout(etatFormulaires.minuterie);
  const json = JSON.stringify(etatFormulaires.courant.conf),
    id = etatFormulaires.courant.id;
  etatFormulaires.enregistrementEnCours = etatFormulaires.enregistrementEnCours.then(() =>
    actions([["UpdateRecord", etatFormulaires.tableFormulaires, id, { Brouillon: json, Modifie_le: maintenant() }]]),
  );
  try {
    await etatFormulaires.enregistrementEnCours;
  } catch (_) {
    return;
  }
  let acces = { etat: "" };
  try {
    if (window.OngletAcces && window.OngletAcces.reappliquerSiBesoin)
      acces = await window.OngletAcces.reappliquerSiBesoin();
  } catch (erreur) {
    acces = { etat: "refusees", texte: String(erreur.message || erreur) };
  }
  if (acces.etat === "reappliquees") message(`Table ${table} : règles d'accès du socle appliquées.`, "ok");
  else if (["incomplet", "refusees", "illisibles"].includes(acces.etat))
    message(`Table ${table} : ${acces.texte}`, "err");
}

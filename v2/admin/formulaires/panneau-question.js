/* PRISME — administration, onglet « Formulaires » : formulaires/panneau-question.js
   Panneau de réglages d'un bloc : question (libellé, choix, couleurs, condition, champs d'un tableau, formule),
   titre, texte, partie, colonnes communes.
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : formulePiecesJointes, majCopieLiens, adapterPiecesJointes, dessinerPanneau, brancherEvenementsPanneau,
     dessinerPanneauBase, optionsParties, ajouterPartie, panneauPartie, panneauCommun, panneauDecor, majBloc,
     compterReponses, dessinerChoix, texteSur, modifierOptions, renommerChoix, changerTypeNombre, dessinerCondition,
     dessinerCouleur, reglagesSousColonne, descriptionSousColonne, dessinerSousColonnes, supprimerColonne,
     panneauFormule.
   Utilise :
     fondations : $, COULEURS, PARTIES_DEFAUT, ROLES, copie, esc, estVideValeur, etatFormulaires, identifiant,
       lisible, message, normaliser, typeBase.
     donnees : actions, ajouterColonne, colonnesDe, creerColonne, ecrireStructure, lireMeta, lireValeursColonne,
       modifierColonne, modifierLigneFormulaire, renommerLibelleColonne, retirerColonneDeTable.
     formulaire-courant : blocDe, blocs, colonneDeRef, libelleQuestion, lireReperes, majEtat, partieDe, parties,
       sauver.
     colonnes-roles : colonneEtablissement, groupeColonnesHtml, lierRoles, metaCourante.
     apercu : blocHtml, choisir, deplacer, dessinerApercu, etapeEtablissement, ouvrirMenu, retirerBloc, typeAffiche.
     mode-test : dessinerPanneauTest, sousColonnes, valeurFormuleTestPossible.
     sites-esr : groupeSitesHtml, lierSites.
     tableaux : renommerTableTableau.
     gestion : ajouterColonneService, analyserReferentiel, appliquerReferentiel, remplirChoixFormulaire,
       supprimerFormulaire.
     description : choixFormatQuestion, panneauDescription.
     saisie-etablissement : colonnesEtabProposees, groupePageHtml, groupeVersionHtml, groupesEtablissementHtml,
       lierEtablissement, lierPages, lierVersion, moduleRepartition, saisieEffective, sourceColonneEtablissement,
       tableEtablissements.
   Modifie etatFormulaires : choisi, colonnesEtablissementTest, etablissementTest, etablissementsTest, meta. */
/* Pièces jointes et liens d'établissement : Grist n'accepte qu'un utilisateur à accès restreint (lien d'établissement)
 place dans une cellule un fichier envoyé dans la même session que lui ; le formulaire envoie les fichiers par l'API
 (autre session). La cellule Pièces jointes est donc une formule : elle reprend les numéros écrits par le formulaire
 dans la colonne d'envoi, en vérifiant pour chacun l'empreinte SHA-1 du contenu (fileIdent de Grist) : seul celui qui a
 le fichier en main peut le joindre, impossible d'afficher la pièce d'un autre établissement en devinant son numéro. */
const formulePiecesJointes = (envoi) =>
  [
    `# Pièces jointes envoyées par le formulaire (colonne ${envoi} : « numéro:empreinte » de chaque fichier).`,
    "# Seuls les fichiers dont l'empreinte (SHA-1 du contenu) correspond sont retenus.",
    "ids = []",
    `for x in ($${envoi} or "").split():`,
    "  n, _, h = x.partition(':')",
    "  a = _grist_Attachments.lookupOne(id=int(n)) if n.isdigit() else None",
    "  if a and len(h) >= 40 and (a.fileIdent or '').startswith(h) and a.id not in ids:",
    "    ids.append(a.id)",
    "return ids",
  ].join("\n");
// Copie des colonnes lue par les liens d'établissement (clé « schema » de Config) : à rafraîchir dès qu'une colonne
// publiée change de nature (sinon le formulaire ouvert par lien écrit encore dans l'ancienne colonne)
async function majCopieLiens() {
  try {
    const configuration = await Socle.lireConfig(),
      general = Socle.general(configuration);
    return await moduleRepartition.majSchemaPublic(
      await Socle.lireMeta(),
      configuration,
      general,
      await moduleRepartition.lireFormulairesPublies(general),
    );
  } catch (_) {
    return false; /* copie pour les liens : facultative */
  }
}
// Question Pièces jointes déjà créée en colonne simple : passe en formule avec sa colonne d'envoi (pièces déjà jointes reprises)
async function adapterPiecesJointes(bloc) {
  const colonne = etatFormulaires.meta[bloc.colonne];
  if (!colonne || colonne.formule || colonne.pjEnvoi || typeBase(colonne.type) !== "Attachments") return;
  if (
    !confirm(
      `Rendre la question « ${libelleQuestion(bloc.colonne)} » utilisable par les liens d'établissement ?\n\nUne colonne « ${colonne.libelle} (envoi) » est ajoutée ; la colonne des pièces jointes devient une formule qui la lit. Les pièces déjà jointes sont conservées.`,
    )
  )
    return;
  try {
    const envoi = await creerColonne(etatFormulaires.courant.table, `${colonne.libelle} (envoi)`, "Text", null);
    const [donneesTable, piecesJointes] = await Promise.all([
      Donnees.lire(etatFormulaires.courant.table),
      Donnees.lire("_grist_Attachments"),
    ]);
    const identifiantsPieces = new Map(
      piecesJointes.id.map((id, i) => [id, String((piecesJointes.fileIdent || [])[i] || "").replace(/\..*$/, "")]),
    );
    const ids = [],
      valeurs = [];
    donneesTable.id.forEach((id, i) => {
      const valeur = donneesTable[bloc.colonne][i],
        numeros = Array.isArray(valeur) ? valeur.slice(1).filter((numero) => typeof numero === "number") : [];
      if (numeros.length) {
        ids.push(id);
        valeurs.push(numeros.map((numero) => `${numero}:${identifiantsPieces.get(numero) || ""}`).join(" "));
      }
    });
    const listeActions = [];
    if (ids.length) listeActions.push(["BulkUpdateRecord", etatFormulaires.courant.table, ids, { [envoi]: valeurs }]);
    listeActions.push([
      "ModifyColumn",
      etatFormulaires.courant.table,
      bloc.colonne,
      { isFormula: true, formula: formulePiecesJointes(envoi) },
    ]);
    await actions(listeActions);
    await lireMeta();
    etatFormulaires.meta = metaCourante();
    dessinerApercu();
    dessinerPanneau();
    await majCopieLiens();
    message(
      `Question « ${libelleQuestion(bloc.colonne)} » adaptée aux liens d'établissement (colonne ${envoi} ajoutée${ids.length ? `, ${ids.length} réponse(s) reprise(s)` : ""}). Les formulaires déjà ouverts doivent être rechargés.`,
      "ok",
    );
  } catch (erreur) {
    message(`Adaptation refusée par Grist (${erreur.message || erreur}).`, "err");
  }
}

/* =========================================================
 Panneau de réglages
 ========================================================= */
// Panneau de droite ; quand un élément est choisi, un lien ramène aux réglages du formulaire
function dessinerPanneau() {
  dessinerPanneauBase();
  if (etatFormulaires.modeTest || !etatFormulaires.courant || !etatFormulaires.choisi) return;
  const panneau = $("panneau");
  if (!panneau.firstElementChild || panneau.querySelector("#pn-retour")) return;
  panneau.insertAdjacentHTML(
    "afterbegin",
    `<button type="button" class="lien-retour" id="pn-retour">← Réglages du formulaire</button>`,
  );
  $("pn-retour").addEventListener("click", () => choisir(null));
}
// Échap : retour aux réglages du formulaire (sauf dans un champ de saisie ou un menu ouvert)
// Clavier du panneau de réglages ; appelé une fois au démarrage
function brancherEvenementsPanneau() {
  document.addEventListener("keydown", (evenement) => {
    if (
      evenement.key !== "Escape" ||
      !etatFormulaires.choisi ||
      etatFormulaires.modeTest ||
      $("formulaires").hidden ||
      !$("menu-ajout").hidden
    )
      return;
    if (evenement.target.closest && evenement.target.closest("input, select, textarea, dialog")) return;
    choisir(null);
  });
}
function dessinerPanneauBase() {
  const panneau = $("panneau");
  if (etatFormulaires.modeTest) return dessinerPanneauTest();
  const bloc = blocDe(etatFormulaires.choisi);
  if (!etatFormulaires.courant) {
    panneau.innerHTML = "";
    return;
  }
  if (String(etatFormulaires.choisi).startsWith("partie:"))
    return panneauPartie(partieDe(etatFormulaires.choisi.slice(7)));
  if (String(etatFormulaires.choisi).startsWith("commun:")) return panneauCommun(etatFormulaires.choisi.slice(7));
  if (!bloc) {
    panneau.innerHTML = `<h2>${esc(etatFormulaires.courant.nom)}</h2><p class="sous">table ${esc(etatFormulaires.courant.table)}${etatFormulaires.courant.publieLe ? ` · publié le ${Outils.dates.dateHeure(etatFormulaires.courant.publieLe, { dateStyle: "short", timeStyle: "short" })}` : " · jamais publié"}</p>
    <div class="vide-panneau"><p>Cliquez sur une question de l'aperçu pour la régler.</p><ul>
      <li>« + Ajouter une question » apparaît au survol, entre deux blocs.</li>
      <li>Glissez un bloc par sa poignée ⋮⋮ pour le déplacer (ou Alt + ↑ / ↓ au clavier).</li>
      <li>Les modifications sont enregistrées en brouillon : les formulaires des pages ne changent qu'au clic sur « Publier ».</li></ul></div>
    <div class="groupe"><div class="t">Formulaire</div><label class="l" for="pf-nom">Nom</label><input type="text" id="pf-nom" value="${esc(etatFormulaires.courant.nom)}">
    <button type="button" class="danger" id="pf-supprimer">Supprimer ce formulaire…</button></div>${groupeVersionHtml()}${groupePageHtml()}${groupeColonnesHtml()}`;
    lierVersion(panneau);
    lierPages(panneau);
    panneau
      .querySelectorAll("[data-ajout-col]")
      .forEach((bouton) => bouton.addEventListener("click", () => ajouterColonneService(bouton.dataset.ajoutCol)));
    lierRoles(panneau);
    $("pf-nom").addEventListener("change", async () => {
      const nouveauNom = $("pf-nom").value.trim();
      if (!nouveauNom) return;
      try {
        await modifierLigneFormulaire(etatFormulaires.courant.id, { Nom: nouveauNom });
        etatFormulaires.courant.nom = nouveauNom;
        const formulaire = etatFormulaires.formulaires.find((candidat) => candidat.id === etatFormulaires.courant.id);
        if (formulaire) formulaire.nom = nouveauNom;
        remplirChoixFormulaire();
        message(
          "Nom enregistré. Les pages qui avaient choisi ce formulaire par son nom devront le choisir à nouveau.",
          "ok",
        );
      } catch (erreur) {
        message(`Nom non enregistré : ${erreur.message || erreur}`, "err");
      }
    });
    $("pf-supprimer").addEventListener("click", supprimerFormulaire);
    return;
  }
  if (bloc.genre !== "question") return panneauDecor(bloc);
  const colonne = etatFormulaires.meta[bloc.colonne],
    reglages = (bloc.reglages = bloc.reglages || {});
  if (colonne && colonne.formule) return panneauFormule(bloc, colonne);
  if (!colonne) {
    panneau.innerHTML = `<h2>Colonne absente</h2><p class="avert">La colonne « ${esc(bloc.colonne)} » n'existe plus dans la table.</p><div class="pied-panneau"><button type="button" class="danger" id="pa-retirer">Retirer du formulaire</button></div>`;
    $("pa-retirer").addEventListener("click", () => retirerBloc(bloc));
    return;
  }
  const type = typeBase(colonne.type);
  const choixPossibles = (type === "Choice" || type === "ChoiceList") && !reglages.tableau;
  const nombre = type === "Int" || type === "Numeric";
  panneau.innerHTML = `<h2>${esc(reglages.libelle || colonne.libelle)}</h2><p class="sous">${esc(typeAffiche(bloc))} · <span id="pa-nb-rep">…</span></p>
  <label class="l" for="pa-libelle">Libellé</label><input type="text" id="pa-libelle" value="${esc(reglages.libelle || colonne.libelle)}">
  <label class="l" for="pa-aide">Aide affichée sous la question</label><textarea id="pa-aide">${esc(reglages.aide || "")}</textarea>
  <span class="ident" title="Identifiant de la colonne dans Grist, fixé à la création">colonne : ${esc(colonne.colId)}</span>
  <label class="l" for="pa-section" style="margin-top:8px">Partie du formulaire</label>
  <select id="pa-section">${optionsParties(bloc.section)}</select>

  <div class="groupe"><div class="t">Saisie</div>
    ${!reglages.tableau ? `<label class="interrupteur">Réponse obligatoire <input type="checkbox" id="pa-oblig"${reglages.obligatoire ? " checked" : ""}></label>` : `<label class="interrupteur">Au moins une ligne obligatoire <input type="checkbox" id="pa-oblig"${reglages.obligatoire ? " checked" : ""}></label>`}
    ${type === "Text" && !reglages.tableau ? `<label class="l">Zone de saisie</label><div class="seg2" role="group"><button type="button" data-court="1" aria-pressed="${!!reglages.court}">Une ligne</button><button type="button" data-court="0" aria-pressed="${!reglages.court}">Plusieurs lignes</button></div>` : ""}
    ${
      nombre
        ? `<label class="l">Type de nombre</label><div class="seg2" role="group"><button type="button" data-num="Int" aria-pressed="${type === "Int"}">Entier</button><button type="button" data-num="Numeric" aria-pressed="${type === "Numeric"}">Décimal</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="l" for="pa-min">Minimum</label><input type="number" id="pa-min" value="${reglages.min ?? ""}" placeholder="aucun"></div><div><label class="l" for="pa-max">Maximum</label><input type="number" id="pa-max" value="${reglages.max ?? ""}" placeholder="aucun"></div></div>`
        : ""
    }
    ${type === "Choice" ? `<label class="l" for="pa-affichage">Affichage</label><select id="pa-affichage"><option value="">Automatique (boutons jusqu'à 5 choix)</option><option value="boutons"${reglages.affichage === "boutons" ? " selected" : ""}>Boutons</option><option value="liste"${reglages.affichage === "liste" ? " selected" : ""}>Liste déroulante</option></select>` : ""}
    ${type === "Bool" ? `<label class="l" for="pa-affichage">Affichage</label><select id="pa-affichage"><option value="">Boutons Oui / Non</option><option value="case"${reglages.affichage === "case" ? " selected" : ""}>Case à cocher</option></select>` : ""}
  </div>
  ${
    choixPossibles
      ? `<div class="groupe"><div class="t">Choix proposés</div><div id="pa-choix"></div><button type="button" class="ajout-lien" id="pa-ajout-choix">+ Ajouter un choix</button>
    <p class="note" style="margin:6px 0 0">Les choix et leurs couleurs sont enregistrés tout de suite dans la colonne Grist. Renommer un choix met à jour les réponses déjà saisies.</p></div>`
      : ""
  }
  ${
    reglages.tableau
      ? `<div class="groupe"><div class="t">Table des lignes</div>
    <div class="ligne-sc"><input type="text" id="pa-table-nom" value="${esc(reglages.tableau.table)}" aria-label="Nom de la table des lignes" style="flex:1">
      <button type="button" class="secondaire petit" id="pa-table-renommer">Renommer la table</button></div>
    <p class="note" style="margin:4px 0 0">Renomme la table dans Grist (lignes, références et formules suivent) et dans tous les formulaires qui l'utilisent, brouillons et versions publiées.</p></div>
    <div class="groupe"><div class="t">Champs de chaque ligne (table ${esc(reglages.tableau.table)})</div><div id="pa-sous"></div>
    <div class="sous-col"><div class="ligne-sc"><input type="text" id="sc-nouveau-lib" placeholder="Nouveau champ (ex. Fonction)"><select id="sc-nouveau-type" style="width:auto;margin:0">
      <option value="Choice">Choix unique</option><option value="ChoiceList">Choix multiple</option><option value="Text">Texte</option><option value="Int">Nombre</option><option value="Bool">Oui / Non</option><option value="Date">Date</option></select>
      <button type="button" class="secondaire petit" id="sc-ajouter">Ajouter</button></div></div>
    <label class="l" for="pa-lignes">Nombre de lignes fixé par</label><select id="pa-lignes"><option value="">— (lignes ajoutées à la main)</option>${blocs()
      .filter(
        (bloc) =>
          bloc.genre === "question" &&
          etatFormulaires.meta[bloc.colonne] &&
          ["Int", "Numeric"].includes(typeBase(etatFormulaires.meta[bloc.colonne].type)),
      )
      .map(
        (bloc) =>
          `<option value="${esc(bloc.colonne)}"${reglages.tableau.lignes === bloc.colonne ? " selected" : ""}>${esc(libelleQuestion(bloc.colonne))}</option>`,
      )
      .join("")}</select></div>`
      : ""
  }

  ${reglages.tableau ? groupeSitesHtml(bloc) : ""}
  ${
    type === "Attachments"
      ? `<div class="groupe"><div class="t">Pièces jointes</div>${
          colonne && colonne.pjEnvoi
            ? `<p class="note" style="margin:0">Utilisable par tous, liens d'établissement compris : le formulaire écrit dans la colonne « ${esc((etatFormulaires.meta[colonne.pjEnvoi] || {}).libelle || colonne.pjEnvoi)} » et ne sont retenus que les fichiers qu'il a envoyés (empreinte vérifiée).</p>`
            : `<p class="note" style="margin:0 0 6px">Les liens d'établissement ne peuvent pas joindre de fichier à cette question (Grist : « cannot access attachment »).</p><button type="button" class="secondaire petit" id="pa-pj-adapter">Rendre utilisable par les liens d'établissement</button>`
        }</div>`
      : ""
  }
  <div class="groupe"><div class="t">Affichage conditionnel</div><div id="pa-condition"></div></div>
  ${!reglages.tableau && type !== "Text" && type !== "Ref" && type !== "RefList" && type !== "Attachments" ? `<div class="groupe"><div class="t">Couleur du formulaire</div><div id="pa-couleur"></div></div>` : ""}
  <div class="groupe"><div class="t">Données et diffusion</div>
    <label class="interrupteur">Confidentiel (exclu de la description automatique) <input type="checkbox" id="pa-conf"${reglages.confidentiel ? " checked" : ""}></label>
    <label class="l" for="pa-format">Dans la description automatique</label>
    <select id="pa-format">${choixFormatQuestion(bloc)
      .map(
        ([valeur, libelle]) =>
          `<option value="${valeur}"${(reglages.format || "defaut") === valeur ? " selected" : ""}>${libelle}</option>`,
      )
      .join("")}</select>
  </div>
  <div class="pied-panneau"><button type="button" class="danger" id="pa-retirer">Retirer du formulaire</button><button type="button" class="danger" id="pa-supprimer" disabled>Supprimer la colonne…</button></div>`;
  // champs simples
  const lier = (id, evenement, ecouteur) => {
    const element = $(id);
    if (element) element.addEventListener(evenement, ecouteur);
  };
  lier("pa-libelle", "input", (evenement) => {
    reglages.libelle = evenement.target.value;
    panneau.querySelector("h2").textContent = evenement.target.value || colonne.libelle;
    majBloc(bloc);
    sauver();
  });
  lier("pa-aide", "input", (evenement) => {
    reglages.aide = evenement.target.value.trim();
    majBloc(bloc);
    sauver();
  });
  lier("pa-section", "change", (evenement) => {
    deplacer(bloc.id, blocs().length, evenement.target.value);
    choisir(bloc.id);
  });
  lier("pa-oblig", "change", (evenement) => {
    reglages.obligatoire = evenement.target.checked;
    majBloc(bloc);
    sauver();
  });
  lier("pa-conf", "change", (evenement) => {
    reglages.confidentiel = evenement.target.checked;
    majBloc(bloc);
    sauver();
  });
  lier("pa-format", "change", (evenement) => {
    reglages.format = evenement.target.value === "defaut" ? undefined : evenement.target.value;
    sauver();
  });
  lier("pa-affichage", "change", (evenement) => {
    reglages.affichage = evenement.target.value || undefined;
    majBloc(bloc);
    sauver();
  });
  lier("pa-min", "input", (evenement) => {
    reglages.min = evenement.target.value === "" ? undefined : parseFloat(evenement.target.value);
    sauver();
  });
  lier("pa-max", "input", (evenement) => {
    reglages.max = evenement.target.value === "" ? undefined : parseFloat(evenement.target.value);
    sauver();
  });
  lier("pa-lignes", "change", (evenement) => {
    reglages.tableau.lignes = evenement.target.value || null;
    majBloc(bloc);
    sauver();
  });
  lier("pa-table-renommer", "click", () => renommerTableTableau(bloc, $("pa-table-nom").value));
  lier("pa-pj-adapter", "click", () => adapterPiecesJointes(bloc));
  lier("pa-table-nom", "keydown", (evenement) => {
    if (evenement.key === "Enter") {
      evenement.preventDefault();
      renommerTableTableau(bloc, evenement.target.value);
    }
  });
  panneau.querySelectorAll("[data-court]").forEach((bouton) =>
    bouton.addEventListener("click", () => {
      reglages.court = bouton.dataset.court === "1";
      dessinerPanneau();
      majBloc(bloc);
      sauver();
    }),
  );
  panneau
    .querySelectorAll("[data-num]")
    .forEach((bouton) => bouton.addEventListener("click", () => changerTypeNombre(bloc, bouton.dataset.num)));
  lier("pa-retirer", "click", () => retirerBloc(bloc));
  lier("pa-supprimer", "click", () => supprimerColonne(bloc));
  if (choixPossibles) dessinerChoix(bloc);
  if (reglages.tableau) {
    dessinerSousColonnes(bloc);
    lierSites(bloc);
  }
  dessinerCondition(bloc);
  if ($("pa-couleur")) dessinerCouleur(bloc);
  compterReponses(bloc);
}
const optionsParties = (partieChoisie) =>
  parties()
    .map(
      (partie) =>
        `<option value="${esc(partie.id)}"${(partieChoisie || "q") === partie.id ? " selected" : ""}>${esc(partie.nom)}${partie.role === "q" ? "" : " (visa)"}</option>`,
    )
    .join("");
function ajouterPartie() {
  const nom = prompt("Nom de la nouvelle partie :", "Nouvelle partie");
  if (!nom || !nom.trim()) return;
  const listeParties =
    etatFormulaires.courant.conf.parties || (etatFormulaires.courant.conf.parties = copie(PARTIES_DEFAUT));
  const nouvellePartie = { id: "p" + Date.now().toString(36), nom: nom.trim(), role: "q", titre: true };
  const dernierIndexQuestion = listeParties.map((partie) => partie.role).lastIndexOf("q");
  listeParties.splice(dernierIndexQuestion + 1, 0, nouvellePartie);
  etatFormulaires.choisi = `partie:${nouvellePartie.id}`;
  sauver();
  dessinerApercu();
  dessinerPanneau();
}
function panneauPartie(partie) {
  const panneau = $("panneau"),
    partiesQuestions = parties().filter((autrePartie) => autrePartie.role === "q"),
    k = partiesQuestions.indexOf(partie);
  const nombreBlocs = blocs().filter((bloc) => (bloc.section || "q") === partie.id).length;
  panneau.innerHTML = `<h2>Partie : ${esc(partie.nom)}</h2><p class="sous">${esc(ROLES[partie.role])} · ${nombreBlocs} bloc${nombreBlocs > 1 ? "s" : ""}</p>
  <label class="l" for="pp-nom">Nom</label><input type="text" id="pp-nom" value="${esc(partie.nom)}">
  ${
    partie.role === "q"
      ? `<label class="interrupteur">Afficher le nom en titre dans le formulaire <input type="checkbox" id="pp-titre"${partie.titre ? " checked" : ""}></label>
    <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="secondaire petit" id="pp-haut"${k <= 0 ? " disabled" : ""}>↑ Monter</button><button type="button" class="secondaire petit" id="pp-bas"${k >= partiesQuestions.length - 1 ? " disabled" : ""}>↓ Descendre</button></div>`
      : `<p class="note">Ce nom remplace « ${partie.role === "vd" ? "Échelon départemental" : "Échelon académique"} » dans l'onglet Visas du widget de saisie. Les questions de cette partie ne sont visibles que des échelons concernés.</p>`
  }
  <div class="pied-panneau">${partie.role === "q" && partiesQuestions.length > 1 ? `<button type="button" class="danger" id="pp-suppr">Supprimer la partie…</button>` : "<span></span>"}</div>`;
  $("pp-nom").addEventListener("input", (evenement) => {
    partie.nom = evenement.target.value;
    panneau.querySelector("h2").textContent = `Partie : ${partie.nom}`;
    const entete = document.querySelector(`[data-partie="${partie.id}"]`);
    if (entete) entete.firstChild.textContent = partie.nom + " ";
    sauver();
  });
  const caseTitre = $("pp-titre");
  if (caseTitre)
    caseTitre.addEventListener("change", (evenement) => {
      partie.titre = evenement.target.checked;
      sauver();
      dessinerApercu();
    });
  const bouger = (decalage) => {
    const listeParties = etatFormulaires.courant.conf.parties,
      i = listeParties.indexOf(partie),
      cible = listeParties.indexOf(partiesQuestions[k + decalage]);
    [listeParties[i], listeParties[cible]] = [listeParties[cible], listeParties[i]];
    sauver();
    dessinerApercu();
    dessinerPanneau();
  };
  if ($("pp-haut")) $("pp-haut").addEventListener("click", () => bouger(-1));
  if ($("pp-bas")) $("pp-bas").addEventListener("click", () => bouger(1));
  if ($("pp-suppr"))
    $("pp-suppr").addEventListener("click", () => {
      const partieDestination = partiesQuestions[k === 0 ? 1 : k - 1];
      if (
        nombreBlocs &&
        !confirm(
          `Supprimer la partie « ${partie.nom} » ? Ses ${nombreBlocs} bloc(s) rejoindront la partie « ${partieDestination.nom} ».`,
        )
      )
        return;
      blocs().forEach((bloc) => {
        if ((bloc.section || "q") === partie.id) bloc.section = partieDestination.id;
      });
      etatFormulaires.courant.conf.parties = etatFormulaires.courant.conf.parties.filter(
        (autrePartie) => autrePartie !== partie,
      );
      etatFormulaires.choisi = null;
      sauver();
      dessinerApercu();
      dessinerPanneau();
    });
}
function panneauCommun(colId) {
  const panneau = $("panneau"),
    colonne = etatFormulaires.meta[colId];
  if (colId === "Description") return panneauDescription();
  const textes = {
    Site: "Site, campus ou bâtiment concerné, en saisie libre et facultative. Il est repris dans l'en-tête de la description automatique et dans le repérage des doublons (même établissement, même site, même date des faits).",
    Etablissement: `Recherche de l'établissement par son nom ou son UAI (${etatFormulaires.courant.type === "etablissement" && saisieEffective().annuaires.length ? "référentiel du document, puis annuaires en ligne cochés ci-dessous" : "référentiel du document"}), complétion automatique de ses informations, mail et lien d'accès. Le premier enregistrement crée le signalement ; les suivants en créent des mises à jour (versions).`,
    Date_faits:
      "Jour des faits signalés, aujourd'hui par défaut. Sert au classement des versions, au décompte des jours de mobilisation et au point de situation.",
    Description:
      "Rédigée automatiquement à partir des réponses ; son format se règle en cliquant sur la description de l'aperçu, et pour chaque question dans « Données et diffusion ».",
    Qualification: "Qualification du signalement, obligatoire. Ses choix et leurs couleurs se règlent ici.",
  };
  panneau.innerHTML = `<h2>${esc(colonne ? colonne.libelle : colId)}</h2><p class="sous">Champ commun du questionnaire établissement · colonne ${esc(colId)}</p><p class="note">${esc(textes[colId] || "")}</p>
  ${
    colId === "Qualification" && colonne
      ? `<div class="groupe"><div class="t">Choix proposés</div><div id="pa-choix"></div><button type="button" class="ajout-lien" id="pa-ajout-choix">+ Ajouter un choix</button></div>
    <div class="groupe"><div class="t">Couleur du formulaire</div><label class="interrupteur">Colorer le formulaire selon la qualification <input type="checkbox" id="pq-couleur"${/\[\s*couleurs?\b/i.test(colonne.description) ? " checked" : ""}></label>
    <p class="note" style="margin:0">Enregistré tout de suite dans la colonne (repère [couleur]). Donnez une couleur à chaque choix ci-dessus (carré de couleur).</p></div>`
      : ""
  }
  ${
    colId === "Etablissement"
      ? `<div class="groupe"><div class="t">Référentiel</div><p class="note" style="margin:0 0 8px">Table <b>${esc(tableEtablissements() || "?")}</b> (référence de la colonne Etablissement).</p>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><select id="pc-ref" aria-label="Autre référentiel" style="margin:0">${etatFormulaires.tables
      .filter(
        (identifiantTable) =>
          identifiantTable !== etatFormulaires.courant.table && identifiantTable !== etatFormulaires.tableFormulaires,
      )
      .map(
        (identifiantTable) =>
          `<option value="${esc(identifiantTable)}"${identifiantTable === tableEtablissements() ? " selected" : ""}>${esc(identifiantTable)}</option>`,
      )
      .join("")}</select>
      <button type="button" class="secondaire petit" id="pc-ref-ok">Changer</button></div><p class="note" id="pc-ref-info" style="margin:0 0 8px"></p>
    ${tableEtablissements() ? `<button type="button" class="secondaire petit" id="pc-ajout-etab">+ Afficher une donnée de la fiche…</button><p class="note" style="margin:6px 0 0">Effectif, région académique, tutelle… : affichée en lecture seule dès que l'établissement est choisi, et reprise dans la description si besoin.</p>` : ""}</div>
    ${groupesEtablissementHtml()}`
      : ""
  }`;
  if (colId === "Etablissement") lierEtablissement(panneau);
  if ($("pc-ref")) {
    const majInfo = async () => {
      const tableChoisie = $("pc-ref").value,
        i = $("pc-ref-info");
      if (tableChoisie === tableEtablissements()) {
        i.textContent = "";
        $("pc-ref-ok").disabled = true;
        return;
      }
      i.textContent = "Vérification…";
      const analyse = await analyserReferentiel(etatFormulaires.courant.table, tableChoisie);
      if ($("pc-ref").value !== tableChoisie) return;
      i.textContent = analyse.erreur || analyse.texte;
      i.classList.toggle("avert", !!analyse.erreur);
      $("pc-ref-ok").disabled = !!analyse.erreur;
    };
    $("pc-ref-ok").disabled = true;
    $("pc-ref").addEventListener("change", majInfo);
    $("pc-ref-ok").addEventListener("click", async () => {
      const analyse = await analyserReferentiel(etatFormulaires.courant.table, $("pc-ref").value);
      if (analyse.erreur) {
        $("pc-ref-info").textContent = analyse.erreur;
        return;
      }
      if (!confirm(`Rattacher le formulaire au référentiel « ${$("pc-ref").value} » ?\n${analyse.texte}`)) return;
      try {
        await appliquerReferentiel(etatFormulaires.courant.table, analyse);
        etatFormulaires.meta = metaCourante();
        etatFormulaires.etablissementsTest = null;
        etatFormulaires.etablissementTest = null;
        etatFormulaires.colonnesEtablissementTest = {};
        dessinerApercu();
        dessinerPanneau();
        message(`Référentiel des établissements : ${analyse.cible}.`, "ok");
      } catch (erreur) {
        message(`Changement refusé : ${erreur.message || erreur}`, "err");
      }
    });
  }
  if ($("pc-ajout-etab"))
    $("pc-ajout-etab").addEventListener("click", () => {
      const partieQuestions = parties().find((partie) => partie.role === "q"),
        premier = blocs().findIndex((bloc) => (bloc.section || "q") === partieQuestions.id);
      const ancre =
        document.querySelector(`[data-section-feuille="${partieQuestions.id}"] [data-ajout]`) || $("pc-ajout-etab");
      ouvrirMenu(partieQuestions.id, premier < 0 ? blocs().length : premier, ancre);
      etapeEtablissement();
    });
  if (colId === "Qualification" && colonne) {
    dessinerChoix({ id: "commun:Qualification", genre: "commun", colonne: "Qualification" });
    $("pq-couleur").addEventListener("change", async (evenement) => {
      const sans = colonne.description.replace(/\[\s*couleurs?\b[^\]]*\]\s*/gi, "").trim();
      try {
        await modifierColonne(etatFormulaires.courant.table, etatFormulaires.meta.Qualification.colId, {
          description: evenement.target.checked ? `[couleur] ${sans}`.trim() : sans,
        });
        etatFormulaires.meta = metaCourante();
      } catch (erreur) {
        message(`Réglage refusé : ${erreur.message || erreur}`, "err");
      }
    });
  }
}
function panneauDecor(bloc) {
  const panneau = $("panneau");
  panneau.innerHTML = `<h2>${bloc.genre === "titre" ? "Titre de section" : "Texte d'information"}</h2><p class="sous">Bloc d'affichage, sans colonne ni réponse.</p>
  <label class="l" for="pd-texte">${bloc.genre === "titre" ? "Titre" : "Texte"}</label>
  ${bloc.genre === "titre" ? `<input type="text" id="pd-texte" value="${esc(bloc.texte || "")}">` : `<textarea id="pd-texte" style="min-height:110px">${esc(bloc.texte || "")}</textarea>`}
  <label class="l" for="pd-section">Partie du formulaire</label>
  <select id="pd-section">${optionsParties(bloc.section)}</select>
  <div class="pied-panneau"><button type="button" class="danger" id="pd-retirer">Retirer du formulaire</button></div>`;
  $("pd-texte").addEventListener("input", (evenement) => {
    bloc.texte = evenement.target.value;
    majBloc(bloc);
    sauver();
  });
  $("pd-section").addEventListener("change", (evenement) => {
    deplacer(bloc.id, blocs().length, evenement.target.value);
    choisir(bloc.id);
  });
  $("pd-retirer").addEventListener("click", () => retirerBloc(bloc));
}
function majBloc(bloc) {
  // redessine un seul bloc de l'aperçu (sans perdre la saisie du panneau)
  const element = document.querySelector(`[data-bloc="${bloc.id}"]`);
  if (!element) return;
  const conteneur = document.createElement("div");
  conteneur.innerHTML = blocHtml(bloc);
  element.replaceWith(conteneur.firstElementChild);
  majEtat();
}
async function compterReponses(bloc) {
  const element = $("pa-nb-rep");
  if (!element) return;
  try {
    const nombre = (await lireValeursColonne(etatFormulaires.courant.table, bloc.colonne)).filter(
      (valeur) => lisible(valeur) && !estVideValeur(valeur),
    ).length;
    if (!$("pa-nb-rep")) return;
    element.textContent = `${nombre} réponse${nombre > 1 ? "s" : ""} enregistrée${nombre > 1 ? "s" : ""}`;
    const boutonSupprimer = $("pa-supprimer");
    if (boutonSupprimer) {
      boutonSupprimer.disabled = nombre > 0;
      boutonSupprimer.title =
        nombre > 0
          ? "La colonne contient des réponses : elle ne peut pas être supprimée d'ici"
          : "Supprimer définitivement la colonne vide";
    }
    bloc._reponses = nombre;
  } catch (_) {
    element.textContent = "réponses non lisibles";
  }
}

/* ---------- choix et couleurs ---------- */
function dessinerChoix(bloc) {
  const colonne = etatFormulaires.meta[bloc.colonne],
    choix = colonne.opts.choices || [],
    optionsChoix = colonne.opts.choiceOptions || {};
  $("pa-choix").innerHTML =
    choix
      .map((texteChoix, i) => {
        const couleur = (optionsChoix[texteChoix] || {}).fillColor;
        return `<div class="choix-edit" data-i="${i}"><button type="button" class="icone" data-ch="haut" aria-label="Monter ${esc(texteChoix)}" ${i === 0 ? "disabled" : ""}>↑</button>
    <input type="color" value="${couleur || "#ffffff"}" aria-label="Couleur de ${esc(texteChoix)}" title="${couleur ? "Couleur du choix" : "Sans couleur (cliquez pour en choisir une)"}">
    <input type="text" value="${esc(texteChoix)}" aria-label="Choix ${i + 1}">
    ${couleur ? `<button type="button" class="icone" data-ch="sans" title="Retirer la couleur" aria-label="Retirer la couleur de ${esc(texteChoix)}">◌</button>` : ""}
    <button type="button" class="icone" data-ch="suppr" aria-label="Supprimer le choix ${esc(texteChoix)}">✕</button></div>`;
      })
      .join("") || `<p class="note">Aucun choix.</p>`;
  $("pa-choix")
    .querySelectorAll(".choix-edit")
    .forEach((blocChoix) => {
      const i = +blocChoix.dataset.i,
        ancien = choix[i];
      blocChoix
        .querySelector("input[type=text]")
        .addEventListener("change", (evenement) => renommerChoix(bloc, ancien, evenement.target.value.trim()));
      blocChoix.querySelector("input[type=color]").addEventListener("change", (evenement) =>
        modifierOptions(bloc, (options) => {
          options.choiceOptions = options.choiceOptions || {};
          options.choiceOptions[ancien] = {
            ...(options.choiceOptions[ancien] || {}),
            fillColor: evenement.target.value,
            textColor: texteSur(evenement.target.value),
          };
        }),
      );
      blocChoix.querySelectorAll("[data-ch]").forEach((bouton) =>
        bouton.addEventListener("click", () => {
          if (bouton.dataset.ch === "suppr") {
            if (
              confirm(
                `Supprimer le choix « ${ancien} » ? Les réponses déjà saisies le conservent, mais il ne sera plus proposé.`,
              )
            )
              modifierOptions(bloc, (options) => {
                options.choices = (options.choices || []).filter((texteChoix) => texteChoix !== ancien);
                if (options.choiceOptions) delete options.choiceOptions[ancien];
              });
          } else if (bouton.dataset.ch === "sans")
            modifierOptions(bloc, (options) => {
              if (options.choiceOptions) delete options.choiceOptions[ancien];
            });
          else if (bouton.dataset.ch === "haut" && i > 0)
            modifierOptions(bloc, (options) => {
              const liste = options.choices;
              [liste[i - 1], liste[i]] = [liste[i], liste[i - 1]];
            });
        }),
      );
    });
  $("pa-ajout-choix").onclick = () => {
    const nom = prompt("Nouveau choix :");
    if (!nom || !nom.trim()) return;
    modifierOptions(bloc, (options) => {
      options.choices = [...(options.choices || []), nom.trim()];
    });
  };
}
function texteSur(hex) {
  const correspondance = String(hex).match(/^#?([0-9a-f]{6})$/i);
  if (!correspondance) return "#161616";
  const [rouge, vert, bleu] = [0, 2, 4].map((i) => parseInt(correspondance[1].slice(i, i + 2), 16));
  return 0.299 * rouge + 0.587 * vert + 0.114 * bleu > 150 ? "#161616" : "#FFFFFF";
}
async function modifierOptions(blocOuColonne, modifier, table) {
  const tableCible = table || etatFormulaires.courant.table,
    colonnes = colonnesDe(tableCible),
    colonne = colonnes[blocOuColonne.colonne || blocOuColonne];
  const options = copie(colonne.opts || {});
  modifier(options);
  try {
    await actions([["ModifyColumn", tableCible, colonne.colId, { widgetOptions: JSON.stringify(options) }]]);
    await lireMeta();
    etatFormulaires.meta = metaCourante();
    if (typeof blocOuColonne === "object" && blocOuColonne.genre === "commun") {
      dessinerApercu();
      dessinerPanneau();
    } else if (typeof blocOuColonne === "object") {
      majBloc(blocOuColonne);
      dessinerPanneau();
    } else dessinerPanneau();
  } catch (erreur) {
    message(`Modification refusée : ${erreur.message || erreur}`, "err");
  }
}
async function renommerChoix(bloc, ancien, nouveau) {
  if (!nouveau || nouveau === ancien) return;
  const colonne = etatFormulaires.meta[bloc.colonne];
  if ((colonne.opts.choices || []).includes(nouveau)) {
    if (!(colonne.opts.choices || []).includes(ancien)) return; // renommage déjà fait (événement répété)
    message(`Le choix « ${nouveau} » existe déjà.`, "err");
    dessinerPanneau();
    return;
  }
  const options = copie(colonne.opts);
  options.choices = options.choices.map((texteChoix) => (texteChoix === ancien ? nouveau : texteChoix));
  if (options.choiceOptions && options.choiceOptions[ancien]) {
    options.choiceOptions[nouveau] = options.choiceOptions[ancien];
    delete options.choiceOptions[ancien];
  }
  try {
    // RenameChoices met aussi à jour les réponses déjà enregistrées (versions récentes de Grist)
    try {
      await actions([["RenameChoices", etatFormulaires.courant.table, colonne.colId, { [ancien]: nouveau }]]);
    } catch (_) {
      message(
        "Ancien choix conservé dans les réponses déjà saisies (version de Grist sans renommage des choix).",
        "err",
      );
    }
    await actions([
      ["ModifyColumn", etatFormulaires.courant.table, colonne.colId, { widgetOptions: JSON.stringify(options) }],
    ]);
    // les conditions qui citaient l'ancien choix suivent
    for (const bloc of blocs()) {
      const condition = bloc.reglages && bloc.reglages.condition;
      if (condition && colonneDeRef(condition.ref) === colonne)
        condition.valeurs = (condition.valeurs || []).map((valeur) => (valeur === ancien ? nouveau : valeur));
    }
    sauver();
    await lireMeta();
    etatFormulaires.meta = metaCourante();
    dessinerApercu();
    dessinerPanneau();
  } catch (erreur) {
    message(`Renommage refusé : ${erreur.message || erreur}`, "err");
  }
}
async function changerTypeNombre(bloc, type) {
  const colonne = etatFormulaires.meta[bloc.colonne];
  if (typeBase(colonne.type) === type) return;
  if (
    (bloc._reponses || 0) > 0 &&
    type === "Int" &&
    !confirm("Passer en nombre entier arrondit les valeurs décimales déjà saisies. Continuer ?")
  )
    return;
  try {
    await actions([["ModifyColumn", etatFormulaires.courant.table, colonne.colId, { type }]]);
    await lireMeta();
    etatFormulaires.meta = metaCourante();
    majBloc(bloc);
    dessinerPanneau();
  } catch (erreur) {
    message(`Changement de type refusé : ${erreur.message || erreur}`, "err");
  }
}

/* ---------- condition construite avec des menus ---------- */
function dessinerCondition(bloc) {
  const reglages = bloc.reglages,
    condition = reglages.condition || null,
    element = $("pa-condition");
  const autres = blocs().filter(
    (autreBloc) =>
      autreBloc.genre === "question" &&
      autreBloc.id !== bloc.id &&
      etatFormulaires.meta[autreBloc.colonne] &&
      !(autreBloc.reglages && autreBloc.reglages.tableau),
  );
  const horsForm = Object.values(etatFormulaires.meta)
    .filter(
      (colonne) =>
        !autres.some((autreBloc) => autreBloc.colonne === colonne.colId) &&
        colonne.colId !== bloc.colonne &&
        colonne.colId !== "id",
    )
    .sort((colonneA, colonneB) => colonneA.pos - colonneB.pos);
  const identifiantReference = condition ? (colonneDeRef(condition.ref) || {}).colId : "";
  element.innerHTML = `<div class="condition"><label class="l" for="pc-col">Afficher cette question si</label>
  <select id="pc-col"><option value="">— toujours affichée —</option>
    ${autres.length ? `<optgroup label="Questions du formulaire">${autres.map((autreBloc) => `<option value="${esc(autreBloc.colonne)}"${identifiantReference === autreBloc.colonne ? " selected" : ""}>${esc(libelleQuestion(autreBloc.colonne))}</option>`).join("")}</optgroup>` : ""}
    <optgroup label="Autres colonnes de la table">${horsForm.map((colonne) => `<option value="${esc(colonne.colId)}"${identifiantReference === colonne.colId ? " selected" : ""}>${esc(colonne.libelle)}</option>`).join("")}</optgroup></select>
  <div id="pc-suite"></div></div>`;
  $("pc-col").addEventListener("change", (evenement) => {
    reglages.condition = evenement.target.value ? { ref: evenement.target.value, op: "=", valeurs: [] } : undefined;
    const colonneChoisie = etatFormulaires.meta[evenement.target.value];
    if (colonneChoisie && !["Choice", "ChoiceList", "Bool"].includes(typeBase(colonneChoisie.type)))
      reglages.condition.op = "rempli";
    if (colonneChoisie && typeBase(colonneChoisie.type) === "Bool") reglages.condition.valeurs = ["Oui"];
    majBloc(bloc);
    sauver();
    dessinerCondition(bloc);
  });
  if (!condition || !identifiantReference) return;
  const colonneRef = etatFormulaires.meta[identifiantReference],
    type = typeBase(colonneRef.type);
  const operateurs = ["Choice", "ChoiceList"].includes(type)
    ? [
        ["=", "est l'un de"],
        ["!=", "n'est pas"],
        ["rempli", "est renseigné"],
        ["vide", "est vide"],
      ]
    : type === "Bool"
      ? [["=", "est"]]
      : ["Int", "Numeric"].includes(type)
        ? [
            ["rempli", "est renseigné"],
            ["vide", "est vide"],
            [">", "est supérieur à"],
            [">=", "est au moins"],
            ["<", "est inférieur à"],
            ["<=", "est au plus"],
            ["=", "est égal à"],
            ["!=", "est différent de"],
          ]
        : [
            ["rempli", "est renseigné"],
            ["vide", "est vide"],
            ["=", "est égal à"],
            ["!=", "est différent de"],
          ];
  let valeurs = "";
  if (condition.op !== "rempli" && condition.op !== "vide") {
    if (["Choice", "ChoiceList"].includes(type))
      valeurs = `<div class="valeurs-c">${(colonneRef.opts.choices || []).map((texteChoix) => `<label><input type="checkbox" value="${esc(texteChoix)}"${(condition.valeurs || []).includes(texteChoix) ? " checked" : ""}> ${esc(texteChoix)}</label>`).join("")}</div>`;
    else if (type === "Bool")
      valeurs = `<select id="pc-bool"><option${(condition.valeurs || [])[0] !== "Non" ? " selected" : ""}>Oui</option><option${(condition.valeurs || [])[0] === "Non" ? " selected" : ""}>Non</option></select>`;
    else
      valeurs = `<input type="${["Int", "Numeric"].includes(type) ? "number" : "text"}" id="pc-val" value="${esc((condition.valeurs || []).join(", "))}" placeholder="valeur">`;
  }
  $("pc-suite").innerHTML =
    `<select id="pc-op">${operateurs.map(([valeur, libelle]) => `<option value="${valeur}"${condition.op === valeur ? " selected" : ""}>${libelle}</option>`).join("")}</select>${valeurs}
  ${condition.ref && !blocs().some((autreBloc) => autreBloc.colonne === identifiantReference) ? `<p class="note" style="margin:4px 0 0">Colonne hors formulaire : sa valeur est celle déjà enregistrée (dernière version du signalement).</p>` : ""}`;
  $("pc-op").addEventListener("change", (evenement) => {
    condition.op = evenement.target.value;
    if (condition.op === "rempli" || condition.op === "vide") condition.valeurs = [];
    majBloc(bloc);
    sauver();
    dessinerCondition(bloc);
  });
  $("pc-suite")
    .querySelectorAll(".valeurs-c input")
    .forEach((caseACocher) =>
      caseACocher.addEventListener("change", () => {
        condition.valeurs = [...$("pc-suite").querySelectorAll(".valeurs-c input:checked")].map((i) => i.value);
        majBloc(bloc);
        sauver();
      }),
    );
  if ($("pc-bool"))
    $("pc-bool").addEventListener("change", (evenement) => {
      condition.valeurs = [evenement.target.value];
      majBloc(bloc);
      sauver();
    });
  if ($("pc-val"))
    $("pc-val").addEventListener("input", (evenement) => {
      condition.valeurs = evenement.target.value.split(/\s*,\s*/).filter(Boolean);
      majBloc(bloc);
      sauver();
    });
}

/* ---------- couleur du formulaire selon la réponse ---------- */
function dessinerCouleur(bloc) {
  const reglages = bloc.reglages,
    colonne = etatFormulaires.meta[bloc.colonne],
    type = typeBase(colonne.type),
    element = $("pa-couleur");
  if (type === "Choice" || type === "ChoiceList") {
    element.innerHTML = `<label class="interrupteur">Colorer le formulaire selon la réponse <input type="checkbox" id="pk-choix"${reglages.couleur === "choix" ? " checked" : ""}></label>
    <p class="note" style="margin:0">Couleurs prises dans les choix ci-dessus. Plusieurs réponses : la première dans l'ordre des choix l'emporte.</p>`;
    $("pk-choix").addEventListener("change", (evenement) => {
      reglages.couleur = evenement.target.checked ? "choix" : undefined;
      sauver();
    });
    return;
  }
  const regles = Array.isArray(reglages.couleur) ? reglages.couleur : [];
  const operateursCouleur =
    type === "Bool"
      ? [
          ["Oui", "si Oui"],
          ["Non", "si Non"],
        ]
      : type === "Date" || type === "DateTime"
        ? [
            ["renseigné", "si renseignée"],
            ["vide", "si vide"],
          ]
        : [
            [">", "au-delà de"],
            [">=", "à partir de"],
            ["<", "en dessous de"],
            ["<=", "jusqu'à"],
            ["=", "égal à"],
          ];
  const decoupe = (cle) => {
    const correspondance = String(cle).match(/^(>=|<=|>|<|=)?\s*(.*)$/);
    return type === "Bool" || type === "Date" || type === "DateTime"
      ? [cle, ""]
      : [correspondance[1] || "=", correspondance[2]];
  };
  element.innerHTML =
    regles
      .map((regle, i) => {
        const [operateur, valeur] = decoupe(regle.cle);
        const hex = COULEURS[normaliser(regle.couleur)] || regle.couleur;
        return `<div class="choix-edit" data-i="${i}"><select class="pk-op" style="width:auto;margin:0">${operateursCouleur.map(([symbole, libelle]) => `<option value="${symbole}"${symbole === operateur ? " selected" : ""}>${libelle}</option>`).join("")}</select>
    ${type === "Bool" || type === "Date" || type === "DateTime" ? "" : `<input type="number" class="pk-val" value="${esc(valeur)}" style="width:80px;margin:0">`}
    <input type="color" class="pk-coul" value="${/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ce0500"}" aria-label="Couleur"><button type="button" class="icone pk-suppr" aria-label="Supprimer">✕</button></div>`;
      })
      .join("") +
    `<button type="button" class="ajout-lien" id="pk-ajout">+ Ajouter ${type === "Bool" || type === "Date" || type === "DateTime" ? "une couleur" : "un seuil"}</button>
   <p class="note" style="margin:4px 0 0">La première règle qui s'applique l'emporte.</p>`;
  const relire = () => {
    reglages.couleur = [...element.querySelectorAll(".choix-edit")]
      .map((ligne) => {
        const operateur = ligne.querySelector(".pk-op").value,
          valeur = ligne.querySelector(".pk-val") ? ligne.querySelector(".pk-val").value : "";
        const cle =
          type === "Bool" || type === "Date" || type === "DateTime"
            ? operateur
            : operateur === "="
              ? valeur
              : `${operateur}${valeur}`;
        return { cle, couleur: ligne.querySelector(".pk-coul").value };
      })
      .filter((regle) => regle.cle !== "" && regle.cle !== ">" && regle.cle !== "<");
    if (!reglages.couleur.length) reglages.couleur = undefined;
    sauver();
  };
  element.querySelectorAll("select, input").forEach((champ) => champ.addEventListener("change", relire));
  element.querySelectorAll(".pk-suppr").forEach((bouton) =>
    bouton.addEventListener("click", () => {
      bouton.closest(".choix-edit").remove();
      relire();
      dessinerCouleur(bloc);
    }),
  );
  $("pk-ajout").addEventListener("click", () => {
    reglages.couleur = [
      ...regles,
      {
        cle: type === "Bool" ? "Oui" : type === "Date" || type === "DateTime" ? "renseigné" : ">0",
        couleur: "#ce0500",
      },
    ];
    sauver();
    dessinerCouleur(bloc);
  });
}

/* ---------- champs d'une question « tableau » (colonnes de la table liée) ---------- */
function reglagesSousColonne(description) {
  const reperes = lireReperes(description);
  return {
    ordre: reperes.ordre ?? null,
    court: !!reperes.court,
    auto: !!reperes.auto,
    masque: !!reperes.masque,
    obligatoire: !!reperes.obligatoire,
    confidentiel: !!reperes.confidentiel,
    condition: reperes.condition
      ? `${reperes.condition.ref}${reperes.condition.op === "rempli" ? " n'est pas vide" : reperes.condition.op === "vide" ? " est vide" : ` ${reperes.condition.op} ${(reperes.condition.valeurs || []).join(", ")}`}`
      : "",
    aide: reperes.aide,
    autres: (description.match(/\[(liste|boutons|positif|min[^\]]*|max[^\]]*|couleur[^\]]*)\]/gi) || []).join(" "),
  };
}
function descriptionSousColonne(reglages) {
  return [
    reglages.obligatoire ? "*" : "",
    reglages.ordre != null ? `[ordre ${reglages.ordre}]` : "",
    reglages.court ? "[court]" : "",
    reglages.auto ? "[auto]" : "",
    reglages.masque ? "[masqué]" : "",
    reglages.condition ? `[si ${reglages.condition}]` : "",
    reglages.autres || "",
    reglages.confidentiel ? "[confidentiel]" : "",
    reglages.aide || "",
  ]
    .filter(Boolean)
    .join(" ");
}
function dessinerSousColonnes(bloc) {
  const table = bloc.reglages.tableau.table,
    colonnes = sousColonnes(table);
  const element = $("pa-sous");
  if (!Object.keys(colonnesDe(table)).length) {
    element.innerHTML = `<p class="avert">La table « ${esc(table)} » est introuvable.</p>`;
    return;
  }
  const noms = {
    Choice: "Choix unique",
    ChoiceList: "Choix multiple",
    Text: "Texte",
    Int: "Nombre",
    Numeric: "Nombre",
    Bool: "Oui / Non",
    Date: "Date",
    DateTime: "Date et heure",
  };
  element.innerHTML =
    colonnes
      .map((colonne, i) => {
        const reglages = reglagesSousColonne(colonne.description),
          type = typeBase(colonne.type);
        return (
          `<div class="sous-col${reglages.masque ? " masque-sc" : ""}" data-col="${esc(colonne.colId)}"><div class="ligne-sc"><span class="ordre-sc">` +
          `<button type="button" class="icone sc-monter" data-sens="-1"${i === 0 ? " disabled" : ""} aria-label="Monter le champ ${esc(colonne.libelle)}" title="Monter">↑</button>` +
          `<button type="button" class="icone sc-descendre" data-sens="1"${i === colonnes.length - 1 ? " disabled" : ""} aria-label="Descendre le champ ${esc(colonne.libelle)}" title="Descendre">↓</button></span>` +
          `<input type="text" class="sc-lib" value="${esc(colonne.libelle)}" aria-label="Libellé du champ"><small class="note" style="white-space:nowrap">${esc(noms[type] || type)}</small>
    <button type="button" class="icone sc-suppr" aria-label="Supprimer le champ ${esc(colonne.libelle)}">✕</button></div>
    ${type === "Choice" || type === "ChoiceList" ? `<input type="text" class="choix-sc" value="${esc((colonne.opts.choices || []).join(", "))}" aria-label="Choix, séparés par des virgules" placeholder="Choix, séparés par des virgules">` : ""}
    <div class="opts"><label title="Le champ n'apparaît pas dans le formulaire ; ses valeurs restent dans la table"><input type="checkbox" class="sc-masque"${reglages.masque ? " checked" : ""}> masqué</label><label><input type="checkbox" class="sc-oblig"${reglages.obligatoire ? " checked" : ""}> obligatoire</label><label><input type="checkbox" class="sc-conf"${reglages.confidentiel ? " checked" : ""}> confidentiel</label>${type === "Text" ? `<label><input type="checkbox" class="sc-court"${reglages.court ? " checked" : ""}> sur une seule ligne</label><label title="Rempli à partir des autres champs de la ligne (modifiable par l'agent)"><input type="checkbox" class="sc-auto"${reglages.auto ? " checked" : ""}> texte automatique</label>` : ""}</div>
    <input type="text" class="cond-sc" value="${esc(reglages.condition)}" placeholder="Afficher si… (ex. Catégorie = Personnel)" aria-label="Condition d'affichage du champ"></div>`
        );
      })
      .join("") || `<p class="note">Aucun champ pour l'instant.</p>`;
  element.querySelectorAll(".sous-col").forEach((blocSousColonne) => {
    const colId = blocSousColonne.dataset.col,
      colonne = colonnesDe(table)[colId];
    const majDesc = async () => {
      const reglages = reglagesSousColonne(colonne.description);
      reglages.obligatoire = blocSousColonne.querySelector(".sc-oblig").checked;
      reglages.confidentiel = blocSousColonne.querySelector(".sc-conf").checked;
      reglages.condition = blocSousColonne.querySelector(".cond-sc").value.trim();
      const caseCourt = blocSousColonne.querySelector(".sc-court");
      if (caseCourt) reglages.court = caseCourt.checked;
      const caseAuto = blocSousColonne.querySelector(".sc-auto");
      if (caseAuto) reglages.auto = caseAuto.checked;
      reglages.masque = blocSousColonne.querySelector(".sc-masque").checked;
      try {
        await modifierColonne(table, colId, { description: descriptionSousColonne(reglages) });
        majBloc(bloc);
      } catch (erreur) {
        message(`Réglage refusé : ${erreur.message || erreur}`, "err");
      }
    };
    blocSousColonne.querySelector(".sc-oblig").addEventListener("change", majDesc);
    blocSousColonne.querySelector(".sc-conf").addEventListener("change", majDesc);
    blocSousColonne.querySelector(".sc-masque").addEventListener("change", majDesc);
    if (blocSousColonne.querySelector(".sc-court"))
      blocSousColonne.querySelector(".sc-court").addEventListener("change", majDesc);
    if (blocSousColonne.querySelector(".sc-auto"))
      blocSousColonne.querySelector(".sc-auto").addEventListener("change", majDesc);
    // Monter / descendre : toutes les colonnes de la table reçoivent leur numéro [ordre N]
    blocSousColonne.querySelectorAll("[data-sens]").forEach((bouton) =>
      bouton.addEventListener("click", async () => {
        const liste = sousColonnes(table),
          i = liste.findIndex((colonneListe) => colonneListe.colId === colId),
          j = i + +bouton.dataset.sens;
        if (i < 0 || j < 0 || j >= liste.length) return;
        [liste[i], liste[j]] = [liste[j], liste[i]];
        try {
          await ecrireStructure(
            liste.map((colonneListe, numero) => [
              "ModifyColumn",
              table,
              colonneListe.colId,
              {
                description: descriptionSousColonne({
                  ...reglagesSousColonne(colonneListe.description),
                  ordre: numero + 1,
                }),
              },
            ]),
          );
          majBloc(bloc);
          dessinerSousColonnes(bloc);
          const nouveauBouton = $("pa-sous").querySelector(
            `.sous-col[data-col="${CSS.escape(colId)}"] [data-sens="${bouton.dataset.sens}"]`,
          );
          const cibleFocus =
            nouveauBouton && !nouveauBouton.disabled
              ? nouveauBouton
              : $("pa-sous").querySelector(`.sous-col[data-col="${CSS.escape(colId)}"] .sc-lib`);
          if (cibleFocus) cibleFocus.focus();
        } catch (erreur) {
          message(`Déplacement refusé : ${erreur.message || erreur}`, "err");
        }
      }),
    );
    blocSousColonne.querySelector(".cond-sc").addEventListener("change", majDesc);
    blocSousColonne.querySelector(".sc-lib").addEventListener("change", async (evenement) => {
      try {
        await renommerLibelleColonne(table, colId, evenement.target.value.trim() || colonne.libelle);
        majBloc(bloc);
      } catch (erreur) {
        message(`Renommage refusé : ${erreur.message || erreur}`, "err");
      }
    });
    const champChoix = blocSousColonne.querySelector(".choix-sc");
    if (champChoix)
      champChoix.addEventListener("change", (evenement) =>
        modifierOptions(
          colId,
          (options) => {
            options.choices = evenement.target.value.split(/\s*,\s*/).filter(Boolean);
          },
          table,
        ),
      );
    blocSousColonne.querySelector(".sc-suppr").addEventListener("click", async () => {
      if (
        !confirm(
          `Supprimer le champ « ${colonne.libelle} » de la table ${table} ? Les valeurs déjà saisies dans cette colonne seront perdues.`,
        )
      )
        return;
      try {
        await retirerColonneDeTable(table, colId);
        majBloc(bloc);
        dessinerPanneau();
      } catch (erreur) {
        message(`Suppression refusée : ${erreur.message || erreur}`, "err");
      }
    });
  });
  $("sc-ajouter").onclick = async () => {
    const libelle = $("sc-nouveau-lib").value.trim(),
      type = $("sc-nouveau-type").value;
    if (!libelle) {
      $("sc-nouveau-lib").focus();
      return;
    }
    try {
      const existants = Object.keys(colonnesDe(table));
      const colId = identifiant(libelle, existants);
      const info = { type, label: libelle, isFormula: false, untieColIdFromLabel: true };
      if (type === "Choice" || type === "ChoiceList")
        info.widgetOptions = JSON.stringify({ choices: ["Option 1", "Option 2"] });
      await ajouterColonne(table, colId, info);
      majBloc(bloc);
      dessinerPanneau();
      const champ = $("panneau").querySelector(`.sous-col[data-col="${colId}"] .choix-sc`) || $("sc-nouveau-lib");
      if (champ) champ.focus();
    } catch (erreur) {
      message(`Champ non créé : ${erreur.message || erreur}`, "err");
    }
  };
}

/* ---------- suppression de colonne (vide uniquement) ---------- */
async function supprimerColonne(bloc) {
  const colonne = etatFormulaires.meta[bloc.colonne];
  if (!colonne) return;
  const donneesTable = await Donnees.lire(etatFormulaires.courant.table);
  if (!colonne.formule && (donneesTable[colonne.colId] || []).some((valeur) => !estVideValeur(valeur))) {
    message("La colonne contient des réponses : elle ne peut pas être supprimée d'ici.", "err");
    return;
  }
  const autres = etatFormulaires.formulaires.filter(
    (formulaire) =>
      formulaire.id !== etatFormulaires.courant.id &&
      formulaire.table === etatFormulaires.courant.table &&
      String(formulaire.brouillon || formulaire.publie || "").includes(`"colonne":"${colonne.colId}"`),
  );
  if (
    !confirm(
      `Supprimer définitivement la colonne « ${colonne.libelle} » (${colonne.colId}) de la table ${etatFormulaires.courant.table} ?${autres.length ? `\nElle est aussi utilisée par : ${autres.map((formulaire) => formulaire.nom).join(", ")}.` : ""}`,
    )
  )
    return;
  try {
    etatFormulaires.courant.conf.blocs = blocs().filter((autreBloc) => autreBloc.id !== bloc.id);
    etatFormulaires.choisi = null;
    sauver();
    await actions([["RemoveColumn", etatFormulaires.courant.table, colonne.colId]]);
    await lireMeta();
    etatFormulaires.meta = metaCourante();
    dessinerApercu();
    dessinerPanneau();
    message("Colonne supprimée.", "ok");
  } catch (erreur) {
    message(`Suppression refusée : ${erreur.message || erreur}`, "err");
  }
}

/* ---------- panneau d'une question formule (donnée de la fiche ou calcul) ---------- */
function panneauFormule(bloc, colonne) {
  const panneau = $("panneau"),
    reglages = bloc.reglages,
    colonneSource = sourceColonneEtablissement(colonne),
    identifiantTable = tableEtablissements(),
    colonnesEtablissement = colonnesEtabProposees(identifiantTable);
  const calculable = !colonneSource && valeurFormuleTestPossible(colonne);
  panneau.innerHTML = `<h2>${esc(reglages.libelle || colonne.libelle)}</h2><p class="sous">${colonneSource ? "Donnée de la fiche établissement" : "Colonne formule"} · lecture seule, sans saisie</p>
  <label class="l" for="pa-libelle">Libellé</label><input type="text" id="pa-libelle" value="${esc(reglages.libelle || colonne.libelle)}">
  <label class="l" for="pa-aide">Aide affichée sous la question</label><textarea id="pa-aide">${esc(reglages.aide || "")}</textarea>
  <span class="ident" title="Identifiant de la colonne dans Grist">colonne : ${esc(colonne.colId)}</span>
  <label class="l" for="pa-section" style="margin-top:8px">Partie du formulaire</label><select id="pa-section">${optionsParties(bloc.section)}</select>
  <div class="groupe"><div class="t">Valeur affichée</div>
    ${
      colonneSource
        ? `<label class="l" for="pa-source">Information de la fiche (table ${esc(identifiantTable)})</label><select id="pa-source">${colonnesEtablissement.map((colonne) => `<option value="${esc(colonne.colId)}"${colonne.colId === colonneSource ? " selected" : ""}>${esc(colonne.libelle)}</option>`).join("")}</select>
      <p class="note" style="margin:0">Formule <code>${esc(colonne.texteFormule)}</code>. Le formulaire l'affiche dès que l'établissement est choisi ; Grist la tient à jour si la fiche change.</p>`
        : `<p class="note" style="margin:0">Formule <code>${esc(colonne.texteFormule)}</code>. ${calculable ? "Le formulaire la calcule en direct à partir des réponses." : "Le formulaire affiche la valeur enregistrée, recalculée par Grist."}</p>`
    }
  </div>
  <div class="groupe"><div class="t">Affichage conditionnel</div><div id="pa-condition"></div></div>
  <div class="groupe"><div class="t">Données et diffusion</div>
    <label class="interrupteur">Confidentiel (exclu de la description automatique) <input type="checkbox" id="pa-conf"${reglages.confidentiel ? " checked" : ""}></label>
    <label class="l" for="pa-format">Dans la description automatique</label>
    <select id="pa-format">${choixFormatQuestion(bloc)
      .map(
        ([valeurOption, libelleOption]) =>
          `<option value="${valeurOption}"${(reglages.format || "defaut") === valeurOption ? " selected" : ""}>${libelleOption}</option>`,
      )
      .join("")}</select>
  </div>
  <div class="pied-panneau"><button type="button" class="danger" id="pa-retirer">Retirer du formulaire</button><button type="button" class="danger" id="pa-supprimer">Supprimer la colonne…</button></div>`;
  $("pa-libelle").addEventListener("input", (evenement) => {
    reglages.libelle = evenement.target.value;
    panneau.querySelector("h2").textContent = evenement.target.value || colonne.libelle;
    majBloc(bloc);
    sauver();
  });
  $("pa-aide").addEventListener("input", (evenement) => {
    reglages.aide = evenement.target.value.trim();
    majBloc(bloc);
    sauver();
  });
  $("pa-section").addEventListener("change", (evenement) => {
    deplacer(bloc.id, blocs().length, evenement.target.value);
    choisir(bloc.id);
  });
  $("pa-conf").addEventListener("change", (evenement) => {
    reglages.confidentiel = evenement.target.checked;
    majBloc(bloc);
    sauver();
  });
  $("pa-format").addEventListener("change", (evenement) => {
    reglages.format = evenement.target.value === "defaut" ? undefined : evenement.target.value;
    sauver();
  });
  $("pa-retirer").addEventListener("click", () => retirerBloc(bloc));
  $("pa-supprimer").addEventListener("click", () => supprimerColonne(bloc));
  if ($("pa-source"))
    $("pa-source").addEventListener("change", async (evenement) => {
      const colonneSource = colonnesDe(identifiantTable)[evenement.target.value] || {},
        identifiantReference =
          (String(colonne.texteFormule).match(/^\s*(?:return\s+)?\$(\w+)\./) || [])[1] || colonneEtablissement();
      const info = {
        formula: `$${identifiantReference}.${evenement.target.value}`,
        type: colonneSource.type || "Any",
      };
      if (["Choice", "ChoiceList"].includes(typeBase(colonneSource.type)))
        info.widgetOptions = JSON.stringify(colonneSource.opts || {});
      try {
        await modifierColonne(etatFormulaires.courant.table, colonne.colId, info);
        etatFormulaires.meta = metaCourante();
        majBloc(bloc);
        dessinerPanneau();
      } catch (erreur) {
        message(`Modification refusée : ${erreur.message || erreur}`, "err");
      }
    });
  dessinerCondition(bloc);
}

/* PRISME — administration, onglet « Formulaires » : formulaires/apercu.js
   Aperçu du formulaire tel que l'agent le verra : blocs, étapes, sélection, déplacement, glisser-déposer, menu
   d'ajout et ajout d'un bloc.
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : champHtml, typeAffiche, blocHtml, insertion, communHtml, majApercu, etapeHtml, enteteApercuHtml,
     envoiHtml, dessinerApercu, dessinerAccueil, brancherEvenementsApercu, choisir, deplacer, agir, dupliquerBloc,
     copierSousTable, retirerBloc, cibleDepot, fermerMenu, placerMenu, ouvrirMenu, brancherEvenementsMenuAjout,
     etapeLibelle, ajouterBloc, etapeEtablissement, ajouterBlocEtablissement, etapeExistantes, blocDepuisColonne,
     ajouterExistantes.
   Utilise :
     fondations : $, ROLES, TYPES_QUESTIONS, actionsHistoriqueTableau, copie, esc, etatFormulaires, identifiant,
       message, nouvelId, typeBase.
     donnees : actions, colonnesDe, creerColonne, creerTableLignes, ecrireStructure, lireMeta.
     formulaire-courant : blocDe, blocs, colonneDeRef, communsActifs, libelleQuestion, lireReperes, majEtat,
       parties, sauver, texteCondition.
     colonnes-roles : colonneEtablissement, rolesEffectifs.
     mode-test : appliquerTest, chercherEtablissementTest, clicTableauTest, ficheTestHtml, libelleEtablissementTest,
       nomEtablissement, resumeEtablissementTestHtml, saisieTableauTest, sousColonnes, tableauTestHtml,
       valeurFormuleTest.
     panneau-question : ajouterPartie, dessinerPanneau, formulePiecesJointes.
     sites-esr : reglesApresTableau.
     tableaux : analyserTableLignes, reprendreLignesExistantes, tablesPourTableau.
     gestion : ouvrirNouveau.
     description : exempleDescription, majDescriptionTest, optionsDescription.
     saisie-etablissement : colonnesEtabProposees, libelleColonneEtablissement, saisieEffective,
       sourceColonneEtablissement, tableEtablissements, valeurLisible.
   Modifie etatFormulaires : blocGlisse, choisi, descriptionTestManuelle, menuContextuel, modeApercu, siteTest,
     testLignes. */
/* =========================================================
 Aperçu
 ========================================================= */
function champHtml(bloc) {
  const reglages = bloc.reglages || {},
    colonne = etatFormulaires.meta[bloc.colonne];
  if (!colonne)
    return `<p class="avert">La colonne « ${esc(bloc.colonne)} » n'existe plus dans la table ${esc(etatFormulaires.courant.table)}.</p>`;
  const id = `ap-${bloc.colonne}`,
    typeColonne = typeBase(colonne.type),
    choixPossibles = colonne.opts.choices || [],
    couleurs = colonne.opts.choiceOptions || {};
  const libelle = esc(reglages.libelle || colonne.libelle);
  const titre =
    `${libelle}${reglages.obligatoire ? ' <span class="req">*</span>' : ""}${reglages.condition && reglages.condition.ref ? `<span class="pastille-cond">si ${esc(texteCondition(reglages.condition))}</span>` : ""}` +
    `${reglages.confidentiel ? '<span class="pastille-autre">confidentiel</span>' : ""}`;
  const aide = reglages.aide ? `<span class="aide">${esc(reglages.aide)}</span>` : "";
  const style = (valeur) => {
    const couleur = couleurs[valeur] || {};
    return couleur.fillColor ? `--c:${couleur.textColor || "#161616"};--c-bg:${couleur.fillColor}` : "";
  };
  const enBoutons =
    (typeColonne === "Choice" &&
      choixPossibles.length &&
      reglages.affichage !== "liste" &&
      (reglages.affichage === "boutons" || choixPossibles.length <= 5)) ||
    (typeColonne === "Bool" && reglages.affichage !== "case");
  const attributTabulation = etatFormulaires.modeTest ? "" : ' tabindex="-1"';
  if (colonne.formule) {
    const colonneSource = sourceColonneEtablissement(colonne),
      valeurFormule = etatFormulaires.modeTest ? valeurFormuleTest(colonne) : undefined;
    const contenu = etatFormulaires.modeTest
      ? valeurFormule === undefined
        ? "Valeur calculée par Grist à l'enregistrement"
        : valeurFormule == null || valeurFormule === ""
          ? "—"
          : valeurLisible(colonne, valeurFormule)
      : colonneSource
        ? `Repris de la fiche établissement : ${libelleColonneEtablissement(colonneSource)}`
        : `Calculé par Grist : ${colonne.texteFormule}`;
    return `<div class="champ"><label>${titre}${aide}</label><div class="lecture" data-formule="${esc(bloc.colonne)}">${esc(contenu)}</div></div>`;
  }
  if (reglages.tableau && reglages.tableau.table && etatFormulaires.modeTest)
    return `<div class="champ"><label>${titre}${aide}</label><div class="tableau-test" data-tab="${esc(bloc.colonne)}">${tableauTestHtml(bloc)}</div></div>`;
  if (reglages.tableau && reglages.tableau.table) {
    const champsTableau = sousColonnes(reglages.tableau.table).filter((champ) => !champ.r.masque);
    return (
      `<div class="champ"><label>${titre}${aide}</label><div class="tableau-apercu"><strong>Une ligne par élément</strong> · table « ${esc(reglages.tableau.table)} »` +
      `<div class="cols">${champsTableau.map((champ) => `<span>${esc(champ.libelle)}</span>`).join("") || "<em>aucune colonne : ajoutez-en dans le panneau</em>"}</div>` +
      `<button type="button" class="secondaire petit"${attributTabulation}>+ Ajouter</button>${reglages.tableau.lignes ? ` <small class="note">Nombre de lignes suivant « ${esc(libelleQuestion(reglages.tableau.lignes))} »</small>` : ""}</div></div>`
    );
  }
  if (enBoutons) {
    const optionsBoutons =
      typeColonne === "Bool"
        ? [
            ["true", "Oui"],
            ["false", "Non"],
          ]
        : choixPossibles.map((choix) => [choix, choix]);
    return `<fieldset class="champ"><legend>${titre}${aide}</legend><div class="choix-groupe${typeColonne === "Bool" ? " choix-oui-non" : ""}">${optionsBoutons
      .map(
        ([valeur, libelle]) =>
          `<label class="choix" style="${typeColonne === "Bool" ? "" : style(valeur)}"><input type="radio" name="${id}" value="${esc(valeur)}"${attributTabulation}><span>${esc(libelle)}</span></label>`,
      )
      .join("")}</div></fieldset>`;
  }
  if (typeColonne === "Bool")
    return `<div class="champ"><label class="case"><input type="checkbox" name="${id}"${attributTabulation}> ${libelle}</label>${aide}</div>`;
  if (typeColonne === "Choice")
    return `<div class="champ"><label for="${id}">${titre}${aide}</label><select id="${id}" name="${id}"${attributTabulation}><option value="">Choisir…</option>${choixPossibles.map((choix) => `<option>${esc(choix)}</option>`).join("")}</select></div>`;
  if (typeColonne === "ChoiceList")
    return `<fieldset class="champ"><legend>${titre}${aide}</legend><div class="coches">${choixPossibles.map((choix) => `<label><input type="checkbox" name="${id}" value="${esc(choix)}"${attributTabulation}> ${esc(choix)}</label>`).join("")}</div></fieldset>`;
  if (typeColonne === "Numeric" || typeColonne === "Int")
    return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="number" id="${id}" name="${id}"${reglages.min != null && reglages.min !== "" ? ` min="${esc(reglages.min)}"` : ""}${attributTabulation}></div>`;
  if (typeColonne === "Date")
    return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="date" id="${id}" name="${id}"${attributTabulation}></div>`;
  if (typeColonne === "DateTime")
    return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="datetime-local" id="${id}" name="${id}"${attributTabulation}></div>`;
  if (typeColonne === "Ref" || typeColonne === "RefList")
    return `<div class="champ"><label for="${id}">${titre}${aide}</label><select id="${id}" name="${id}"${attributTabulation}><option>Choisir…</option></select></div>`;
  if (typeColonne === "Attachments")
    return `<div class="champ"><label>${titre}${aide}</label><div class="pj-apercu" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px dashed var(--bleu,#000091);border-radius:6px;color:var(--bleu,#000091);font-weight:600">📎 Ajouter des photos ou des fichiers</div>
  <div class="note" style="margin-top:4px">Photos de la galerie ou de l'appareil photo, PDF, documents bureautiques ; envoyés dans les pièces jointes du document Grist.</div></div>`;
  if (reglages.court)
    return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="text" id="${id}" name="${id}"${attributTabulation}></div>`;
  return `<div class="champ"><label for="${id}">${titre}${aide}</label><textarea id="${id}" name="${id}" style="min-height:70px"${attributTabulation}></textarea></div>`;
}
function typeAffiche(bloc) {
  if (bloc.genre === "titre") return "Titre";
  if (bloc.genre === "info") return "Information";
  const colonne = etatFormulaires.meta[bloc.colonne],
    reglages = bloc.reglages || {};
  if (!colonne) return "Colonne absente";
  if (colonne.formule) return sourceColonneEtablissement(colonne) ? "Donnée établissement" : "Formule";
  if (reglages.tableau) return "Tableau";
  return (
    {
      Text: reglages.court ? "Texte court" : "Texte long",
      Int: "Nombre entier",
      Numeric: "Nombre décimal",
      Choice: "Choix unique",
      ChoiceList: "Choix multiple",
      Bool: "Oui / Non",
      Date: "Date",
      DateTime: "Date et heure",
      Ref: "Référence",
      RefList: "Références",
      Attachments: "Pièces jointes",
    }[typeBase(colonne.type)] || typeBase(colonne.type)
  );
}
function blocHtml(bloc) {
  const contenu =
    bloc.genre === "titre"
      ? `<h3 class="titre-section">${esc(bloc.texte || "Titre de section")}</h3>`
      : bloc.genre === "info"
        ? `<p class="info-formulaire">${esc(bloc.texte || "Texte d'information").replace(/\n/g, "<br>")}</p>`
        : champHtml(bloc);
  const nom = bloc.genre === "question" ? libelleQuestion(bloc.colonne) : bloc.texte || typeAffiche(bloc);
  return (
    `<div class="bloc${bloc.id === etatFormulaires.choisi && !etatFormulaires.modeTest ? " choisi" : ""}" data-bloc="${bloc.id}" draggable="${!etatFormulaires.modeTest}" tabindex="${etatFormulaires.modeTest ? -1 : 0}" aria-label="${esc(typeAffiche(bloc))} : ${esc(nom)}">` +
    `<span class="etiq-type">${esc(typeAffiche(bloc))}</span><span class="poignee" aria-hidden="true">⋮⋮</span>` +
    (etatFormulaires.modeTest
      ? ""
      : `<span class="outils"><button type="button" data-act="haut" title="Monter" aria-label="Monter">↑</button><button type="button" data-act="bas" title="Descendre" aria-label="Descendre">↓</button>` +
        `<button type="button" data-act="dupliquer" title="Dupliquer" aria-label="Dupliquer">⧉</button><button type="button" data-act="retirer" title="Retirer du formulaire" aria-label="Retirer du formulaire">✕</button></span>`) +
    `${contenu}</div>`
  );
}
const insertion = (section, index) =>
  etatFormulaires.modeTest
    ? ""
    : `<div class="insertion" data-section="${section}" data-index="${index}"><button type="button" data-ajout>+ Ajouter une question</button></div>`;
function communHtml(colId) {
  const colonne = etatFormulaires.meta[colId];
  if (!colonne) return "";
  const attributTabulation = etatFormulaires.modeTest ? "" : ' tabindex="-1"';
  let html = "";
  const rechercheTest = (libelle) =>
    `<label for="test-etab">${libelle}<span class="aide">Test : recherche dans la table ${esc(tableEtablissements() || "des établissements")}. Les données de la fiche et la description suivent l'établissement choisi.</span></label>` +
    `<input type="text" id="test-etab" list="test-etab-liste" autocomplete="off" placeholder="${etatFormulaires.etablissementsTest ? "Nom ou UAI" : "Chargement du référentiel…"}" value="${esc(etatFormulaires.etablissementTest ? libelleEtablissementTest(etatFormulaires.etablissementTest) : "")}"><datalist id="test-etab-liste"></datalist>`;
  if (colId === "Etablissement" && majApercu())
    html =
      `<div class="champ"><div class="resume-etab"><span id="test-resume-etab">${resumeEtablissementTestHtml()}</span><span class="faux-lien">Voir la fiche</span></div></div>` +
      (etatFormulaires.modeTest
        ? `<div class="champ">${rechercheTest("Établissement du dossier (pour le test)")}</div>`
        : "");
  else if (colId === "Etablissement" && etatFormulaires.modeTest)
    html = `<div class="champ">${rechercheTest('Nom ou UAI <span class="req">*</span>')}<dl class="identite" id="test-fiche"${etatFormulaires.etablissementTest ? "" : " hidden"}>${ficheTestHtml()}</dl></div>`;
  else if (colId === "Etablissement")
    html = `<div class="champ"><label>Nom ou UAI <span class="req">*</span><span class="aide">Recherche par nom ou UAI dans la table ${esc(tableEtablissements() || "des établissements")}, puis complétion automatique (type, commune, académie, département) ; création dans le référentiel si besoin.</span></label><input type="text" placeholder="Nom ou UAI"${attributTabulation} disabled></div>`;
  else if (colId === "Site")
    html = `<div class="champ"><label for="test-site">${esc(colonne.libelle && colonne.libelle !== "Site" ? colonne.libelle : "Site / bâtiment")}<span class="aide">Facultatif : campus, site ou bâtiment concerné.</span></label><input type="text" id="test-site"${attributTabulation} ${etatFormulaires.modeTest ? "" : "disabled"}></div>`;
  else if (colId === "Date_faits") {
    const saisie = saisieEffective();
    html =
      `<div class="champ"><label>${esc(colonne.libelle)} <span class="req">*</span><span class="aide">Aujourd'hui par défaut.${saisie.faitsFuturs ? " Peut être à venir (fermeture annoncée…)." : " Jamais postérieure à aujourd'hui."}</span></label><input type="date"${attributTabulation}>` +
      (saisie.plusieursJours && typeBase(colonne.type) === "Date"
        ? `<label class="case" style="margin-top:6px"><input type="checkbox"${attributTabulation} ${etatFormulaires.modeTest ? "" : "disabled"}> Les faits s'étendent sur plusieurs jours (un signalement par jour)</label>`
        : "") +
      `</div>`;
  } else if (colId === "Qualification") {
    const choixPossibles = colonne.opts.choices || [],
      optionsChoix = colonne.opts.choiceOptions || {};
    html = `<fieldset class="champ"><legend>${esc(colonne.libelle)} <span class="req">*</span></legend><div class="choix-groupe">${choixPossibles
      .map((choix) => {
        const optionChoix = optionsChoix[choix] || {};
        return `<label class="choix" style="${optionChoix.fillColor ? `--c:${optionChoix.textColor || "#161616"};--c-bg:${optionChoix.fillColor}` : ""}"><input type="radio" name="ap-Qualification" value="${esc(choix)}"${attributTabulation}><span>${esc(choix)}</span></label>`;
      })
      .join("")}</div></fieldset>`;
  } else if (colId === "Description") {
    const perso = !!(etatFormulaires.courant.conf.description && etatFormulaires.courant.conf.description.perso),
      reglagesDescription = optionsDescription();
    const aideDescription = !reglagesDescription.actif
      ? "Saisie libre : le pré-remplissage est désactivé."
      : `Rédigée automatiquement à partir des réponses ci-dessus ; l'agent peut la compléter ou la modifier. Réglages ${perso ? "propres à ce formulaire" : "communs à tous les formulaires"}.`;
    html =
      `<div class="champ"><label${etatFormulaires.modeTest ? ' for="test-description"' : ""}>${esc(colonne.libelle)} <span class="req">*</span><span class="aide">${esc(aideDescription)}</span></label>` +
      (etatFormulaires.modeTest
        ? `<textarea id="test-description" style="min-height:90px"></textarea><div class="etat-desc-test" id="etat-desc-test"></div>`
        : `<div class="exemple-desc">${esc(exempleDescription() || "(aucun élément inclus)")}</div>`) +
      `</div>`;
  }
  const id = `commun:${colId}`;
  return `<div class="bloc commun${etatFormulaires.choisi === id && !etatFormulaires.modeTest ? " choisi" : ""}" data-commun="${id}" tabindex="${etatFormulaires.modeTest ? -1 : 0}" aria-label="Champ commun : ${esc(colonne.libelle)}"><span class="etiq-type">Champ commun</span>${html}</div>`;
}
/* ---------- bandeau et étapes, comme dans le widget de saisie ---------- */
const majApercu = () => communsActifs() && etatFormulaires.modeApercu === "maj";
const etapeHtml = (numero, texte) =>
  `<h3 class="etape"><span class="num-etape" aria-hidden="true">${numero}</span>${esc(texte)}</h3>`;
function enteteApercuHtml() {
  const miseAJour = majApercu();
  return (
    `<div class="barre-apercu${saisieEffective().version === "esr" ? " version-esr" : ""}"><span>Situation montrée :</span><div class="seg2" role="group" aria-label="Situation montrée par l'aperçu">` +
    `<button type="button" data-mode-apercu="nouveau" aria-pressed="${!miseAJour}">Nouveau signalement</button><button type="button" data-mode-apercu="maj" aria-pressed="${miseAJour}">Mise à jour d'un dossier</button></div>` +
    `<span class="marque-apercu" id="marque-apercu" title="Bandeau du formulaire">${esc(saisieEffective().marque)}</span></div>` +
    `<div class="entete-apercu${miseAJour ? " maj" : ""}">${miseAJour ? `<p class="etiquette-mode">Mise à jour · dossier n° 12</p>` : ""}` +
    `<h1>${miseAJour ? esc(etatFormulaires.etablissementTest ? nomEtablissement(etatFormulaires.etablissementTest) : "Établissement du dossier") : "Nouveau signalement"}</h1>` +
    (miseAJour
      ? `<p class="sous-titre-apercu">Signalé le ${Outils.dates.date(Date.now())} · 2 mises à jour.</p>`
      : "") +
    `<p class="phrase-mode">${
      miseAJour
        ? "Modifiez uniquement ce qui a changé : votre enregistrement s'ajoute comme nouvelle étape, l'état précédent reste dans l'historique."
        : "Trois étapes : l'établissement, les faits, puis la description. Un dossier sera créé à l'enregistrement."
    }</p></div>`
  );
}
function envoiHtml() {
  const miseAJour = majApercu();
  return (
    `<div class="envoi-apercu"><button type="button" class="primaire" disabled tabindex="-1">${miseAJour ? "Enregistrer la mise à jour" : "Enregistrer le signalement"}</button>` +
    (miseAJour && etatFormulaires.meta.Clos
      ? `<span class="note">Menu « Autres actions » : corriger ou annuler la dernière étape, clore le signalement.</span>`
      : "") +
    `</div>`
  );
}
function dessinerApercu() {
  const apercu = $("apercu");
  if (!etatFormulaires.courant) {
    dessinerAccueil();
    return;
  }
  const html = [],
    listeParties = parties(),
    partiesQuestions = listeParties.filter((partie) => partie.role === "q"),
    etapes = communsActifs();
  apercu.classList.toggle("maj-apercu", majApercu());
  if (etapes) html.push(enteteApercuHtml());
  listeParties.forEach((partie) => {
    const idPartie = partie.id,
      liste = blocs()
        .map((bloc, i) => ({ b: bloc, i }))
        .filter((entree) => (entree.b.section || "q") === idPartie);
    if (partie.role !== "q" && !liste.length && etatFormulaires.modeTest) return;
    const choisiP = etatFormulaires.choisi === `partie:${idPartie}` && !etatFormulaires.modeTest;
    let htmlFeuille = `<div class="feuille${partie.role !== "q" ? " visa" : ""}${etapes && partie.role === "q" ? " cadre" : ""}${etapes && partie === partiesQuestions[0] ? " premiere" : ""}${choisiP ? " partie-choisie" : ""}" data-section-feuille="${idPartie}">
    <h2 class="titre-partie"${etatFormulaires.modeTest ? "" : ` data-partie="${idPartie}" tabindex="0" title="Régler la partie"`}>${esc(partie.nom)} <small>${esc(ROLES[partie.role])}${partie.role === "q" && partie.titre ? " · titre affiché" : ""}</small>${etatFormulaires.modeTest ? "" : ' <span class="crayon" aria-hidden="true">✎</span>'}</h2>`;
    if (etapes && partie === partiesQuestions[0])
      htmlFeuille +=
        etapeHtml(1, majApercu() ? "Établissement" : "Quel établissement est concerné ?") +
        communHtml("Etablissement") +
        communHtml("Site") +
        etapeHtml(2, "Les faits") +
        ["Date_faits", "Qualification"].map(communHtml).join("");
    if (partie.role === "q" && partie.titre && partie.nom)
      htmlFeuille += `<h3 class="titre-section titre-partie-q">${esc(partie.nom)}</h3>`; // titre de partie affiché dans le formulaire
    if (!liste.length)
      htmlFeuille += etatFormulaires.modeTest
        ? ""
        : `<div class="vide-section">${partie.role === "q" ? "Aucune question dans cette partie." : "Aucune question de visa."}<br><button type="button" class="secondaire petit" data-ajout data-section="${idPartie}" data-index="${blocs().length}">+ Ajouter une question</button></div>`;
    else
      liste.forEach(({ b: bloc, i }, k) => {
        htmlFeuille += insertion(idPartie, i) + blocHtml(bloc);
        if (k === liste.length - 1) htmlFeuille += insertion(idPartie, i + 1);
      });
    if (etapes && partie === partiesQuestions[partiesQuestions.length - 1])
      htmlFeuille +=
        etapeHtml(3, "Description et envoi") +
        communHtml("Description") +
        (majApercu() && saisieEffective().commentaire && etatFormulaires.meta.Commentaire
          ? `<div class="champ"><label${etatFormulaires.modeTest ? ' for="test-commentaire"' : ""}>Commentaire de mise à jour<span class="aide">Ce qui s'est passé depuis l'étape précédente</span></label><textarea id="test-commentaire" style="min-height:50px"${etatFormulaires.modeTest ? "" : ' tabindex="-1" disabled'}></textarea></div>`
          : "") +
        envoiHtml();
    html.push(htmlFeuille + "</div>");
    if (partie === partiesQuestions[partiesQuestions.length - 1] && !etatFormulaires.modeTest)
      html.push(
        `<div class="ajout-partie"><button type="button" class="ajout-lien" id="btn-ajout-partie">+ Ajouter une partie au formulaire</button></div>`,
      );
  });
  const bandeau = $("msg-global");
  apercu.innerHTML = html.join("");
  if (bandeau) apercu.prepend(bandeau);
  if (etatFormulaires.modeTest) {
    appliquerTest();
    const champSite = $("test-site");
    if (champSite) champSite.value = etatFormulaires.siteTest;
  }
  majEtat();
}
function dessinerAccueil() {
  $("apercu").innerHTML = `<div class="accueil"><h2>Aucun formulaire</h2>
  <p class="note">Un formulaire rassemble les questions affichées par le widget de saisie pour une table de réponses. Ses questions créent automatiquement les colonnes de cette table.</p>
  ${etatFormulaires.accesOk ? `<button type="button" class="primaire" id="btn-premier">+ Créer un premier formulaire</button>` : ""}</div>`;
  const bouton = $("btn-premier");
  if (bouton) bouton.addEventListener("click", () => ouvrirNouveau(false));
  $("panneau").innerHTML = "";
  majEtat();
}
// Événements de l'aperçu : saisie en mode test, sélection, clavier, glisser-déposer ; appelé une fois au démarrage
function brancherEvenementsApercu() {
  $("apercu").addEventListener("input", (evenement) => {
    if (!etatFormulaires.modeTest) return;
    if (evenement.target.id === "test-description") {
      etatFormulaires.descriptionTestManuelle = true;
      majDescriptionTest();
      return;
    }
    if (evenement.target.id === "test-etab") {
      chercherEtablissementTest(evenement.target.value);
      return;
    }
    if (evenement.target.id === "test-site") etatFormulaires.siteTest = evenement.target.value;
    saisieTableauTest(evenement);
    appliquerTest();
  });
  $("apercu").addEventListener("change", (evenement) => {
    if (!etatFormulaires.modeTest || evenement.target.id === "test-description" || evenement.target.id === "test-etab")
      return;
    saisieTableauTest(evenement);
    appliquerTest();
  });
  $("apercu").addEventListener("click", (evenement) => {
    if (!etatFormulaires.courant) return;
    const boutonMode = evenement.target.closest("[data-mode-apercu]");
    if (boutonMode) {
      etatFormulaires.modeApercu = boutonMode.dataset.modeApercu;
      etatFormulaires.testLignes = {};
      etatFormulaires.descriptionTestManuelle = false;
      dessinerApercu();
      return;
    }
    if (evenement.target.closest("#btn-desc-auto")) {
      etatFormulaires.descriptionTestManuelle = false;
      majDescriptionTest();
      return;
    }
    if (etatFormulaires.modeTest) {
      clicTableauTest(evenement);
      return;
    }
    if (evenement.target.closest("#btn-ajout-partie")) {
      ajouterPartie();
      return;
    }
    const titrePartie = evenement.target.closest("[data-partie]");
    if (titrePartie) {
      choisir(`partie:${titrePartie.dataset.partie}`);
      return;
    }
    const champCommun = evenement.target.closest("[data-commun]");
    if (champCommun) {
      choisir(champCommun.dataset.commun);
      return;
    }
    const boutonAjout = evenement.target.closest("[data-ajout]");
    if (boutonAjout) {
      const zoneInsertion = boutonAjout.closest(".insertion") || boutonAjout;
      ouvrirMenu(
        zoneInsertion.dataset.section || boutonAjout.dataset.section,
        +(zoneInsertion.dataset.index ?? boutonAjout.dataset.index),
        boutonAjout,
      );
      return;
    }
    const outil = evenement.target.closest("[data-act]");
    const bloc = evenement.target.closest(".bloc");
    // Clic dans un espace vide de l'aperçu : retour aux réglages du formulaire
    if (!bloc) {
      if (
        etatFormulaires.choisi &&
        !evenement.target.closest("button, a, input, select, textarea, label, .insertion, [data-section-feuille] h3")
      )
        choisir(null);
      return;
    }
    evenement.preventDefault();
    const id = bloc.dataset.bloc;
    if (outil) {
      agir(outil.dataset.act, id);
      return;
    }
    choisir(id);
  });
  $("apercu").addEventListener("keydown", (evenement) => {
    if (etatFormulaires.modeTest) return;
    if (
      evenement.target.dataset &&
      (evenement.target.dataset.partie || evenement.target.dataset.commun) &&
      (evenement.key === "Enter" || evenement.key === " ")
    ) {
      evenement.preventDefault();
      choisir(
        evenement.target.dataset.partie ? `partie:${evenement.target.dataset.partie}` : evenement.target.dataset.commun,
      );
      return;
    }
    const bloc =
      evenement.target.classList && evenement.target.classList.contains("bloc") && evenement.target.dataset.bloc
        ? evenement.target
        : null;
    if (!bloc) return;
    if (evenement.key === "Enter" || evenement.key === " ") {
      evenement.preventDefault();
      choisir(bloc.dataset.bloc);
    } else if (evenement.altKey && (evenement.key === "ArrowUp" || evenement.key === "ArrowDown")) {
      evenement.preventDefault();
      agir(evenement.key === "ArrowUp" ? "haut" : "bas", bloc.dataset.bloc);
    } else if (evenement.key === "Delete") {
      evenement.preventDefault();
      agir("retirer", bloc.dataset.bloc);
    }
  });
  $("apercu").addEventListener("dragstart", (evenement) => {
    const bloc = evenement.target.closest && evenement.target.closest(".bloc");
    if (!bloc || etatFormulaires.modeTest) return;
    etatFormulaires.blocGlisse = bloc.dataset.bloc;
    bloc.classList.add("glisse");
    evenement.dataTransfer.effectAllowed = "move";
    try {
      evenement.dataTransfer.setData("text/plain", etatFormulaires.blocGlisse);
    } catch (_) {}
  });
  $("apercu").addEventListener("dragend", () => {
    etatFormulaires.blocGlisse = null;
    document
      .querySelectorAll(".glisse, .depot-avant, .depot-apres")
      .forEach((element) => element.classList.remove("glisse", "depot-avant", "depot-apres"));
  });
  $("apercu").addEventListener("dragover", (evenement) => {
    if (!etatFormulaires.blocGlisse) return;
    const depot = cibleDepot(evenement);
    if (!depot) return;
    evenement.preventDefault();
    document
      .querySelectorAll(".depot-avant, .depot-apres")
      .forEach((element) => element.classList.remove("depot-avant", "depot-apres"));
    if (depot.el) depot.el.classList.add(depot.apres ? "depot-apres" : "depot-avant");
  });
  $("apercu").addEventListener("drop", (evenement) => {
    if (!etatFormulaires.blocGlisse) return;
    const depot = cibleDepot(evenement);
    if (!depot) return;
    evenement.preventDefault();
    if (depot.el) {
      const cible = blocDe(depot.el.dataset.bloc),
        k = blocs().indexOf(cible);
      deplacer(etatFormulaires.blocGlisse, k + (depot.apres ? 1 : 0), cible.section || "q");
    } else if (depot.feuille)
      deplacer(etatFormulaires.blocGlisse, blocs().length, depot.feuille.dataset.sectionFeuille);
  });
}

/* =========================================================
 Sélection, déplacement, outils des blocs
 ========================================================= */
function choisir(id) {
  etatFormulaires.choisi = id;
  document
    .querySelectorAll(".bloc")
    .forEach((bloc) => bloc.classList.toggle("choisi", (bloc.dataset.bloc || bloc.dataset.commun) === id));
  document
    .querySelectorAll("[data-section-feuille]")
    .forEach((feuille) =>
      feuille.classList.toggle("partie-choisie", id === `partie:${feuille.dataset.sectionFeuille}`),
    );
  dessinerPanneau();
}
function deplacer(id, versIndex, section) {
  const liste = blocs(),
    i = liste.findIndex((candidat) => candidat.id === id);
  if (i < 0) return;
  const [bloc] = liste.splice(i, 1);
  if (section) bloc.section = section;
  liste.splice(Math.max(0, Math.min(liste.length, versIndex > i ? versIndex - 1 : versIndex)), 0, bloc);
  sauver();
  dessinerApercu();
  const elementBloc = document.querySelector(`[data-bloc="${id}"]`);
  if (elementBloc) elementBloc.focus();
}
function agir(action, id) {
  const liste = blocs(),
    i = liste.findIndex((candidat) => candidat.id === id),
    bloc = liste[i];
  if (!bloc) return;
  const section = bloc.section || "q";
  const memeSection = liste
    .map((blocParcouru, k) => ({ x: blocParcouru, k }))
    .filter((entree) => (entree.x.section || "q") === section);
  const position = memeSection.findIndex((entree) => entree.x.id === id);
  if (action === "haut" && position > 0) deplacer(id, memeSection[position - 1].k);
  else if (action === "bas" && position < memeSection.length - 1) deplacer(id, memeSection[position + 1].k + 1);
  else if (action === "dupliquer") dupliquerBloc(bloc, i);
  else if (action === "retirer") retirerBloc(bloc);
}
async function dupliquerBloc(bloc, i) {
  const blocCopie = copie(bloc);
  blocCopie.id = nouvelId();
  if (bloc.genre === "question") {
    // une question ne peut pas partager sa colonne : la copie crée une nouvelle colonne de même type
    const colonne = etatFormulaires.meta[bloc.colonne];
    if (!colonne) return;
    const libelle = `${libelleQuestion(bloc.colonne)} (copie)`;
    try {
      blocCopie.colonne = await creerColonne(etatFormulaires.courant.table, libelle, colonne.type, colonne.opts);
      blocCopie.reglages = { ...blocCopie.reglages, libelle: libelle };
      // question tableau : la copie a sa propre table, de même structure (sinon les deux questions partageraient leurs lignes et leurs champs)
      if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table)
        blocCopie.reglages.tableau = {
          ...bloc.reglages.tableau,
          table: await copierSousTable(bloc.reglages.tableau.table),
        };
    } catch (erreur) {
      message(`Copie impossible : ${erreur.message || erreur}`, "err");
      return;
    }
  }
  blocs().splice(i + 1, 0, blocCopie);
  etatFormulaires.choisi = blocCopie.id;
  sauver();
  dessinerApercu();
  dessinerPanneau();
  if (blocCopie.reglages && blocCopie.reglages.tableau && blocCopie.reglages.tableau.table) {
    message(
      `Question copiée avec sa propre table, ${blocCopie.reglages.tableau.table} (mêmes champs, sans les lignes).`,
      "ok",
    );
    reglesApresTableau(blocCopie.reglages.tableau.table);
  }
}
// Nouvelle table de même structure que la sous-table d'une question tableau (colonnes, libellés, choix, réglages) ; renvoie son nom
async function copierSousTable(tableSource) {
  const [tablesGrist, colonnesGrist] = await Promise.all([
    Donnees.lire("_grist_Tables"),
    Donnees.lire("_grist_Tables_column"),
  ]);
  const idTable = tablesGrist.id[tablesGrist.tableId.indexOf(tableSource)];
  if (!idTable) throw new Error(`table ${tableSource} introuvable`);
  const indexColonnes = colonnesGrist.id
    .map((_, i) => i)
    .filter(
      (i) =>
        colonnesGrist.parentId[i] === idTable &&
        colonnesGrist.colId[i] !== "manualSort" &&
        !String(colonnesGrist.colId[i]).startsWith("gristHelper"),
    );
  const nouvelleTable = identifiant(`${tableSource} copie`, etatFormulaires.tables.concat(tablesGrist.tableId));
  const cellule = (k, i) => (colonnesGrist[k] || [])[i];
  const simples = indexColonnes.filter((i) => !cellule("isFormula", i)),
    formules = indexColonnes.filter((i) => cellule("isFormula", i));
  await actions([
    [
      "AddTable",
      nouvelleTable,
      simples.map((i) => ({
        id: cellule("colId", i),
        type: cellule("type", i),
        isFormula: false,
        formula: cellule("formula", i) || "",
      })),
    ],
  ]);
  await actions([
    ...formules.map((i) => [
      "AddColumn",
      nouvelleTable,
      cellule("colId", i),
      { type: cellule("type", i), isFormula: true, formula: cellule("formula", i) || "" },
    ]),
    ...indexColonnes.map((i) => [
      "ModifyColumn",
      nouvelleTable,
      cellule("colId", i),
      {
        label: cellule("label", i) || cellule("colId", i),
        widgetOptions: cellule("widgetOptions", i) || "",
        description: cellule("description", i) || "",
        untieColIdFromLabel: true,
      },
    ]),
  ]);
  await lireMeta();
  return nouvelleTable;
}
function retirerBloc(bloc) {
  const libelle = bloc.genre === "question" ? `« ${libelleQuestion(bloc.colonne)} »` : "ce bloc";
  const dependantes = blocs().filter(
    (autreBloc) =>
      autreBloc.reglages &&
      autreBloc.reglages.condition &&
      colonneDeRef(autreBloc.reglages.condition.ref) &&
      colonneDeRef(autreBloc.reglages.condition.ref).colId === bloc.colonne &&
      bloc.genre === "question",
  );
  if (
    !confirm(
      `Retirer ${libelle} du formulaire ?${bloc.genre === "question" ? "\nLa colonne et ses réponses restent dans la table." : ""}${dependantes.length ? `\n${dependantes.length} question(s) dépendent de celle-ci : leur condition restera à corriger.` : ""}`,
    )
  )
    return;
  etatFormulaires.courant.conf.blocs = blocs().filter((autreBloc) => autreBloc.id !== bloc.id);
  if (etatFormulaires.choisi === bloc.id) etatFormulaires.choisi = null;
  sauver();
  dessinerApercu();
  dessinerPanneau();
}
function cibleDepot(evenement) {
  const bloc = evenement.target.closest && evenement.target.closest(".bloc");
  if (bloc && bloc.dataset.bloc !== etatFormulaires.blocGlisse) {
    const rectangle = bloc.getBoundingClientRect();
    return { el: bloc, apres: evenement.clientY > rectangle.top + rectangle.height / 2 };
  }
  const feuille = evenement.target.closest && evenement.target.closest("[data-section-feuille]");
  return feuille ? { feuille: feuille } : null;
}

/* =========================================================
 Ajout d'un bloc
 ========================================================= */
function fermerMenu() {
  $("menu-ajout").hidden = true;
  document.querySelectorAll(".insertion.ouverte").forEach((insertion) => insertion.classList.remove("ouverte"));
  etatFormulaires.menuContextuel = null;
}
function placerMenu(ancre) {
  const menu = $("menu-ajout"),
    rectangle = ancre.getBoundingClientRect();
  menu.hidden = false;
  const gauche = Math.max(
    10,
    Math.min(window.innerWidth - menu.offsetWidth - 10, rectangle.left + rectangle.width / 2 - menu.offsetWidth / 2),
  );
  let haut = rectangle.bottom + 6;
  if (haut + menu.offsetHeight > window.innerHeight - 10) haut = Math.max(10, rectangle.top - menu.offsetHeight - 6);
  menu.style.left = gauche + "px";
  menu.style.top = haut + "px";
}
function ouvrirMenu(section, index, ancre) {
  etatFormulaires.menuContextuel = { section: section || "q", index: isNaN(index) ? blocs().length : index, ancre };
  const zoneInsertion = ancre.closest(".insertion");
  if (zoneInsertion) zoneInsertion.classList.add("ouverte");
  const menu = $("menu-ajout");
  menu.innerHTML = `<h4>Ajouter</h4><div class="types">${TYPES_QUESTIONS.filter(
    (type) => !type.etab || (communsActifs() && tableEtablissements()),
  )
    .map((type) => `<button type="button" data-type="${type.cle}"><b>${type.icone}</b>${esc(type.nom)}</button>`)
    .join("")}</div>
  <div class="lien-existante"><button type="button" class="ajout-lien" data-type="existante">↳ Utiliser des colonnes existantes de la table…</button></div>`;
  placerMenu(ancre);
  menu.querySelector("button").focus();
}
// Événements du menu d'ajout d'un bloc ; appelé une fois au démarrage
function brancherEvenementsMenuAjout() {
  $("menu-ajout").addEventListener("click", (evenement) => {
    const bouton = evenement.target.closest("button");
    if (!bouton || !etatFormulaires.menuContextuel) return;
    if (bouton.dataset.type === "existante") return etapeExistantes();
    if (bouton.dataset.type === "etab") return etapeEtablissement();
    if (bouton.dataset.type) return etapeLibelle(TYPES_QUESTIONS.find((type) => type.cle === bouton.dataset.type));
    if (bouton.dataset.menu === "annuler") return fermerMenu();
  });
  $("menu-ajout").addEventListener("keydown", (evenement) => {
    if (evenement.key === "Escape") {
      evenement.preventDefault();
      const ancre = etatFormulaires.menuContextuel && etatFormulaires.menuContextuel.ancre;
      fermerMenu();
      if (ancre) ancre.focus();
    }
  });
  document.addEventListener("mousedown", (evenement) => {
    if (
      !$("menu-ajout").hidden &&
      !$("menu-ajout").contains(evenement.target) &&
      !evenement.target.closest("[data-ajout]")
    )
      fermerMenu();
  });
}
function etapeLibelle(type) {
  const menu = $("menu-ajout");
  const decor = !!type.decor;
  menu.innerHTML = `<h4>${esc(type.nom)}</h4><form class="etape2" id="form-etape2">
  <label for="e2-texte">${decor ? (type.decor === "titre" ? "Titre" : "Texte") : "Intitulé de la question"}</label>
  ${type.decor === "info" ? `<textarea id="e2-texte" required></textarea>` : `<input type="text" id="e2-texte" required autocomplete="off">`}
  ${
    type.cle === "tableau"
      ? `<label for="e2-table-choix">Table des lignes<span class="aide">Une ligne par élément saisi (par exemple un blessé, un site).</span></label>
    <select id="e2-table-choix" style="margin-bottom:8px"><option value="__nouvelle__">+ Créer une nouvelle table</option>${tablesPourTableau()
      .map((identifiantTable) => `<option value="${esc(identifiantTable)}">${esc(identifiantTable)}</option>`)
      .join("")}</select>
    <div id="e2-bloc-nouvelle"><label for="e2-table">Nom de la nouvelle table</label><input type="text" id="e2-table" autocomplete="off"></div>
    <p class="note" id="e2-table-info" style="margin:0 0 6px" hidden></p>`
      : ""
  }
  ${!decor ? `<p class="note" style="margin:0 0 6px">Une colonne « ${esc(typeAffiche({ genre: "question", colonne: "", reglages: {} }) && type.nom)} » sera créée dans la table ${esc(etatFormulaires.courant.table)}.</p>` : ""}
  <p class="statut err" id="e2-erreur" role="alert"></p>
  <div class="actions-menu"><button type="button" class="secondaire" data-menu="annuler">Annuler</button><button type="submit" class="primaire">Ajouter</button></div></form>`;
  placerMenu(etatFormulaires.menuContextuel.ancre);
  const champ = $("e2-texte");
  champ.focus();
  if (type.cle === "tableau")
    champ.addEventListener("input", () => {
      if (!$("e2-table").dataset.touche) $("e2-table").value = identifiant(champ.value, []);
    });
  if ($("e2-table-choix"))
    $("e2-table-choix").addEventListener("change", () => {
      const tableChoisie = $("e2-table-choix").value,
        info = $("e2-table-info");
      $("e2-erreur").textContent = "";
      $("e2-bloc-nouvelle").hidden = tableChoisie !== "__nouvelle__";
      info.hidden = tableChoisie === "__nouvelle__";
      if (tableChoisie !== "__nouvelle__") {
        const analyse = analyserTableLignes(tableChoisie);
        info.innerHTML = analyse.html;
        info.classList.toggle("avert", !!analyse.erreur);
      }
      placerMenu(etatFormulaires.menuContextuel.ancre);
    });
  if ($("e2-table"))
    $("e2-table").addEventListener("input", () => {
      $("e2-table").dataset.touche = "1";
    });
  $("form-etape2").addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    const texte = champ.value.trim();
    if (!texte) return;
    const bouton = evenement.submitter || menu.querySelector("button[type=submit]");
    bouton.disabled = true;
    const existante =
      $("e2-table-choix") && $("e2-table-choix").value !== "__nouvelle__" ? $("e2-table-choix").value : null;
    try {
      await ajouterBloc(type, texte, $("e2-table") ? $("e2-table").value.trim() : "", existante);
      fermerMenu();
    } catch (erreur) {
      $("e2-erreur").textContent = `Échec : ${erreur.message || erreur}`;
      bouton.disabled = false;
    }
  });
}
async function ajouterBloc(type, texte, nomTable, tableExistante) {
  const contexteMenu = etatFormulaires.menuContextuel;
  const bloc = { id: nouvelId(), section: contexteMenu.section };
  if (type.decor) {
    bloc.genre = type.decor;
    bloc.texte = texte;
  } else if (type.cle === "tableau" && tableExistante) {
    const analyse = analyserTableLignes(tableExistante);
    if (analyse.erreur) throw new Error(analyse.erreur);
    // colonnes de liaison manquantes : dossier (référence vers la table des réponses), identifiant et ordre des lignes
    const listeActions = [];
    if (!analyse.colDossier)
      listeActions.push([
        "AddColumn",
        tableExistante,
        "Dossier",
        { type: `Ref:${etatFormulaires.courant.table}`, isFormula: false, label: "Dossier" },
      ]);
    if (!analyse.ligne)
      listeActions.push(["AddColumn", tableExistante, "Ligne_id", { type: "Text", isFormula: false }]);
    if (!analyse.ordre) listeActions.push(["AddColumn", tableExistante, "Ordre", { type: "Int", isFormula: false }]);
    if (listeActions.length) await ecrireStructure(listeActions);
    // historique : une ligne par version (Version, Mouvement, Etat_actuel, Date_version)
    const actionsHistorique = actionsHistoriqueTableau(tableExistante, analyse.colDossier || "Dossier");
    if (actionsHistorique.length) {
      await ecrireStructure(actionsHistorique);
      listeActions.push(...actionsHistorique);
    }
    bloc.genre = "question";
    bloc.colonne = await creerColonne(etatFormulaires.courant.table, texte, "Text", null);
    bloc.reglages = { libelle: texte, tableau: { table: tableExistante } };
    const reprise = await reprendreLignesExistantes(tableExistante, bloc.colonne, analyse.colDossier || "Dossier");
    setTimeout(
      () =>
        message(
          `Question tableau créée sur la table ${tableExistante}${listeActions.length ? ` (colonne${listeActions.length > 1 ? "s" : ""} ajoutée${listeActions.length > 1 ? "s" : ""} : ${listeActions.map((action) => action[2]).join(", ")})` : ""}.` +
            (reprise.lignes
              ? ` ${reprise.lignes} ligne${reprise.lignes > 1 ? "s" : ""} existante${reprise.lignes > 1 ? "s" : ""} reprise${reprise.lignes > 1 ? "s" : ""} dans ${reprise.dossiers} dossier${reprise.dossiers > 1 ? "s" : ""}.`
              : ""),
          "ok",
        ),
      0,
    );
  } else if (type.cle === "tableau") {
    const nomNouvelleTable = identifiant(
      nomTable || texte,
      etatFormulaires.tables.concat(Object.keys(etatFormulaires.meta)),
    );
    await creerTableLignes(nomNouvelleTable, etatFormulaires.courant.table);
    const actionsHistorique = actionsHistoriqueTableau(nomNouvelleTable, "Dossier"); // historique : une ligne par version et par ligne saisie
    if (actionsHistorique.length) await ecrireStructure(actionsHistorique);
    bloc.genre = "question";
    bloc.colonne = await creerColonne(etatFormulaires.courant.table, texte, "Text", null);
    bloc.reglages = { libelle: texte, tableau: { table: nomNouvelleTable } };
  } else if (type.cle === "pj") {
    // pièces jointes : colonne texte d'envoi (remplie par le formulaire) + colonne Pièces jointes en formule, qui ne
    // retient que les fichiers dont le formulaire prouve l'envoi (empreinte) : compatible avec les liens d'établissement
    bloc.genre = "question";
    const envoi = await creerColonne(etatFormulaires.courant.table, `${texte} (envoi)`, "Text", null);
    bloc.colonne = await creerColonne(
      etatFormulaires.courant.table,
      texte,
      "Attachments",
      null,
      formulePiecesJointes(envoi),
    );
    bloc.reglages = { libelle: texte };
  } else {
    bloc.genre = "question";
    const options = type.choix ? { choices: type.choix, choiceOptions: {} } : null;
    bloc.colonne = await creerColonne(etatFormulaires.courant.table, texte, type.type, options);
    bloc.reglages = { libelle: texte, ...(type.reglages || {}) };
  }
  blocs().splice(Math.min(contexteMenu.index, blocs().length), 0, bloc);
  etatFormulaires.choisi = bloc.id;
  sauver();
  dessinerApercu();
  dessinerPanneau();
  // question tableau : sa table reçoit tout de suite les règles d'accès du socle (une fois le brouillon enregistré)
  if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table)
    reglesApresTableau(bloc.reglages.tableau.table);
  const element = document.querySelector(`[data-bloc="${bloc.id}"]`);
  if (element) {
    element.scrollIntoView({ block: "center" });
  }
  if (type.choix || type.cle === "tableau") {
    const champ = $("panneau").querySelector(type.choix ? ".choix-edit input[type=text]" : "#sc-nouveau-lib");
    if (champ) champ.focus();
  } else {
    const champ = $("pa-libelle");
    if (champ) champ.focus();
  }
}
// Donnée de la fiche établissement : colonne formule « $Etablissement.Colonne » dans la table des réponses
function etapeEtablissement() {
  const menu = $("menu-ajout"),
    tableEtablissement = tableEtablissements(),
    colonnes = colonnesEtabProposees(tableEtablissement);
  const deja = new Set(
    blocs()
      .filter((bloc) => bloc.genre === "question" && etatFormulaires.meta[bloc.colonne])
      .map((bloc) => sourceColonneEtablissement(etatFormulaires.meta[bloc.colonne]))
      .filter(Boolean),
  );
  menu.innerHTML = `<h4>Donnée de la fiche établissement</h4><form class="etape2" id="form-etape2">
  <label for="e2-col">Information de la fiche<span class="aide">Table ${esc(tableEtablissement)}, à laquelle renvoie la colonne Etablissement.</span></label>
  <select id="e2-col">${colonnes.map((colonne) => `<option value="${esc(colonne.colId)}">${esc(colonne.libelle)}${colonne.libelle !== colonne.colId ? ` (${esc(colonne.colId)})` : ""}${deja.has(colonne.colId) ? " — déjà dans le formulaire" : ""}</option>`).join("")}</select>
  <label for="e2-texte">Intitulé affiché dans le formulaire</label><input type="text" id="e2-texte" required autocomplete="off">
  <p class="note" style="margin:0 0 6px">Une colonne formule <code>$${esc(colonneEtablissement())}.…</code> sera créée dans la table ${esc(etatFormulaires.courant.table)} : la valeur s'affiche dès que l'établissement est choisi, sans saisie, et peut entrer dans la description automatique.</p>
  <p class="statut err" id="e2-erreur" role="alert"></p>
  <div class="actions-menu"><button type="button" class="secondaire" data-menu="annuler">Annuler</button><button type="submit" class="primaire"${colonnes.length ? "" : " disabled"}>Ajouter</button></div></form>`;
  placerMenu(etatFormulaires.menuContextuel.ancre);
  const selecteur = $("e2-col"),
    champ = $("e2-texte");
  const remplir = () => {
    if (!champ.dataset.touche)
      champ.value = (colonnes.find((colonne) => colonne.colId === selecteur.value) || {}).libelle || "";
  };
  remplir();
  selecteur.focus();
  selecteur.addEventListener("change", remplir);
  champ.addEventListener("input", () => {
    champ.dataset.touche = "1";
  });
  $("form-etape2").addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    const texte = champ.value.trim();
    if (!texte || !selecteur.value) return;
    const bouton = menu.querySelector("button[type=submit]");
    bouton.disabled = true;
    try {
      await ajouterBlocEtablissement(selecteur.value, texte);
      fermerMenu();
    } catch (erreur) {
      $("e2-erreur").textContent = `Échec : ${erreur.message || erreur}`;
      bouton.disabled = false;
    }
  });
}
async function ajouterBlocEtablissement(identifiantSource, texte) {
  const contexteMenu = etatFormulaires.menuContextuel,
    colonneSource = colonnesDe(tableEtablissements())[identifiantSource] || {};
  const options = ["Choice", "ChoiceList"].includes(typeBase(colonneSource.type)) ? colonneSource.opts : null;
  const colId = await creerColonne(
    etatFormulaires.courant.table,
    texte,
    colonneSource.type || "Any",
    options,
    `$${colonneEtablissement()}.${identifiantSource}`,
  );
  const bloc = {
    id: nouvelId(),
    section: contexteMenu.section,
    genre: "question",
    colonne: colId,
    reglages: { libelle: texte },
  };
  blocs().splice(Math.min(contexteMenu.index, blocs().length), 0, bloc);
  etatFormulaires.choisi = bloc.id;
  sauver();
  dessinerApercu();
  dessinerPanneau();
  // question tableau : sa table reçoit tout de suite les règles d'accès du socle (une fois le brouillon enregistré)
  if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table)
    reglesApresTableau(bloc.reglages.tableau.table);
  const element = document.querySelector(`[data-bloc="${bloc.id}"]`);
  if (element) element.scrollIntoView({ block: "center" });
}
function etapeExistantes() {
  const menu = $("menu-ajout");
  const pris = new Set(
    blocs()
      .filter((bloc) => bloc.genre === "question")
      .map((bloc) => bloc.colonne),
  );
  const deRole = new Set(Object.values(rolesEffectifs()).filter(Boolean));
  const communs = {
    test: (id) =>
      deRole.has(id) ||
      /^(Etablissement|Description|Qualification|Date|Date_faits|Dossier|Nature|Commentaire|Auteur|Site|Clos)$/.test(
        id,
      ),
  };
  const libres = Object.values(etatFormulaires.meta)
    .filter(
      (colonne) =>
        !pris.has(colonne.colId) && colonne.colId !== "id" && !(communsActifs() && communs.test(colonne.colId)),
    )
    .sort((colonneA, colonneB) => colonneA.pos - colonneB.pos);
  menu.innerHTML = `<h4>Colonnes existantes de ${esc(etatFormulaires.courant.table)}</h4>
  ${
    libres.length
      ? `<div class="liste-existantes">${libres.map((colonne) => `<label><input type="checkbox" value="${esc(colonne.colId)}"${communs.test(colonne.colId) || colonne.formule ? "" : ""}> ${esc(colonne.libelle)} <small>${esc(typeBase(colonne.type))}${colonne.formule ? ", formule" : ""}${communs.test(colonne.colId) ? ", champ commun" : ""}</small></label>`).join("")}</div>
  <p class="note" style="margin:0 0 6px">Les repères déjà écrits dans leur description ([si …], *, [couleur]…) sont repris dans les réglages.</p>`
      : `<p class="note">Toutes les colonnes sont déjà dans le formulaire.</p>`
  }
  <div class="actions-menu"><button type="button" class="secondaire" data-menu="annuler">Annuler</button>${libres.length ? `<button type="button" class="primaire" id="btn-ajout-existantes">Ajouter</button>` : ""}</div>`;
  placerMenu(etatFormulaires.menuContextuel.ancre);
  const bouton = $("btn-ajout-existantes");
  if (bouton)
    bouton.addEventListener("click", () => {
      const ids = [...menu.querySelectorAll("input:checked")].map((caseACocher) => caseACocher.value);
      ajouterExistantes(ids, etatFormulaires.menuContextuel.section, etatFormulaires.menuContextuel.index);
      fermerMenu();
    });
}
function blocDepuisColonne(colonne, section) {
  const reperes = lireReperes(colonne.description);
  return {
    id: nouvelId(),
    genre: "question",
    section,
    colonne: colonne.colId,
    reglages: { libelle: colonne.libelle, ...reperes },
  };
}
function ajouterExistantes(ids, section, index) {
  const nouveaux = ids
    .map((id) => etatFormulaires.meta[id])
    .filter(Boolean)
    .map((colonne) => blocDepuisColonne(colonne, section));
  blocs().splice(Math.min(index, blocs().length), 0, ...nouveaux);
  if (nouveaux[0]) etatFormulaires.choisi = nouveaux[0].id;
  sauver();
  dessinerApercu();
  dessinerPanneau();
}

/* PRISME — administration, onglet « Formulaires » : formulaires/mode-test.js
   Mode test : l'aperçu devient saisissable (conditions, questions tableau, établissement choisi dans le
   référentiel, formules calculées).
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : valeurTest, appliquerTest, refsExternes, dessinerPanneauTest, sousColonnes, visibleDansLigne,
     texteAutoTest, tableauTestHtml, redessinerTableauTest, ajusterTableauxTest, clicTableauTest, saisieTableauTest,
     basculerTest, trouverColonneEtablissement, chargerEtablissementsTest, devinerColonnesEtablissement,
     colonneDuRole, nomEtablissement, libelleEtablissementTest, chercherEtablissementTest,
     resumeEtablissementTestHtml, majEtablissementTest, valeurFormuleTest, majFormulesTest,
     valeurFormuleTestPossible, regionTest, valeursEtablissementTest, ficheTestHtml.
   Utilise :
     fondations : $, RESERVES_TABLEAU, esc, estVideValeur, etatFormulaires, normaliser, typeBase.
     donnees : colonnesDe.
     formulaire-courant : blocs, colonneDeRef, communsActifs, evaluerCondition, libelleQuestion, lireReperes.
     apercu : dessinerApercu, fermerMenu.
     panneau-question : dessinerPanneau.
     description : majDescriptionTest.
     saisie-etablissement : ROLES_ETABLISSEMENT, ROLES_FICHE, confSaisie, libelleColonneEtablissement,
       saisieEffective, sourceColonneEtablissement, tableEtablissements, valeurLisible.
   Modifie etatFormulaires : colonnesEtablissementTest, descriptionTestManuelle, etablissementTest,
     etablissementsTest, modeTest, siteTest, testLignes. */
/* ---------- mode test ---------- */
function valeurTest(colId) {
  const blocQuestion = blocs().find((candidat) => candidat.genre === "question" && candidat.colonne === colId);
  const colonne = etatFormulaires.meta[colId];
  if (!blocQuestion && communsActifs() && colId === "Qualification") {
    const radioQualification = document.querySelector('input[name="ap-Qualification"]:checked');
    return radioQualification ? radioQualification.value : null;
  }
  if (colonne && colonne.formule) {
    const valeurFormule = valeurFormuleTest(colonne);
    if (valeurFormule !== undefined) return valeurFormule;
  }
  if (!blocQuestion || !colonne) return etatFormulaires.simulations[colId] ?? null;
  if (blocQuestion.reglages && blocQuestion.reglages.tableau)
    return (etatFormulaires.testLignes[colId] || []).filter((ligne) =>
      Object.values(ligne).some((valeur) => !estVideValeur(valeur)),
    ).length;
  const bloc = document.querySelector(`[data-bloc="${blocQuestion.id}"]`);
  if (bloc && bloc.classList.contains("masque-test")) return null;
  if (blocQuestion.reglages && blocQuestion.reglages.tableau) return 0;
  const typeColonne = typeBase(colonne.type),
    nom = `ap-${colId}`;
  if (typeColonne === "Bool") {
    const entreeCochee = document.querySelector(`input[name="${nom}"]:checked`);
    return entreeCochee
      ? entreeCochee.type === "checkbox"
        ? entreeCochee.checked
        : entreeCochee.value === "true"
      : null;
  }
  if (typeColonne === "ChoiceList")
    return [...document.querySelectorAll(`input[name="${nom}"]:checked`)].map((caseCochee) => caseCochee.value);
  const radioCoche = document.querySelector(`input[type=radio][name="${nom}"]:checked`);
  if (radioCoche) return radioCoche.value;
  const champ = document.querySelector(`[name="${nom}"]:not([type=radio])`);
  if (!champ || champ.value === "") return null;
  return typeColonne === "Int" || typeColonne === "Numeric" ? parseFloat(champ.value) : champ.value;
}
function appliquerTest() {
  ajusterTableauxTest();
  for (let passe = 0; passe < 3; passe++) {
    for (const bloc of blocs()) {
      const condition = bloc.reglages && bloc.reglages.condition;
      const elementBloc = document.querySelector(`[data-bloc="${bloc.id}"]`);
      if (!elementBloc) continue;
      let visible = true;
      if (condition && condition.ref) {
        const colonneCondition = colonneDeRef(condition.ref);
        visible = evaluerCondition(valeurTest(colonneCondition ? colonneCondition.colId : condition.ref), condition);
      }
      elementBloc.classList.toggle("masque-test", !visible);
    }
  }
  majFormulesTest();
  majDescriptionTest();
}
function refsExternes() {
  const dansForm = new Set(
    blocs()
      .filter((bloc) => bloc.genre === "question")
      .map((bloc) => bloc.colonne),
  );
  if (communsActifs()) dansForm.add("Qualification");
  const colonnesExternes = new Map();
  for (const bloc of blocs()) {
    const condition = bloc.reglages && bloc.reglages.condition;
    if (!condition || !condition.ref) continue;
    const colonneCondition = colonneDeRef(condition.ref);
    if (colonneCondition && !dansForm.has(colonneCondition.colId))
      colonnesExternes.set(colonneCondition.colId, colonneCondition);
  }
  return [...colonnesExternes.values()];
}
function dessinerPanneauTest() {
  const externes = refsExternes();
  $("panneau").innerHTML =
    `<h2>Mode test</h2><p class="sous">Répondez dans l'aperçu : les questions conditionnelles apparaissent comme dans le widget de saisie. Rien n'est enregistré.</p>` +
    (communsActifs()
      ? `<p class="note">Choisissez un établissement à l'étape 1 : les données de sa fiche s'affichent et la description se rédige au fil de vos réponses.</p>`
      : "") +
    (externes.length
      ? `<div class="groupe simul"><div class="t">Valeurs simulées</div><p class="note" style="margin:0 0 8px">Colonnes utilisées dans des conditions mais absentes du formulaire (par exemple la qualification).</p>` +
        externes
          .map((colonne) => {
            const typeColonne = typeBase(colonne.type),
              choixPossibles = colonne.opts.choices || [],
              valeurSimulee = etatFormulaires.simulations[colonne.colId];
            const controle = choixPossibles.length
              ? `<select data-simul="${esc(colonne.colId)}"><option value="">(vide)</option>${choixPossibles.map((choix) => `<option${choix === valeurSimulee ? " selected" : ""}>${esc(choix)}</option>`).join("")}</select>`
              : typeColonne === "Bool"
                ? `<select data-simul="${esc(colonne.colId)}"><option value="">(vide)</option><option value="true"${valeurSimulee === true ? " selected" : ""}>Oui</option><option value="false"${valeurSimulee === false ? " selected" : ""}>Non</option></select>`
                : `<input type="text" data-simul="${esc(colonne.colId)}" value="${esc(valeurSimulee ?? "")}">`;
            return `<label class="l">${esc(colonne.libelle)}</label>${controle}`;
          })
          .join("") +
        `</div>`
      : "") +
    `<div class="pied-panneau"><button type="button" class="secondaire petit" id="btn-fin-test">Revenir à l'édition</button></div>`;
  $("panneau")
    .querySelectorAll("[data-simul]")
    .forEach((champ) =>
      champ.addEventListener("input", () => {
        const colonneSimulee = etatFormulaires.meta[champ.dataset.simul],
          typeColonne = typeBase(colonneSimulee.type);
        etatFormulaires.simulations[champ.dataset.simul] =
          champ.value === ""
            ? null
            : typeColonne === "Bool"
              ? champ.value === "true"
              : typeColonne === "Int" || typeColonne === "Numeric"
                ? parseFloat(champ.value)
                : champ.value;
        appliquerTest();
      }),
    );
  $("btn-fin-test").addEventListener("click", basculerTest);
}
/* ---------- tableau en mode test : lignes saisissables, nombre de lignes suivant une question ---------- */
// Champs d'une table de tableau, dans l'ordre de saisie : [ordre N] d'abord, puis l'ordre des colonnes de Grist
const sousColonnes = (table) =>
  Object.values(colonnesDe(table))
    .filter(
      (colonne) =>
        !colonne.formule &&
        !RESERVES_TABLEAU.includes(colonne.colId) &&
        !(etatFormulaires.courant && colonne.type === `Ref:${etatFormulaires.courant.table}`),
    )
    .map((colonne) => ({ ...colonne, r: lireReperes(colonne.description) }))
    .sort((colonneA, colonneB) => (colonneA.r.ordre ?? 1e9) - (colonneB.r.ordre ?? 1e9) || colonneA.pos - colonneB.pos);
function visibleDansLigne(champ, colonnes, ligne) {
  const condition = champ.r.condition;
  if (!condition || !condition.ref) return true;
  const refNormalisee = normaliser(condition.ref),
    cible = colonnes.find(
      (colonne) =>
        colonne.colId === condition.ref ||
        normaliser(colonne.colId) === refNormalisee ||
        normaliser(colonne.libelle) === refNormalisee,
    );
  return cible ? evaluerCondition(ligne[cible.colId] ?? null, condition) : true;
}
// Aperçu simplifié d'un champ [auto] : « Libellé : valeur » des autres champs de la ligne (hors confidentiels)
function texteAutoTest(colonnes, ligne) {
  return colonnes
    .filter((champ) => !champ.r.auto && !champ.r.confidentiel && visibleDansLigne(champ, colonnes, ligne))
    .map((champ) => {
      const valeur = ligne[champ.colId];
      if (estVideValeur(valeur)) return "";
      return `${champ.libelle} : ${Array.isArray(valeur) ? valeur.join(", ") : valeur === true ? "Oui" : valeur === false ? "Non" : valeur}`;
    })
    .filter(Boolean)
    .join(" — ");
}
function tableauTestHtml(bloc) {
  const colonnes = sousColonnes(bloc.reglages.tableau.table).filter((champ) => !champ.r.masque),
    lignes = etatFormulaires.testLignes[bloc.colonne] || (etatFormulaires.testLignes[bloc.colonne] = []);
  const attendu = bloc.reglages.tableau.lignes ? valeurTest(bloc.reglages.tableau.lignes) : null;
  const controle = (champ, k, valeur) => {
    const typeColonne = typeBase(champ.type),
      choixPossibles = champ.opts.choices || [],
      attributs = `data-k="${k}" data-sc="${esc(champ.colId)}"`;
    // choix unique : boutons ronds comme les pastilles du widget de saisie ([liste] : menu déroulant)
    if (typeColonne === "Choice" && !/\[liste\]/i.test(champ.description || ""))
      return `<div class="coches" role="radiogroup">${choixPossibles.map((choix) => `<label><input type="radio" name="t-${esc(bloc.colonne)}-${k}-${esc(champ.colId)}" ${attributs} value="${esc(choix)}"${choix === valeur ? " checked" : ""}> ${esc(choix)}</label>`).join("")}</div>`;
    if (typeColonne === "Choice")
      return `<select ${attributs}><option value="">Choisir…</option>${choixPossibles.map((choix) => `<option${choix === valeur ? " selected" : ""}>${esc(choix)}</option>`).join("")}</select>`;
    if (typeColonne === "ChoiceList")
      return `<div class="coches">${choixPossibles.map((choix) => `<label><input type="checkbox" ${attributs} value="${esc(choix)}"${(valeur || []).includes(choix) ? " checked" : ""}> ${esc(choix)}</label>`).join("")}</div>`;
    if (typeColonne === "Bool")
      return `<select ${attributs}><option value="">—</option><option value="true"${valeur === true ? " selected" : ""}>Oui</option><option value="false"${valeur === false ? " selected" : ""}>Non</option></select>`;
    if (typeColonne === "Int" || typeColonne === "Numeric")
      return `<input type="number" ${attributs} value="${valeur ?? ""}">`;
    if (typeColonne === "Date") return `<input type="date" ${attributs} value="${esc(valeur || "")}">`;
    if (champ.r.auto)
      return `<input type="text" ${attributs} value="${esc(texteAutoTest(colonnes, lignes[k]))}" readonly title="Aperçu : dans le formulaire, l'agent peut modifier ce texte">`;
    return `<input type="text" ${attributs} value="${esc(valeur || "")}">`;
  };
  return `${
    lignes
      .map(
        (ligne, k) => `<div class="ligne-test"><span class="num-test">${k + 1}</span>${colonnes
          .filter((champ) => visibleDansLigne(champ, colonnes, ligne))
          .map(
            (champ) =>
              `<label class="sc-test"><span>${esc(champ.libelle)}${champ.r.obligatoire ? ' <span class="req">*</span>' : ""}${champ.r.auto ? ' <small class="note">(auto)</small>' : ""}</span>${controle(champ, k, ligne[champ.colId])}</label>`,
          )
          .join("")}
    <button type="button" class="icone" data-tab-act="suppr" data-k="${k}" aria-label="Supprimer la ligne ${k + 1}">✕</button></div>`,
      )
      .join("") || `<p class="note" style="margin:0 0 8px">Aucune ligne.</p>`
  }
  <div class="pied-test"><button type="button" class="secondaire petit" data-tab-act="ajout">+ Ajouter</button>
    <span class="note">${lignes.length} ligne${lignes.length > 1 ? "s" : ""}${attendu != null ? ` · ${attendu || 0} indiqué${(attendu || 0) > 1 ? "s" : ""} dans « ${esc(libelleQuestion(bloc.reglages.tableau.lignes))} »` : ""}</span></div>`;
}
function redessinerTableauTest(colId) {
  const bloc = blocs().find((candidat) => candidat.colonne === colId),
    zoneTableau = document.querySelector(`[data-tab="${CSS.escape(colId)}"]`);
  if (bloc && zoneTableau) zoneTableau.innerHTML = tableauTestHtml(bloc);
}
function ajusterTableauxTest() {
  // même règle que le widget de saisie : ajout de lignes vides, retrait des seules lignes vides
  for (const bloc of blocs()) {
    const reglagesTableau = bloc.reglages && bloc.reglages.tableau;
    if (!reglagesTableau || !reglagesTableau.lignes) continue;
    const valeurLignes = valeurTest(reglagesTableau.lignes),
      nombreLignes = typeof valeurLignes === "number" && valeurLignes > 0 ? Math.min(200, Math.floor(valeurLignes)) : 0;
    const lignes = etatFormulaires.testLignes[bloc.colonne] || (etatFormulaires.testLignes[bloc.colonne] = []);
    if (lignes.dernierN === nombreLignes) continue; // seul un changement du nombre ajuste les lignes (l'ajout à la main reste possible)
    lignes.dernierN = nombreLignes;
    const avant = lignes.length;
    while (lignes.length < nombreLignes) lignes.push({});
    while (
      lignes.length > nombreLignes &&
      !Object.values(lignes[lignes.length - 1]).some((valeur) => !estVideValeur(valeur))
    )
      lignes.pop();
    if (lignes.length !== avant) redessinerTableauTest(bloc.colonne);
  }
}
function clicTableauTest(evenement) {
  const boutonAction = evenement.target.closest("[data-tab-act]");
  if (!boutonAction) return;
  const colId = boutonAction.closest("[data-tab]").dataset.tab,
    lignes = etatFormulaires.testLignes[colId] || (etatFormulaires.testLignes[colId] = []);
  if (boutonAction.dataset.tabAct === "ajout") lignes.push({});
  else lignes.splice(+boutonAction.dataset.k, 1);
  redessinerTableauTest(colId);
  appliquerTest();
}
function saisieTableauTest(evenement) {
  const controle = evenement.target.closest("[data-sc]");
  if (!controle) return false;
  const colId = controle.closest("[data-tab]").dataset.tab,
    k = +controle.dataset.k,
    identifiantChamp = controle.dataset.sc,
    ligne = etatFormulaires.testLignes[colId][k];
  const colonne = sousColonnes(blocs().find((candidat) => candidat.colonne === colId).reglages.tableau.table).find(
      (candidat) => candidat.colId === identifiantChamp,
    ),
    typeColonne = typeBase(colonne.type);
  if (typeColonne === "ChoiceList")
    ligne[identifiantChamp] = [...controle.closest(".sc-test").querySelectorAll("input:checked")].map(
      (caseCochee) => caseCochee.value,
    );
  else if (typeColonne === "Bool") ligne[identifiantChamp] = controle.value === "" ? null : controle.value === "true";
  else if (typeColonne === "Int" || typeColonne === "Numeric")
    ligne[identifiantChamp] = controle.value === "" ? null : parseFloat(controle.value);
  else ligne[identifiantChamp] = controle.value;
  if (evenement.type === "change") {
    redessinerTableauTest(colId);
    const champRedessine = document.querySelector(
      `[data-tab="${CSS.escape(colId)}"] [data-k="${k}"][data-sc="${CSS.escape(identifiantChamp)}"]`,
    );
    if (champRedessine && champRedessine.type !== "checkbox") champRedessine.focus();
  }
  return true;
}
function basculerTest() {
  etatFormulaires.modeTest = !etatFormulaires.modeTest;
  etatFormulaires.testLignes = {};
  etatFormulaires.descriptionTestManuelle = false;
  etatFormulaires.siteTest = "";
  if (etatFormulaires.modeTest && communsActifs() && !etatFormulaires.etablissementsTest)
    chargerEtablissementsTest().then(() => {
      const i = $("test-etab");
      if (i) i.placeholder = "Nom ou UAI";
    });
  $("btn-tester").setAttribute("aria-pressed", String(etatFormulaires.modeTest));
  $("btn-tester").textContent = etatFormulaires.modeTest ? "✎ Éditer" : "▶ Tester";
  $("app").classList.toggle("test", etatFormulaires.modeTest);
  fermerMenu();
  dessinerApercu();
  if (etatFormulaires.modeTest) dessinerPanneauTest();
  else dessinerPanneau();
}

/* ---------- mode test : établissement choisi dans le référentiel ---------- */
function trouverColonneEtablissement(colonnes, motifs, sauf) {
  const listeColonnes = Object.values(colonnes),
    cle = (colonne) => normaliser(`${colonne.colId} ${colonne.libelle}`).replace(/[^a-z0-9]+/g, "_");
  for (const motif of motifs) {
    const colonneTrouvee = listeColonnes.find(
      (candidate) => motif.test(cle(candidate)) && !(sauf && sauf.test(cle(candidate))),
    );
    if (colonneTrouvee) return colonneTrouvee.colId;
  }
  return null;
}
async function chargerEtablissementsTest() {
  const identifiantTable = tableEtablissements();
  etatFormulaires.etablissementsTest = [];
  if (!identifiantTable) return;
  try {
    const donneesTable = await Donnees.lire(identifiantTable),
      identifiantsColonnes = Object.keys(donneesTable).filter(
        (identifiantColonne) => identifiantColonne !== "manualSort",
      );
    etatFormulaires.etablissementsTest = donneesTable.id.map((id, i) => {
      const ligne = {};
      identifiantsColonnes.forEach((identifiantColonne) => {
        ligne[identifiantColonne] = donneesTable[identifiantColonne][i];
      });
      return ligne;
    });
    devinerColonnesEtablissement();
  } catch (_) {
    etatFormulaires.etablissementsTest = [];
  }
}
function devinerColonnesEtablissement() {
  // colonnes du référentiel reconnues d'après leur identifiant ou leur libellé
  const colonnes = colonnesDe(tableEtablissements() || "");
  etatFormulaires.colonnesEtablissementTest = {
    nom: colonnes.Nom
      ? "Nom"
      : trouverColonneEtablissement(
          colonnes,
          [/(^|_)nom(_|$)/, /appellation|denomination|libelle|intitule/, /etablissement/],
          /commune|ville|academi|departement|region|type|sigle|uai|tutelle|mail/,
        ),
    uai: colonnes.UAI
      ? "UAI"
      : trouverColonneEtablissement(colonnes, [/(^|_)(uai|rne)(_|$)/, /uai|rne/], /tutelle|siege|parent/),
    commune: colonnes.Commune
      ? "Commune"
      : trouverColonneEtablissement(colonnes, [/commune|ville|localite/], /code|insee|postal/),
    type: colonnes.Type
      ? "Type"
      : trouverColonneEtablissement(
          colonnes,
          [/^type/, /(^|_)type(_|$)/, /nature|categorie|typologie/],
          /code|contrat/,
        ),
    academie: colonnes.Academie ? "Academie" : trouverColonneEtablissement(colonnes, [/academie/], /code|region/),
    departement: colonnes.Departement
      ? "Departement"
      : trouverColonneEtablissement(colonnes, [/departement/], /code|numero/),
    mail: colonnes.Mail ? "Mail" : trouverColonneEtablissement(colonnes, [/mail|courriel/], /annuaire/),
    region: trouverColonneEtablissement(colonnes, [/region_?academique/, /region/], /code/),
  };
}
const colonneDuRole = (k) => (confSaisie().colonnes || {})[k] || etatFormulaires.colonnesEtablissementTest[k] || null; // colonne imposée par le formulaire, sinon reconnue
const nomEtablissement = (etablissement) =>
  String((colonneDuRole("nom") && etablissement[colonneDuRole("nom")]) || `Établissement n° ${etablissement.id}`);
const libelleEtablissementTest = (etablissement) =>
  `${nomEtablissement(etablissement)}${etatFormulaires.colonnesEtablissementTest.uai && etablissement[etatFormulaires.colonnesEtablissementTest.uai] ? ` — ${etablissement[etatFormulaires.colonnesEtablissementTest.uai]}` : ""}`;
function chercherEtablissementTest(recherche) {
  const liste = $("test-etab-liste");
  if (!liste || !etatFormulaires.etablissementsTest) return;
  const exact = etatFormulaires.etablissementsTest.find(
    (etablissement) => libelleEtablissementTest(etablissement) === recherche,
  );
  if (exact) {
    etatFormulaires.etablissementTest = exact;
    majEtablissementTest();
    return;
  }
  if (etatFormulaires.etablissementTest && !recherche.trim()) {
    etatFormulaires.etablissementTest = null;
    majEtablissementTest();
  }
  const rechercheNormalisee = normaliser(recherche);
  const resultats =
    rechercheNormalisee.length < 2
      ? []
      : etatFormulaires.etablissementsTest
          .filter((etablissement) =>
            normaliser(
              `${nomEtablissement(etablissement)} ${etatFormulaires.colonnesEtablissementTest.uai ? etablissement[etatFormulaires.colonnesEtablissementTest.uai] || "" : ""}`,
            ).includes(rechercheNormalisee),
          )
          .slice(0, 30);
  liste.innerHTML = resultats
    .map((etablissement) => `<option value="${esc(libelleEtablissementTest(etablissement))}"></option>`)
    .join("");
}
function resumeEtablissementTestHtml() {
  const etablissement = etatFormulaires.etablissementTest,
    commune =
      etablissement && etatFormulaires.colonnesEtablissementTest.commune
        ? etablissement[etatFormulaires.colonnesEtablissementTest.commune]
        : "";
  return etablissement
    ? `<b>${esc(nomEtablissement(etablissement))}</b>${commune ? ` <span class="meta">· ${esc(commune)}</span>` : ""}`
    : `<b>Établissement du dossier</b> <span class="meta">· choisi au signalement initial</span>`;
}
function majEtablissementTest() {
  // établissement de test choisi : résumé, titre (mise à jour), données de la fiche, description
  const resume = $("test-resume-etab");
  if (resume) resume.innerHTML = resumeEtablissementTestHtml();
  const fiche = $("test-fiche");
  if (fiche) {
    fiche.hidden = !etatFormulaires.etablissementTest;
    fiche.innerHTML = ficheTestHtml();
  }
  const titre = document.querySelector(".entete-apercu.maj h1");
  if (titre)
    titre.textContent = etatFormulaires.etablissementTest
      ? nomEtablissement(etatFormulaires.etablissementTest)
      : "Établissement du dossier";
  appliquerTest();
}
// Valeur d'une colonne formule en mode test ; undefined si l'aperçu ne sait pas la calculer
function valeurFormuleTest(colonne) {
  const colonneSource = sourceColonneEtablissement(colonne);
  if (colonneSource) {
    const valeur = etatFormulaires.etablissementTest ? etatFormulaires.etablissementTest[colonneSource] : null;
    return valeur && typeof valeur === "object" && !Array.isArray(valeur) ? null : (valeur ?? null);
  }
  const formule = String(colonne.texteFormule || "")
    .trim()
    .replace(/^return\s+/, "");
  if (
    !/^[\s$\w.,+\-*/()]+$/.test(formule) ||
    !/\$\w/.test(formule) ||
    !/^[\s+\-*/()]*$/.test(formule.replace(/\$\w+/g, " ").replace(/\d+(?:[.,]\d+)?/g, " "))
  )
    return undefined;
  let manque = false;
  const expression = formule.replace(/\$(\w+)/g, (_, identifiantColonne) => {
    const valeur = identifiantColonne === colonne.colId ? null : valeurTest(identifiantColonne);
    if (typeof valeur !== "number") manque = true;
    return `(${Number(valeur) || 0})`;
  });
  if (manque) return null;
  try {
    const resultat = Function(`"use strict"; return (${expression.replace(/,/g, ".")});`)();
    return Number.isFinite(resultat) ? Math.round(resultat * 1e6) / 1e6 : null;
  } catch (_) {
    return null;
  }
}
function majFormulesTest() {
  document.querySelectorAll("[data-formule]").forEach((element) => {
    const colonne = etatFormulaires.meta[element.dataset.formule];
    if (!colonne) return;
    const valeur = valeurFormuleTest(colonne);
    element.textContent =
      valeur === undefined
        ? "Valeur calculée par Grist à l'enregistrement"
        : valeur == null || valeur === ""
          ? "—"
          : valeurLisible(colonne, valeur);
  });
}
const valeurFormuleTestPossible = (colonne) => {
  const formule = String(colonne.texteFormule || "")
    .trim()
    .replace(/^return\s+/, "");
  return (
    /^[\s$\w.,+\-*/()]+$/.test(formule) &&
    /\$\w/.test(formule) &&
    /^[\s+\-*/()]*$/.test(formule.replace(/\$\w+/g, " ").replace(/\d+(?:[.,]\d+)?/g, " "))
  );
};
// Région académique : colonne du référentiel, sinon déduite de l'académie (comme le widget de saisie)
function regionTest(etablissement) {
  const colonneRegion = etatFormulaires.colonnesEtablissementTest.region,
    valeur = colonneRegion ? etablissement[colonneRegion] : null;
  if (valeur != null && valeur !== "" && typeof valeur !== "object") return String(valeur);
  return Socle.regionDeAcademie(colonneDuRole("academie") ? etablissement[colonneDuRole("academie")] : "");
}
function valeursEtablissementTest(etablissement) {
  const valeurs = {};
  for (const [k, valeur] of Object.entries(etablissement))
    if (valeur != null && typeof valeur !== "object") valeurs[k] = valeur;
  for (const k of Object.keys(ROLES_ETABLISSEMENT)) {
    const colonne = colonneDuRole(k);
    if (colonne && etablissement[colonne] != null && typeof etablissement[colonne] !== "object")
      valeurs[k] = etablissement[colonne];
  }
  valeurs.nom = nomEtablissement(etablissement);
  valeurs.region = regionTest(etablissement);
  return valeurs;
}
function ficheTestHtml() {
  if (!etatFormulaires.etablissementTest) return "";
  const etablissement = etatFormulaires.etablissementTest;
  return saisieEffective()
    .fiche.map((champFiche) => {
      const cle = String(champFiche.col || ""),
        libelle =
          champFiche.lib || (cle.startsWith("@") ? ROLES_FICHE[cle.slice(1)] : libelleColonneEtablissement(cle));
      let valeur =
        cle === "@region"
          ? regionTest(etablissement)
          : etablissement[cle.startsWith("@") ? colonneDuRole(cle.slice(1)) : cle];
      if (valeur == null || valeur === "" || typeof valeur === "object") return "";
      return `<dt>${esc(libelle)}</dt><dd>${esc(valeurLisible({ type: typeof valeur === "number" ? "Numeric" : "Text" }, valeur))}</dd>`;
    })
    .join("");
}

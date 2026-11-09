/* PRISME — administration, onglet « Formulaires » : formulaires/description.js
   Description automatique : réglages communs ou propres au formulaire, exemple, panneau « Description ».
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : DESCRIPTION_DEFAUT, CLES_DESCRIPTION, SEPARATEURS, lireReglagesCommuns, demarrerBrouillonCommuns,
     enregistrerReglagesCommuns, descriptionPropre, optionsDescription, joindreDescription, formatPourItem,
     champDecomptable, modeChampTableau, estQualifSous, texteTableauAdmin, elementsTableauAdmin,
     enteteDescriptionAdmin, estRienASignaler, descriptionTexte, questionsDescription, itemsDescriptionTest,
     majDescriptionTest, lignesExempleAdmin, exempleDescription, choixFormatQuestion, panneauDescription,
     groupeEnteteHtml, lierEntete.
   Utilise :
     fondations : $, copie, esc, estVideValeur, etatFormulaires, typeBase.
     formulaire-courant : blocDe, blocs, parties, sauver.
     apercu : dessinerApercu.
     mode-test : sousColonnes, texteAutoTest, valeurTest, valeursEtablissementTest, visibleDansLigne.
     saisie-etablissement : ENTETES, FAMILLES, PRESETS, appliquerModele, familleQuestion, identiteExemple,
       majSaisie, saisieEffective, sourceColonneEtablissement, valeurLisible, versionFormulaire.
   Modifie etatFormulaires : brouillonCommuns, reglagesCommuns. */
/* =========================================================
 Description automatique : réglages communs (clé resume_auto de Config, autrefois table Parametres) ou propres au formulaire
 ---------------------------------------------------------
 conf.description = { perso: true, actif, format, separateur, puce, entete, qualification, questions, mobilisation, formatsType } ;
 le format de chaque question reste dans ses réglages (reglages.format), celui des champs d'un tableau dans
 reglages.descTableau = { colonne: { ligne, decompte } }. Le widget de saisie applique ces réglages à la place
 des réglages communs quand perso est vrai. Les réglages communs se modifient dans le panneau Description (mode
 « Communs ») et s'enregistrent pour tous les formulaires, sans publication.
 ========================================================= */
const DESCRIPTION_DEFAUT = {
  actif: true,
  format: "libelle",
  separateur: "ligne",
  puce: "",
  entete: true,
  qualification: true,
  questions: true,
  mobilisation: true,
  formatsType: {},
  formatsQuestion: {},
  formatsTableau: {},
};
const CLES_DESCRIPTION = [
  "actif",
  "format",
  "separateur",
  "puce",
  "entete",
  "qualification",
  "questions",
  "mobilisation",
  "formatsType",
];
const SEPARATEURS = { ligne: "\n", pv: " ; ", virgule: ", ", barre: " / ", espace: " ", point: ". " };
async function lireReglagesCommuns() {
  if (etatFormulaires.socleConfig && etatFormulaires.socleConfig.valeurs.resume_auto) {
    etatFormulaires.reglagesCommuns = etatFormulaires.socleConfig.valeurs.resume_auto;
    return;
  }
  try {
    const donneesTable = await Donnees.lire("Parametres");
    const texteJson = donneesTable.Resume_auto && donneesTable.Resume_auto[0];
    etatFormulaires.reglagesCommuns = texteJson ? JSON.parse(texteJson) : {};
  } catch (_) {
    etatFormulaires.reglagesCommuns = etatFormulaires.socleConfig ? {} : null;
  }
}
/* Réglages communs modifiés dans le panneau Description, pas encore enregistrés (null : aucune modification).
   Ils s'appliquent à tous les formulaires sans réglages propres, dès l'enregistrement (clé resume_auto de Config). */
function demarrerBrouillonCommuns() {
  if (!etatFormulaires.brouillonCommuns) {
    const actuels = { ...DESCRIPTION_DEFAUT, ...(etatFormulaires.reglagesCommuns || {}) };
    etatFormulaires.brouillonCommuns = {};
    for (const k of [...CLES_DESCRIPTION, "formatsTableau"])
      etatFormulaires.brouillonCommuns[k] = copie(actuels[k] ?? DESCRIPTION_DEFAUT[k]);
  }
  return etatFormulaires.brouillonCommuns;
}
async function enregistrerReglagesCommuns() {
  if (!etatFormulaires.brouillonCommuns) return;
  const valeur = {
    ...(etatFormulaires.reglagesCommuns || {}),
    ...etatFormulaires.brouillonCommuns,
    description: false,
  };
  await window.Socle.ecrireConfig("resume_auto", valeur);
  if (etatFormulaires.socleConfig && etatFormulaires.socleConfig.valeurs)
    etatFormulaires.socleConfig.valeurs.resume_auto = valeur;
  etatFormulaires.reglagesCommuns = valeur;
  etatFormulaires.brouillonCommuns = null;
}
const descriptionPropre = () =>
  !!(
    etatFormulaires.courant &&
    etatFormulaires.courant.conf.description &&
    etatFormulaires.courant.conf.description.perso
  );
function optionsDescription() {
  const communs = {
    ...DESCRIPTION_DEFAUT,
    ...(etatFormulaires.reglagesCommuns || {}),
    ...(etatFormulaires.brouillonCommuns || {}),
  };
  if (!descriptionPropre()) return communs;
  const reglagesPropres = etatFormulaires.courant.conf.description,
    options = { ...communs, formatsQuestion: {}, formatsTableau: {} };
  for (const k of CLES_DESCRIPTION) if (k in reglagesPropres) options[k] = copie(reglagesPropres[k]);
  for (const bloc of blocs()) {
    const reglagesTableau = bloc.reglages && bloc.reglages.descTableau;
    if (bloc.colonne && reglagesTableau && Object.keys(reglagesTableau).length)
      options.formatsTableau[bloc.colonne] = reglagesTableau;
  }
  return options;
}
function joindreDescription(elements, options) {
  const elementsNonVides = elements.filter((element) => String(element).trim());
  if (options.separateur !== "point") return elementsNonVides.join(SEPARATEURS[options.separateur] ?? "\n");
  if (!elementsNonVides.length) return "";
  const texte = elementsNonVides.map((element) => String(element).trim().replace(/\.+$/, "")).join(". ");
  return /[.!?…]$/.test(texte) ? texte : texte + ".";
}
function formatPourItem(item, options) {
  const reglagesBloc = (item.b && item.b.reglages) || {};
  if (reglagesBloc.format && reglagesBloc.format !== "defaut") return reglagesBloc.format;
  const formatQuestion = item.c && (options.formatsQuestion || {})[item.c.colId];
  if (formatQuestion && formatQuestion !== "defaut") return formatQuestion;
  const formatType = item.c && !item.tableau && (options.formatsType || {})[familleQuestion(item.c)];
  if (formatType && formatType !== "defaut") return formatType;
  return options.format;
}
// Champs d'un tableau dans la description (mêmes règles que le widget de saisie)
const champDecomptable = (sousColonne) =>
  ["Choice", "ChoiceList", "Bool", "Ref", "RefList", "Numeric", "Int"].includes(typeBase(sousColonne.type));
function modeChampTableau(bloc, sousColonne, options) {
  const reglagesSousColonne = ((options.formatsTableau || {})[bloc.colonne] || {})[sousColonne.colId];
  const ligne =
    reglagesSousColonne && ["defaut", "libelle", "valeur", "exclure"].includes(reglagesSousColonne.ligne)
      ? reglagesSousColonne.ligne
      : "defaut";
  if (!reglagesSousColonne && estQualifSous(sousColonne)) return { ligne, decompte: true }; // qualification d'une ligne : décompte en tête par défaut
  return {
    ligne,
    decompte: !!(reglagesSousColonne && reglagesSousColonne.decompte && champDecomptable(sousColonne)),
  };
}
const estQualifSous = (sousColonne) =>
  !!sousColonne &&
  typeBase(sousColonne.type) === "Choice" &&
  (/qualif/i.test(sousColonne.colId) || /qualif/i.test(sousColonne.libelle || ""));
function texteTableauAdmin(bloc, lignesBrutes, options) {
  const tous = sousColonnes(bloc.reglages.tableau.table).filter((sousColonne) => !sousColonne.r.masque),
    sous = tous.filter((sousColonne) => !sousColonne.r.confidentiel);
  const estVisible = (ligne, sousColonne) => visibleDansLigne(sousColonne, tous, ligne);
  const lignes = lignesBrutes.filter((ligne) =>
    tous.some((sousColonne) => estVisible(ligne, sousColonne) && !estVideValeur(ligne[sousColonne.colId])),
  );
  if (!lignes.length) return "";
  const parts = [];
  for (const sousColonne of sous.filter((colonne) => modeChampTableau(bloc, colonne, options).decompte)) {
    const typeDeBase = typeBase(sousColonne.type);
    if (typeDeBase === "Numeric" || typeDeBase === "Int") {
      const nombres = lignes
        .filter((ligne) => estVisible(ligne, sousColonne) && typeof ligne[sousColonne.colId] === "number")
        .map((ligne) => ligne[sousColonne.colId]);
      if (nombres.length)
        parts.push(
          `${sousColonne.libelle} : ${nombres.reduce((cumul, nombre) => cumul + nombre, 0).toLocaleString("fr-FR")}`,
        );
      continue;
    }
    const compte = new Map();
    for (const ligne of lignes) {
      if (!estVisible(ligne, sousColonne) || estVideValeur(ligne[sousColonne.colId])) continue;
      const valeur = ligne[sousColonne.colId];
      for (const reponse of Array.isArray(valeur) ? valeur : [valeurLisible(sousColonne, valeur)])
        compte.set(reponse, (compte.get(reponse) || 0) + 1);
    }
    const ordre = sousColonne.opts.choices || [],
      rang = (reponse) => {
        const i = ordre.indexOf(reponse);
        return i < 0 ? 1e9 : i;
      };
    if (compte.size)
      parts.push(
        `${sousColonne.libelle} : ${[...compte]
          .sort((entreeA, entreeB) => rang(entreeA[0]) - rang(entreeB[0]))
          .map(([reponse, nombre]) => `${reponse} ${nombre}`)
          .join(", ")}`,
      );
  }
  const resume = sous.some(estQualifSous)
    ? `${lignes.length}${parts.length ? ` — ${parts.join(" ; ")}` : ""}`
    : `${lignes.length}${parts.length ? ` (${parts.join(" ; ")})` : ""}`;
  const fmtGen = (sousColonne) => {
    const format = (options.formatsType || {})[familleQuestion(sousColonne)];
    return format && format !== "defaut" ? format : options.format;
  };
  const valeurs = (ligne) =>
    sous
      .filter(
        (sousColonne) =>
          !sousColonne.r.auto &&
          modeChampTableau(bloc, sousColonne, options).ligne !== "exclure" &&
          estVisible(ligne, sousColonne),
      )
      .map((sousColonne) => {
        const modeLigne = modeChampTableau(bloc, sousColonne, options).ligne,
          avecLib = modeLigne === "libelle" || (modeLigne === "defaut" && fmtGen(sousColonne) !== "valeur"),
          texte = valeurLisible(sousColonne, ligne[sousColonne.colId]);
        if (!avecLib && typeBase(sousColonne.type) === "Bool")
          return ligne[sousColonne.colId] ? sousColonne.libelle : "";
        return texte ? (avecLib ? `${sousColonne.libelle} : ${texte}` : texte) : "";
      })
      .filter(Boolean);
  const autos = sous.filter(
    (sousColonne) => sousColonne.r.auto && modeChampTableau(bloc, sousColonne, options).ligne !== "exclure",
  );
  if (
    !autos.length &&
    !sous.some((sousColonne) => !sousColonne.r.auto && modeChampTableau(bloc, sousColonne, options).ligne !== "exclure")
  )
    return resume;
  const detail = lignes
    .map((ligne, k) => {
      const repris = autos
        .filter((sousColonne) => estVisible(ligne, sousColonne))
        .map((sousColonne) => String(ligne[sousColonne.colId] ?? "").trim() || texteAutoTest(tous, ligne))
        .filter(Boolean)
        .join(" — ");
      const valeursLigne = repris ? [repris] : valeurs(ligne);
      return valeursLigne.length ? `${k + 1}. ${valeursLigne.join(" — ")}` : "";
    })
    .filter(Boolean);
  return [resume, ...detail].join("\n");
}
function elementsTableauAdmin(item, premiereLigne, options) {
  const [formatItem = "", ...lignes] = String(item.valeur ?? "")
    .split(/\s*\n\s*/)
    .filter(Boolean);
  let enTete = "";
  if (premiereLigne === "exclure") enTete = formatItem.replace(/^\d+\s*(—\s*)?/, "").replace(/^\((.*)\)$/, "$1");
  else if (formatItem) enTete = premiereLigne === "valeur" ? formatItem : `${item.libelle} : ${formatItem}`;
  return [enTete, ...lignes].filter(Boolean).map((ligne) => `${options.puce || ""}${ligne}`);
}
// En-tête : version ESR (table avec Site) « **Nom** (site) », sinon « **Nom**, **Commune** »
function enteteDescriptionAdmin(identite) {
  return String(identite.nom || "").trim() ? appliquerModele(saisieEffective().entete, identite) : "";
}
const estRienASignaler = (qualification) => !!qualification && String(qualification).trim().toUpperCase() === "RAS";
function descriptionTexte(options, items, identite, jour, qualif) {
  if (!options.actif) return "";
  const corps = joindreDescription(
    items.flatMap((item) => {
      const formatItem = formatPourItem(item, options);
      if (item.tableau) return elementsTableauAdmin(item, formatItem, options);
      if (formatItem === "exclure") return [];
      const valeur = String(item.valeur ?? "")
        .replace(/\s*\n\s*/g, " ")
        .trim();
      return [`${options.puce || ""}${formatItem === "valeur" ? valeur : `${item.libelle} : ${valeur}`}`];
    }),
    options,
  );
  const entete = options.entete ? enteteDescriptionAdmin(identite) : "";
  let texte = entete && corps ? `${entete} : ${corps}` : entete || corps;
  if (options.mobilisation && !estRienASignaler(qualif))
    texte += `${options.separateur === "ligne" && texte ? "\n" : texte ? " " : ""}(${jour === 1 ? "1er" : jour + "e"} jour de mobilisation)`;
  return texte;
}
// Questions du formulaire de signalement qui peuvent entrer dans la description (hors visas)
function questionsDescription() {
  const roles = new Map(parties().map((partie) => [partie.id, partie.role]));
  return blocs()
    .filter(
      (bloc) =>
        bloc.genre === "question" && etatFormulaires.meta[bloc.colonne] && roles.get(bloc.section || "q") === "q",
    )
    .map((bloc) => ({ b: bloc, c: etatFormulaires.meta[bloc.colonne], r: bloc.reglages || {} }));
}
function itemsDescriptionTest(options) {
  const items = [],
    qualification = valeurTest("Qualification");
  if (options.qualification && etatFormulaires.meta.Qualification && qualification)
    items.push({
      libelle: etatFormulaires.meta.Qualification.libelle || "Qualification",
      valeur: qualification,
      c: etatFormulaires.meta.Qualification,
    });
  if (options.questions)
    for (const { b: bloc, c: colonne, r: reglages } of questionsDescription()) {
      const element = document.querySelector(`[data-bloc="${bloc.id}"]`);
      if (reglages.confidentiel || !element || element.classList.contains("masque-test")) continue;
      if (reglages.tableau && reglages.tableau.table) {
        const texte = texteTableauAdmin(bloc, etatFormulaires.testLignes[bloc.colonne] || [], options);
        if (texte)
          items.push({
            libelle: reglages.libelle || colonne.libelle,
            valeur: texte,
            b: bloc,
            c: colonne,
            tableau: true,
          });
        continue;
      }
      const valeur = valeurTest(bloc.colonne);
      if (valeur === undefined || estVideValeur(valeur)) continue;
      items.push({
        libelle: reglages.libelle || colonne.libelle,
        valeur: valeurLisible(colonne, valeur),
        b: bloc,
        c: colonne,
      });
    }
  return items;
}
function majDescriptionTest() {
  const zoneDescription = $("test-description"),
    etat = $("etat-desc-test");
  if (!zoneDescription) return;
  const options = optionsDescription();
  if (!options.actif) {
    etat.textContent = "Pré-remplissage désactivé : la description se saisit librement.";
    return;
  }
  if (!etatFormulaires.descriptionTestManuelle)
    zoneDescription.value = descriptionTexte(
      options,
      itemsDescriptionTest(options),
      etatFormulaires.etablissementTest
        ? { ...valeursEtablissementTest(etatFormulaires.etablissementTest), site: etatFormulaires.siteTest.trim() }
        : { nom: "", site: etatFormulaires.siteTest.trim() },
      1,
      valeurTest("Qualification"),
    );
  etat.innerHTML = etatFormulaires.descriptionTestManuelle
    ? `✎ Texte modifié à la main : il ne suit plus les réponses. <button type="button" class="ajout-lien" id="btn-desc-auto">Reprendre le texte automatique</button>`
    : "↻ Rédigé automatiquement : le texte suit les réponses du formulaire.";
}
// Exemple avec des réponses fictives (panneau et aperçu en édition)
function lignesExempleAdmin(bloc) {
  return [0, 1].map((k) => {
    const ligne = {};
    for (const sousColonne of sousColonnes(bloc.reglages.tableau.table)) {
      const typeDeBase = typeBase(sousColonne.type),
        choix = sousColonne.opts.choices || [];
      if (sousColonne.r.auto) continue;
      if (typeDeBase === "Choice") ligne[sousColonne.colId] = choix[k % Math.max(choix.length, 1)] || "Oui";
      else if (typeDeBase === "ChoiceList") ligne[sousColonne.colId] = choix.length ? [choix[k % choix.length]] : null;
      else if (typeDeBase === "Bool") ligne[sousColonne.colId] = k === 0;
      else if (typeDeBase === "Int" || typeDeBase === "Numeric") ligne[sousColonne.colId] = k + 1;
      else if (typeDeBase === "Date") ligne[sousColonne.colId] = Outils.dates.aujourdhui();
      else ligne[sousColonne.colId] = k === 0 ? "texte saisi" : "autre texte";
    }
    return ligne;
  });
}
function exempleDescription(options = optionsDescription()) {
  if (!etatFormulaires.courant) return "";
  if (!options.actif) return "(pré-remplissage désactivé : la description se saisit librement)";
  const colonneQualification = etatFormulaires.meta.Qualification,
    items = [];
  if (options.qualification && colonneQualification)
    items.push({
      libelle: colonneQualification.libelle || "Qualification",
      valeur: (colonneQualification.opts.choices || [])[0] || "Intrusion",
      c: colonneQualification,
    });
  if (options.questions)
    for (const { b: bloc, c: colonne, r: reglages } of questionsDescription()) {
      if (reglages.confidentiel) continue;
      if (reglages.tableau && reglages.tableau.table) {
        const texte = texteTableauAdmin(bloc, lignesExempleAdmin(bloc), options);
        if (texte)
          items.push({
            libelle: reglages.libelle || colonne.libelle,
            valeur: texte,
            b: bloc,
            c: colonne,
            tableau: true,
          });
        continue;
      }
      const valeur = colonne.formule
        ? sourceColonneEtablissement(colonne)
          ? familleQuestion(colonne) === "nombre"
            ? 12500
            : `${reglages.libelle || colonne.libelle} de la fiche`
          : 3
        : {
            nombre: 20,
            date: Outils.dates.aujourdhui(),
            case: true,
            choix: (colonne.opts.choices || [])[0] || "Oui",
            reference: "élément lié",
            texte: "texte saisi",
          }[familleQuestion(colonne)];
      items.push({
        libelle: reglages.libelle || colonne.libelle,
        valeur: valeurLisible(colonne, typeBase(colonne.type) === "ChoiceList" ? [valeur] : valeur),
        b: bloc,
        c: colonne,
      });
    }
  return (
    descriptionTexte(
      options,
      items,
      identiteExemple(),
      3,
      colonneQualification && (colonneQualification.opts.choices || [])[0],
    ) || "(aucun élément inclus)"
  );
}
// Choix du format d'une question dans la description (panneau de la question et panneau Description)
function choixFormatQuestion(bloc) {
  const reglages = (bloc && bloc.reglages) || {},
    defaut = descriptionPropre() ? "Par défaut (réglage du formulaire)" : "Par défaut (réglages communs)";
  return reglages.tableau
    ? [
        ["defaut", defaut],
        ["libelle", "En-tête : libellé et nombre"],
        ["valeur", "En-tête : nombre seul"],
        ["exclure", "Sans en-tête (lignes seules)"],
      ]
    : [
        ["defaut", defaut],
        ["libelle", "Libellé : valeur"],
        ["valeur", "Valeur seule"],
        ["exclure", "Ne pas inclure"],
      ];
}
function panneauDescription() {
  const panneau = $("panneau"),
    colonneDescription = etatFormulaires.meta.Description,
    perso = descriptionPropre(),
    options = optionsDescription(),
    reglagesPropres = etatFormulaires.courant.conf.description,
    // réglages communs : modifiables ici dès que le document a sa table Config
    communsModifiables = !!etatFormulaires.socleConfig;
  const selecteurHtml = (id, listeOptions, valeurChoisie, intitule) =>
    `<label class="l" for="${id}">${intitule}</label><select id="${id}">${listeOptions.map(([k, libelle]) => `<option value="${k}"${k === valeurChoisie ? " selected" : ""}>${libelle}</option>`).join("")}</select>`;
  const interrupteur = (cle, intitule) =>
    `<label class="interrupteur">${intitule} <input type="checkbox" data-desc="${cle}"${options[cle] ? " checked" : ""}></label>`;
  const questions = questionsDescription();
  const familles = [
    ...new Set(questions.filter((question) => !question.r.tableau).map((question) => familleQuestion(question.c))),
  ];
  const optFmt = (valeur) =>
    [
      ["defaut", "Par défaut"],
      ["libelle", "Libellé : valeur"],
      ["valeur", "Valeur seule"],
    ]
      .map(([k, libelle]) => `<option value="${k}"${k === (valeur || "defaut") ? " selected" : ""}>${libelle}</option>`)
      .join("");
  const ligneQ = ({ b: bloc, c: colonne, r: reglages }) => {
    if (reglages.confidentiel)
      return `<div class="reglage-q"><div><span>${esc(reglages.libelle || colonne.libelle)}</span><small class="note" style="margin:0">confidentielle : jamais incluse</small></div></div>`;
    let html = `<div class="reglage-q"><div><span>${esc(reglages.libelle || colonne.libelle)}${colonne.formule ? ' <small class="note">(fiche)</small>' : ""}</span><select data-format-q="${esc(bloc.id)}" aria-label="Format de ${esc(reglages.libelle || colonne.libelle)}">${choixFormatQuestion(
      bloc,
    )
      .map(
        ([valeurOption, libelleOption]) =>
          `<option value="${valeurOption}"${(reglages.format || "defaut") === valeurOption ? " selected" : ""}>${valeurOption === "defaut" ? "Par défaut" : libelleOption}</option>`,
      )
      .join("")}</select></div>`;
    if ((perso || communsModifiables) && reglages.tableau && reglages.tableau.table)
      html += sousColonnes(reglages.tableau.table)
        .filter((sousColonne) => !sousColonne.r.masque)
        .map((sousColonne) => {
          if (sousColonne.r.confidentiel)
            return `<div class="sous-reglage"><span>↳ ${esc(sousColonne.libelle)}</span><small>confidentiel : jamais inclus</small></div>`;
          const mode = modeChampTableau(bloc, sousColonne, options),
            listeOptions = sousColonne.r.auto
              ? [
                  ["defaut", "Reprendre ce texte"],
                  ["exclure", "Ne pas l'utiliser"],
                ]
              : [
                  ["defaut", "Par défaut"],
                  ["libelle", "Libellé : valeur"],
                  ["valeur", "Valeur seule"],
                  ["exclure", "Ne pas inclure"],
                ];
          return (
            `<div class="sous-reglage"><span>↳ ${esc(sousColonne.libelle)}</span><span style="display:flex;gap:6px;align-items:center">${champDecomptable(sousColonne) ? `<label><input type="checkbox" data-dt-dec="${esc(bloc.id)}" data-sc="${esc(sousColonne.colId)}"${mode.decompte ? " checked" : ""}> ${["Int", "Numeric"].includes(typeBase(sousColonne.type)) ? "somme" : "décompte"} en tête</label>` : ""}` +
            `<select data-dt-ligne="${esc(bloc.id)}" data-sc="${esc(sousColonne.colId)}" aria-label="${esc(sousColonne.libelle)} dans chaque ligne">${listeOptions.map(([k, libelleOption]) => `<option value="${k}"${k === mode.ligne ? " selected" : ""}>${libelleOption}</option>`).join("")}</select></span></div>`
          );
        })
        .join("");
    return html + `</div>`;
  };
  panneau.innerHTML = `<h2>${esc(colonneDescription ? colonneDescription.libelle : "Description")}</h2><p class="sous">Champ commun · colonne Description</p>
  <p class="note">Rédigée automatiquement à partir des réponses ; l'agent peut la compléter ou la modifier avant d'enregistrer.</p>
  <div class="groupe"><div class="t">Réglages de la description automatique</div>
    <div class="seg2" role="group" aria-label="Origine des réglages"><button type="button" data-perso="0" aria-pressed="${!perso}">Communs à tous les formulaires</button><button type="button" data-perso="1" aria-pressed="${perso}">Propres à ce formulaire</button></div>
    ${
      perso || communsModifiables
        ? `${
            perso
              ? ""
              : `<p class="note" style="margin:0 0 8px">Réglages communs à tous les formulaires qui n'ont pas leurs propres réglages (clé resume_auto de Config). Ils s'appliquent dès leur enregistrement, sans publication.</p>`
          }${interrupteur("actif", "Pré-remplir la description")}
      <div class="grille2"><div>${selecteurHtml(
        "pd-format",
        [
          ["libelle", "Libellé : valeur"],
          ["valeur", "Valeur seule"],
        ],
        options.format,
        "Contenu de chaque élément",
      )}</div>
      <div>${selecteurHtml(
        "pd-separateur",
        [
          ["ligne", "Retour à la ligne"],
          ["pv", "Point-virgule"],
          ["virgule", "Virgule"],
          ["barre", "Barre oblique"],
          ["espace", "Espace"],
          ["point", "Point"],
        ],
        options.separateur,
        "Séparateur",
      )}</div></div>
      <label class="l" for="pd-puce">Puce devant chaque élément</label><input type="text" id="pd-puce" maxlength="4" placeholder="Aucune" value="${esc(options.puce || "")}">
      ${interrupteur("entete", etatFormulaires.meta.Site ? "Commencer par le nom de l'établissement (et le site)" : "Commencer par le nom de l'établissement et sa commune")}
      ${interrupteur("qualification", "Inclure la qualification")}
      ${interrupteur("questions", "Inclure les questions du formulaire")}
      ${interrupteur("mobilisation", "Terminer par le jour de mobilisation")}`
        : `<p class="note" style="margin:0">Ce formulaire suit les réglages communs du document. Ils se modifient ici une fois la table Config créée (onglet Installation) ; en attendant, réglages par défaut.
       Choisissez « Propres à ce formulaire » pour les régler pour ce formulaire seulement : ils partent des réglages communs actuels et s'appliquent à la publication.</p>`
    }
    ${
      !perso && communsModifiables
        ? `<div class="actions" style="margin-top:8px"><button type="button" class="primaire petit" id="pd-communs-ok"${etatFormulaires.brouillonCommuns ? "" : " disabled"}>Enregistrer pour tous les formulaires</button>
      <span class="statut" id="pd-communs-statut" role="status">${etatFormulaires.brouillonCommuns ? "Modifications non enregistrées." : ""}</span></div>`
        : ""
    }
  </div>
  ${(perso || communsModifiables) && familles.length ? `<div class="groupe"><div class="t">Format par type de question</div>${familles.map((cleFamille) => `<div class="reglage-q"><div><span>${FAMILLES[cleFamille]}</span><select data-famille="${cleFamille}" aria-label="Format des ${FAMILLES[cleFamille].toLowerCase()}">${optFmt((options.formatsType || {})[cleFamille])}</select></div></div>`).join("")}</div>` : ""}
  <div class="groupe"><div class="t">Question par question</div>${questions.map(ligneQ).join("") || `<p class="note" style="margin:0">Aucune question dans le formulaire.</p>`}
    <p class="note" style="margin:6px 0 0">Prioritaire sur le format par type. Le format de chaque question est enregistré avec le formulaire ; celui des champs d'un tableau suit l'origine des réglages choisie plus haut.</p></div>
  ${groupeEnteteHtml()}
  <div class="groupe"><div class="t">Exemple</div><div class="exemple-desc" id="pd-exemple"></div>
    <p class="note" style="margin:6px 0 0">Avec des réponses fictives. En mode ▶ Tester, la description suit vos réponses.</p></div>`;
  // formulaireModifie : le changement porte sur le formulaire (enregistré en brouillon), pas sur les réglages communs
  const miseAJour = (formulaireModifie = perso) => {
    if (formulaireModifie) sauver();
    else if ($("pd-communs-ok")) {
      $("pd-communs-ok").disabled = false;
      statutCommuns("Modifications non enregistrées.");
    }
    $("pd-exemple").textContent = exempleDescription();
    const exemple = document.querySelector('[data-commun="commun:Description"] .exemple-desc');
    if (exemple) exemple.textContent = exempleDescription();
  };
  $("pd-exemple").textContent = exempleDescription();
  lierEntete(panneau, () => miseAJour(true));
  const statutCommuns = (texte, type) => {
    const zone = $("pd-communs-statut");
    if (!zone) return;
    zone.textContent = texte || "";
    zone.className = `statut ${type || ""}`;
  };
  if ($("pd-communs-ok"))
    $("pd-communs-ok").addEventListener("click", async () => {
      $("pd-communs-ok").disabled = true;
      try {
        await enregistrerReglagesCommuns();
        statutCommuns(
          "Réglages communs enregistrés : ils s'appliquent aux pages de saisie à leur prochaine lecture.",
          "ok",
        );
        dessinerApercu();
      } catch (erreur) {
        $("pd-communs-ok").disabled = false;
        statutCommuns(`Échec : ${erreur.message || erreur}`, "err");
      }
    });
  panneau.querySelectorAll("[data-perso]").forEach((bouton) =>
    bouton.addEventListener("click", () => {
      const oui = bouton.dataset.perso === "1";
      if (oui && !reglagesPropres) {
        const base = optionsDescription();
        etatFormulaires.courant.conf.description = { perso: true };
        for (const k of CLES_DESCRIPTION) etatFormulaires.courant.conf.description[k] = copie(base[k]);
      } else if (reglagesPropres) reglagesPropres.perso = oui;
      sauver();
      dessinerApercu();
      panneauDescription();
    }),
  );
  const reglagesActifs = () => (perso ? etatFormulaires.courant.conf.description : demarrerBrouillonCommuns());
  panneau.querySelectorAll("[data-desc]").forEach((caseACocher) =>
    caseACocher.addEventListener("change", () => {
      reglagesActifs()[caseACocher.dataset.desc] = caseACocher.checked;
      miseAJour();
    }),
  );
  [
    ["pd-format", "format"],
    ["pd-separateur", "separateur"],
  ].forEach(([id, k]) => {
    const champ = $(id);
    if (champ)
      champ.addEventListener("change", () => {
        reglagesActifs()[k] = champ.value;
        miseAJour();
      });
  });
  if ($("pd-puce"))
    $("pd-puce").addEventListener("input", (evenement) => {
      reglagesActifs().puce = evenement.target.value;
      miseAJour();
    });
  panneau.querySelectorAll("[data-famille]").forEach((menu) =>
    menu.addEventListener("change", () => {
      const formatsType = (reglagesActifs().formatsType = { ...(reglagesActifs().formatsType || {}) });
      if (menu.value === "defaut") delete formatsType[menu.dataset.famille];
      else formatsType[menu.dataset.famille] = menu.value;
      miseAJour();
    }),
  );
  panneau.querySelectorAll("[data-format-q]").forEach((menu) =>
    menu.addEventListener("change", () => {
      const bloc = blocDe(menu.dataset.formatQ);
      bloc.reglages.format = menu.value === "defaut" ? undefined : menu.value;
      miseAJour(true);
    }),
  );
  // champs d'un tableau : dans le formulaire (réglages propres) ou dans les réglages communs, par colonne de la question
  const majSous = (identifiantBloc, identifiantSousColonne) => {
    const bloc = blocDe(identifiantBloc),
      communs = perso ? null : demarrerBrouillonCommuns();
    if (communs) communs.formatsTableau = { ...(communs.formatsTableau || {}) };
    const reglagesTableau = perso
      ? (bloc.reglages.descTableau = bloc.reglages.descTableau || {})
      : (communs.formatsTableau[bloc.colonne] = { ...(communs.formatsTableau[bloc.colonne] || {}) });
    const ligne = panneau.querySelector(
        `[data-dt-ligne="${CSS.escape(identifiantBloc)}"][data-sc="${CSS.escape(identifiantSousColonne)}"]`,
      ).value,
      caseDecompte = panneau.querySelector(
        `[data-dt-dec="${CSS.escape(identifiantBloc)}"][data-sc="${CSS.escape(identifiantSousColonne)}"]`,
      );
    const reglage = { ligne, decompte: !!(caseDecompte && caseDecompte.checked) };
    // réglage par défaut : retiré ; sauf la qualification, dont le décompte est actif par défaut (le décocher doit être retenu)
    const qualif = estQualifSous(
      sousColonnes(bloc.reglages.tableau.table).find((sousColonne) => sousColonne.colId === identifiantSousColonne),
    );
    if (reglage.ligne === "defaut" && reglage.decompte === qualif) delete reglagesTableau[identifiantSousColonne];
    else reglagesTableau[identifiantSousColonne] = reglage;
    if (!Object.keys(reglagesTableau).length) {
      if (perso) delete bloc.reglages.descTableau;
      else delete communs.formatsTableau[bloc.colonne];
    }
    miseAJour();
  };
  panneau
    .querySelectorAll("[data-dt-ligne]")
    .forEach((menu) => menu.addEventListener("change", () => majSous(menu.dataset.dtLigne, menu.dataset.sc)));
  panneau
    .querySelectorAll("[data-dt-dec]")
    .forEach((caseACocher) =>
      caseACocher.addEventListener("change", () => majSous(caseACocher.dataset.dtDec, caseACocher.dataset.sc)),
    );
}

/* ---------- panneau « Description » : en-tête ---------- */
function groupeEnteteHtml() {
  const reglagesEffectifs = saisieEffective(),
    connu = ENTETES.some(([modele]) => modele === reglagesEffectifs.entete),
    exemple = identiteExemple();
  return `<div class="groupe"><div class="t">En-tête de la description</div>
  <label class="l" for="pd-entete">Format${descriptionPropre() || optionsDescription().entete ? "" : " (l'en-tête est désactivé dans les réglages)"}</label>
  <select id="pd-entete">${ENTETES.map(([modele, libelle]) => `<option value="${esc(modele)}"${reglagesEffectifs.entete === modele ? " selected" : ""}>${esc(libelle)} : ${esc(appliquerModele(modele, exemple).replace(/\*\*/g, ""))}</option>`).join("")}<option value="__perso__"${connu ? "" : " selected"}>Personnalisé…</option></select>
  <input type="text" id="pd-entete-perso" value="${esc(reglagesEffectifs.entete)}" spellcheck="false" aria-label="Modèle d'en-tête"${connu ? " hidden" : ""}>
  <p class="note" style="margin:0">Repères : {nom}, {commune}, {uai}, {type}, {academie}, {departement}, {region}, {site}, ou l'identifiant d'une colonne du référentiel, par exemple {Sigle}. ** met en gras ; un repère vide disparaît avec ses parenthèses ou sa virgule.</p></div>`;
}
function lierEntete(panneau, miseAJour) {
  const selecteur = $("pd-entete"),
    perso = $("pd-entete-perso");
  if (!selecteur) return;
  const ecrire = (valeur) => {
    majSaisie((saisie) => {
      if (valeur && valeur !== PRESETS[versionFormulaire()].entete) saisie.entete = valeur;
      else delete saisie.entete;
    });
    miseAJour();
  };
  selecteur.addEventListener("change", () => {
    if (selecteur.value === "__perso__") {
      perso.hidden = false;
      perso.focus();
      return;
    }
    perso.hidden = true;
    perso.value = selecteur.value;
    ecrire(selecteur.value);
  });
  perso.addEventListener("input", () => ecrire(perso.value));
}

/* PRISME — widget de saisie, composants/champs.js
   Composant : moteur de champs, affichage et lecture des réponses.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lireBorne, cheminsRef, estVide, valeurOuNull, optionsReference, rendreChamps, remplirChamps,
     boolRepondu, horsBornes, lireUnChamp, lireChamps.
   Utilise :
     fondations/outils : colonneDe, lisible, secondes, typeBase.
     fondations/etat : etatSaisie.
     fondations/grist : lireTableReference.
     composants/nombres : bornesDe.
     composants/conditions-formules : appliquerConditions, resoudreColonne.
     composants/pieces-jointes : piecesJointes.
     composants/tableaux-structure : Tableau, lireTableauJson, tableaux.
     domaines/formulaire/regles : carteOuiNon.
     domaines/formulaire/affichage : decorHtml, styleChoix.
     domaines/enregistrement/regles : formatValeur. */
// Bornes d'un nombre : [positif] (0 ou plus), [min 1], [max 500]
function lireBorne(descriptionColonne, mot) {
  const correspondance = descriptionColonne.match(
    new RegExp(`\\[\\s*${mot}(?:imum)?\\s*(-?\\d+(?:[.,]\\d+)?)\\s*\\]`, "i"),
  );
  return correspondance ? parseFloat(correspondance[1].replace(",", ".")) : null;
}
const cheminsRef = {};
function estVide(question, valeur) {
  if (valeur == null || valeur === "") return true;
  if (question && question.tableau && typeof valeur === "string" && !lireTableauJson(valeur).length) return true;
  if (Array.isArray(valeur) && (valeur[0] === "L" ? valeur.length <= 1 : valeur[0] === "C")) return true;
  if (typeBase(question.type) === "Ref" && valeur === 0) return true;
  return false;
}
const valeurOuNull = (question, valeur) => (estVide(question, valeur) ? null : valeur);
async function optionsReference(question) {
  const tableReference = await lireTableReference(question.type.split(":")[1]);
  // colonne affichée de la référence, sinon une colonne de nom (Nom, Libelle…), sinon la première colonne de texte
  const colonneLibelle =
    question.colAffichee && tableReference[question.colAffichee]
      ? question.colAffichee
      : Object.keys(tableReference).find(
          (k) =>
            /^(nom|libelle|intitule|denomination)(_|$)/i.test(k) &&
            (tableReference[k] || []).some((valeur) => typeof valeur === "string"),
        ) ||
        Object.keys(tableReference).find(
          (k) =>
            k !== "id" &&
            k !== "manualSort" &&
            !k.startsWith("gristHelper") &&
            (tableReference[k] || []).some((valeur) => typeof valeur === "string"),
        ) ||
        null;
  const choixReference = tableReference.id
    .map((id, i) => ({
      id,
      libelle: String(colonneLibelle ? (tableReference[colonneLibelle][i] ?? "") : `Ligne ${id}`),
    }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
  question._labels = new Map(choixReference.map((choix) => [choix.id, choix.libelle]));
  return choixReference;
}
function rendreChamps(zone, prefix, questions, surChangement) {
  zone.innerHTML = "";
  queueMicrotask(() => {
    if (prefix === "q")
      for (const decor of etatSaisie.decorsQ.fin) zone.insertAdjacentHTML("beforeend", decorHtml(decor));
  });
  for (const question of questions) {
    const typeColonne = typeBase(question.type),
      id = `${prefix}-${question.colId}`;
    const choixPossibles = question.opts.choices || [];
    const enGroupe =
      (typeColonne === "Bool" && !question.caseACocher && !question.formule) ||
      (question.forcer === "liste"
        ? false
        : typeColonne === "ChoiceList" ||
          (typeColonne === "Choice" &&
            choixPossibles.length &&
            (question.forcer === "boutons" || choixPossibles.length <= 5)));
    const bloc = document.createElement(enGroupe ? "fieldset" : "div");
    bloc.className = "champ";
    bloc.dataset.champ = id;
    const titre = `${esc(question.libelle)}${question.obligatoire ? ' <span class="req">*</span>' : ""}`;
    const txtAide = question.aide ? `<span class="aide">${esc(question.aide)}</span>` : "";
    const entete = enGroupe ? `<legend>${titre}${txtAide}</legend>` : `<label for="${id}">${titre}${txtAide}</label>`;
    let html;
    if (question.formule)
      html = `<label>${esc(question.libelle)}${txtAide}</label><div class="lecture" id="${id}">—</div>`;
    else if (typeColonne === "Bool" && enGroupe)
      html = `${entete}<div class="choix-groupe choix-oui-non">${[
        ["true", "Oui"],
        ["false", "Non"],
      ]
        .map(
          ([valeur, libelle]) =>
            `<label class="choix" data-valeur="${libelle}"><input type="radio" name="${id}" value="${valeur}"><span>${libelle}</span></label>`,
        )
        .join("")}</div>`;
    else if (typeColonne === "Bool")
      html = `<label class="case"><input type="checkbox" id="${id}"> ${esc(question.libelle)}</label>${txtAide}`;
    else if (typeColonne === "Numeric" || typeColonne === "Int")
      html =
        `${entete}<input type="number" id="${id}" step="${typeColonne === "Int" ? 1 : "any"}"` +
        `>` +
        `<span class="erreur-champ" id="${id}-erreur" aria-live="polite" hidden></span>`;
    else if (typeColonne === "Date") html = `${entete}<input type="date" id="${id}">`;
    else if (typeColonne === "DateTime") html = `${entete}<input type="datetime-local" id="${id}">`;
    else if (typeColonne === "Choice" && enGroupe)
      html = `${entete}<div class="choix-groupe">${choixPossibles
        .map(
          (choix) =>
            `<label class="choix" data-valeur="${esc(choix)}"><input type="radio" name="${id}" value="${esc(choix)}"><span>${esc(choix)}</span></label>`,
        )
        .join("")}</div>`;
    else if (typeColonne === "Choice" && choixPossibles.length)
      html = `${entete}<select id="${id}"><option value="">Choisir…</option>${choixPossibles
        .map((choix) => `<option value="${esc(choix)}">${esc(choix)}</option>`)
        .join("")}</select>`;
    else if (typeColonne === "ChoiceList")
      html = `${entete}<div class="coches">${choixPossibles
        .map((choix) => `<label><input type="checkbox" name="${id}" value="${esc(choix)}"> ${esc(choix)}</label>`)
        .join("")}</div>`;
    else if (typeColonne === "Ref" || typeColonne === "RefList") {
      html = `${entete}<select id="${id}" ${typeColonne === "RefList" ? "multiple" : ""}><option value="">Chargement…</option></select>`;
      cheminsRef[id] = optionsReference(question)
        .then((references) => {
          const liste = document.getElementById(id);
          if (!liste) return;
          liste.innerHTML =
            (typeColonne === "Ref" ? '<option value="">Choisir…</option>' : "") +
            references
              .map((reference) => `<option value="${reference.id}">${esc(reference.libelle)}</option>`)
              .join("");
        })
        .catch((erreur) => console.warn(`Références de ${question.colId} illisibles`, erreur));
    } else if (question.tableau) html = `<label>${titre}${txtAide}</label><div class="tableau-rep" id="${id}"></div>`;
    else if (typeColonne === "Attachments")
      html = `<label for="${id}-fichiers">${titre}${txtAide}</label>${piecesJointes.html(id)}`;
    else if (question.court) html = `${entete}<input type="text" id="${id}">`;
    else
      html = `${entete}<textarea id="${id}" style="min-height:${question.colId === colonneDe("Description") ? 100 : 70}px"></textarea>`;
    bloc.innerHTML = html;
    if (question.condition) {
      // Question conditionnelle : décalée, bordée, avec le rappel de la condition qui l'affiche
      bloc.classList.add("conditionnelle");
      bloc.hidden = true; // pas d'affichage trompeur avant l'évaluation de la condition
      const cible = resoudreColonne(question.condition.ref, questions);
      const nomCible = cible ? cible.def.libelle || cible.def.colId : question.condition.ref;
      const operateur = question.condition.op;
      const texte =
        operateur === "rempli"
          ? `« ${nomCible} » est renseigné`
          : operateur === "vide"
            ? `« ${nomCible} » est vide`
            : `« ${nomCible} » ${{ "=": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤" }[operateur]} ${question.condition.valeurs.join(" ou ")}`;
      const note = document.createElement("span");
      note.className = "condition-note";
      note.textContent = `Question affichée car ${texte}`;
      bloc.insertBefore(note, bloc.firstChild);
    }
    const champNombre =
      (typeColonne === "Numeric" || typeColonne === "Int") && !question.formule
        ? bloc.querySelector('input[type="number"]')
        : null;
    if (champNombre) {
      champNombre.addEventListener("keydown", (evenement) => {
        const { min } = bornesDe(question);
        if (min != null && min >= 0 && (evenement.key === "-" || evenement.key === "Subtract"))
          evenement.preventDefault();
      });
      const verifier = () => {
        const contrainte = horsBornes(question, champNombre.value === "" ? null : parseFloat(champNombre.value));
        const zoneErreur = document.getElementById(`${id}-erreur`);
        zoneErreur.textContent = contrainte ? `La valeur doit être ${contrainte}.` : "";
        zoneErreur.hidden = !contrainte;
        if (contrainte) {
          champNombre.setAttribute("aria-invalid", "true");
          champNombre.setAttribute("aria-describedby", `${id}-erreur`);
        } else {
          champNombre.removeAttribute("aria-invalid");
          champNombre.removeAttribute("aria-describedby");
        }
      };
      // après le nettoyage général des erreurs du formulaire (écouteur placé sur le formulaire)
      champNombre.addEventListener("input", () => setTimeout(verifier));
      champNombre.addEventListener("change", () => setTimeout(verifier));
    }
    if (question.tableau) {
      bloc.classList.add("champ-tableau");
      const cont = bloc.querySelector(".tableau-rep");
      if (cont) tableaux[id] = new Tableau(question, prefix, cont, surChangement);
    }
    bloc
      .querySelectorAll(".choix[data-valeur]")
      .forEach((etiquette) =>
        styleChoix(
          etiquette,
          etiquette.dataset.valeur,
          typeColonne === "Bool" ? carteOuiNon(question) : question.opts.choiceOptions || {},
        ),
      );
    if (prefix === "q")
      for (const decor of etatSaisie.decorsQ.avant[question.colId] || [])
        zone.insertAdjacentHTML("beforeend", decorHtml(decor));
    zone.appendChild(bloc);
    if (typeColonne === "Attachments" && !question.formule) piecesJointes.lier(bloc, id, surChangement);
    bloc.querySelectorAll("input, select, textarea").forEach((champ) => {
      const majConditions = () => appliquerConditions(prefix, questions);
      champ.addEventListener("input", surChangement);
      champ.addEventListener("change", surChangement);
      champ.addEventListener("input", majConditions);
      champ.addEventListener("change", majConditions);
    });
  }
}
async function remplirChamps(prefix, questions, valeurDe) {
  for (const question of questions) {
    const id = `${prefix}-${question.colId}`;
    if (!document.querySelector(`[data-champ="${id}"]`)) continue;
    const typeColonne = typeBase(question.type),
      champ = document.getElementById(id);
    let valeur = valeurDe(question);
    if (!lisible(valeur)) valeur = null;
    if (question.tableau) {
      if (tableaux[id]) await tableaux[id].charger(valeur, etatSaisie.dossierId);
      continue;
    }
    if (question.formule) {
      champ.textContent = formatValeur(question, valeur);
      continue;
    }
    if (typeColonne === "Attachments") {
      piecesJointes.remplir(id, valeur, question.pjEnvoi ? valeurDe({ ...question, colId: question.pjEnvoi }) : null);
      continue;
    }
    if (typeColonne === "Bool") {
      if (champ) champ.checked = !!valeur;
      else
        document
          .querySelectorAll(`input[name="${id}"]`)
          .forEach((bouton) => (bouton.checked = valeur != null && bouton.value === String(!!valeur)));
    } else if (typeColonne === "Numeric" || typeColonne === "Int") champ.value = valeur ?? "";
    else if (typeColonne === "Date") {
      const secondesValeur = secondes(valeur);
      champ.value = secondesValeur != null ? new Date(secondesValeur * 1000).toISOString().slice(0, 10) : "";
    } else if (typeColonne === "DateTime") {
      const secondesValeur = secondes(valeur);
      champ.value = secondesValeur != null ? Outils.dates.valeurChamp(secondesValeur, true) : ""; // heure de Paris
    } else if (typeColonne === "Choice") {
      if (champ) champ.value = valeur ?? "";
      else
        document
          .querySelectorAll(`input[name="${id}"]`)
          .forEach((bouton) => (bouton.checked = bouton.value === valeur));
    } else if (typeColonne === "ChoiceList") {
      const valeursCochees = Array.isArray(valeur) ? valeur.slice(1) : [];
      document
        .querySelectorAll(`input[name="${id}"]`)
        .forEach((caseChoix) => (caseChoix.checked = valeursCochees.includes(caseChoix.value)));
    } else if (typeColonne === "Ref" || typeColonne === "RefList") {
      await cheminsRef[id];
      const ids = typeColonne === "Ref" ? [valeur || 0] : Array.isArray(valeur) ? valeur.slice(1) : [];
      [...champ.options].forEach((optionListe) => (optionListe.selected = ids.includes(+optionListe.value)));
      if (typeColonne === "Ref" && !valeur) champ.value = "";
    } else champ.value = valeur ?? "";
  }
}
// Oui / Non en boutons : une réponse a-t-elle été choisie ? (la case à cocher, elle, vaut toujours oui ou non)
function boolRepondu(prefix, question) {
  const id = `${prefix}-${question.colId}`;
  return !!document.getElementById(id) || !!document.querySelector(`input[name="${id}"]:checked`);
}
// Valeur hors des bornes [positif] / [min] / [max] : texte de la contrainte, sinon ""
function horsBornes(question, valeur) {
  if (valeur == null || isNaN(valeur)) return "";
  question = { ...question, ...bornesDe(question) };
  const formaterNombre = (nombre) => nombre.toLocaleString("fr-FR");
  if (question.min != null && question.max != null && (valeur < question.min || valeur > question.max))
    return `comprise entre ${formaterNombre(question.min)} et ${formaterNombre(question.max)}`;
  if (question.min != null && valeur < question.min)
    return question.min === 0 ? "positive ou nulle" : `supérieure ou égale à ${formaterNombre(question.min)}`;
  if (question.max != null && valeur > question.max) return `inférieure ou égale à ${formaterNombre(question.max)}`;
  return "";
}
// Lecture d'un champ unique, quel que soit son type
function lireUnChamp(prefix, question) {
  const id = `${prefix}-${question.colId}`;
  if (question.tableau) return tableaux[id] ? tableaux[id].valeur() : "";
  const champ = document.getElementById(id);
  const typeColonne = typeBase(question.type);
  if (typeColonne === "Bool") {
    if (champ) return champ.checked;
    const boutonCoche = document.querySelector(`input[name="${id}"]:checked`);
    return boutonCoche ? boutonCoche.value === "true" : false;
  }
  if (typeColonne === "Numeric" || typeColonne === "Int")
    return !champ || champ.value === ""
      ? null
      : typeColonne === "Int"
        ? parseInt(champ.value, 10)
        : parseFloat(champ.value);
  if (typeColonne === "Date") return champ && champ.value ? Date.parse(champ.value + "T00:00:00Z") / 1000 : null;
  if (typeColonne === "DateTime") return champ && champ.value ? Outils.dates.depuisChamp(champ.value) / 1000 : null;
  if (typeColonne === "Choice")
    return champ ? champ.value : (document.querySelector(`input[name="${id}"]:checked`) || {}).value || "";
  if (typeColonne === "ChoiceList") {
    const valeursCochees = [...document.querySelectorAll(`input[name="${id}"]:checked`)].map(
      (caseChoix) => caseChoix.value,
    );
    return valeursCochees.length ? ["L", ...valeursCochees] : null;
  }
  if (typeColonne === "Ref") return champ && champ.value ? +champ.value : 0;
  if (typeColonne === "RefList") {
    const idsChoisis = champ ? [...champ.selectedOptions].map((optionListe) => +optionListe.value).filter(Boolean) : [];
    return idsChoisis.length ? ["L", ...idsChoisis] : null;
  }
  if (typeColonne === "Attachments") return piecesJointes.valeur(id);
  return champ ? champ.value.trim() : "";
}
function lireChamps(prefix, questions, manquants) {
  const fields = {};
  for (const question of questions) {
    if (question.formule) continue;
    const bloc = document.querySelector(`[data-champ="${prefix}-${question.colId}"]`);
    if (!bloc || bloc.hidden) continue; // question masquée par une condition : pas de réponse enregistrée
    const valeur = lireUnChamp(prefix, question);
    if (
      question.obligatoire &&
      (typeBase(question.type) === "Bool" ? !boolRepondu(prefix, question) : estVide(question, valeur))
    )
      manquants.push(`« ${question.libelle} »`);
    else if (typeof valeur === "number" && horsBornes(question, valeur))
      manquants.push(`« ${question.libelle} » avec une valeur ${horsBornes(question, valeur)}`);
    if (typeBase(question.type) === "Attachments" && piecesJointes.enCours(`${prefix}-${question.colId}`))
      manquants.push(`« ${question.libelle} » (envoi des fichiers en cours : patientez un instant)`);
    if (question.tableau && tableaux[`${prefix}-${question.colId}`]) {
      const problemes = tableaux[`${prefix}-${question.colId}`].verifier();
      if (problemes.length) manquants.push(`« ${question.libelle} » (${problemes.join(" ; ")})`);
    }
    if (question.pjEnvoi) {
      fields[question.pjEnvoi] = piecesJointes.envoi(`${prefix}-${question.colId}`);
      continue;
    } // colonne Pièces jointes calculée
    fields[question.colId] = valeur;
  }
  return fields;
}

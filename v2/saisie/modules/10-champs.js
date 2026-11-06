/* PRISME — widget de saisie, module 10/34 : Moteur de champs : affichage et lecture des réponses.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Moteur de champs (questions, visas)
   ========================================================= */
const typeBase = (t) => (t || "Any").split(":")[0];
const cheminsRef = {};

function estVide(def, v) {
  if (v == null || v === "") return true;
  if (def && def.tableau && typeof v === "string" && !lireTableauJson(v).length) return true;
  if (Array.isArray(v) && (v[0] === "L" ? v.length <= 1 : v[0] === "C")) return true;
  if (typeBase(def.type) === "Ref" && v === 0) return true;
  return false;
}
const egal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const norm = (def, v) => (estVide(def, v) ? null : v);

async function optionsReference(def) {
  const t = await lireTableReference(def.type.split(":")[1]);
  // colonne affichée de la référence, sinon une colonne de nom (Nom, Libelle…), sinon la première colonne de texte
  const c =
    def.colAffichee && t[def.colAffichee]
      ? def.colAffichee
      : Object.keys(t).find(
          (k) =>
            /^(nom|libelle|intitule|denomination)(_|$)/i.test(k) && (t[k] || []).some((x) => typeof x === "string"),
        ) ||
        Object.keys(t).find(
          (k) =>
            k !== "id" &&
            k !== "manualSort" &&
            !k.startsWith("gristHelper") &&
            (t[k] || []).some((x) => typeof x === "string"),
        ) ||
        null;
  const opts = t.id
    .map((id, i) => ({ id, libelle: String(c ? (t[c][i] ?? "") : `Ligne ${id}`) }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
  def._labels = new Map(opts.map((o) => [o.id, o.libelle]));
  return opts;
}

function rendreChamps(zone, prefix, defs, surChangement) {
  zone.innerHTML = "";
  queueMicrotask(() => {
    if (prefix === "q") for (const dc of etatSaisie.decorsQ.fin) zone.insertAdjacentHTML("beforeend", decorHtml(dc));
  });
  for (const def of defs) {
    const t = typeBase(def.type),
      id = `${prefix}-${def.colId}`;
    const ch = def.opts.choices || [];
    const enGroupe =
      (t === "Bool" && !def.caseACocher && !def.formule) ||
      (def.forcer === "liste"
        ? false
        : t === "ChoiceList" || (t === "Choice" && ch.length && (def.forcer === "boutons" || ch.length <= 5)));
    const bloc = document.createElement(enGroupe ? "fieldset" : "div");
    bloc.className = "champ";
    bloc.dataset.champ = id;
    const titre = `${esc(def.libelle)}${def.obligatoire ? ' <span class="req">*</span>' : ""}`;
    const txtAide = def.aide ? `<span class="aide">${esc(def.aide)}</span>` : "";
    const entete = enGroupe ? `<legend>${titre}${txtAide}</legend>` : `<label for="${id}">${titre}${txtAide}</label>`;
    let html;
    if (def.formule) html = `<label>${esc(def.libelle)}${txtAide}</label><div class="lecture" id="${id}">—</div>`;
    else if (t === "Bool" && enGroupe)
      html = `${entete}<div class="choix-groupe choix-oui-non">${[
        ["true", "Oui"],
        ["false", "Non"],
      ]
        .map(
          ([v, lib]) =>
            `<label class="choix" data-valeur="${lib}"><input type="radio" name="${id}" value="${v}"><span>${lib}</span></label>`,
        )
        .join("")}</div>`;
    else if (t === "Bool")
      html = `<label class="case"><input type="checkbox" id="${id}"> ${esc(def.libelle)}</label>${txtAide}`;
    else if (t === "Numeric" || t === "Int")
      html =
        `${entete}<input type="number" id="${id}" step="${t === "Int" ? 1 : "any"}"` +
        `>` +
        `<span class="erreur-champ" id="${id}-erreur" aria-live="polite" hidden></span>`;
    else if (t === "Date") html = `${entete}<input type="date" id="${id}">`;
    else if (t === "DateTime") html = `${entete}<input type="datetime-local" id="${id}">`;
    else if (t === "Choice" && enGroupe)
      html = `${entete}<div class="choix-groupe">${ch
        .map(
          (v) =>
            `<label class="choix" data-valeur="${esc(v)}"><input type="radio" name="${id}" value="${esc(v)}"><span>${esc(v)}</span></label>`,
        )
        .join("")}</div>`;
    else if (t === "Choice" && ch.length)
      html = `${entete}<select id="${id}"><option value="">Choisir…</option>${ch
        .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
        .join("")}</select>`;
    else if (t === "ChoiceList")
      html = `${entete}<div class="coches">${ch
        .map((v) => `<label><input type="checkbox" name="${id}" value="${esc(v)}"> ${esc(v)}</label>`)
        .join("")}</div>`;
    else if (t === "Ref" || t === "RefList") {
      html = `${entete}<select id="${id}" ${t === "RefList" ? "multiple" : ""}><option value="">Chargement…</option></select>`;
      cheminsRef[id] = optionsReference(def)
        .then((opts) => {
          const sel = document.getElementById(id);
          if (!sel) return;
          sel.innerHTML =
            (t === "Ref" ? '<option value="">Choisir…</option>' : "") +
            opts.map((o) => `<option value="${o.id}">${esc(o.libelle)}</option>`).join("");
        })
        .catch((e) => console.warn(`Références de ${def.colId} illisibles`, e));
    } else if (def.tableau) html = `<label>${titre}${txtAide}</label><div class="tableau-rep" id="${id}"></div>`;
    else if (t === "Attachments") html = `<label for="${id}-fichiers">${titre}${txtAide}</label>${PJ.html(id)}`;
    else if (def.court) html = `${entete}<input type="text" id="${id}">`;
    else
      html = `${entete}<textarea id="${id}" style="min-height:${def.colId === col("Description") ? 100 : 70}px"></textarea>`;
    bloc.innerHTML = html;
    if (def.condition) {
      // Question conditionnelle : décalée, bordée, avec le rappel de la condition qui l'affiche
      bloc.classList.add("conditionnelle");
      bloc.hidden = true; // pas d'affichage trompeur avant l'évaluation de la condition
      const cible = resoudreColonne(def.condition.ref, defs);
      const nomCible = cible ? cible.def.libelle || cible.def.colId : def.condition.ref;
      const op = def.condition.op;
      const texte =
        op === "rempli"
          ? `« ${nomCible} » est renseigné`
          : op === "vide"
            ? `« ${nomCible} » est vide`
            : `« ${nomCible} » ${{ "=": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤" }[op]} ${def.condition.valeurs.join(" ou ")}`;
      const note = document.createElement("span");
      note.className = "condition-note";
      note.textContent = `Question affichée car ${texte}`;
      bloc.insertBefore(note, bloc.firstChild);
    }
    const nb = (t === "Numeric" || t === "Int") && !def.formule ? bloc.querySelector('input[type="number"]') : null;
    if (nb) {
      nb.addEventListener("keydown", (ev) => {
        const { min } = bornesDe(def);
        if (min != null && min >= 0 && (ev.key === "-" || ev.key === "Subtract")) ev.preventDefault();
      });
      const verifier = () => {
        const msg = horsBornes(def, nb.value === "" ? null : parseFloat(nb.value));
        const err = document.getElementById(`${id}-erreur`);
        err.textContent = msg ? `La valeur doit être ${msg}.` : "";
        err.hidden = !msg;
        if (msg) {
          nb.setAttribute("aria-invalid", "true");
          nb.setAttribute("aria-describedby", `${id}-erreur`);
        } else {
          nb.removeAttribute("aria-invalid");
          nb.removeAttribute("aria-describedby");
        }
      };
      // après le nettoyage général des erreurs du formulaire (écouteur placé sur le formulaire)
      nb.addEventListener("input", () => setTimeout(verifier));
      nb.addEventListener("change", () => setTimeout(verifier));
    }
    if (def.tableau) {
      bloc.classList.add("champ-tableau");
      const cont = bloc.querySelector(".tableau-rep");
      if (cont) tableaux[id] = new Tableau(def, prefix, cont, surChangement);
    }
    bloc
      .querySelectorAll(".choix[data-valeur]")
      .forEach((l) => styleChoix(l, l.dataset.valeur, t === "Bool" ? carteOuiNon(def) : def.opts.choiceOptions || {}));
    if (prefix === "q")
      for (const dc of etatSaisie.decorsQ.avant[def.colId] || []) zone.insertAdjacentHTML("beforeend", decorHtml(dc));
    zone.appendChild(bloc);
    if (t === "Attachments" && !def.formule) PJ.lier(bloc, id, surChangement);
    bloc.querySelectorAll("input, select, textarea").forEach((el) => {
      const majConditions = () => appliquerConditions(prefix, defs);
      el.addEventListener("input", surChangement);
      el.addEventListener("change", surChangement);
      el.addEventListener("input", majConditions);
      el.addEventListener("change", majConditions);
    });
  }
}

async function remplirChamps(prefix, defs, valeurDe) {
  for (const def of defs) {
    const id = `${prefix}-${def.colId}`;
    if (!document.querySelector(`[data-champ="${id}"]`)) continue;
    const t = typeBase(def.type),
      el = document.getElementById(id);
    let v = valeurDe(def);
    if (!lisible(v)) v = null;
    if (def.tableau) {
      if (tableaux[id]) await tableaux[id].charger(v, etatSaisie.dossierId);
      continue;
    }
    if (def.formule) {
      el.textContent = formatValeur(def, v);
      continue;
    }
    if (t === "Attachments") {
      PJ.remplir(id, v, def.pjEnvoi ? valeurDe({ ...def, colId: def.pjEnvoi }) : null);
      continue;
    }
    if (t === "Bool") {
      if (el) el.checked = !!v;
      else
        document
          .querySelectorAll(`input[name="${id}"]`)
          .forEach((r) => (r.checked = v != null && r.value === String(!!v)));
    } else if (t === "Numeric" || t === "Int") el.value = v ?? "";
    else if (t === "Date") {
      const s = secondes(v);
      el.value = s != null ? new Date(s * 1000).toISOString().slice(0, 10) : "";
    } else if (t === "DateTime") {
      const s = secondes(v);
      el.value = s != null ? Outils.dates.valeurChamp(s, true) : ""; // heure de Paris
    } else if (t === "Choice") {
      if (el) el.value = v ?? "";
      else document.querySelectorAll(`input[name="${id}"]`).forEach((r) => (r.checked = r.value === v));
    } else if (t === "ChoiceList") {
      const l = Array.isArray(v) ? v.slice(1) : [];
      document.querySelectorAll(`input[name="${id}"]`).forEach((c) => (c.checked = l.includes(c.value)));
    } else if (t === "Ref" || t === "RefList") {
      await cheminsRef[id];
      const ids = t === "Ref" ? [v || 0] : Array.isArray(v) ? v.slice(1) : [];
      [...el.options].forEach((o) => (o.selected = ids.includes(+o.value)));
      if (t === "Ref" && !v) el.value = "";
    } else el.value = v ?? "";
  }
}

// Oui / Non en boutons : une réponse a-t-elle été choisie ? (la case à cocher, elle, vaut toujours oui ou non)
function boolRepondu(prefix, def) {
  const id = `${prefix}-${def.colId}`;
  return !!document.getElementById(id) || !!document.querySelector(`input[name="${id}"]:checked`);
}
// Couleurs des boutons Oui / Non : celles du repère [couleur Oui=…, Non=…] s'il y en a un
function carteOuiNon(def) {
  const r = lireRegleCouleur(def.description),
    carte = {};
  if (r)
    for (const lib of ["Oui", "Non"]) {
      const x = r.regles.find((g) => (g.type === "egal" && g.valeur === normaliser(lib)) || g.type === "rempli");
      const c = x && x.couleur,
        rvb = hexVersRvb(c);
      if (rvb)
        carte[lib] = {
          fillColor: c,
          textColor: 0.299 * rvb[0] + 0.587 * rvb[1] + 0.114 * rvb[2] > 150 ? "#161616" : "#FFFFFF",
        };
    }
  return carte;
}
// Valeur hors des bornes [positif] / [min] / [max] : texte de la contrainte, sinon ""
function horsBornes(def, v) {
  if (v == null || isNaN(v)) return "";
  def = { ...def, ...bornesDe(def) };
  const f = (n) => n.toLocaleString("fr-FR");
  if (def.min != null && def.max != null && (v < def.min || v > def.max))
    return `comprise entre ${f(def.min)} et ${f(def.max)}`;
  if (def.min != null && v < def.min)
    return def.min === 0 ? "positive ou nulle" : `supérieure ou égale à ${f(def.min)}`;
  if (def.max != null && v > def.max) return `inférieure ou égale à ${f(def.max)}`;
  return "";
}
// Lecture d'un champ unique, quel que soit son type
function lireUnChamp(prefix, def) {
  const id = `${prefix}-${def.colId}`;
  if (def.tableau) return tableaux[id] ? tableaux[id].valeur() : "";
  const el = document.getElementById(id);
  const t = typeBase(def.type);
  if (t === "Bool") {
    if (el) return el.checked;
    const r = document.querySelector(`input[name="${id}"]:checked`);
    return r ? r.value === "true" : false;
  }
  if (t === "Numeric" || t === "Int")
    return !el || el.value === "" ? null : t === "Int" ? parseInt(el.value, 10) : parseFloat(el.value);
  if (t === "Date") return el && el.value ? Date.parse(el.value + "T00:00:00Z") / 1000 : null;
  if (t === "DateTime") return el && el.value ? Outils.dates.depuisChamp(el.value) / 1000 : null;
  if (t === "Choice") return el ? el.value : (document.querySelector(`input[name="${id}"]:checked`) || {}).value || "";
  if (t === "ChoiceList") {
    const l = [...document.querySelectorAll(`input[name="${id}"]:checked`)].map((c) => c.value);
    return l.length ? ["L", ...l] : null;
  }
  if (t === "Ref") return el && el.value ? +el.value : 0;
  if (t === "RefList") {
    const l = el ? [...el.selectedOptions].map((o) => +o.value).filter(Boolean) : [];
    return l.length ? ["L", ...l] : null;
  }
  if (t === "Attachments") return PJ.valeur(id);
  return el ? el.value.trim() : "";
}

function lireChamps(prefix, defs, manquants) {
  const fields = {};
  for (const def of defs) {
    if (def.formule) continue;
    const bloc = document.querySelector(`[data-champ="${prefix}-${def.colId}"]`);
    if (!bloc || bloc.hidden) continue; // question masquée par une condition : pas de réponse enregistrée
    const v = lireUnChamp(prefix, def);
    if (def.obligatoire && (typeBase(def.type) === "Bool" ? !boolRepondu(prefix, def) : estVide(def, v)))
      manquants.push(`« ${def.libelle} »`);
    else if (typeof v === "number" && horsBornes(def, v))
      manquants.push(`« ${def.libelle} » avec une valeur ${horsBornes(def, v)}`);
    if (typeBase(def.type) === "Attachments" && PJ.enCours(`${prefix}-${def.colId}`))
      manquants.push(`« ${def.libelle} » (envoi des fichiers en cours : patientez un instant)`);
    if (def.tableau && tableaux[`${prefix}-${def.colId}`]) {
      const pb = tableaux[`${prefix}-${def.colId}`].verifier();
      if (pb.length) manquants.push(`« ${def.libelle} » (${pb.join(" ; ")})`);
    }
    if (def.pjEnvoi) {
      fields[def.pjEnvoi] = PJ.envoi(`${prefix}-${def.colId}`);
      continue;
    } // colonne Pièces jointes calculée
    fields[def.colId] = v;
  }
  return fields;
}

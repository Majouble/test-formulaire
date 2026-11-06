/* PRISME — widget de saisie, module 11/31 : Questions conditionnelles et formules calculées en direct.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Questions conditionnelles ---------- */
// Valeur courante d'une colonne dont dépend une condition (questions, mais aussi description
// et qualification du formulaire principal).
const normaliser = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Retrouve la colonne visée par une condition : d'abord parmi les questions du formulaire, puis la
// qualification et la description, puis n'importe quelle colonne de la table (valeur de la dernière version).
function resoudreColonne(ref, defs) {
  const n = normaliser(ref);
  const trouve = (liste) =>
    liste.find((d) => d.colId === ref) || liste.find((d) => normaliser(d.colId) === n || normaliser(d.libelle) === n);
  const q = trouve(defs);
  if (q) return { genre: "question", def: q };
  const tous = Object.values(etatSaisie.metaSig);
  const autre = trouve(tous);
  if (!autre) return null;
  if (autre.colId === col("Qualification")) return { genre: "qualification", def: autre };
  if (autre.colId === col("Description")) return { genre: "description", def: autre };
  return { genre: "colonne", def: autre };
}

/* ---------- Formules simples calculées en direct ----------
   Une colonne formule n'est recalculée par Grist qu'après enregistrement. Si sa formule est une
   expression arithmétique simple sur d'autres colonnes (ex. « $Blesses + $Hospitalises »), le widget la
   calcule lui-même à partir des réponses en cours de saisie. Opérations acceptées : + - * / et
   parenthèses, nombres et références $Colonne. Toute autre formule garde sa dernière valeur enregistrée.
   Le calcul ne porte que sur quelques champs : aucun coût perceptible. */
const FORMULE_SIMPLE = /^[\s$\w.,+\-*/()]+$/;
function formuleCalculable(def) {
  const f = ((def && def.texteFormule) || "").trim().replace(/^return\s+/, "");
  if (!def || !def.formule || !f || !FORMULE_SIMPLE.test(f) || !/\$\w/.test(f)) return null;
  // Une fois retirés les références $Colonne et les nombres, il ne doit rester que des opérateurs :
  // un nom de fonction (max, SUM, len…) ou tout autre mot rend la formule non calculable ici.
  const reste = f.replace(/\$\w+/g, " ").replace(/\d+(?:[.,]\d+)?/g, " ");
  return /^[\s+\-*/()]*$/.test(reste) ? f : null;
}
/* Formule qui lit une colonne de la fiche de l'établissement (ex. « $Etablissement_ESR.Effectif ») :
   le widget a déjà cette fiche, il donne donc la valeur dès que l'établissement est choisi. */
function formuleEtab(def) {
  const f = ((def && def.formule && def.texteFormule) || "").trim().replace(/^return\s+/, "");
  const m = f.match(/^\$(\w+)\.(\w+)$/);
  if (!m) return null;
  const ref = etatSaisie.metaSig[m[1]];
  const versEtab = m[1] === col("Etablissement") || (ref && (ref.type || "") === `Ref:${ETAB.table}`);
  return versEtab ? m[2] : null;
}
// Valeur d'une question formule pendant la saisie ; undefined si le widget ne sait pas la calculer
function valeurFormuleEnDirect(def, prefix = "q", defs = etatSaisie.defsQuestions) {
  const c = formuleEtab(def);
  if (c) {
    const e = etabDe(etablissementDuFormulaire());
    const v = e ? e[c] : null;
    return v === undefined || (v && typeof v === "object") ? null : v;
  }
  if (formuleCalculable(def)) return valeurColonneEnDirect(def.colId, prefix, defs);
  return undefined;
}
const formuleConnue = (def) => !!def.formule && (!!formuleEtab(def) || !!formuleCalculable(def));
// Affichage en direct des questions formules calculables
function majFormulesEnDirect() {
  for (const def of etatSaisie.defsQuestions) {
    if (!formuleConnue(def)) continue;
    const el = document.getElementById(`q-${def.colId}`),
      v = valeurFormuleEnDirect(def);
    if (el && v !== undefined) el.textContent = formatValeur(def, v);
  }
}
const questionVisible = (prefix, def) => {
  const b = document.querySelector(`[data-champ="${prefix}-${def.colId}"]`);
  return !!b && !b.hidden;
};
function nombreDe(v) {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v == null || v === "") return 0; // réponse vide : comptée comme 0, comme dans Grist
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function calculerFormule(f, lire, profondeur = 0) {
  // Analyse descendante : expression → terme (+|- terme)* ; terme → facteur (*|/ facteur)*
  const jetons = f.match(/\$\w+|\d+(?:[.,]\d+)?|[+\-*/()]/g) || [];
  let i = 0;
  const facteur = () => {
    const j = jetons[i++];
    if (j === "(") {
      const v = expression();
      i++;
      return v;
    }
    if (j === "-") return -facteur();
    if (j && j[0] === "$") return lire(j.slice(1), profondeur);
    return nombreDe(j);
  };
  const terme = () => {
    let v = facteur();
    while (jetons[i] === "*" || jetons[i] === "/") {
      const op = jetons[i++];
      const d = facteur();
      v = op === "*" ? v * d : d ? v / d : 0;
    }
    return v;
  };
  const expression = () => {
    let v = terme();
    while (jetons[i] === "+" || jetons[i] === "-") {
      const op = jetons[i++];
      const d = terme();
      v = op === "+" ? v + d : v - d;
    }
    return v;
  };
  return expression();
}
// Valeur actuelle d'une colonne, pour le calcul : réponse en cours si c'est une question du formulaire,
// formule simple recalculée si c'en est une, sinon dernière valeur enregistrée
function valeurColonneEnDirect(colId, prefix, defs, profondeur = 0) {
  const def = defs.find((d) => d.colId === colId) || etatSaisie.metaSig[colId];
  if (!def) return 0;
  const f = formuleCalculable(def);
  if (f && profondeur < 5)
    return calculerFormule(f, (c, p) => valeurColonneEnDirect(c, prefix, defs, p + 1), profondeur);
  if (colId === col("Qualification") && prefix === "q") return nombreDe(lireQualificationInitiale());
  if (!def.formule && defs.includes(def)) {
    const bloc = document.querySelector(`[data-champ="${prefix}-${colId}"]`);
    if (bloc && !bloc.hidden) return nombreDe(lireUnChamp(prefix, def));
    if (bloc && bloc.hidden) return 0;
  }
  const ref = etatSaisie.derniere || etatSaisie.initiale;
  return nombreDe(ref ? ref[colId] : null);
}

function valeurPourCondition(prefix, defs, cond) {
  const cible = resoudreColonne(cond.ref, defs);
  if (!cible) return null;
  const def = cible.def;
  const f = formuleCalculable(def);
  if (f) return calculerFormule(f, (c, p) => valeurColonneEnDirect(c, prefix, defs, p + 1));
  if (typeBase(def.type) === "Bool" && cible.genre === "colonne") {
    const r = etatSaisie.derniere || etatSaisie.initiale;
    return !!(r && r[def.colId]);
  }
  if (cible.genre === "qualification" && prefix === "q") return lireQualificationInitiale();
  if (cible.genre === "description" && prefix === "q") return $("description").value.trim();
  if (cible.genre === "question" && def.formule) {
    const r = etatSaisie.derniere || etatSaisie.initiale;
    return r ? r[def.colId] : null;
  }
  if (cible.genre === "question" && def.tableau) {
    // tableau : nombre de lignes saisies
    const c = tableaux[`${prefix}-${def.colId}`];
    return c ? c.lignesValides().length : lireTableauJson(lireUnChamp(prefix, def)).length;
  }
  if (cible.genre === "question") {
    const bloc = document.querySelector(`[data-champ="${prefix}-${def.colId}"]`);
    if (bloc && bloc.hidden) return null; // question elle-même masquée : considérée comme sans réponse
    const v = lireUnChamp(prefix, def);
    // Référence : on compare avec le texte affiché, pas avec le numéro de ligne
    const t = typeBase(def.type);
    if (t === "Ref") return v ? (def._labels && def._labels.get(v)) || String(v) : null;
    if (t === "RefList" && Array.isArray(v))
      return ["L", ...v.slice(1).map((x) => (def._labels && def._labels.get(x)) || String(x))];
    return v;
  }
  // Colonne hors formulaire : valeur de la version affichée (ou vide pour un nouveau signalement)
  const ref = etatSaisie.derniere || etatSaisie.initiale;
  return ref ? ref[def.colId] : null;
}

function conditionRemplie(prefix, defs, cond) {
  if (!cond) return true;
  return evaluerCondition(valeurPourCondition(prefix, defs, cond), cond);
}
function evaluerCondition(v, cond) {
  // Nombre comparé à Oui / Non : « Oui » = supérieur à 0 (ex. [si Nb de blessés = Oui])
  if ((cond.op === "=" || cond.op === "!=") && typeof v === "number") {
    const c = (cond.valeurs || []).map(normaliser),
      oui = ["oui", "vrai", "true"],
      non = ["non", "faux", "false"];
    if (c.length && c.every((x) => oui.includes(x) || non.includes(x))) {
      const res = (c.some((x) => oui.includes(x)) && v > 0) || (c.some((x) => non.includes(x)) && v <= 0);
      return cond.op === "!=" ? !res : res;
    }
  }
  // Comparaisons numériques
  if ([">", ">=", "<", "<="].includes(cond.op)) {
    const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
    const y = parseFloat(String((cond.valeurs || [])[0] ?? "").replace(",", "."));
    if (isNaN(x) || isNaN(y)) return false;
    return cond.op === ">" ? x > y : cond.op === ">=" ? x >= y : cond.op === "<" ? x < y : x <= y;
  }
  let liste, renseignee;
  if (typeof v === "boolean") {
    liste = v ? ["oui", "vrai", "true", "1"] : ["non", "faux", "false", "0"];
    renseignee = v;
  } else if (Array.isArray(v)) {
    liste = v[0] === "L" ? v.slice(1) : v;
    renseignee = liste.length > 0;
  } else {
    liste = v == null || v === "" ? [] : [String(v)];
    renseignee = liste.length > 0;
  }
  if (cond.op === "vide") return !renseignee;
  if (cond.op === "rempli") return !!renseignee;
  // Égalité : sans tenir compte des majuscules, des accents ni des espaces superflus
  const valeurs = liste.map(normaliser);
  const candidates = [...(cond.valeurs || []), ...(cond.brut ? [cond.brut] : [])];
  const trouve = candidates.some((x) => valeurs.includes(normaliser(x)));
  return cond.op === "!=" ? !trouve : trouve;
}

// Affiche ou masque les questions conditionnelles. Plusieurs passes, pour qu'une question
// conditionnée par une autre question elle-même conditionnelle suive correctement.
function afficherDiagnostic() {
  if (!$("diagnostic-conditions").open) return;
  const defs = etatSaisie.defsQuestions;
  const lignes = defs
    .filter((d) => d.condition)
    .map((d) => {
      const cible = resoudreColonne(d.condition.ref, defs);
      const bloc = document.querySelector(`[data-champ="q-${d.colId}"]`);
      const v = cible ? valeurPourCondition("q", defs, d.condition) : undefined;
      const lu =
        v === undefined
          ? "—"
          : v === null || v === ""
            ? "(vide)"
            : Array.isArray(v)
              ? (v[0] === "L" ? v.slice(1) : v).join(", ") || "(vide)"
              : typeof v === "boolean"
                ? v
                  ? "coché"
                  : "non coché"
                : String(v);
      const origine = !cible
        ? `<span class="ko">introuvable</span>`
        : `${esc(cible.def.libelle || cible.def.colId)} <small>(${esc(cible.def.colId)}${
            formuleCalculable(cible.def)
              ? ", formule calculée en direct"
              : cible.def.formule
                ? ", formule : valeur enregistrée, mise à jour après enregistrement"
                : cible.genre === "colonne"
                  ? ", hors formulaire : valeur enregistrée"
                  : ""
          })</small>`;
      const res = bloc && !bloc.hidden ? `<span class="ok">affichée</span>` : `<span class="ko">masquée</span>`;
      return `<tr><td>${esc(d.libelle)}</td><td><code>[si ${esc(d.condition.texte)}]</code></td><td>${origine}</td><td>${esc(lu)}</td><td>${res}</td></tr>`;
    });
  $("diag-lignes").innerHTML = lignes.join("") || `<tr><td colspan="5">Aucune question conditionnelle.</td></tr>`;
}
$("diagnostic-conditions").addEventListener("toggle", afficherDiagnostic);

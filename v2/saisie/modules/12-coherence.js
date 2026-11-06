/* PRISME — widget de saisie, module 12/31 : Cohérence des dossiers.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Cohérence des dossiers ---------- */
function lignesIncoherentes() {
  const cD = col("Dossier"),
    cE = col("Etablissement");
  if (!cD || !cE) return [];
  const parId = new Map(enregistrements.map((l) => [l.id, l]));
  return enregistrements
    .filter((l) => {
      const d = refId(l[cD]);
      if (!d || d === l.id) return false;
      const init = parId.get(d);
      return init && refId(init[cE]) !== refId(l[cE]);
    })
    .map((l) => ({ ligne: l, dossier: parId.get(refId(l[cD])) }));
}
function afficherCoherence() {
  if (!$("coherence-dossiers").open) return;
  const nomEtab = (id) => (etabDe(id) || {})[E.nom] || `n° ${id}`;
  const liste = lignesIncoherentes();
  $("coherence-lignes").innerHTML = liste.length
    ? liste
        .map(
          ({ ligne, dossier }) => `<tr><td>${ligne.id}</td><td>${esc(nomEtab(refId(val(ligne, "Etablissement"))))}</td>
        <td>n° ${dossier.id}</td><td>${esc(nomEtab(refId(val(dossier, "Etablissement"))))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="ok">Aucune incohérence : chaque version appartient au dossier de son établissement.</td></tr>`;
  $("btn-reparer").hidden = !liste.length;
  $("btn-reparer").textContent = `Réparer ${liste.length > 1 ? "ces " + liste.length + " lignes" : "cette ligne"}`;
}
$("coherence-dossiers").addEventListener("toggle", afficherCoherence);
$("btn-reparer").addEventListener("click", () =>
  enFile(async () => {
    const liste = lignesIncoherentes();
    if (!liste.length) return;
    if (
      !confirm(
        `Faire de ${liste.length > 1 ? "ces " + liste.length + " lignes des dossiers" : "cette ligne un dossier"} à part entière ?`,
      )
    )
      return;
    const maj = liste.map(({ ligne }) => {
      const fields = { [col("Dossier")]: ligne.id };
      if (col("Nature")) fields[col("Nature")] = NATURE.initial;
      return { id: ligne.id, fields };
    });
    try {
      await grist.getTable().update(maj);
      statut("statut-coherence", `${maj.length} ligne(s) réparée(s).`, "ok");
    } catch (e) {
      statut("statut-coherence", `Échec : ${e.message || e}`, "err");
    }
  }),
);

function appliquerConditions(prefix, defs) {
  const aCondition = defs.filter((d) => d.condition);
  if (!aCondition.length) {
    controleursTableau(prefix).forEach((c) => c.ajuster());
    return;
  }
  for (let passe = 0; passe < 3; passe++) {
    let bouge = false;
    for (const def of aCondition) {
      const bloc = document.querySelector(`[data-champ="${prefix}-${def.colId}"]`);
      if (!bloc || bloc.dataset.masqueAcces === "1") continue; // masquage par règle d'accès prioritaire
      const montrer = conditionRemplie(prefix, defs, def.condition);
      if (bloc.hidden === !montrer) continue;
      bloc.hidden = !montrer;
      bouge = true;
    }
    if (!bouge) break;
  }
  controleursTableau(prefix).forEach((c) => c.ajuster());
  if (prefix === "q") afficherDiagnostic();
}

// Ne garde que les champs dont la valeur diffère de la ligne de référence
// Une version est arrivée depuis l'ouverture du formulaire : on garde les réponses que l'agent a changées,
// et pour les autres celles de la version la plus récente (l'apport du collègue n'est pas effacé).
function fusionnerAvecVersionRecente(valeurs) {
  const res = { valeurs: {}, conflits: [], recuperes: [] };
  if (!versionAffichee || !derniere || versionAffichee.id === derniere.id) return res;
  const defs = [...champsVersion, ...defsQuestions],
    def = (c) => defs.find((d) => d.colId === c) || { type: "Any" };
  const pareil = (c, a, b) => egal(norm(def(c), a), norm(def(c), b));
  for (const [c, v] of Object.entries(valeurs)) {
    const avant = versionAffichee[c],
      recent = derniere[c];
    const moi = !pareil(c, v, avant),
      lui = !pareil(c, recent, avant);
    if (!moi && lui) {
      res.valeurs[c] = recent;
      res.recuperes.push(def(c).libelle || c);
    } else if (moi && lui && !pareil(c, v, recent)) res.conflits.push(def(c).libelle || c);
  }
  return res;
}
const auteurDe = (l) => {
  const a = l && col("Auteur") ? val(l, "Auteur") : "";
  return a ? ` (par ${a})` : "";
};
function seulementModifies(defs, valeurs, ligne) {
  const res = {};
  for (const [c, v] of Object.entries(valeurs)) {
    const def = defs.find((d) => d.colId === c) || { type: "Any" };
    if (!egal(norm(def, v), norm(def, ligne ? ligne[c] : null))) res[c] = v;
  }
  return res;
}

function formatValeur(def, v) {
  if (estVide(def, v)) return "—";
  if (def.tableau) return syntheseTableau(def._sousDefs || [], lireTableauJson(v), true);
  const t = typeBase(def.type);
  if (t === "Bool") return v ? "Oui" : "Non";
  if (t === "Date" || t === "DateTime") return dateFr(v, def);
  if (t === "Numeric" || t === "Int") return typeof v === "number" ? v.toLocaleString("fr-FR") : String(v);
  if (t === "Ref") return (def._labels && def._labels.get(v)) || `n° ${v}`;
  if (t === "Attachments") return PJ.texte(v);
  if (Array.isArray(v) && v[0] === "L") {
    const l = v.slice(1);
    return (t === "RefList" ? l.map((x) => (def._labels && def._labels.get(x)) || `n° ${x}`) : l).join(", ");
  }
  const s = String(v);
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
}

/* PRISME — widget de saisie, module 28/31 : Recherche d'établissement (autocomplétion).
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Autocomplétion (agents, création)
   ========================================================= */
const nom = $("nom"),
  liste = $("liste");
// Recherche dans le référentiel du document (sans accents, tous les mots doivent être présents)
const sansAccent = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const odsq = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
function clauses(src, q) {
  const f = src.champs;
  if (/^\d{7}[a-z]$/i.test(q)) return [`${f.uai}="${q.toUpperCase()}"`];
  const texte = odsq(q);
  return [`search(${f.nom}, ${f.commune}, "${texte}")`, `search(*, "${texte}")`];
}
async function appeler(src, where) {
  const r = await fetch(`${src.url}?${new URLSearchParams({ where, limit: NB_RESULTATS_ANNUAIRE })}`);
  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.json()).message || "";
    } catch (_) {}
    throw new Error(`${src.etiquette} : HTTP ${r.status} ${detail}`);
  }
  return r.json();
}
async function interroger(src, q) {
  const f = src.champs;
  let data = { results: [] };
  for (const where of clauses(src, q)) {
    data = await appeler(src, where);
    if (data.results && data.results.length) break;
  }
  return (data.results || []).map((rec) => ({
    source: src.etiquette,
    nom: rec[f.nom],
    uai: rec[f.uai],
    type: rec[f.type],
    academie: rec[f.academie],
    departement: rec[f.departement],
    commune: rec[f.commune],
    mail: f.mail ? rec[f.mail] : "",
  }));
}
const sourcesActives = () => SOURCES.filter((x) => S().annuaires.includes(x.cle));
function rechercheLocale(q) {
  const mots = sansAccent(q).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const colsRecherche = etatSaisie.colsEtab.includes(E.nom)
    ? [...new Set([E.nom, E.commune, E.uai, ...COLONNES_RECHERCHE_EN_PLUS, ...S().recherche])]
    : etatSaisie.colsEtab.filter(
        (c) => c !== "id" && c !== "manualSort" && !c.startsWith("gristHelper") && c !== E.cle && c !== E.lien,
      );
  // lignes fusionnées dans un autre établissement (référentiel ESR, colonne Etat) : plus proposées
  const trouves = etatSaisie.etabs.filter((e) => {
    if (typeof e.Etat === "string" && /^fusionn/i.test(e.Etat.trim())) return false;
    const texte = sansAccent(
      colsRecherche
        .map((c) => e[c])
        .filter((v) => v != null && typeof v !== "object")
        .join(" "),
    );
    return mots.every((m) => texte.includes(m));
  });
  // le nom (ou le sigle, le libellé consolidé) d'abord ; les mots-clés de recherche (anciens noms, villes…) ensuite
  const titre = (e) =>
    sansAccent([e[E.nom], e.Sigle, e.Libelle_consolide].filter((v) => typeof v === "string").join(" "));
  const note = (e) => {
    const t = titre(e);
    return mots.filter((m) => t.includes(m)).length * 2 + (t.startsWith(mots[0]) ? 1 : 0);
  };
  if (colsRecherche.includes("Mots_cles") || colsRecherche.includes("Libelle_consolide"))
    trouves.sort((a, b) => note(b) - note(a));
  const dedans = perimetreActif() ? trouves.filter(dansPerimetre) : trouves;
  const retenus = dedans.length ? dedans : trouves;
  return retenus.slice(0, NB_RESULTATS).map((e) => ({
    source: "local",
    ligne: e,
    nom: e[E.nom] ?? libelleEtabDeRepli(e),
    uai: e[E.uai],
    type: e[E.type],
    academie: e[E.academie],
    departement: e[E.departement],
    commune: e[E.commune],
    mail: e[E.mail],
    hors: perimetreActif() && !dedans.length,
  }));
}

// Sans colonne de nom reconnue : première valeur texte de la ligne
function libelleEtabDeRepli(e) {
  const c = etatSaisie.colsEtab.find(
    (c) => c !== "id" && c !== E.cle && c !== E.lien && typeof e[c] === "string" && e[c].trim(),
  );
  return c ? e[c] : `Ligne ${e.id}`;
}
async function rechercher(q) {
  const id = ++etatSaisie.requete;
  const locaux = rechercheLocale(q),
    actives = q.length >= MIN_CARACTERES_ANNUAIRE ? sourcesActives() : [];
  if (!actives.length) {
    // référentiel seul
    etatSaisie.resultats = locaux;
    if (!etatSaisie.resultats.length)
      etat(
        `Aucun établissement du référentiel ne correspond. Vérifiez l'orthographe, essayez la commune ou l'UAI${sourcesActives().length ? " (au moins 3 caractères pour l'annuaire)" : ""}, ou cliquez sur « Établissement introuvable ? Le créer ».`,
      );
    else afficherResultats();
    return;
  }
  if (locaux.length) {
    etatSaisie.resultats = locaux;
    afficherResultats();
  } else etat("Recherche…");
  // L'annuaire en ligne complète la recherche (établissements pas encore dans le référentiel)
  const rep = await Promise.allSettled(actives.map((x) => interroger(x, q)));
  if (id !== etatSaisie.requete) return;
  const connus = new Set(locaux.map((l) => String(l.uai || "").toUpperCase()));
  // annuaire en ligne : filtré sur l'académie ou le département quand le périmètre en dépend
  const p = perimetreActif() ? perimetre() : {},
    filtres = [
      ["academie", E.academie],
      ["departement", E.departement],
    ].filter(([, c]) => p[c]);
  const distants = rep
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((e) => !connus.has(String(e.uai || "").toUpperCase()))
    .filter((e) => filtres.every(([k, c]) => !e[k] || p[c].some((x) => sansAccent(x) === sansAccent(e[k]))));
  etatSaisie.resultats = [...locaux, ...distants];
  if (locaux.length && rep.every((r) => r.status === "rejected")) {
    afficherResultats();
    return;
  }
  rep.filter((r) => r.status === "rejected").forEach((r) => console.warn("Autocomplétion :", r.reason));
  if (!etatSaisie.resultats.length) {
    etat(
      rep.every((r) => r.status === "rejected")
        ? `Annuaire injoignable (${(rep[0].reason && rep[0].reason.message) || "erreur réseau"}). Saisissez les informations à la main.`
        : "Aucun établissement trouvé. Vérifiez l'orthographe ou saisissez l'UAI, ou cliquez sur « Établissement introuvable ? Le créer ».",
    );
    return;
  }
  afficherResultats();
}
function afficherResultats() {
  etatSaisie.index = -1;
  liste.innerHTML = etatSaisie.resultats
    .map(
      (e, i) => `
    <li role="option" id="opt-${i}" data-i="${i}" aria-selected="false">
      <div class="nom">${esc(e.nom)}${e.hors ? '<span class="source hors">hors périmètre</span>' : ""}${!sourcesActives().length ? "" : e.source === "local" ? '<span class="source connu">référentiel</span>' : `<span class="source">${esc(e.source)}</span>`}</div>
      <div class="meta">${esc([e.uai, e.type, e.commune, e.academie].filter(Boolean).join(", "))}</div>
      ${e.ligne && rattachementDe(e.ligne) ? `<div class="meta">→ dossier ouvert sur ${esc(rattachementDe(e.ligne)[E.nom])}</div>` : ""}
    </li>`,
    )
    .join("");
  ouvrir();
}
function etat(t) {
  liste.innerHTML = `<li class="etat" aria-disabled="true">${esc(t)}</li>`;
  etatSaisie.resultats = [];
  etatSaisie.index = -1;
  ouvrir();
}
function ouvrir() {
  liste.hidden = false;
  nom.setAttribute("aria-expanded", "true");
}
function fermer() {
  liste.hidden = true;
  nom.setAttribute("aria-expanded", "false");
  etatSaisie.index = -1;
}
function surligner(i) {
  [...liste.querySelectorAll("[role=option]")].forEach((li, k) => {
    li.setAttribute("aria-selected", k === i);
    if (k === i) li.scrollIntoView({ block: "nearest" });
  });
  etatSaisie.index = i;
  nom.setAttribute("aria-activedescendant", i >= 0 ? `opt-${i}` : "");
}
function choisir(i) {
  const e = etatSaisie.resultats[i];
  if (!e) return;
  if (etatSaisie.reaffectation) {
    proposerRattachement(e);
    return;
  }
  fermer();
  const existant = (e.ligne && etabDe(e.ligne.id)) || e.ligne || etabParUai(e.uai);
  etatSaisie.composanteChoisie = null;
  if (existant) {
    etatSaisie.etabCourant = versEtablissement(existant);
    etatSaisie.ligneAnnuaire = null;
  } else {
    etatSaisie.ligneAnnuaire = e;
    nom.value = e.nom || "";
    CHAMPS_NOUVEL_ETAB.forEach((k) => {
      $(k).value = e[k] || "";
      $(k).classList.toggle("auto", !!e[k]);
    });
    $("mail").dataset.saisi = e.mail || "";
  }
  etatSaisie.modifie = true;
  afficherEtablissement();
  focusPremiereQuestion();
}
nom.addEventListener("input", () => {
  clearTimeout(etatSaisie.minuterie);
  CHAMPS_NOUVEL_ETAB.forEach((k) => $(k).classList.remove("auto"));
  afficherEtablissement();
  const q = nom.value.trim();
  if (q.length < MIN_CARACTERES) {
    fermer();
    return;
  }
  etatSaisie.minuterie = setTimeout(() => rechercher(q), sourcesActives().length ? 300 : 150);
});
nom.addEventListener("keydown", (ev) => {
  if (liste.hidden || !etatSaisie.resultats.length) return;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    surligner(Math.min(etatSaisie.index + 1, etatSaisie.resultats.length - 1));
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    surligner(Math.max(etatSaisie.index - 1, 0));
  } else if (ev.key === "Enter" && etatSaisie.index >= 0) {
    ev.preventDefault();
    choisir(etatSaisie.index);
  } else if (ev.key === "Escape") fermer();
});
liste.addEventListener("mousedown", (ev) => {
  const li = ev.target.closest("[role=option]");
  if (li) {
    ev.preventDefault();
    choisir(+li.dataset.i);
  }
});
nom.addEventListener("blur", () => setTimeout(fermer, 150));
CHAMPS_NOUVEL_ETAB.forEach((k) => $(k).addEventListener("input", () => $(k).classList.remove("auto")));
$("uai").addEventListener("change", () => {
  const existant = etabParUai($("uai").value);
  if (existant) {
    etatSaisie.etabCourant = versEtablissement(existant);
    etatSaisie.ligneAnnuaire = null;
    afficherEtablissement();
  }
});

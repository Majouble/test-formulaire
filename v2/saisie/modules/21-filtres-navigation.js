/* PRISME — widget de saisie, module 21/31 : Filtre des signalements et navigation d'une fiche à l'autre.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Filtre des signalements et navigation d'une fiche à l'autre ----------
   Plusieurs filtres possibles (combinés par ET ; plusieurs valeurs d'un même filtre combinées par OU).
   Chaque filtre porte sur l'état actuel de chaque dossier (sa dernière version) ou sur son établissement.
   Il s'applique à la barre de recherche, à la liste « Signalements » et aux flèches de navigation,
   et il est mémorisé sur ce poste (par table). Les flèches ‹ › (ou les touches ← → hors d'un champ
   de saisie) passent au signalement précédent ou suivant dans l'ordre de la liste. */
const VIDE_FILTRE = "∅",
  RENSEIGNE_FILTRE = "✱";
const CHAMPS_ETAB_FILTRE = [
  ["academie", "Académie"],
  ["departement", "Département"],
  ["type", "Type d'établissement"],
  ["commune", "Commune"],
];
const MAX_VALEURS_FILTRE = 60;
function derniereDe(l) {
  if (!etatSaisie.cacheDernieres) {
    const cD = col("Dossier");
    etatSaisie.cacheDernieres = new Map();
    for (const x of etatSaisie.enregistrements) {
      const d = refId(cD && x[cD]) || x.id,
        p = etatSaisie.cacheDernieres.get(d);
      if (!p || comparerVersions(p, x) < 0) etatSaisie.cacheDernieres.set(d, x);
    }
  }
  return etatSaisie.cacheDernieres.get(l.id) || l;
}
// Colonnes proposées : qualification et dates, toutes les questions supplémentaires (quel que soit leur type),
// les visas (agents), l'établissement (agents), puis les autres colonnes à valeurs fermées de la table.
function champsFiltrables() {
  const res = [],
    vus = new Set();
  const ajouter = (def, groupe) => {
    if (!def || vus.has(def.colId)) return;
    vus.add(def.colId);
    res.push({ cle: "c:" + def.colId, libelle: def.libelle || def.colId, groupe, def });
  };
  ["Qualification", "Date_faits", "Date", "Nature"].forEach((k) =>
    ajouter(col(k) && etatSaisie.metaSig[col(k)], "Signalement"),
  );
  etatSaisie.defsQuestions.filter((d) => !d.tableau).forEach((d) => ajouter(d, "Questions supplémentaires"));
  if (!etatSaisie.modeEtab) [...etatSaisie.defsDep, ...etatSaisie.defsAca].forEach((d) => ajouter(d, "Visas"));
  if (!etatSaisie.modeEtab)
    for (const [k, lib] of CHAMPS_ETAB_FILTRE)
      if (E[k] && etatSaisie.colsEtab.includes(E[k]))
        res.push({ cle: "e:" + k, libelle: lib, groupe: "Établissement" });
  const exclus = new Set(
    [col("Dossier"), col("Etablissement"), col("Description"), col("Commentaire"), "id", "manualSort"].filter(Boolean),
  );
  const fermes = ["Choice", "ChoiceList", "Bool", "Ref", "RefList", "Date", "DateTime"];
  for (const def of Object.values(etatSaisie.metaSig))
    if (!exclus.has(def.colId) && !def.colId.startsWith("gristHelper") && fermes.includes(typeBase(def.type)))
      ajouter(def, "Autres colonnes");
  return res;
}
const typeChamp = (champ) => (champ.def ? typeBase(champ.def.type) : "Text");
function valeursDossier(l, champ) {
  if (champ.cle.startsWith("e:")) {
    const v = (etabDeLigne(l) || {})[E[champ.cle.slice(2)]];
    return v == null || v === "" || typeof v === "object" ? [] : [{ cle: normaliser(v), libelle: String(v) }];
  }
  const def = champ.def,
    v = derniereDe(l)[def.colId],
    t = typeBase(def.type);
  if (t === "Date" || t === "DateTime") {
    const s = secondes(v);
    if (s == null) return [];
    const d = new Date(s * 1000),
      j = t === "Date" ? d.toISOString().slice(0, 10) : valeurLocale(d, false);
    return [{ cle: j, libelle: j.split("-").reverse().join("/") }];
  }
  if ((t === "Numeric" || t === "Int") && typeof v === "number")
    return [{ cle: String(v), libelle: v.toLocaleString("fr-FR") }];
  return textesValeur(def, v)
    .filter((x) => String(x).trim())
    .map((x) => {
      const s = String(x)
        .replace(/\*\*|==/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return { cle: normaliser(x), libelle: s.length > 70 ? s.slice(0, 68) + "…" : s };
    });
}
const champDe = (f) => etatSaisie.listeChampsFiltre.find((c) => c.cle === f.colonne) || null;
const filtreEffectif = (f) => !!(champDe(f) && (f.valeurs.length || (f.contient || "").trim()));
const filtreActif = () => etatSaisie.filtres.some(filtreEffectif);
function passeUn(f, l) {
  if (!filtreEffectif(f)) return true;
  const vs = valeursDossier(l, champDe(f));
  if (
    f.valeurs.some((k) =>
      k === VIDE_FILTRE ? !vs.length : k === RENSEIGNE_FILTRE ? vs.length > 0 : vs.some((x) => x.cle === k),
    )
  )
    return true;
  const c = normaliser(f.contient || "");
  return !!c && vs.some((x) => x.cle.includes(c));
}
const passeFiltre = (l, sauf) => etatSaisie.filtres.every((f) => f === sauf || passeUn(f, l));
const dossiersFiltres = () =>
  filtreActif() ? etatSaisie.dossiersInit.filter((l) => passeFiltre(l)) : etatSaisie.dossiersInit;
function resumeFiltre(f, court) {
  const champ = champDe(f);
  const noms = f.valeurs.map((k) =>
    k === VIDE_FILTRE ? "(vide)" : k === RENSEIGNE_FILTRE ? "(renseigné)" : f.libelles[k] || k,
  );
  if ((f.contient || "").trim()) noms.push(`contient « ${f.contient.trim()} »`);
  const val = !noms.length
    ? "toutes les valeurs"
    : court && noms.length > 2
      ? `${noms.slice(0, 2).join(" ou ")} + ${noms.length - 2}`
      : noms.join(" ou ");
  return `${champ ? champ.libelle : "?"} : ${val}`;
}
function sauverFiltre() {
  Outils.stockage.ecrireJSON(`signalements-filtres:${etatSaisie.tableId || ""}`, etatSaisie.filtres);
}
function restaurerFiltre() {
  try {
    const f = Outils.stockage.lireJSON(`signalements-filtres:${etatSaisie.tableId || ""}`, []);
    if (Array.isArray(f))
      etatSaisie.filtres = f
        .filter((x) => x && typeof x.colonne === "string")
        .map((x) => ({
          colonne: x.colonne,
          valeurs: Array.isArray(x.valeurs) ? x.valeurs : [],
          libelles: x.libelles || {},
          contient: x.contient || "",
        }));
  } catch (_) {}
}
// Valeurs d'un filtre avec leur nombre de signalements, compté en tenant compte des AUTRES filtres
function valeursDisponibles(f) {
  const champ = champDe(f),
    compte = new Map();
  let vides = 0,
    renseignes = 0;
  for (const l of etatSaisie.dossiersInit) {
    if (!passeFiltre(l, f)) continue;
    const vs = valeursDossier(l, champ);
    if (vs.length) renseignes++;
    else vides++;
    new Map(vs.map((x) => [x.cle, x.libelle])).forEach((libelle, cle) => {
      const p = compte.get(cle) || { libelle, n: 0 };
      p.n++;
      compte.set(cle, p);
    });
  }
  f.valeurs.forEach((k) => {
    if (k !== VIDE_FILTRE && k !== RENSEIGNE_FILTRE && !compte.has(k))
      compte.set(k, { libelle: f.libelles[k] || k, n: 0 });
  });
  const t = typeChamp(champ);
  const ordre = ((champ.def && champ.def.opts && champ.def.opts.choices) || []).map(normaliser);
  let entrees = [...compte.entries()];
  const trop = entrees.length > MAX_VALEURS_FILTRE;
  if (trop)
    entrees = entrees
      .sort((a, b) => b[1].n - a[1].n)
      .filter((e, i) => i < MAX_VALEURS_FILTRE || f.valeurs.includes(e[0]));
  entrees.sort(([ca, a], [cb, b]) => {
    if (t === "Date" || t === "DateTime") return cb.localeCompare(ca); // jours les plus récents d'abord
    if (t === "Numeric" || t === "Int") return parseFloat(ca) - parseFloat(cb);
    const ia = ordre.indexOf(ca),
      ib = ordre.indexOf(cb);
    if (ia !== ib && (ia >= 0 || ib >= 0)) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    return a.libelle.localeCompare(b.libelle, "fr");
  });
  return { entrees, vides, renseignes, trop };
}
function majFiltre() {
  etatSaisie.listeChampsFiltre = champsFiltrables();
  // Filtre sur une colonne disparue (associations modifiées) : retiré
  if (Object.keys(etatSaisie.metaSig).length)
    etatSaisie.filtres = etatSaisie.filtres.filter(
      (f) => champDe(f) || (f.colonne.startsWith("e:") && !etatSaisie.etabsCharges),
    );
  // Pastilles des filtres
  $("filtres-actifs").innerHTML = etatSaisie.filtres
    .map(
      (f, i) =>
        `<span class="puce-filtre${filtreEffectif(f) ? "" : " inactive"}">` +
        `<button type="button" class="puce-libelle" data-i="${i}" aria-expanded="${etatSaisie.filtreOuvert === f}" aria-controls="panneau-filtre" title="${esc(resumeFiltre(f))}">${esc(resumeFiltre(f, true))} ▾</button>` +
        `<button type="button" class="puce-retirer" data-i="${i}" aria-label="Retirer le filtre ${esc(champDe(f) ? champDe(f).libelle : "")}">×</button></span>`,
    )
    .join("");
  $("filtre-tout-effacer").hidden = etatSaisie.filtres.length < 2;
  // Liste des colonnes encore disponibles pour un nouveau filtre
  const sel = $("filtre-ajout");
  if (document.activeElement !== sel) {
    const pris = new Set(etatSaisie.filtres.map((f) => f.colonne));
    const dispo = etatSaisie.listeChampsFiltre.filter(
      (c) =>
        !pris.has(c.cle) &&
        (c.groupe === "Questions supplémentaires" ||
          c.groupe === "Signalement" ||
          etatSaisie.dossiersInit.some((l) => valeursDossier(l, c).length)),
    );
    const groupes = [...new Set(dispo.map((c) => c.groupe))];
    sel.innerHTML =
      `<option value="">${etatSaisie.filtres.length ? "+ Ajouter un filtre" : "Filtrer par…"}</option>` +
      groupes
        .map(
          (g) =>
            `<optgroup label="${esc(g)}">${dispo
              .filter((c) => c.groupe === g)
              .map((c) => `<option value="${esc(c.cle)}">${esc(c.libelle)}</option>`)
              .join("")}</optgroup>`,
        )
        .join("");
    sel.value = "";
    sel.hidden = !dispo.length;
  }
  if (etatSaisie.filtreOuvert && !etatSaisie.filtres.includes(etatSaisie.filtreOuvert)) fermerPanneauFiltre();
  else if (etatSaisie.filtreOuvert) remplirPanneauFiltre(false);
  majNavigation();
}
function appliquerFiltre() {
  sauverFiltre();
  etatSaisie.posNav = null;
  majListeDossiers();
  if (!$("resultats-signalements").hidden) afficherResultatsRecherche();
}
/* ---------- Panneau des valeurs d'un filtre (cases à cocher, appliquées aussitôt) ---------- */
function remplirPanneauFiltre(reconstruire = true) {
  const f = etatSaisie.filtreOuvert,
    champ = f && champDe(f);
  if (!champ) return;
  const { entrees, vides, renseignes, trop } = valeursDisponibles(f);
  const t = typeChamp(champ);
  const texteLibre = t === "Text" || t === "Any";
  if (reconstruire) {
    $("pf-titre").textContent = champ.libelle;
    $("pf-cherche").value = "";
    $("pf-contient").value = f.contient || "";
  }
  $("pf-cherche").hidden = entrees.length <= 8;
  $("pf-bloc-contient").hidden = !texteLibre;
  const q = sansAccent($("pf-cherche").value.trim());
  const coche = (k) => (f.valeurs.includes(k) ? " checked" : "");
  const ligne = (k, lib, n, cls = "") =>
    `<label class="pf-valeur${cls}" data-cle-texte="${esc(sansAccent(lib))}"><input type="checkbox" value="${esc(k)}" data-libelle="${esc(lib)}"${coche(k)}>` +
    `<span>${esc(lib)}</span><small>${n}</small></label>`;
  const special =
    ligne(RENSEIGNE_FILTRE, "(renseigné)", renseignes, " special") + ligne(VIDE_FILTRE, "(vide)", vides, " special");
  $("pf-valeurs").innerHTML =
    (entrees.map(([k, x]) => ligne(k, x.libelle, x.n)).join("") ||
      `<p class="pf-note">Aucune valeur saisie pour l'instant.</p>`) +
    special +
    (trop
      ? `<p class="pf-note">Seules les ${MAX_VALEURS_FILTRE} valeurs les plus fréquentes sont listées${texteLibre ? " : utilisez « Contient » pour les autres" : ""}.</p>`
      : "");
  if (q)
    $("pf-valeurs")
      .querySelectorAll(".pf-valeur:not(.special)")
      .forEach((l) => {
        l.hidden = !l.dataset.cleTexte.includes(q);
      });
}
function ouvrirPanneauFiltre(f, bouton) {
  fermerRecherche();
  etatSaisie.filtreOuvert = f;
  const p = $("panneau-filtre");
  p.hidden = false;
  remplirPanneauFiltre(true);
  const barre = $("barre-filtre").getBoundingClientRect(),
    b = bouton ? bouton.getBoundingClientRect() : barre;
  p.style.left = Math.max(0, Math.min(b.left - barre.left, barre.width - p.offsetWidth)) + "px";
  document
    .querySelectorAll(".puce-libelle")
    .forEach((x) => x.setAttribute("aria-expanded", String(+x.dataset.i === etatSaisie.filtres.indexOf(f))));
  const cible = !$("pf-cherche").hidden ? $("pf-cherche") : p.querySelector(".pf-valeur input") || $("pf-ok");
  cible.focus();
}
function fermerPanneauFiltre(rendreFocus) {
  if (!etatSaisie.filtreOuvert) return;
  const i = etatSaisie.filtres.indexOf(etatSaisie.filtreOuvert);
  etatSaisie.filtreOuvert = null;
  $("panneau-filtre").hidden = true;
  document.querySelectorAll(".puce-libelle").forEach((x) => x.setAttribute("aria-expanded", "false"));
  if (rendreFocus) {
    const b = document.querySelector(`.puce-libelle[data-i="${i}"]`);
    (b || $("filtre-ajout")).focus();
  }
}
$("pf-valeurs").addEventListener("change", (ev) => {
  const c = ev.target,
    f = etatSaisie.filtreOuvert;
  if (!f || !c.matches('input[type="checkbox"]')) return;
  f.valeurs = f.valeurs.filter((k) => k !== c.value);
  if (c.checked) {
    f.valeurs.push(c.value);
    f.libelles[c.value] = c.dataset.libelle;
  }
  appliquerFiltre();
});
$("pf-cherche").addEventListener("input", () => remplirPanneauFiltre(false));
$("pf-contient").addEventListener("input", () => {
  clearTimeout(etatSaisie.minuterieContient);
  etatSaisie.minuterieContient = setTimeout(() => {
    if (etatSaisie.filtreOuvert) {
      etatSaisie.filtreOuvert.contient = $("pf-contient").value;
      appliquerFiltre();
    }
  }, 250);
});
$("pf-aucune").addEventListener("click", () => {
  if (!etatSaisie.filtreOuvert) return;
  etatSaisie.filtreOuvert.valeurs = [];
  etatSaisie.filtreOuvert.contient = "";
  $("pf-contient").value = "";
  appliquerFiltre();
});
// Tout cocher : toutes les valeurs listées (celles que la recherche du panneau laisse visibles),
// sans « (renseigné) » ni « (vide) »
$("pf-tout").addEventListener("click", () => {
  const f = etatSaisie.filtreOuvert;
  if (!f) return;
  $("pf-valeurs")
    .querySelectorAll(".pf-valeur:not(.special):not([hidden]) input")
    .forEach((c) => {
      if (!f.valeurs.includes(c.value)) {
        f.valeurs.push(c.value);
        f.libelles[c.value] = c.dataset.libelle;
      }
    });
  appliquerFiltre();
});
$("pf-ok").addEventListener("click", () => fermerPanneauFiltre(true));
$("panneau-filtre").addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    fermerPanneauFiltre(true);
  } else if (ev.key === "Enter" && ev.target.matches("#pf-cherche, #pf-contient")) {
    ev.preventDefault();
    fermerPanneauFiltre(true);
  }
});
document.addEventListener("mousedown", (ev) => {
  if (etatSaisie.filtreOuvert && !$("panneau-filtre").contains(ev.target) && !ev.target.closest(".puce-libelle"))
    fermerPanneauFiltre(false);
});
$("filtres-actifs").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-i]");
  if (!b) return;
  const f = etatSaisie.filtres[+b.dataset.i];
  if (b.classList.contains("puce-retirer")) {
    if (etatSaisie.filtreOuvert === f) fermerPanneauFiltre(false);
    etatSaisie.filtres.splice(+b.dataset.i, 1);
    appliquerFiltre();
    $("filtre-ajout").focus();
  } else if (etatSaisie.filtreOuvert === f) fermerPanneauFiltre(false);
  else ouvrirPanneauFiltre(f, b);
});
$("filtre-ajout").addEventListener("change", () => {
  const cle = $("filtre-ajout").value;
  if (!cle) return;
  etatSaisie.listeChampsFiltre = champsFiltrables();
  const f = { colonne: cle, valeurs: [], libelles: {}, contient: "" };
  // Un signalement est affiché : le filtre reprend d'emblée sa valeur (« même catégorie »)
  const champ = champDe(f);
  if (champ && etatSaisie.dossierId && etatSaisie.initiale) {
    const vs = valeursDossier(etatSaisie.initiale, champ);
    if (vs.length)
      vs.forEach((x) => {
        f.valeurs.push(x.cle);
        f.libelles[x.cle] = x.libelle;
      });
    else f.valeurs.push(VIDE_FILTRE);
  }
  etatSaisie.filtres.push(f);
  $("filtre-ajout").blur();
  appliquerFiltre();
  const b = document.querySelector(`.puce-libelle[data-i="${etatSaisie.filtres.length - 1}"]`);
  if (!f.valeurs.length) ouvrirPanneauFiltre(f, b);
  else if (b) b.focus();
});
$("filtre-tout-effacer").addEventListener("click", () => {
  fermerPanneauFiltre(false);
  etatSaisie.filtres = [];
  appliquerFiltre();
  $("filtre-ajout").focus();
});
// Voisins du signalement affiché ; s'il ne fait pas (ou plus) partie de la liste, ceux de la place qu'il occupait
function voisins(liste, i) {
  if (i >= 0) return [liste[i - 1] || null, liste[i + 1] || null];
  if (etatSaisie.posNav == null) return [liste[liste.length - 1] || null, liste[0] || null];
  const k = Math.min(etatSaisie.posNav, liste.length);
  return [liste[k - 1] || null, liste[k] || null];
}
function majNavigation() {
  const liste = dossiersFiltres(),
    i = liste.findIndex((l) => l.id === etatSaisie.dossierId);
  if (i >= 0) etatSaisie.posNav = i;
  $("nav-fiches").hidden = !liste.length || (!etatSaisie.dossierId && !filtreActif());
  $("nav-position").textContent = i >= 0 ? `${i + 1} / ${liste.length}` : `– / ${liste.length}`;
  $("nav-position").title =
    i >= 0 ? "" : etatSaisie.dossierId ? "Le signalement affiché ne correspond pas au filtre" : "";
  const [p, s] = voisins(liste, i);
  $("nav-prec").disabled = !p;
  $("nav-suiv").disabled = !s;
  $("nav-prec").title = p ? `Précédent : ${libelleDossier(p).titre} (touche ←)` : "Début de la liste";
  $("nav-suiv").title = s ? `Suivant : ${libelleDossier(s).titre} (touche →)` : "Fin de la liste";
}
function allerA(sens) {
  const liste = dossiersFiltres(),
    i = liste.findIndex((l) => l.id === etatSaisie.dossierId);
  const cible = voisins(liste, i)[sens < 0 ? 0 : 1];
  if (!cible) return;
  if (
    (etatSaisie.modifie || etatSaisie.modifieVisa) &&
    !confirm("La saisie en cours n'est pas enregistrée. L'abandonner pour ouvrir un autre signalement ?")
  )
    return;
  cacherConfirmation();
  enFile(async () => {
    try {
      await grist.setCursorPos({ rowId: cible.id });
    } catch (_) {}
    await ouvrirDossier(cible.id, true);
  });
}
$("nav-prec").addEventListener("click", () => allerA(-1));
$("nav-suiv").addEventListener("click", () => allerA(1));
document.addEventListener("keydown", (ev) => {
  if (
    (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") ||
    ev.defaultPrevented ||
    ev.ctrlKey ||
    ev.metaKey ||
    ev.altKey ||
    ev.shiftKey
  )
    return;
  const t = ev.target;
  if (
    t &&
    (t.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) ||
      (t.closest && t.closest('[role="tablist"], [role="listbox"], .choix-groupe')))
  )
    return;
  if ($("nav-fiches").hidden || etatSaisie.vue !== "saisie" || menuOuvert() || etatSaisie.filtreOuvert) return;
  ev.preventDefault();
  allerA(ev.key === "ArrowLeft" ? -1 : 1);
});

function afficherOptionsDossiers() {
  const q = sansAccent($("recherche-dossiers").value.trim());
  const visibles = q
    ? dossiersFiltres().filter((l) => {
        const lib = libelleDossier(l);
        return sansAccent(`${lib.titre} ${lib.detail}`).includes(q);
      })
    : dossiersFiltres();
  const courant = etatSaisie.dossiersInit.find((l) => l.id === etatSaisie.dossierId);
  $("options-dossiers").innerHTML =
    `<li role="option" tabindex="-1" data-id="" aria-selected="${!courant}">Nouveau signalement</li>` +
    (visibles.length
      ? visibles
          .map((l) => {
            const lib = libelleDossier(l);
            return `<li role="option" tabindex="-1" data-id="${l.id}" aria-selected="${l.id === etatSaisie.dossierId}"${bandeCouleur(l)}>${esc(lib.titre)}<small>${esc(lib.detail)}</small></li>`;
          })
          .join("")
      : `<li class="vide" style="cursor:default;color:var(--gris)">Aucun signalement ne correspond</li>`);
}
$("recherche-dossiers").addEventListener("input", afficherOptionsDossiers);

function menuOuvert() {
  return $("btn-dossiers").getAttribute("aria-expanded") === "true";
}
function fermerMenuDossiers(rendreFocus) {
  if (!menuOuvert()) return;
  $("liste-dossiers").hidden = true;
  $("btn-dossiers").setAttribute("aria-expanded", "false");
  if (rendreFocus) $("btn-dossiers").focus();
}
const optionsMenu = () => [...$("options-dossiers").querySelectorAll('[role="option"][data-id]')];
function focusOption(i) {
  const opts = optionsMenu();
  if (!opts.length) return;
  opts[Math.max(0, Math.min(i, opts.length - 1))].focus();
}
function ouvrirMenuDossiers(focusPremier) {
  afficherOptionsDossiers();
  $("liste-dossiers").hidden = false;
  $("btn-dossiers").setAttribute("aria-expanded", "true");
  if (!$("recherche-dossiers").hidden) $("recherche-dossiers").focus();
  else if (focusPremier) {
    // Au clavier : focus sur le signalement affiché, sinon sur la première entrée
    const opts = optionsMenu();
    const i = opts.findIndex((o) => o.getAttribute("aria-selected") === "true");
    focusOption(i >= 0 ? i : 0);
  }
}
function choisirOption(li) {
  fermerMenuDossiers(true);
  enFile(async () => {
    const id = li.dataset.id ? +li.dataset.id : null;
    if (!id) {
      await passerEnCreation();
      return;
    }
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {}
    await ouvrirDossier(id, true);
  });
}
// ev.detail === 0 : « clic » produit au clavier (Entrée ou Espace sur le bouton)
$("btn-dossiers").addEventListener("click", (ev) => {
  if (menuOuvert()) fermerMenuDossiers(false);
  else ouvrirMenuDossiers(ev.detail === 0);
});
$("btn-dossiers").addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    ouvrirMenuDossiers(true);
  }
});
$("options-dossiers").addEventListener("click", (ev) => {
  const li = ev.target.closest('[role="option"][data-id]');
  if (li) choisirOption(li);
});
$("options-dossiers").addEventListener("keydown", (ev) => {
  const opts = optionsMenu();
  const i = opts.indexOf(document.activeElement);
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    focusOption(i + 1);
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    if (i <= 0 && !$("recherche-dossiers").hidden) $("recherche-dossiers").focus();
    else focusOption(i - 1);
  } else if (ev.key === "Home") {
    ev.preventDefault();
    focusOption(0);
  } else if (ev.key === "End") {
    ev.preventDefault();
    focusOption(opts.length - 1);
  } else if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    if (i >= 0) choisirOption(opts[i]);
  } else if (ev.key === "Tab") fermerMenuDossiers(false);
});
// Depuis le champ de filtre : flèche bas vers la liste, Entrée ouvre le premier résultat
$("recherche-dossiers").addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    focusOption(0);
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    const premier = optionsMenu().find((o) => o.dataset.id); // premier signalement filtré
    if (premier) choisirOption(premier);
  }
});
document.addEventListener("click", (ev) => {
  if (!$("menu-dossiers").contains(ev.target)) fermerMenuDossiers(false);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && menuOuvert()) {
    ev.preventDefault();
    fermerMenuDossiers(true);
  }
});

/* PRISME — widget de saisie, module 17/31 : Menu et recherche des signalements.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
// Menu des signalements, dessiné par le widget. Il rend la sélection possible sans « Sélectionner par » :
// un widget lié est recouvert par Grist dès qu'aucune ligne n'est sélectionnée, ce qui empêcherait
// toute création quand la vue est vide ou filtrée.
let dossiersInit = [];
function libelleDossier(l) {
  const d = secondes(val(l, "Date")) != null ? dateFr(val(l, "Date"), { ...(metaDate || {}), type: "Date" }) : "";
  const texte = String(val(l, "Description") || "").slice(0, 60);
  const etab = modeEtab ? "" : nomEtabLigne(l);
  return { titre: etab || `Signalement n° ${l.id}`, detail: `${d ? "du " + d + " — " : ""}${texte}` };
}
function majListeDossiers() {
  $("menu-dossiers").hidden = true; // remplacé par la liste de l'accueil
  $("barre-recherche").hidden = false;
  indexRecherche = null; // reconstruit à la prochaine frappe
  cacheDernieres = null;
  const cD = col("Dossier");
  dossiersInit = enregistrements
    .filter((l) => (refId(cD && l[cD]) || l.id) === l.id)
    .filter((l) => !perimetreActif() || dansPerimetre(etabDeLigne(l)))
    .sort((a, b) => (secondes(val(b, "Date")) ?? 0) - (secondes(val(a, "Date")) ?? 0));
  majFiltre();
  if (!$("resultats-signalements").hidden) afficherResultatsRecherche();
  const courant = dossiersInit.find((l) => l.id === dossierId);
  const lib = courant ? libelleDossier(courant) : null;
  $("btn-dossiers").querySelector(".texte").textContent = lib
    ? `${lib.titre} — ${lib.detail}`
    : `${modeEtab ? "Mes signalements" : "Signalements"} (${filtreActif() ? dossiersFiltres().length + " / " : ""}${dossiersInit.length})`;
  $("recherche-dossiers").hidden = dossiersInit.length < 8;
  // Le contenu de la liste n'est construit qu'à l'ouverture du menu : inutile de formater
  // des centaines de libellés à chaque changement de signalement.
  if ($("btn-dossiers").getAttribute("aria-expanded") === "true") afficherOptionsDossiers();
  if (vue === "accueil") afficherCartes();
  afficherBandeauPerimetre();
}
/* ---------- Barre de recherche des signalements ----------
   Cherche dans tous les dossiers visibles : établissement, commune, UAI, académie, n° de dossier, et le texte
   de la version initiale comme de la dernière version. Tous les mots tapés doivent être présents (sans accents). */
let indexRecherche = null;
function construireIndexRecherche() {
  const cD = col("Dossier"),
    dernieres = new Map();
  for (const l of enregistrements) {
    const d = refId(cD && l[cD]) || l.id,
      p = dernieres.get(d);
    if (!p || comparerVersions(p, l) < 0) dernieres.set(d, l);
  }
  indexRecherche = dossiersInit.map((l) => {
    const e = etabDeLigne(l) || {},
      der = dernieres.get(l.id) || l;
    const texte = [
      e[E.nom] || texteEtabBrut(l),
      e[E.commune],
      e[E.uai],
      e[E.academie],
      e[E.departement],
      col("Site") ? val(der, "Site") : "",
      `n° ${l.id}`,
      String(l.id),
      val(l, "Description"),
      der !== l ? val(der, "Description") : "",
      listeQualif(val(der, "Qualification")).join(" "),
    ]
      .filter((v) => v != null && typeof v !== "object")
      .join(" ")
      .replace(/\*\*|==/g, "");
    return { l, der, e, cle: sansAccent(texte) };
  });
}
function surligneMots(txt, mots) {
  // repérage sans accents, sur le texte d'origine (même longueur une fois normalisé), puis échappement morceau par morceau
  const brut = String(txt ?? "").normalize("NFC"),
    norm = [...brut].map((c) => sansAccent(c) || c).join("");
  if (norm.length !== brut.length) return esc(brut);
  const marques = new Array(brut.length).fill(false);
  for (const m of mots) {
    if (m.length < 2) continue;
    let i = norm.indexOf(m);
    while (i >= 0) {
      for (let k = i; k < i + m.length; k++) marques[k] = true;
      i = norm.indexOf(m, i + m.length);
    }
  }
  let h = "",
    dans = false;
  for (let k = 0; k < brut.length; k++) {
    if (marques[k] !== dans) {
      h += marques[k] ? "<mark>" : "</mark>";
      dans = marques[k];
    }
    h += esc(brut[k]);
  }
  return h + (dans ? "</mark>" : "");
}
function afficherResultatsRecherche() {
  nbCartes = 30;
  afficherCartes();
}
function fermerRecherche() {
  $("resultats-signalements").hidden = true;
  $("recherche-signalements").setAttribute("aria-expanded", "false");
}
function ouvrirResultat(li) {
  const id = +li.dataset.id;
  if (!id) return;
  fermerRecherche();
  $("recherche-signalements").value = "";
  enFile(async () => {
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {}
    await ouvrirDossier(id, true);
  });
}
$("recherche-signalements").addEventListener("input", afficherResultatsRecherche);
$("recherche-signalements").addEventListener("focus", () => {
  fermerPanneauFiltre(false);
  afficherResultatsRecherche();
});
$("recherche-signalements").addEventListener("keydown", (ev) => {
  const premiere = $("cartes-signalements").querySelector(".carte-sig");
  if (ev.key === "ArrowDown") {
    if (premiere) {
      ev.preventDefault();
      premiere.focus();
    }
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    if (premiere) ouvrirDepuisListe(+premiere.dataset.id);
  } else if (ev.key === "Escape" && $("recherche-signalements").value) {
    ev.preventDefault();
    $("recherche-signalements").value = "";
    afficherResultatsRecherche();
  }
});
$("resultats-signalements").addEventListener("mousedown", (ev) => {
  const li = ev.target.closest('[role="option"]');
  if (li) {
    ev.preventDefault();
    ouvrirResultat(li);
  }
});
$("recherche-signalements").addEventListener("blur", () => setTimeout(fermerRecherche, 150));
// Raccourci : « / » place le curseur dans la barre de recherche (hors saisie en cours)
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const t = ev.target,
    saisie = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (saisie || $("barre-recherche").hidden || vue !== "accueil") return;
  ev.preventDefault();
  $("recherche-signalements").focus();
});

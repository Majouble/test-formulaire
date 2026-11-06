/* PRISME — widget de saisie, module 23/31 : Formulaire par site (enseignement supérieur).
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Formulaire par site (enseignement supérieur) ----------
   Tableau des sites (réglage « sites » d'une question tableau) : chaque ligne est un site, avec sa qualification.
   - Reprise (2.50) : les sites du dossier de l'établissement mis à jour le plus récemment (jours antérieurs), dans sa
     dernière version, et eux seuls ; ceux revenus à la normale sont repris pour mémoire (sauf réglage contraire).
     Un site ne se retire pas d'un dossier : il passe en RAS (bouton « RAS » à la place de la suppression, pour les sites
     du dossier et les sites repris). Site saisi à tort : bouton « Supprimer » (🗑), qui l'efface de toutes les étapes
     du dossier à l'enregistrement (purgerSitesSupprimes).
   - Qualification de l'établissement : en bas du formulaire, déduite du site le plus grave (ordre des choix de la
     colonne Qualification, du plus grave au moins grave) ; contrôle de cohérence avant l'enregistrement. */
const sitesCtrl = () => controleursTableau("q").find((c) => c.sites && c.pret) || null;
const formulaireParSite = () => defsQuestions.some((d) => d.tableau && d.tableau.sites);
// reprise du dernier état des sites (réglage du tableau des sites) : "auto", "bouton" ou "non" (par défaut)
const modeRepriseSites = () => {
  const d = defsQuestions.find((x) => x.tableau && x.tableau.sites);
  if (!d) return null;
  const r = d.tableau.sites.reprise;
  return r === true || r === "auto" ? "auto" : r === "bouton" ? "bouton" : "non";
};
const retourNormale = () =>
  new Set(
    (socleGeneral.retour_normale && socleGeneral.retour_normale.length ? socleGeneral.retour_normale : ["RAS"]).map(
      (x) => String(x).trim().toUpperCase(),
    ),
  );
// rang de gravité d'une qualification : 0 = la plus grave (premier choix) ; retour à la normale en dernier
function rangGravite(q) {
  if (!q) return 1e9;
  if (retourNormale().has(String(q).trim().toUpperCase())) return 1e6;
  const i = choix.indexOf(q);
  return i < 0 ? 5e5 : i;
}
const plusGrave = (liste) => [...liste].filter(Boolean).sort((a, b) => rangGravite(a) - rangGravite(b))[0] || null;
const texteQualifSite = (v) => listeQualif(v).join(", ");
/* Sites à reprendre pour un nouveau signalement (2.50) : ceux du dossier de l'établissement mis à jour le plus récemment,
   dans sa dernière version, et eux seuls (un site absent de ce dossier, signalé plus tôt dans un autre, n'est plus repris).
   dossierChoisi : signalement précis choisi par l'agent (« Reprendre » dans la proposition). */
function dernierEtatSites(c, etabId, avecRas, dossierChoisi = null) {
  const s = c.sites,
    cD = col("Dossier"),
    jour = jourDuFormulaire(),
    limite = col("Date_faits") && lireDateFaits() != null ? lireDateFaits() : Date.now() / 1000;
  const versions = enregistrements.filter(
    (l) =>
      refId(val(l, "Etablissement")) === etabId &&
      jourDeLaVersion(l) !== jour &&
      (secondes(col("Date_faits") ? val(l, "Date_faits") : val(l, "Date")) ?? 0) < limite + 86400,
  );
  const parDossier = new Map();
  versions.forEach((l) => {
    const d = refId(cD && l[cD]) || l.id;
    if (!parDossier.has(d)) parDossier.set(d, []);
    parDossier.get(d).push(l);
  });
  // lignes d'une version : la question elle-même, puis les questions des formulaires précédents (historique)
  const lignesDe = (l) => {
    const res = lireTableauJson(l[c.def.colId]).map((o) => {
      const { _id, ...v } = o;
      return v;
    });
    for (const h of s.historique) for (const o of lireTableauJson(l[h.colonne])) res.push(c.vueHistorique(h, o));
    return res;
  };
  const quandDe = (l) => secondes(val(l, "Date")) ?? secondes(col("Date_faits") ? val(l, "Date_faits") : null);
  // dossier le plus récemment mis à jour (date de saisie de sa version la plus récente), puis sa dernière version
  let choisi = null;
  for (const [d, ls] of parDossier) {
    if (dossierChoisi && d !== dossierChoisi) continue; // signalement choisi dans la proposition de reprise
    const maj = Math.max(...ls.map((l) => quandDe(l) ?? 0)),
      der = [...ls].sort(comparerVersions).pop(),
      id = Math.max(...ls.map((l) => l.id));
    if (!choisi || maj > choisi.maj || (maj === choisi.maj && id > choisi.id)) choisi = { maj, der, id };
  }
  if (!choisi) return [];
  const der = choisi.der,
    quand = quandDe(der),
    dernier = new Map();
  for (const v of lignesDe(der)) {
    const k = c.cleSite(etabId, v);
    if (k) dernier.set(k, { cle: k, valeurs: v, qualif: s.qualif ? texteQualifSite(v[s.qualif]) : "", quand });
  }
  const retour = retourNormale();
  const normal = (e) => !!e.qualif && listeQualif(e.qualif).every((q) => retour.has(String(q).trim().toUpperCase()));
  // site désactivé depuis au référentiel (fermé, fusionné) : plus repris s'il est revenu à la normale
  const dSite = s.site && c.sousDefs.find((d) => d.colId === s.site),
    inactif = (e) => !!(dSite && dSite._inactifs && e.cle.startsWith("s") && dSite._inactifs.has(+e.cle.slice(1)));
  return [...dernier.values()]
    .filter((e) => (avecRas || !normal(e)) && !(inactif(e) && normal(e)))
    .map((e) => ({ ...e, normal: normal(e) }));
}
// préremplit le tableau des sites ; renvoie le nombre de sites repris
function reprendreEtatSites(c, etabId, avecRas = c.sites.avecRas !== false, dossier = null) {
  const etats = dernierEtatSites(c, etabId, avecRas, dossier),
    s = c.sites;
  c.retires = [];
  c.supprimes = [];
  c.lignes = etats.map((e) => {
    const v = {};
    for (const d of c.sousDefs)
      if (!d.confidentiel && !videSous(e.valeurs[d.colId]))
        v[d.colId] = Array.isArray(e.valeurs[d.colId]) ? [...e.valeurs[d.colId]] : e.valeurs[d.colId];
    if (s.site && e.cle.startsWith("s") && !refId(v[s.site])) {
      v[s.site] = +e.cle.slice(1);
      if (s.libre) delete v[s.libre];
    } // libellé rattaché au référentiel
    // site revenu à la normale : repris pour mémoire (une ligne par site connu), sans confirmation à donner
    return {
      _id: nouvelIdLigne(),
      valeurs: v,
      _fixe: true,
      _repris: { qualif: e.qualif, quand: e.quand, etat: e.normal ? "normal" : "a_confirmer" },
    };
  });
  c.lignes.forEach((l) => c.initAuto(l));
  c.dessiner();
  return etats.length;
}
/* « Une ligne par site connu » : nouveau dossier d'un établissement déjà signalé, le tableau des sites se remplit seul
   du dernier état connu de chaque site (sites revenus à la normale compris, sauf réglage contraire). Reprise
   réglable (reglages.tableau.sites.reprise) : "auto", "bouton" (proposée par un bouton), "non" (désactivée, par défaut :
   le tableau part vide, rien n'est proposé ; une reprise d'un signalement précédent ne reprend pas les sites). Refait si
   l'établissement change tant qu'aucune ligne n'a été touchée. */
let sitesAutoPour = null;
function reprendreSitesAuto() {
  const c = sitesCtrl();
  if (!c || dossierId || !etabCourant || modeEtab) return;
  const e = etabCourant.id;
  if (sitesAutoPour === e) return;
  const intactes = c.lignes.every(
    (l) => c.ligneVide(l) || (l._repris && !["modifie", "confirme"].includes(l._repris.etat)),
  );
  if (!intactes) return;
  sitesAutoPour = e;
  if (c.sites.reprise === "non") {
    c.offreReprise = null;
    c.noteAuto = "";
    return;
  }
  if (c.sites.reprise === "bouton") {
    // reprise automatique désactivée (administration) : le tableau reste vide, la reprise est proposée par un bouton
    const nb = dernierEtatSites(c, e, c.sites.avecRas).length;
    c.offreReprise = nb ? { etab: e, n: nb } : null;
    c.dessiner();
    return;
  }
  const n = reprendreEtatSites(c, e);
  c.noteAuto = n
    ? `${n} site${n > 1 ? "s" : ""} du dernier signalement de cet établissement, dans leur dernier état : confirmez ou modifiez ceux qui ne sont pas revenus à la normale, ajoutez les nouveaux.`
    : "";
  c.dessiner();
  qualifTouchee = false;
  majQualifDeduite();
}
let qualifTouchee = false;
// qualification en bas (après les sites), et mention de la qualification déduite des sites
function placerQualification() {
  const fs = $("qualifs-initiales").closest("fieldset"),
    enBas = formulaireParSite() && S().qualificationEnBas !== false;
  if (enBas) $("questions").after(fs);
  else $("bloc-date-faits").after(fs);
  fs.classList.toggle("qualif-deduite", enBas);
  let p = $("qualif-sites");
  if (!p) {
    p = document.createElement("p");
    p.id = "qualif-sites";
    p.className = "aide qualif-sites";
    p.setAttribute("aria-live", "polite");
    fs.appendChild(p);
  }
  p.hidden = !enBas;
  if (enBas) majQualifDeduite();
}
function qualifDesSites() {
  const c = sitesCtrl();
  if (!c || !c.sites.qualif) return null;
  const qs = c.lignesValides().flatMap((l) => listeQualif(l.valeurs[c.sites.qualif]));
  return { nb: c.lignesValides().length, plusGrave: plusGrave(qs) };
}
function majQualifDeduite() {
  const p = $("qualif-sites");
  if (!p || p.hidden) return;
  const d = qualifDesSites();
  if (!d || !d.nb) {
    p.textContent = "Déduite des sites : renseignez d'abord les sites et leur qualification.";
    p.classList.remove("alerte-faits");
    return;
  }
  if (d.plusGrave && !qualifTouchee) cocherQualif(qualifMultiple ? [d.plusGrave] : d.plusGrave);
  const actuel = plusGrave(listeQualif(lireQualificationInitiale()));
  const ecart = d.plusGrave && actuel && actuel !== d.plusGrave;
  p.innerHTML = d.plusGrave
    ? `Qualification la plus grave des sites : <strong>${esc(d.plusGrave)}</strong>${ecart ? ` — différente de celle choisie (${esc(actuel)}) : vérifiez avant d'enregistrer. <button type="button" class="lien-texte" id="btn-qualif-sites">Reprendre ${esc(d.plusGrave)}</button>` : qualifTouchee ? "" : " (reprise automatiquement)"}`
    : "Aucun site n'a de qualification.";
  p.classList.toggle("alerte-faits", !!ecart);
  const b = $("btn-qualif-sites");
  if (b)
    b.addEventListener("click", () => {
      qualifTouchee = false;
      majQualifDeduite();
      modifie = true;
    });
}
$("qualifs-initiales").addEventListener("change", () => {
  qualifTouchee = true;
  majQualifDeduite();
});
// avant l'enregistrement : qualification incohérente avec les sites, sites repris ni confirmés ni modifiés
function controleSites() {
  const c = sitesCtrl();
  if (!c) return true;
  const msgs = [],
    d = qualifDesSites(),
    actuel = plusGrave(listeQualif(lireQualificationInitiale()));
  if (d && d.nb && d.plusGrave && actuel !== d.plusGrave)
    msgs.push(
      `La qualification de l'établissement (${actuel || "aucune"}) ne correspond pas à celle du site le plus grave (${d.plusGrave}).`,
    );
  const enAttente = c.lignes.filter((l) => l._repris && l._repris.etat === "a_confirmer" && !c.ligneVide(l)).length;
  if (enAttente)
    msgs.push(
      `${enAttente} site${enAttente > 1 ? "s" : ""} repris du dernier état connu ${enAttente > 1 ? "n'ont été" : "n'a été"} ni confirmé${enAttente > 1 ? "s" : ""} ni modifié${enAttente > 1 ? "s" : ""}.`,
    );
  return !msgs.length || confirm(`${msgs.join("\n\n")}\n\nEnregistrer quand même ?`);
}

/* PRISME — widget de saisie, module 05/31 : État du widget et périmètre de la page (agent, académies, départements).
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   État
   ========================================================= */
let mappings = null,
  signatureMappings = null;
let tableId = null;
let enregistrements = []; // toutes les lignes visibles de la table (valeurs encodées)
let etabs = []; // lignes visibles de la table Etablissements
let colsEtab = [];
let alerteStructure = "";
let modeEtab = false; // true = accès par lien d'établissement
let pageEtab = null; // option « etablissements » : page ouverte par les liens des établissements (référentiel visé)
let referentielLu = false; // le référentiel a été lu (modeEtab est alors connu)
let dossierId = null; // null = création
let versions = [],
  initiale = null,
  derniere = null;
let etabCourant = null; // ligne Etablissements du dossier ou choisie à la création
let selectionAttendue = null; // ligne créée par le widget, à ouvrir dès qu'elle arrive
let modifie = false,
  modifieVisa = false;
let choix = [],
  couleurs = {},
  qualifMultiple = false;
let metaSig = {},
  metaDate = null,
  metaFaits = null;
let defsQuestions = [],
  defsDep = [],
  defsAca = [],
  champsVersion = [];

// Colonne associée dans le panneau de Grist ; à défaut, pour un formulaire de l'administration, la colonne de même nom
let colsParDefaut = {};
const col = (cle) => (mappings && typeof mappings[cle] === "string" ? mappings[cle] : colsParDefaut[cle] || null);
const val = (ligne, cle) => (ligne && col(cle) ? ligne[col(cle)] : null);
let indexEtabs = new Map();
let rolesAdmin = {}; // rôle -> colonne associée dans l'administration (formulaire publié)
/* ---------- Périmètre de la page (réglé dans l'administration, « Pages de saisie par agent ») ----------
   perimetre = { colonne du référentiel: [valeurs] } : un établissement en fait partie s'il remplit chaque critère.
   Ancien format : liste d'académies. Le périmètre répartit le travail ; il ne restreint pas l'accès. */
let perimetreBrut = null,
  libellePage = "",
  voirToutPerimetre = false;
/* Planning (Équipe › Planning de l'administration) : pendant un créneau où l'agent de la page est affecté, le périmètre
   du créneau s'applique (vide = tous les établissements). Hors créneau : périmètre des options de la page (vide pour
   les pages créées depuis l'équipe, donc tous les établissements). Relu chaque minute. */
let agentPage = null,
  perimetreFiche = null,
  creneauPage = null; // creneauPage : { creneau, affectation, horsChamp }
// Champ de ce formulaire (EN, ESR) : un agent mobilisé sur l'autre champ pendant le créneau en est averti
const champWidget = () => {
  try {
    return (window.Socle.CHAMPS.find((c) => c.version === S().version) || {}).id || "";
  } catch (_) {
    return "";
  }
};
async function majCreneau(redessiner) {
  if (agentPage == null) {
    creneauPage = null;
    return;
  }
  let pl = null;
  try {
    pl = await window.Socle.lirePlanning(socleGeneral);
  } catch (_) {
    pl = null;
  }
  const enCours = window.Socle.affectationsEnCours(pl, agentPage),
    ch = champWidget();
  // de préférence une affectation qui couvre le champ de ce formulaire
  const dansChamp = enCours.find((e) => !ch || window.Socle.champsDe(e.affectation).includes(ch));
  const x = dansChamp || (enCours[0] ? { ...enCours[0], horsChamp: true } : null);
  const avant = JSON.stringify([creneauPage && creneauPage.affectation.id, perimetreBrut]);
  let p = perimetreFiche;
  if (x && !x.horsChamp) {
    try {
      p = String(x.affectation.perimetre || "").trim() ? JSON.parse(x.affectation.perimetre) : {};
    } catch (_) {
      p = {};
    }
  }
  creneauPage = x;
  perimetreBrut = p;
  await lireEmargementAgent();
  if (redessiner && avant !== JSON.stringify([x && x.affectation.id, perimetreBrut])) {
    afficherBandeauPerimetre();
    majListeDossiers();
  } else if (redessiner) afficherBandeauPerimetre();
}
setInterval(() => {
  if (!document.hidden && agentPage != null) majCreneau(true).catch(() => {});
}, 60000);
/* Émargement (table Emargements du socle) : « Je prends mon service » crée une ligne (agent de la page, créneau en cours,
   heure de début) ; « Je termine » remplit l'heure de fin. L'auteur est noté par Grist (adresse du compte connecté) et,
   avec les règles d'accès du socle, seul l'agent lui-même peut émarger. */
let emargementsDispo = false,
  emargementOuvert = null,
  erreurEmargement = "";
async function lireEmargementAgent() {
  if (agentPage == null) {
    emargementsDispo = false;
    emargementOuvert = null;
    return;
  }
  let l = null;
  try {
    l = await window.Socle.lireEmargements(socleGeneral);
  } catch (_) {
    l = null;
  }
  emargementsDispo = l !== null;
  emargementOuvert = (l || []).filter((e) => e.agent === agentPage && e.debut && !e.fin).pop() || null;
}
function htmlEmargement() {
  if (!emargementsDispo || agentPage == null || modeEtab) return "";
  const depuis = emargementOuvert ? (Date.now() / 1000 - emargementOuvert.debut) / 3600 : 0;
  return (
    ` <span class="emargement${emargementOuvert ? " en-service" : ""}">` +
    (emargementOuvert
      ? `en service depuis ${heureCourte(emargementOuvert.debut)}${depuis > 14 ? " (oubli de fin de service ?)" : ""} <button type="button" class="lien" id="btn-service">Je termine mon service</button>`
      : `<button type="button" class="lien" id="btn-service">Je prends mon service</button>`) +
    (erreurEmargement ? ` <span class="err-emargement">${esc(erreurEmargement)}</span>` : "") +
    `</span>`
  );
}
async function basculerService() {
  const t = window.Socle.general(socleConfig).emargements || "Emargements",
    maintenant = Date.now() / 1000;
  erreurEmargement = "";
  try {
    if (emargementOuvert) await Donnees.ecrire([["UpdateRecord", t, emargementOuvert.id, { Fin: maintenant }]]);
    else
      await Donnees.ecrire([
        [
          "AddRecord",
          t,
          null,
          { Agent: agentPage, Creneau: (creneauPage && creneauPage.creneau.id) || 0, Debut: maintenant },
        ],
      ]);
  } catch (e) {
    erreurEmargement = /ACL|access|accès|denied|refus/i.test(String((e && e.message) || e))
      ? `émargement refusé : seul ${libellePage || "l'agent de cette page"} peut émarger ici, avec son propre compte`
      : `émargement impossible (${e.message || e})`;
  }
  await lireEmargementAgent();
  afficherBandeauPerimetre();
}
const heureCourte = (sec) => {
  const p = Outils.dates.parties(sec);
  return `${p.heures} h${p.minutes ? ` ${String(p.minutes).padStart(2, "0")}` : ""}`;
};
function texteCreneau() {
  if (agentPage == null) return "";
  if (!creneauPage) return "hors créneau";
  const c = creneauPage.creneau,
    a = creneauPage.affectation;
  return (
    `${c.nom} ${heureCourte(c.debut)}–${heureCourte(c.fin)}${a.fonction ? `, ${a.fonction.toLowerCase()}` : ""}` +
    (creneauPage.horsChamp ? ` ${window.Socle.champsDe(a).join(" et ")} (pas ${champWidget()} sur ce créneau)` : "")
  );
}
function perimetre() {
  if (modeEtab || !perimetreBrut) return {};
  const p = Array.isArray(perimetreBrut)
    ? perimetreBrut.length
      ? { [E.academie]: perimetreBrut }
      : {}
    : perimetreBrut;
  return Object.fromEntries(
    Object.entries(p || {}).filter(([c, v]) => Array.isArray(v) && v.length && (!etabs.length || colsEtab.includes(c))),
  );
}
const perimetreActif = () => !voirToutPerimetre && Object.keys(perimetre()).length > 0;
function dansPerimetre(e) {
  if (!e) return true; // établissement inconnu du référentiel : jamais masqué
  for (const [c, vals] of Object.entries(perimetre())) {
    const v = e[c];
    if (!vals.some((x) => sansAccent(String(x)) === sansAccent(String(v ?? "").trim()))) return false;
  }
  return true;
}
const resumePerimetre = () =>
  Object.values(perimetre())
    .map((v) => v.join(", "))
    .join(" – ");
function afficherBandeauPerimetre() {
  const b = $("bandeau-perimetre");
  if (!b) return;
  const r = resumePerimetre();
  if (modeEtab || (!r && !libellePage)) {
    b.hidden = true;
    return;
  }
  b.hidden = false;
  const cr = texteCreneau(),
    propre = creneauPage && !creneauPage.horsChamp && String(creneauPage.affectation.perimetre || "").trim();
  b.innerHTML =
    [
      libellePage ? `<strong>${esc(libellePage)}</strong>` : "",
      cr ? esc(cr) : "",
      r
        ? `${propre ? "périmètre du créneau" : "périmètre"} : ${esc(r)}`
        : agentPage != null
          ? "tous les établissements"
          : "",
    ]
      .filter(Boolean)
      .join(" · ") +
    (r
      ? ` <button type="button" class="lien" id="btn-voir-tout">${voirToutPerimetre ? "Revenir à mon périmètre" : "Voir tous les signalements"}</button>`
      : "");
  b.insertAdjacentHTML("beforeend", htmlEmargement());
  const btn = $("btn-voir-tout");
  if (btn)
    btn.addEventListener("click", () => {
      voirToutPerimetre = !voirToutPerimetre;
      afficherBandeauPerimetre();
      majListeDossiers();
    });
  const bs = $("btn-service");
  if (bs) bs.addEventListener("click", basculerService);
}
const etabDe = (id) => indexEtabs.get(id) || null;
/* Établissement d'un signalement. Une cellule en rouge dans Grist (texte qui ne correspond à aucune ligne du référentiel,
   par exemple après conversion d'une colonne texte en référence) arrive sous forme de texte : l'établissement est alors
   retrouvé d'après son nom ou son UAI. */
let indexTexteEtabs = null,
  etabsIndexTexte = null;
const cleTexteEtab = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function etabParTexte(t) {
  if (etabsIndexTexte !== etabs) {
    etabsIndexTexte = etabs;
    indexTexteEtabs = new Map();
    for (const e of etabs)
      for (const c of [E.uai, E.nom]) {
        const k = c && cleTexteEtab(e[c]);
        if (k && !indexTexteEtabs.has(k)) indexTexteEtabs.set(k, e);
      }
  }
  return indexTexteEtabs.get(cleTexteEtab(t)) || null;
}
// Nom provisoire, avant la lecture du référentiel (qui peut prendre plusieurs secondes) : colonne formule de la table
// des réponses qui reprend le nom (« Nom » = $Etablissement.Nom), sinon le texte de la cellule (référence invalide)
let colNomReponses = null;
function trouverColNomReponses() {
  const cE = col("Etablissement");
  colNomReponses = null;
  if (!cE) return;
  const cands = Object.values(metaSig)
    .map((c) => ({
      c,
      m: String(c.texteFormule || "")
        .trim()
        .replace(/^return\s+/, "")
        .match(/^\$(\w+)\.(\w+)$/),
    }))
    .filter((x) => x.c.formule && x.m && x.m[1] === cE && !/^(Ref|RefList|Bool|Int|Numeric|Date)/.test(x.c.type || ""));
  const score = (x) =>
    (x.m[2] === E.nom ? 4 : 0) +
    (/^(nom|appellation|denomination|libelle|etablissement)/.test(normColonne(x.m[2])) ? 2 : 0) +
    (/^(nom|etablissement)/.test(normColonne(`${x.c.colId}`)) ? 1 : 0) -
    (/uai|commune|academ|depart|type|mail|lien|uuid|region/.test(normColonne(x.m[2])) ? 5 : 0);
  const meilleur = cands.sort((a, b) => score(b) - score(a))[0];
  if (meilleur && score(meilleur) > 0) colNomReponses = meilleur.c.colId;
}
const texteEtabBrut = (l) => {
  const n = colNomReponses && l ? l[colNomReponses] : null;
  if (typeof n === "string" && n.trim()) return n.trim();
  const v = val(l, "Etablissement");
  return typeof v === "string" && v.trim() ? v.trim() : "";
};
const etabDeLigne = (l) => {
  const v = val(l, "Etablissement"),
    id = refId(v);
  return id ? etabDe(id) : typeof v === "string" ? etabParTexte(v) : null;
};
// nom affiché d'un signalement : établissement du référentiel, sinon le texte saisi dans la cellule
const nomEtabLigne = (l) => (etabDeLigne(l) || {})[E.nom] || texteEtabBrut(l);

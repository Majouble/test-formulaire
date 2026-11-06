/* PRISME — widget de saisie, module 07/31 : Formulaires construits dans l'administration : socle, rôles des colonnes, questions.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Formulaires construits dans le widget d'administration (table « Formulaires »)
   ---------------------------------------------------------
   Une ligne par formulaire : Nom, Table, Brouillon (JSON), Publie (JSON). Le widget de saisie lit la version
   publiée du formulaire choisi pour cette page (réglage ⚙, enregistré avec la page), sinon le premier formulaire
   publié pour sa table. Sans formulaire publié : fonctionnement d'origine (associations « Questions supplémentaires »
   et repères dans les descriptions de colonnes).
   Les réglages de chaque question sont traduits en repères ([si …], [couleur …], * …) : tout le moteur existant s'applique.
   ========================================================= */
let TABLE_FORMULAIRES = "Formulaires"; // remplacé par la clé « general » de Config
/* ---------- Socle v2 : Config, tables et règles communes ---------- */
let socleConfig = null,
  socleGeneral = { ...window.Socle.DEFAUTS_GENERAL };
async function lireSocleSaisie() {
  try {
    socleConfig = await window.Socle.lireConfig();
  } catch (_) {
    socleConfig = null;
  }
  socleGeneral = window.Socle.general(socleConfig);
  TABLE_FORMULAIRES = socleGeneral.formulaires || "Formulaires";
}
// Réglages communs du widget (description automatique, table du référentiel) : clé « resume_auto » de Config,
// sinon l'ancienne table Parametres (documents pas encore installés)
const reglagesDansConfig = () => !!socleConfig;
let formulaireActif = null,
  signatureFormulaire = "",
  decorsQ = { avant: {}, fin: [] },
  formulairesDispo = [];
let dernierControleFormulaire = 0;
async function lireFormulaires() {
  try {
    const t = await Donnees.lire(TABLE_FORMULAIRES);
    return t.id.map((id, i) => ({
      id,
      nom: String(t.Nom ? (t.Nom[i] ?? "") : ""),
      table: String(t.Table ? (t.Table[i] ?? "") : ""),
      publie: t.Publie ? t.Publie[i] : null,
    }));
  } catch (_) {
    return [];
  }
}
async function choisirFormulaire() {
  formulairesDispo = (await lireFormulaires()).filter((f) => f.table === tableId);
  let voulu = null;
  try {
    voulu = grist.getOption ? await grist.getOption("formulaire") : null;
  } catch (_) {}
  try {
    versionPage = grist.getOption ? await grist.getOption("version") : null;
  } catch (_) {
    versionPage = null;
  }
  try {
    perimetreBrut = grist.getOption ? await grist.getOption("perimetre") : null;
  } catch (_) {
    perimetreBrut = null;
  }
  try {
    libellePage = grist.getOption ? (await grist.getOption("libelle")) || "" : "";
  } catch (_) {
    libellePage = "";
  }
  try {
    agentPage = grist.getOption ? await grist.getOption("agent") : null;
  } catch (_) {
    agentPage = null;
  }
  try {
    pageEtab = grist.getOption ? (await grist.getOption("etablissements")) || null : null;
  } catch (_) {
    pageEtab = null;
  }
  majAlertePageEtab();
  if (agentPage != null && typeof agentPage !== "number") agentPage = Number(agentPage) || null;
  perimetreFiche = perimetreBrut;
  const publies = formulairesDispo.filter((f) => typeof f.publie === "string" && f.publie.trim());
  const f = (voulu && publies.find((x) => x.nom === voulu)) || publies[0] || null;
  let conf = null;
  if (f) {
    try {
      conf = JSON.parse(f.publie);
    } catch (_) {
      conf = null;
    }
  }
  formulaireActif = f && conf && Array.isArray(conf.blocs) ? { ...f, conf } : null;
  signatureFormulaire = f ? `${f.nom}|${f.publie}` : "";
  await majCreneau(false);
  return formulaireActif;
}
// Réglages d'une question → repères de description (même syntaxe que la saisie manuelle)
function reperesDepuisReglages(r) {
  const p = [];
  if (r.obligatoire) p.push("*");
  const c = r.condition;
  if (c && c.ref) {
    const vals = (c.valeurs || []).join(", ");
    if (c.op === "rempli") p.push(`[si ${c.ref} n'est pas vide]`);
    else if (c.op === "vide") p.push(`[si ${c.ref} est vide]`);
    else if (vals) p.push(`[si ${c.ref} ${c.op || "="} ${vals}]`);
  }
  if (r.affichage === "liste") p.push("[liste]");
  if (r.affichage === "boutons") p.push("[boutons]");
  if (r.affichage === "case") p.push("[case]");
  if (r.min != null && r.min !== "") p.push(`[min ${r.min}]`);
  if (r.max != null && r.max !== "") p.push(`[max ${r.max}]`);
  if (r.confidentiel) p.push("[confidentiel]");
  if (r.tableau && r.tableau.table)
    p.push(`[tableau ${r.tableau.table}${r.tableau.lignes ? " lignes=" + r.tableau.lignes : ""}]`);
  if (r.couleur === "choix") p.push("[couleur]");
  else if (Array.isArray(r.couleur) && r.couleur.length)
    p.push(
      `[couleur ${r.couleur
        .filter((x) => x && x.cle && x.couleur)
        .map((x) => `${x.cle}=${x.couleur}`)
        .join(", ")}]`,
    );
  if (r.aide) p.push(r.aide);
  return p.join(" ");
}
function defDepuisBloc(b) {
  const meta = metaSig[b.colonne];
  if (!meta) return null;
  const r = b.reglages || {};
  const def = avecRegles({ ...meta, libelle: r.libelle || meta.libelle, description: reperesDepuisReglages(r) });
  def.court = !!r.court;
  if (def.tableau && r.tableau && r.tableau.sites) def.tableau.sites = r.tableau.sites; // tableau des sites (formulaire par site)
  if (r.format && r.format !== "defaut") def.formatDescription = r.format;
  // pièces jointes compatibles avec les liens d'établissement : colonne Pièces jointes en formule, calculée à partir
  // d'une colonne texte d'envoi (« numéro:empreinte ») que le formulaire remplit (voir PJ)
  if (typeBase(def.type) === "Attachments" && def.formule) {
    const m = /\(\$(\w+) or ""\)\.split\(\)/.exec(def.texteFormule || "");
    if (m && metaSig[m[1]]) {
      def.pjEnvoi = m[1];
      def.formule = false;
    }
  }
  def.depuisFormulaire = true;
  return def;
}
// Parties du formulaire : { id, nom, role: q | vd | va, titre (affiché en tête de partie) }
const PARTIES_DEFAUT = [
  { id: "q", nom: "Signalement", role: "q" },
  { id: "vd", nom: "Visa départemental", role: "vd" },
  { id: "va", nom: "Visa académique", role: "va" },
];
const partiesDe = (conf) =>
  conf && Array.isArray(conf.parties) && conf.parties.length ? conf.parties : PARTIES_DEFAUT;
const NOMS_VISA = {};
function appliquerNomsParties() {
  for (const [role, id] of [
    ["vd", "form-visa-dep"],
    ["va", "form-visa-aca"],
  ]) {
    const f = $(id);
    if (!f) continue;
    const h = f.querySelector("h2"),
      btn = f.querySelector('button[type="submit"]');
    if (!NOMS_VISA[role]) NOMS_VISA[role] = { titre: h.textContent, bouton: btn.textContent };
    const p = formulaireActif ? partiesDe(formulaireActif.conf).find((x) => x.role === role) : null;
    h.textContent = p && p.nom ? p.nom : NOMS_VISA[role].titre;
    btn.textContent = p && p.nom ? `Enregistrer : ${p.nom}` : NOMS_VISA[role].bouton;
  }
}
// Questions d'une section (q, vd, va) selon le formulaire publié ; null = pas de formulaire
function defsDepuisFormulaire(section, cleMapping, alertes) {
  if (!formulaireActif) return null;
  const parties = partiesDe(formulaireActif.conf).filter((p) => p.role === section);
  const roleDe = (b) => (partiesDe(formulaireActif.conf).find((p) => p.id === (b.section || "q")) || {}).role || "q";
  const blocs = [];
  for (const p of parties) {
    const dans = formulaireActif.conf.blocs.filter((b) => (b.section || "q") === p.id && roleDe(b) === section);
    if (section === "q" && p.titre && p.nom) blocs.push({ genre: "titre", texte: p.nom });
    blocs.push(...dans);
  }
  let defs = [];
  const decors = { avant: {}, fin: [] };
  let enAttente = [];
  for (const b of blocs) {
    if (b.genre === "titre" || b.genre === "info") {
      enAttente.push(b);
      continue;
    }
    const def = defDepuisBloc(b);
    if (!def) {
      alertes.push(
        `Formulaire « ${formulaireActif.nom} » : la colonne « ${b.colonne} » n'existe plus dans la table ${tableId}.`,
      );
      continue;
    }
    if (enAttente.length) {
      decors.avant[def.colId] = enAttente;
      enAttente = [];
    }
    defs.push(def);
  }
  decors.fin = enAttente;
  // Association « Questions supplémentaires » remplie sur cette page : seulement ces questions, dans cet ordre
  const restreint =
    mappings && Array.isArray(mappings[cleMapping]) && mappings[cleMapping].length ? mappings[cleMapping] : null;
  if (restreint) {
    defs = restreint
      .map((c) => defs.find((d) => d.colId === c) || (metaSig[c] ? avecRegles(metaSig[c]) : null))
      .filter(Boolean);
    decors.avant = {};
    decors.fin = [];
  }
  if (section === "q") decorsQ = decors;
  return defs;
}
function decorHtml(b) {
  return b.genre === "titre"
    ? `<h3 class="titre-section">${esc(b.texte || "")}</h3>`
    : `<p class="info-formulaire">${esc(b.texte || "").replace(/\n/g, "<br>")}</p>`;
}
// Publication d'une nouvelle version pendant que le widget est ouvert : relue au plus toutes les 30 s
async function verifierFormulairePublie() {
  if (!tableId || Date.now() - dernierControleFormulaire < 30000 || modifie || modifieVisa) return;
  dernierControleFormulaire = Date.now();
  const avant = signatureFormulaire;
  const liste = (await lireFormulaires()).filter((f) => f.table === tableId);
  let voulu = null;
  try {
    voulu = grist.getOption ? await grist.getOption("formulaire") : null;
  } catch (_) {}
  const publies = liste.filter((f) => typeof f.publie === "string" && f.publie.trim());
  const f = (voulu && publies.find((x) => x.nom === voulu)) || publies[0] || null;
  const sig = f ? `${f.nom}|${f.publie}` : "";
  if (sig !== avant)
    enFile(async () => {
      await chargerConfiguration();
      await rafraichir();
    });
}

// Contrôle régulier : une publication modifie la table Formulaires, qui n'envoie aucun signal au widget
// (seule la table liée en envoie). Le widget la relit donc toutes les 30 secondes environ, et dès que
// la page redevient visible ; jamais pendant une saisie en cours (voir verifierFormulairePublie).
setInterval(() => {
  if (!document.hidden) verifierFormulairePublie().catch(() => {});
}, 31000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) verifierFormulairePublie().catch(() => {});
});

/* ---------- Rôles des colonnes de la table des réponses ----------
   Sans association dans le panneau de Grist, chaque rôle (établissement, dossier, date des faits…) prend la colonne
   du même identifiant, sinon une colonne d'identifiant ou de libellé approchant et de type compatible :
   « Etablissement_ESR » (référence), « Date des faits », « Qualification du signalement »… */
const ROLES_SIGNALEMENT = [
  ["Dossier", [/(^|_)dossier(_|$)/, /signalement_?initial/], (c, t) => c.type === `Ref:${t}`],
  [
    "Etablissement",
    [/etablissement/, /(^|_)etab(_|$)/, /structure|universite|ecole|college|lycee/],
    (c, t) => /^Ref:/.test(c.type) && c.type !== `Ref:${t}`,
  ],
  ["Date_faits", [/faits?(_|$)/, /date_?(de_?l_?)?evenement/], (c) => /^(Date|DateTime)/.test(c.type) && !c.formule],
  [
    "Date",
    [/^date_?(de_?)?(saisie|creation|version)/, /cree_?le|horodat|creation/, /^date$/],
    (c) => /^(DateTime|Date)/.test(c.type),
  ],
  [
    "Qualification",
    [/qualif/, /categorie_?(du_?)?(signalement|evenement)/, /type_?(d_?)?evenement/],
    (c) => /^(Choice|ChoiceList|Text)/.test(c.type) && !c.formule,
  ],
  [
    "Description",
    [/^description/, /description/, /recit|resume_?des_?faits/],
    (c) => /^Text/.test(c.type) && !c.formule,
  ],
  [
    "Nature",
    [/^nature$/, /nature_?(du_?)?(signalement|version|saisie)/],
    (c) => /^(Choice|Text)/.test(c.type) && !c.formule,
  ],
  ["Commentaire", [/^commentaire/, /commentaire/], (c) => /^Text/.test(c.type) && !c.formule],
  ["Auteur", [/^auteur/, /saisi_?par|redacteur|createur/], () => true],
  ["Site", [/^site/, /batiment|campus/], (c) => /^(Text|Choice)/.test(c.type) && !c.formule],
  ["Clos", [/^clos/, /cloture|termine/], (c) => c.type === "Bool" && !c.formule],
];
// Cellule renseignée (une référence vide arrive sous la forme ["R", table, 0])
const celluleRemplie = (v) =>
  v != null &&
  v !== "" &&
  v !== 0 &&
  v !== false &&
  !(Array.isArray(v) && (v[0] === "L" ? v.length <= 1 : v[0] === "R" ? !v[2] : !v.length));
function reconnaitreColonnesSignalement(meta, tid = tableId, lignes = enregistrements) {
  const res = {},
    pris = new Set(),
    cols = Object.values(meta || {}).filter(
      (c) => c && c.colId && c.colId !== "id" && c.colId !== "manualSort" && !c.colId.startsWith("gristHelper"),
    );
  const noms = (c) => [normColonne(c.colId), normColonne(c.libelle)].filter(Boolean);
  const remplie = (colId) => (lignes || []).some((l) => celluleRemplie(l[colId]));
  // colonnes des questions du formulaire publié (tableau « Détail des sites »…) : jamais prises pour un rôle par approximation
  const questions = new Set(
    formulaireActif && tid === tableId ? (formulaireActif.conf.blocs || []).map((b) => b.colonne).filter(Boolean) : [],
  );
  // 1) identifiant exact et type compatible ; 2) identifiant ou libellé approchant (premier motif qui trouve une colonne,
  //    la colonne remplie d'abord). Une colonne d'identifiant exact mais entièrement vide, ajoutée après coup alors que
  //    les signalements sont saisis ailleurs (« Etablissement » vide à côté de « Etablissement_ESR »), cède la place à
  //    une colonne approchante remplie.
  const exacts = new Set();
  for (const [role, , ok] of ROLES_SIGNALEMENT) {
    const c = (meta || {})[role];
    if (c && ok(c, tid)) {
      res[role] = role;
      pris.add(role);
      exacts.add(role);
    }
  }
  for (const [role, motifs, ok] of ROLES_SIGNALEMENT) {
    if (res[role] && (!lignes || !lignes.length || remplie(res[role]))) continue;
    let choix = null;
    for (const m of motifs) {
      const cands = cols.filter(
        (c) => !pris.has(c.colId) && !questions.has(c.colId) && ok(c, tid) && noms(c).some((n) => m.test(n)),
      );
      if (!cands.length) continue;
      // date de saisie : la colonne remplie par Grist (NOW()) d'abord
      if (role === "Date")
        cands.sort((a, b) => (/NOW\(\)/.test(b.texteFormule) ? 1 : 0) - (/NOW\(\)/.test(a.texteFormule) ? 1 : 0));
      const pleine = cands.find((c) => remplie(c.colId));
      if (exacts.has(role)) {
        if (pleine) {
          choix = pleine;
          break;
        }
        continue;
      } // n'écarter l'identifiant exact que pour une colonne remplie
      choix = pleine || cands[0];
      break;
    }
    if (choix) {
      if (res[role]) pris.delete(res[role]);
      res[role] = choix.colId;
      pris.add(choix.colId);
    }
  }
  return res;
}

// ⚙ : ce que le widget utilise réellement (utile pour comprendre un affichage inattendu)
const VERSION_WIDGET = `v2 · ${window.Socle.VERSION}`;
function remplirActivite() {
  const A = ACTIVITE,
    min = Math.max(1, (Date.now() - A.debut) / 60000),
    fait = A.envois.filter((e) => e.ms != null);
  const recents = A.envois.filter((e) => Date.now() - e.t < 60000).length,
    dernier = A.envois[A.envois.length - 1];
  const moy = fait.length ? fait.reduce((s, e) => s + e.ms, 0) / fait.length : 0,
    max = fait.reduce((m, e) => Math.max(m, e.ms), 0);
  const ms = (v) => `${Math.round(v)} ms`;
  const lectures = Donnees.compteurs()
    .lectures.map(
      (l) => `<li>${esc(l.table)} : ${l.nombre} fois, ${ms(l.ms / l.nombre)} en moyenne (au plus ${ms(l.max)})</li>`,
    )
    .join("");
  $("cfg-activite").innerHTML =
    `<p style="margin:0 0 4px">Depuis l'ouverture du widget (${Math.round(min)} min) :</p><ul style="margin:0;padding-left:18px">
    <li>Grist a envoyé la table <b>${A.envois.length}</b> fois (${recents} dans la dernière minute, ${(A.envois.length / min).toFixed(1)} par minute en moyenne)${dernier ? `, la dernière fois <b>${dernier.lignes}</b> lignes × ${dernier.colonnes} colonnes` : ""}${A.regroupes ? ` ; ${A.regroupes} envoi(s) rapprochés regroupés` : ""}.</li>
    <li>Traitement de ces envois par le widget : <b>${ms(moy)}</b> en moyenne, au plus ${ms(max)}.</li>
    <li>Ligne sélectionnée renvoyée par Grist : ${A.curseur} fois (${A.curseurIgnores} simples renvois sans effet).</li>
    <li>Tâches longues du widget (plus de 50 ms) : ${A.longues}, ${ms(A.dureeLongues)} au total${A.longues ? ` (${ms(A.dureeLongues / min)} par minute)` : ""}.</li>
    <li>Référentiel : ${referentielDuCache ? `copie conservée dans ce navigateur (lue sur le serveur le ${Outils.dates.dateHeure(referentielDuCache, { dateStyle: "short", timeStyle: "short" })}, relue automatiquement après 24 h) <button type="button" class="lien-texte" id="btn-relire-ref">Relire le référentiel maintenant</button>` : "lu sur le serveur à l'ouverture"}.</li>
    ${sqlRefuse ? `<li>Lecture rapide (SQL) indisponible : ${esc(sqlRefuse)} ; lecture habituelle utilisée.</li>` : ""}
    ${lectures ? `<li>Lectures dans Grist :<ul style="margin:0;padding-left:16px">${lectures}</ul></li>` : ""}</ul>
    <p style="margin:4px 0 0">Si la page est lente alors que ces temps restent faibles, le temps passe dans Grist (préparation et envoi de la table, calcul des formules) plutôt que dans le widget.</p>`;
}
$("btn-activite").addEventListener("click", remplirActivite);
$("cfg-activite").addEventListener("click", async (ev) => {
  if (ev.target.id !== "btn-relire-ref") return;
  ev.target.disabled = true;
  ev.target.textContent = "Lecture en cours…";
  await oublierCacheReferentiel();
  await chargerEtabs(false);
  enFile(async () => {
    indexRecherche = null;
    await rafraichir();
  });
  remplirActivite();
});
function remplirDiagnostic() {
  remplirActivite();
  const LIB = {
    Etablissement: "Établissement",
    Dossier: "Dossier",
    Date_faits: "Date des faits",
    Date: "Date de saisie",
    Qualification: "Qualification",
    Description: "Description",
    Nature: "Nature",
    Commentaire: "Commentaire",
    Auteur: "Auteur",
    Site: "Site / bâtiment",
    Clos: "Clos",
  };
  const rempli = celluleRemplie;
  const ligne = (k) => {
    const c = col(k),
      m = c && metaSig[c],
      origine =
        mappings && typeof mappings[k] === "string"
          ? "associée dans le panneau de Grist"
          : rolesAdmin[k]
            ? "associée dans l'administration"
            : "reconnue d'après son nom";
    // lignes renseignées et exemple de valeur reçue (une référence invalide arrive sous forme de texte, par exemple)
    const vals = c ? enregistrements.map((l) => l[c]).filter(rempli) : [];
    const ex = vals.length ? JSON.stringify(vals[vals.length - 1]).slice(0, 60) : "";
    const refsInvalides = k === "Etablissement" && vals.length ? vals.filter((v) => refId(v) == null).length : 0;
    return `<li>${LIB[k]} : ${
      c
        ? `<b>${esc(c)}</b>${m ? ` <span class="note">(${esc(String(m.type).replace(/^Ref:/, "référence vers "))}, ${origine})</span>` : ""}` +
          ` — renseignée sur ${vals.length} ligne${vals.length > 1 ? "s" : ""} sur ${enregistrements.length}${ex ? `, par exemple ${esc(ex)}` : ""}` +
          (refsInvalides
            ? ` <span style="color:var(--erreur)">· ${refsInvalides} valeur(s) qui ne sont pas des références valides (cellules en rouge dans Grist)</span>`
            : "")
        : `<span style="color:var(--erreur)">non trouvée</span>`
    }</li>`;
  };
  const avec = enregistrements.filter((l) => refId(val(l, "Etablissement")) || texteEtabBrut(l)),
    perdus = avec.filter((l) => !etabDeLigne(l));
  const ecartees = Object.keys(LIB).filter(
    (k) =>
      col(k) &&
      col(k) !== k &&
      metaSig[k] &&
      !(mappings && typeof mappings[k] === "string") &&
      !enregistrements.some((l) => celluleRemplie(l[k])),
  );
  const cE = col("Etablissement"),
    refOk = cE && metaSig[cE] && metaSig[cE].type === `Ref:${ETAB.table}`;
  const aRattacher = refOk ? enregistrements.filter((l) => texteEtabBrut(l) && etabDeLigne(l)) : [];
  const textes = enregistrements.filter((l) => texteEtabBrut(l)).length;
  $("cfg-diagnostic").innerHTML =
    `<p style="margin:0 0 4px">Widget : version du ${esc(VERSION_WIDGET)} · table des réponses <b>${esc(tableId || "?")}</b> · formulaire ${formulaireActif ? `« ${esc(formulaireActif.nom)} » (publié)` : "<b>aucun formulaire publié</b> pour cette table"}.</p>
    <p style="margin:0 0 4px">Référentiel : <b>${esc(ETAB.table)}</b> (${esc(ETAB.origineTable || "table par défaut")}), ${etabs.length} établissement(s) lus${avec.length ? ` ; ${avec.length - perdus.length} signalement(s) sur ${avec.length} y retrouvent leur établissement` : ` ; <span style="color:var(--erreur)">aucune des ${enregistrements.length} ligne(s) reçues par le widget ne porte un établissement valide</span>`}.</p>
    <ul style="margin:0;padding-left:18px">${Object.keys(LIB).map(ligne).join("")}</ul>
    ${ecartees.length ? `<p style="margin:8px 0 4px">Colonne${ecartees.length > 1 ? "s" : ""} ${ecartees.map((k) => `« ${esc(k)} »`).join(", ")} de la table « ${esc(tableId)} » ignorée${ecartees.length > 1 ? "s" : ""} car vide${ecartees.length > 1 ? "s" : ""} : les signalements sont lus dans ${ecartees.map((k) => `« ${esc(col(k))} »`).join(", ")}. Vous pouvez ${ecartees.length > 1 ? "les" : "la"} supprimer dans Grist si personne ne s'en sert.</p>` : ""}
    ${
      textes
        ? `<p style="margin:8px 0 4px">${textes} signalement(s) portent l'établissement sous forme de texte (cellules en rouge dans Grist) : le widget affiche ce texte, mais ces signalements ne sont pas reliés à la fiche de l'établissement (point de situation, filtres).
      ${
        aRattacher.length
          ? `${aRattacher.length} d'entre eux correspondent à un établissement de « ${esc(ETAB.table)} » par leur nom ou leur UAI.</p>
      <button type="button" class="secondaire" id="btn-rattacher-etabs">Rattacher ${aRattacher.length} signalement(s) à leur établissement</button>`
          : refOk
            ? "Aucun ne correspond exactement à un nom ou un UAI du référentiel : corrigez-les dans Grist.</p>"
            : `La colonne « ${esc(cE || "?")} » doit être une référence vers « ${esc(ETAB.table)} » pour les rattacher.</p>`
      }`
        : ""
    }`;
  const b = $("btn-rattacher-etabs");
  if (b)
    b.addEventListener("click", async () => {
      if (
        !confirm(
          `Remplacer le texte de ${aRattacher.length} cellule(s) « ${cE} » par la référence vers l'établissement correspondant de « ${ETAB.table} » ?`,
        )
      )
        return;
      b.disabled = true;
      b.textContent = "Rattachement…";
      try {
        const acts = aRattacher.map((l) => ["UpdateRecord", tableId, l.id, { [cE]: etabDeLigne(l).id }]);
        for (let k = 0; k < acts.length; k += 400) await Donnees.ecrire(acts.slice(k, k + 400));
        b.textContent = `${aRattacher.length} signalement(s) rattachés`;
      } catch (e) {
        b.disabled = false;
        b.textContent = "Réessayer le rattachement";
        alert(`Rattachement impossible : ${e.message || e}`);
      }
    });
}

/* Filet de sécurité : une erreur pendant le chargement ne doit pas laisser un formulaire vide et sans « ⚙ Réglages ».
   Le message est affiché (à transmettre à l'administrateur) et les réglages restent ouverts. */
let erreursChargement = [];
function signalerErreurChargement(e, ou) {
  const msg = `${ou} : ${(e && e.message) || e}${
    e && e.stack
      ? ` [${String(e.stack)
          .split("\n")
          .slice(0, 3)
          .map((x) => x.trim())
          .join(" ← ")}]`
      : ""
  }`;
  console.error("Formulaire :", ou, e);
  if (erreursChargement.includes(msg)) return;
  erreursChargement.push(msg);
  const z = $("alerte");
  if (z) {
    z.textContent = `${z.hidden ? "" : z.textContent + " "}Le formulaire n'a pas pu se charger entièrement (${msg}). Copiez ce message pour l'administrateur du document ; « ⚙ Réglages » reste accessible.`;
    z.hidden = false;
  }
  const b = $("btn-config");
  if (b && !modeEtab) b.hidden = false;
}
window.addEventListener("error", (ev) => {
  if (ev.error && !referentielLu) signalerErreurChargement(ev.error, "erreur");
});
window.addEventListener("unhandledrejection", (ev) => {
  if (!referentielLu) signalerErreurChargement(ev.reason, "erreur");
});
async function chargerConfiguration() {
  try {
    await chargerConfigurationEtapes();
  } catch (e) {
    signalerErreurChargement(e, "chargement de la configuration");
  }
}
async function chargerConfigurationEtapes() {
  const alertes = [];
  await lireSocleSaisie();
  metaSig = {};
  // Toutes les lectures partent en même temps : le temps d'attente est celui de la plus longue,
  // et non plus leur somme. Le référentiel, le plus lourd, est attendu à part (voir plus bas).
  promesseMeta = null;
  lireMeta().catch(() => {});
  const pProfil = chargerProfil();
  const pReglages = chargerReglages();
  try {
    tableId = await grist.getTable().getTableId();
    metaSig = (await metaColonnes(tableId).catch(() => null)) || {};
    if (metaCopie) await completerPjCopie(tableId, metaSig);
    if (!Object.keys(metaSig).length)
      alertes.push(
        "La structure du document n'est pas lisible depuis cette page. Responsable du document : ouvrez l'onglet « Établissements » de l'administration (ou republiez le formulaire) pour la mettre à disposition des liens d'accès.",
      );
    await choisirFormulaire();
    // Aucun formulaire publié pour la table liée : on indique ceux qui existent, et la table à choisir
    if (!formulaireActif) {
      const autres = (await lireFormulaires()).filter(
        (f) => f.table && f.table !== tableId && typeof f.publie === "string" && f.publie.trim(),
      );
      if (autres.length)
        alertes.unshift(
          `Ce widget est relié à la table « ${tableId} », pour laquelle aucun formulaire n'est publié. ` +
            `Formulaire${autres.length > 1 ? "s" : ""} publié${autres.length > 1 ? "s" : ""} : ${autres.map((f) => `« ${f.nom} » (table ${f.table})`).join(", ")}. ` +
            `Dans le panneau de droite de Grist, onglet « Données source », choisissez la table du formulaire voulu.`,
        );
    }
    // Colonnes non associées dans le panneau de Grist : reconnues d'après leur identifiant, leur libellé et leur type
    colsParDefaut = reconnaitreColonnesSignalement(metaSig);
    // Colonnes associées dans l'administration (« Colonnes de la table des réponses ») : elles priment sur la reconnaissance
    rolesAdmin = {};
    const rc = formulaireActif && formulaireActif.conf.roles;
    if (rc && typeof rc === "object") {
      for (const [r, c] of Object.entries(rc)) {
        if (c === "") {
          rolesAdmin[r] = "";
          delete colsParDefaut[r];
        } else if (typeof c === "string" && metaSig[c]) {
          rolesAdmin[r] = c;
          colsParDefaut[r] = c;
        } else if (typeof c === "string")
          alertes.push(
            `La colonne « ${c} » associée dans l'administration des formulaires n'existe plus dans la table « ${tableId} » : choisissez-en une autre (panneau « Formulaire » › « Colonnes de la table des réponses »), puis publiez.`,
          );
      }
      // une colonne associée à un rôle n'en joue pas un autre par reconnaissance
      const imposees = new Set(Object.values(rolesAdmin).filter(Boolean));
      for (const r of Object.keys(colsParDefaut))
        if (!(r in rolesAdmin) && imposees.has(colsParDefaut[r])) delete colsParDefaut[r];
    }
    // Associations du socle (clé « roles » de Config) pour les rôles que le formulaire ne règle pas
    if (tableId === socleGeneral.reponses) {
      const rs = (socleConfig && socleConfig.valeurs.roles && socleConfig.valeurs.roles.reponses) || {};
      for (const [r0, c] of Object.entries(rs)) {
        const r = r0 === "Cree_le" ? "Date" : r0;
        if (r in rolesAdmin || typeof c !== "string" || !metaSig[c]) continue;
        for (const k of Object.keys(colsParDefaut))
          if (k !== r && colsParDefaut[k] === c && !(k in rolesAdmin)) delete colsParDefaut[k];
        colsParDefaut[r] = c;
      }
    }
    trouverColNomReponses();
    // Formulaire de cette table encore jamais publié : le dire plutôt que d'afficher l'ancien fonctionnement sans explication
    if (!formulaireActif) {
      const brouillons = formulairesDispo.filter((f) => !(typeof f.publie === "string" && f.publie.trim()));
      if (brouillons.length) {
        const i = alertes.findIndex((a) => a.startsWith("Ce widget est relié à la table"));
        if (i >= 0) alertes.splice(i, 1);
      }
      if (brouillons.length)
        alertes.unshift(
          `Le formulaire « ${brouillons[0].nom} » de la table « ${tableId} » n'est pas encore publié : publiez-le dans l'administration des formulaires pour qu'il s'affiche ici.`,
        );
    }
    let essentiels = [
      ["Etablissement", "l'établissement (référence vers le référentiel)"],
      ["Description", "la description"],
      ["Qualification", "la qualification"],
    ].filter(([k]) => !col(k));
    if (!col("Etablissement")) {
      const proche = Object.values(metaSig).find(
        (c) => /etablissement|(^|_)etab(_|$)|uai/.test(normColonne(`${c.colId} ${c.libelle}`)) && !/^Ref:/.test(c.type),
      );
      if (proche) essentiels = essentiels.filter(([k]) => k !== "Etablissement");
      if (proche)
        alertes.push(
          `La colonne « ${proche.libelle || proche.colId} » (${proche.colId}) est de type ${String(proche.type).split(":")[0]} : pour relier chaque signalement à son établissement, elle doit être de type Référence vers le référentiel (par exemple Etablissement_ESR). Dans Grist : en-tête de la colonne › Options de la colonne › Type : Référence.`,
        );
    }
    if (essentiels.length)
      alertes.push(
        `Colonne${essentiels.length > 1 ? "s" : ""} introuvable${essentiels.length > 1 ? "s" : ""} dans la table « ${tableId} » : ${essentiels.map((x) => x[1]).join(", ")}. ` +
          `Associez-la${essentiels.length > 1 ? "s" : ""} dans l'administration des formulaires (panneau « Formulaire » › « Colonnes de la table des réponses »), puis publiez.`,
      );
  } catch (e) {
    console.warn("Métadonnées illisibles", e);
  }
  await determinerTableEtab(); // après les rôles : la colonne de l'établissement désigne le référentiel
  const pEtabs = chargerEtabs(true).then(
    () => null,
    (e) => e,
  );

  document.querySelectorAll("[data-libelle]").forEach((el) => {
    if (!el.dataset.defaut) el.dataset.defaut = el.textContent;
    const m = metaSig[col(el.dataset.libelle)];
    el.textContent = (m && m.libelle) || el.dataset.defaut;
  });
  metaDate = metaSig[col("Date")] || null;
  alerteHorloge = "";
  if (col("Date") && metaDate && !dateParGrist())
    alerteHorloge =
      `La date de saisie (« ${metaDate.libelle || col("Date")} ») est fournie par l'horloge de chaque ordinateur : si l'une est déréglée, les dates seront fausses. ` +
      `Donnez-lui plutôt la formule d'initialisation NOW(), appliquée aux nouveaux enregistrements (Grist utilisera l'heure de son serveur).`;
  $("bloc-commentaire").hidden = !(afficherCommentaire() && col("Commentaire"));
  metaFaits = metaSig[col("Date_faits")] || null;
  $("bloc-date-faits").hidden = !col("Date_faits");
  $("bloc-site").hidden = !col("Site");
  appliquerVersion();
  $("date-faits").type = metaFaits && (metaFaits.type || "").startsWith("DateTime") ? "datetime-local" : "date";
  $("bloc-plusieurs-jours").hidden = !(col("Date_faits") && S().plusieursJours && !faitsAvecHeure());
  if (!$("aide-date-faits").dataset.base) $("aide-date-faits").textContent = aideFaitsDefaut();
  const q = metaSig[col("Qualification")];
  choix = (q && q.opts.choices) || [];
  couleurs = (q && q.opts.choiceOptions) || {};
  qualifMultiple = !!(q && (q.type || "").split(":")[0] === "ChoiceList");
  afficherChoix("qualifs-initiales", "qualif-initiale");

  decorsQ = { avant: {}, fin: [] };
  appliquerNomsParties();
  defsQuestions = defsDepuisFormulaire("q", "Questions", alertes) || defsDe("Questions");
  defsDep = defsDepuisFormulaire("vd", "Questions_dep", alertes) || defsDe("Questions_dep");
  if (formulaireParSite()) $("bloc-site").hidden = true; // les sites se saisissent dans le tableau des sites
  defsAca = defsDepuisFormulaire("va", "Questions_aca", alertes) || defsDe("Questions_aca");
  // Champs versionnés : ce dont l'historique retrace l'évolution d'une version à l'autre.
  champsVersion = [];
  if (col("Description") && metaSig[col("Description")])
    champsVersion.push({ ...metaSig[col("Description")], obligatoire: true, aide: "" });
  if (col("Site") && metaSig[col("Site")])
    champsVersion.push({
      ...metaSig[col("Site")],
      libelle: metaSig[col("Site")].libelle || "Site / bâtiment",
      obligatoire: false,
      aide: "",
    });
  // Le type réel (Choice ou ChoiceList) est conservé, pour que le suivi propose le même mode de sélection.
  if (q) champsVersion.push({ ...q, obligatoire: true, aide: "", type: choix.length ? q.type : "Text" });
  defsQuestions.forEach((d) => champsVersion.push(d));
  construireReglesCouleur(alertes);
  restaurerFiltre();

  rendreChamps($("questions"), "q", defsQuestions, () => {
    modifie = true;
  });
  placerQualification();
  appliquerConditions("q", defsQuestions);
  rendreChamps($("champs-dep"), "vd", defsDep, () => {
    modifieVisa = true;
  });
  rendreChamps($("champs-aca"), "va", defsAca, () => {
    modifieVisa = true;
  });
  activerVerdictRapide("vd", defsDep, "statut-dep-rapide");
  activerVerdictRapide("va", defsAca, "statut-aca-rapide");

  await Promise.all([pProfil, pReglages]);
  await chargerProfilViseur();
  lireVeille().then(() => {
    if (vue === "accueil") majBandeauVeille();
  });
  appliquerOptions(optionsParametres);
  appliquerBornes();
  // Conditions qui désignent une colonne introuvable : la question ne pourrait jamais s'afficher
  for (const d of [...defsQuestions, ...defsDep, ...defsAca]) {
    if (d.condition && !resoudreColonne(d.condition.ref, [...defsQuestions, ...defsDep, ...defsAca]))
      alertes.push(
        `La question « ${d.libelle} » dépend de « ${d.condition.ref} », qui ne correspond à aucune colonne (identifiant ou libellé) : elle ne s'affichera jamais.`,
      );
  }
  $("alerte").textContent = alertes.join(" ");
  $("alerte").hidden = !alertes.length;

  // Référentiel : si la lecture est rapide (cas d'un établissement venu par son lien, une seule ligne),
  // on l'attend brièvement pour éviter tout clignotement ; sinon le formulaire s'affiche sans lui
  // et se complète à son arrivée.
  const rapide = await Promise.race([pEtabs.then(() => true), new Promise((r) => setTimeout(() => r(false), 250))]);
  if (rapide) finaliserReferentiel(await pEtabs, alertes);
  else {
    $("sous-titre").textContent = "Chargement du référentiel des établissements…";
    pEtabs.then((err) =>
      enFile(async () => {
        finaliserReferentiel(err, alertes);
        await apresChargementEtabs();
      }),
    );
  }
  if (!dossierId) await passerEnCreation();
  majCouleur();
}

// Table des établissements : 1) choisie dans les réglages ; 2) table visée par la colonne « Établissement »
// associée au widget ; 3) par défaut « Etablissements ».
let alerteTableRef = "";
async function determinerTableEtab() {
  alerteTableRef = "";
  let choisie = null,
    cible = null,
    c = null;
  try {
    const tid = await grist.getTable().getTableId(),
      m = await metaColonnes(tid);
    c = col("Etablissement") || reconnaitreColonnesSignalement(m, tid).Etablissement || null; // sans association : colonne reconnue (Etablissement, Etablissement_ESR…)
    cible = (m && c && m[c] && ((m[c].type || "").match(/^Ref:(.+)$/) || [])[1]) || null;
  } catch (_) {
    /* métadonnées illisibles */
  }
  if (reglagesDansConfig()) {
    const r = socleConfig.valeurs.resume_auto;
    choisie = (r && r[CLE_TABLE_ETAB]) || null;
    if (!choisie && socleGeneral.referentiel && (await metaColonnes(socleGeneral.referentiel).catch(() => null)))
      choisie = socleGeneral.referentiel;
  } else
    try {
      const t = await Donnees.lire(PARAMETRES.table);
      const brut = (t[PARAMETRES.colonne] || [])[0];
      if (typeof brut === "string" && brut.trim()) choisie = JSON.parse(brut)[CLE_TABLE_ETAB] || null;
    } catch (_) {
      /* pas de réglage lisible */
    }
  if (choisie) {
    ETAB.table = choisie;
    ETAB.origineTable = "choisie dans les réglages";
    if (cible && cible !== choisie)
      alerteTableRef =
        `La recherche porte sur la table « ${choisie} », mais la colonne « ${c} » renvoie vers la table « ${cible} » : ` +
        `les signalements seraient rattachés à la mauvaise ligne. Dans Grist, faites pointer la colonne « ${c} » vers « ${choisie} » (type Référence), ou revenez au réglage automatique.`;
    return;
  }
  if (cible) {
    ETAB.table = cible;
    ETAB.origineTable = `table visée par la colonne « ${c} »`;
    return;
  }
  ETAB.table = TABLE_ETAB_DEFAUT;
  ETAB.origineTable = "table par défaut";
}

let alerteHorloge = ""; // conseil technique, affiché aux agents seulement
// Signalements dont la référence ne correspond à aucune ligne du référentiel lu (autre table visée, réglage ⚙ forcé…)
function alerteLiensEtab() {
  if (!col("Etablissement") || !etabs.length || !enregistrements.length) return "";
  const avec = enregistrements.filter((l) => refId(val(l, "Etablissement")) || texteEtabBrut(l));
  const perdus = avec.filter((l) => !etabDeLigne(l));
  return perdus.length > avec.length / 2
    ? `${perdus.length} signalement(s) sur ${avec.length} renvoient à des établissements absents de la table « ${ETAB.table} » : la colonne « ${col("Etablissement")} » vise sans doute une autre table. Vérifiez ⚙ Réglages › « Colonnes et référentiel utilisés ».`
    : "";
}
// Page des établissements ouverte par un compte de la cellule (propriétaire, agent) : tout le référentiel est visible,
// pas de préremplissage ; un établissement, lui, arrive par son lien et ne voit que sa ligne.
function majAlertePageEtab() {
  const z = $("alerte-page-etab");
  if (!z) return;
  if (!pageEtab || !referentielLu || modeEtab) {
    z.hidden = true;
    return;
  }
  const sansCle = !(colsEtab || []).includes(E.cle);
  z.innerHTML = `<strong>Page des établissements, vue avec votre compte</strong> : vous voyez tous les établissements, le formulaire n'est donc pas prérempli.
    Un établissement arrive par son lien personnel et ne voit que sa fiche. Pour le vérifier, ouvrez un lien dans une <strong>fenêtre de navigation privée</strong> (sans être connecté à Grist).
    ${sansCle ? `<br><span style="color:var(--erreur)">Les liens n'existent pas encore dans ${esc(ETAB.table)} (colonne « ${esc(E.cle)} » absente) : administration, onglet Établissements, terminer la mise en place.</span>` : ""}`;
  z.hidden = false;
}
function finaliserReferentiel(err, alertes) {
  referentielLu = true;
  majAlertePageEtab();
  const liste = [...alertes];
  const liens = alerteLiensEtab();
  if (liens && !modeEtab) liste.push(liens);
  if (alerteTableRef && !modeEtab) liste.push(alerteTableRef);
  if (err)
    liste.push(
      /access|acc[eè]s|blocked|denied|refus|permission/i.test(String(err.message || err))
        ? `Accès refusé à la table « ${ETAB.table} ». Si vous êtes arrivé par un lien personnel, il n'est plus valable (lien renouvelé ou expiré, agent retiré de l'équipe) : demandez un nouveau lien à la cellule.`
        : `Table « ${ETAB.table} » inaccessible (${err.message || err}).`,
    );
  $("alerte").textContent = liste.join(" ");
  $("alerte").hidden = !liste.length;
  $("btn-config").hidden = modeEtab;
  // Points techniques (horloge, structure du référentiel) : utiles à l'administrateur seulement, dans les réglages
  const techniques = modeEtab ? [] : [alerteHorloge, !err && alerteStructure].filter(Boolean);
  $("cfg-alertes").innerHTML = techniques.length
    ? `<strong>Points techniques à vérifier</strong>${techniques.map((t) => `<p style="margin:6px 0 0">${esc(t)}</p>`).join("")}`
    : "";
  $("cfg-alertes").hidden = !techniques.length;
  $("btn-config").classList.toggle("a-signaler", techniques.length > 0);
  $("btn-config").title = techniques.length
    ? `${techniques.length} point(s) technique(s) à vérifier dans les réglages`
    : "Réglages du formulaire";
}

// Le référentiel vient d'arriver : on complète ce qui en dépend, sans perdre une saisie en cours
async function apresChargementEtabs() {
  if (dossierId && initiale) {
    etabCourant = etabDeLigne(initiale);
    if (!modifie) await remplirFormulaire(); // réévalue aussi la description (en-tête établissement)
    afficherDossier();
  } else {
    if (modeEtab) etabCourant = etabs[0] || null;
    if (!modifie) $("sous-titre").textContent = modeEtab ? "" : "Identifiez l'établissement par son nom ou son UAI.";
    afficherEtablissement();
    majListeDossiers();
  }
}

/* Colonnes Référence du référentiel (ex. Académie → table des académies) : Grist transmet le numéro de ligne.
   Le widget le remplace par le nom lu dans la table visée (colonne Nom / Libellé / Intitulé si elle existe,
   sinon la colonne affichée dans Grist), pour la fiche, la recherche et les filtres. */
/* Tables lues seulement pour des libellés ou des listes de choix (académies, nomenclatures…) : gardées 10 minutes.
   Une grande table peut demander plusieurs secondes au serveur ; plusieurs colonnes qui la visent ne la relisent pas. */
const cacheTables = new Map();
/* Lecture rapide d'une table par l'API SQL de Grist : lue directement dans la base du document, sans passer par le
   moteur de calcul (qui traite les demandes une par une : une grande table y fait attendre toutes les autres).
   Refusée quand l'utilisateur n'a pas un accès complet (lien d'établissement, règles d'accès) : lecture habituelle. */
let jetonSQL = null,
  sqlRefuse = "";
async function lireTableSQL(tid) {
  if (sqlRefuse) throw new Error(sqlRefuse);
  if (!grist.docApi.getAccessToken) {
    sqlRefuse = "jeton d'accès indisponible";
    throw new Error(sqlRefuse);
  }
  if (!jetonSQL || Date.now() > jetonSQL.expire) {
    const j = await grist.docApi.getAccessToken({ readOnly: true });
    jetonSQL = { ...j, expire: Date.now() + Math.max(30, Math.min(Number(j.ttl) || 300, 600) - 20) * 1000 };
  }
  const meta = await metaColonnes(tid);
  if (!meta) throw new Error("table inconnue");
  const cols = Object.keys(meta).filter((c) => c !== "id" && c !== "manualSort" && !c.startsWith("gristHelper"));
  const sql = `SELECT id${cols.map((c) => `, "${c.replace(/"/g, '""')}"`).join("")} FROM "${tid.replace(/"/g, '""')}"`;
  const t0 = performance.now();
  const r = await fetch(
    `${jetonSQL.baseUrl}/sql?q=${encodeURIComponent(sql)}&auth=${encodeURIComponent(jetonSQL.token)}`,
  );
  if (r.status === 401 || r.status === 403) {
    sqlRefuse = `lecture SQL refusée (${r.status})`;
    throw new Error(sqlRefuse);
  }
  if (!r.ok) throw new Error(`lecture SQL : erreur ${r.status}`);
  const recs = (await r.json()).records || [];
  // valeurs telles que les donnerait fetchTable : cases à cocher en booléens, listes au format ["L", …]
  const conv = cols.map((c) => {
    const ty = typeBase(meta[c].type);
    if (ty === "Bool") return (v) => (v == null ? v : !!v);
    if (ty === "ChoiceList" || ty === "RefList" || ty === "Attachments")
      return (v) => {
        if (typeof v !== "string" || !v.startsWith("[")) return v;
        try {
          return ["L", ...JSON.parse(v)];
        } catch (_) {
          return v;
        }
      };
    return (v) => v;
  });
  const t = { id: recs.map((x) => x.fields.id) };
  cols.forEach((c, k) => {
    t[c] = recs.map((x) => conv[k](x.fields[c]));
  });
  Donnees.noterLecture(`${tid} (SQL)`, t0);
  return t;
}
const lireTableRapide = (tid) =>
  lireTableSQL(tid).catch((e) => {
    if (!sqlRefuse) console.warn(`Lecture SQL de ${tid} impossible`, e);
    return Donnees.lire(tid);
  });
function lireTableReference(tid) {
  const c = cacheTables.get(tid);
  if (c && Date.now() - c.t < 600000) return c.p;
  // la table des réponses est déjà reçue du widget : pas de relecture
  const p =
    tid === tableId && enregistrements.length ? Promise.resolve(tableDepuisEnregistrements()) : lireTableRapide(tid);
  cacheTables.set(tid, { t: Date.now(), p });
  p.catch(() => cacheTables.delete(tid));
  return p;
}
function tableDepuisEnregistrements() {
  const cols = new Set(["id"]);
  for (const l of enregistrements.slice(0, 50)) Object.keys(l).forEach((k) => cols.add(k));
  const t = {};
  for (const c of cols) t[c] = enregistrements.map((l) => l[c]);
  return t;
}
async function libellesTable(tid, colAffichee) {
  const t = await lireTableReference(tid);
  const cols = Object.keys(t).filter((c) => c !== "id" && c !== "manualSort" && !c.startsWith("gristHelper"));
  const texte = (c) => (t[c] || []).some((v) => typeof v === "string" && v.trim());
  const c =
    cols.find((x) => /^(nom|libelle|intitule)(_|$)/.test(normaliser(x).replace(/ /g, "_")) && texte(x)) ||
    (colAffichee && t[colAffichee] ? colAffichee : null) ||
    cols.find(texte);
  return new Map(t.id.map((id, i) => [id, c ? String(t[c][i] ?? "") : ""]));
}
async function resoudreRefsEtab() {
  let meta = null;
  try {
    meta = await metaColonnes(ETAB.table);
  } catch (_) {}
  if (!meta) return;
  const colsPerimetre = perimetreBrut && !Array.isArray(perimetreBrut) ? Object.keys(perimetreBrut) : [];
  for (const colId of new Set(
    [...Object.values(E), colonneRegion(), ...S().fiche.map((f) => colonneChampFiche(f.col)), ...colsPerimetre].filter(
      Boolean,
    ),
  )) {
    const def = meta[colId];
    if (!def || typeBase(def.type) !== "Ref") continue;
    let libelles;
    try {
      libelles = await libellesTable(def.type.split(":")[1], def.colAffichee);
    } catch (_) {
      continue;
    } // table illisible : numéro conservé
    for (const e of etabs) {
      const v = e[colId];
      if (typeof v === "number") e[colId] = v ? libelles.get(v) || "" : "";
    }
  }
}

let dernierChargementEtabs = 0,
  idEtabMax = 0;
async function rafraichirEtabs(forcer) {
  if (!forcer && Date.now() - dernierChargementEtabs < 600000) return; // grand référentiel : lecture coûteuse pour le serveur
  if (!forcer && referentielDuCache && Date.now() - referentielDuCache < DUREE_CACHE_REFERENTIEL) return; // copie du navigateur encore valable
  try {
    await chargerEtabs();
  } catch (e) {
    console.warn("Référentiel illisible", e);
  }
}

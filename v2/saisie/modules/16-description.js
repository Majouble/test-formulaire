/* PRISME — widget de saisie, module 16/34 : Description automatique, résumé des modifications, jour de mobilisation, doublons.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
// Mise à jour : résumé automatique des réponses modifiées, ajouté au commentaire à l'enregistrement.
// Il est affiché en aperçu au-dessus du commentaire, sans être mélangé au texte saisi : on peut ainsi
// choisir n'importe quel format (valeur seule, sur une seule ligne…) sans risque de confusion.
// Les réglages sont ceux du widget (panneau de configuration de Grist), communs à tous les utilisateurs.
// Réglages du résumé : une colonne texte de la table Parametres (première ligne), au format JSON.
const PARAMETRES = { table: "Parametres", colonne: "Resume_auto" };
const OPTIONS_DEFAUT = {
  actif: true,
  format: "libelle",
  separateur: "ligne",
  puce: "",
  longueur: 200,
  position: "avant",
  qualification: true,
  description: false,
  questions: true,
  mobilisation: true,
  entete: true,
  nombresPositifs: false,
  bornes: {},
};
const SEPARATEURS = { ligne: "\n", pv: " ; ", virgule: ", ", barre: " / ", espace: " ", point: ". " };

// Assemble les éléments avec le séparateur choisi. Avec le point, chaque élément devient une phrase :
// son éventuel point final est retiré avant l'assemblage (pas de « .. »), et le texte se termine par un point.
function joindre(elements, o = etatSaisie.optionsAuto) {
  const liste = elements.filter((e) => String(e).trim());
  if (o.separateur !== "point") return liste.join(SEPARATEURS[o.separateur] ?? "\n");
  if (!liste.length) return "";
  const texte = liste.map((e) => String(e).trim().replace(/\.+$/, "")).join(". ");
  return /[.!?…]$/.test(texte) ? texte : texte + ".";
}
etatSaisie.optionsAuto = { ...OPTIONS_DEFAUT };

// Comparaison tolérante aux écarts de forme sans changement réel de valeur
function memeReponse(def, a, b) {
  const t = typeBase(def.type);
  const n = (v) => {
    v = norm(def, v);
    if (v == null) return t === "Bool" ? false : null;
    if (Array.isArray(v) && v[0] === "L") return ["L", ...v.slice(1).map(String).sort()];
    if (t === "DateTime") {
      const s = secondes(v);
      return s == null ? null : Math.floor(s / 60);
    }
    if (t === "Date") {
      const s = secondes(v);
      return s == null ? null : Math.floor(s / 86400);
    }
    if (typeof v === "string") return v.trim();
    return v;
  };
  return egal(n(a), n(b));
}

// Met une valeur au format choisi : sur une seule ligne, abrégée si une longueur maximale est fixée
function mettreEnForme(texte, o = etatSaisie.optionsAuto) {
  let t = String(texte ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const max = +o.longueur || 0;
  if (max > 0 && t.length > max) t = t.slice(0, max - 1) + "…";
  return t;
}
function element(libelle, valeur, o = etatSaisie.optionsAuto) {
  const v = mettreEnForme(valeur, o);
  return `${o.puce || ""}${o.format === "valeur" ? v : `${libelle} : ${v}`}`;
}

// Réponses modifiées par rapport à la version précédente : [{ libelle, valeur }]
function modificationsSaisies() {
  const ref = etatSaisie.derniere || etatSaisie.initiale;
  const res = [];
  const defQ = etatSaisie.metaSig[col("Qualification")];
  if (defQ && etatSaisie.optionsAuto.qualification) {
    const saisie = lireQualificationInitiale();
    const apres = Array.isArray(saisie) ? saisie : saisie ? [saisie] : [];
    const avant = listeQualif(ref ? val(ref, "Qualification") : "");
    if (apres.length && JSON.stringify([...apres].map(String).sort()) !== JSON.stringify([...avant].map(String).sort()))
      res.push({ libelle: defQ.libelle || "Qualification", valeur: apres.join(", ") });
  }
  const defD = etatSaisie.metaSig[col("Description")];
  if (defD && etatSaisie.optionsAuto.description) {
    const nouvelle = $("description").value.trim();
    const avant = String((ref ? val(ref, "Description") : "") ?? "").trim();
    if (nouvelle.replace(/\s+/g, " ") !== avant.replace(/\s+/g, " "))
      res.push({ libelle: defD.libelle || "Description", valeur: nouvelle || "(vide)" });
  }
  if (etatSaisie.optionsAuto.questions) {
    const valeurs = lireChamps("q", etatSaisie.defsQuestions, []); // questions visibles uniquement
    for (const def of etatSaisie.defsQuestions) {
      if (def.formule && formuleConnue(def) && !def.confidentiel && questionVisible("q", def)) {
        const v = valeurFormuleEnDirect(def),
          avant = ref ? ref[def.colId] : null;
        if (v != null && v !== "" && String(v) !== String(avant ?? ""))
          res.push({ libelle: def.libelle, valeur: formatValeur(def, v) });
        continue;
      }
      if (def.formule || def.confidentiel || !(def.colId in valeurs)) continue;
      const nouvelle = valeurs[def.colId];
      if (memeReponse(def, nouvelle, ref ? ref[def.colId] : null)) continue;
      res.push({
        libelle: def.libelle,
        valeur:
          estVide(def, nouvelle) && typeBase(def.type) !== "Bool"
            ? "(vide)"
            : def.tableau
              ? texteTableauDescription(def, lireTableauJson(nouvelle))
              : formatValeur(def, nouvelle),
      });
    }
  }
  return res;
}

function texteAutomatique(o = etatSaisie.optionsAuto, modifs = modificationsSaisies()) {
  if (!o.actif) return "";
  return joindre(
    modifs.map((m) => element(m.libelle, m.valeur, o)),
    o,
  );
}

// Commentaire final : résumé automatique et texte saisi, dans l'ordre choisi
function commentaireComplet() {
  const auto = texteAutomatique();
  const libre = $("commentaire").value.trim();
  const sep = SEPARATEURS[etatSaisie.optionsAuto.separateur] ?? "\n";
  const parties = etatSaisie.optionsAuto.position === "apres" ? [libre, auto] : [auto, libre];
  return parties.filter(Boolean).join(sep);
}

/* ---------- Format de chaque élément : par question, sinon par type de colonne, sinon général ---------- */
const FAMILLES = {
  nombre: "Nombres",
  date: "Dates",
  choix: "Choix",
  case: "Cases à cocher",
  reference: "Références",
  texte: "Textes",
};
function famille(def) {
  const t = typeBase(def && def.type);
  if (t === "Numeric" || t === "Int") return "nombre";
  if (t === "Date" || t === "DateTime") return "date";
  if (t === "Choice" || t === "ChoiceList") return "choix";
  if (t === "Bool") return "case";
  if (t === "Ref" || t === "RefList") return "reference";
  return "texte";
}
function formatPour(def, o = etatSaisie.optionsAuto) {
  if (def && def.formatDescription) return def.formatDescription;
  const parQuestion = def && (o.formatsQuestion || {})[def.colId];
  if (parQuestion && parQuestion !== "defaut") return parQuestion;
  const parType = def && !def.tableau && (o.formatsType || {})[famille(def)];
  if (parType && parType !== "defaut") return parType;
  return o.format;
}
// Questions concernées par la description : qualification puis questions supplémentaires
function questionsDescription() {
  const q = etatSaisie.metaSig[col("Qualification")];
  return [
    ...(q ? [{ ...q, libelle: q.libelle || "Qualification" }] : []),
    ...etatSaisie.defsQuestions.filter((d) => !d.formule || formuleConnue(d)),
  ];
}

function elementsDescription(o = etatSaisie.optionsAuto) {
  const items = [];
  const defQ = etatSaisie.metaSig[col("Qualification")];
  if (o.qualification && defQ) {
    const q = lireQualificationInitiale();
    const l = Array.isArray(q) ? q : q ? [q] : [];
    const avecFleche = etatSaisie.defsQuestions.some((d) => d.tableau && (d._sousDefs || []).some(estQualifSous));
    const avant = avecFleche && versionDuJour() ? listeQualif(val(etatSaisie.derniere, "Qualification")) : [];
    const change =
      avant.length &&
      l.length &&
      JSON.stringify([...avant].map(String).sort()) !== JSON.stringify([...l].map(String).sort());
    if (l.length)
      items.push({
        libelle: defQ.libelle || "Qualification",
        valeur: change ? `${avant.join(", ")} → ==${l.join(", ")}==` : l.join(", "),
        def: defQ,
      });
  }
  if (o.questions) {
    const valeurs = lireChamps("q", etatSaisie.defsQuestions, []); // questions visibles uniquement
    for (const def of etatSaisie.defsQuestions) {
      if (def.formule && formuleConnue(def) && !def.confidentiel && questionVisible("q", def)) {
        const v = valeurFormuleEnDirect(def);
        if (v != null && v !== "") items.push({ libelle: def.libelle, valeur: formatValeur(def, v), def });
        continue;
      }
      if (def.formule || def.confidentiel || !(def.colId in valeurs)) continue;
      const v = valeurs[def.colId];
      if (estVide(def, v)) continue; // question sans réponse : ignorée
      if (typeBase(def.type) === "Bool" && !v) continue; // case non cochée : ignorée
      items.push({
        libelle: def.libelle,
        valeur: def.tableau
          ? texteTableauDescription(def, lireTableauJson(v), o, lignesPrecedentes(def))
          : formatValeur(def, v),
        def,
      });
    }
  }
  return items;
}

/* ---------- Jour de mobilisation ----------
   Nombre de jours calendaires distincts où l'établissement a fait l'objet d'une saisie (signalement
   initial ou mise à jour, tous dossiers confondus), en comptant aujourd'hui, jour de l'enregistrement.
   Le jour est déterminé dans le fuseau horaire de la colonne Date. Seules les lignes visibles par
   l'utilisateur sont prises en compte (règles d'accès). */
const MOTIF_MOBILISATION = /\s*\(\d+(?:er|e) jour de mobilisation\)\s*$/;
const ordinal = (n) => (n === 1 ? "1er" : `${n}e`);
function jourCalendaire(sec) {
  const tz = /^Date$/.test((etatSaisie.metaDate && etatSaisie.metaDate.type) || "") ? "UTC" : Outils.dates.FUSEAU;
  return formateur(`jour|${tz || ""}`, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(new Date(sec * 1000));
}
/* Colonne Référence vers un référentiel des sites (table qui renvoie elle-même vers le référentiel des établissements) :
   rattachement de chaque site à son établissement et à sa composante, commune, mots-clés, sites désactivés, et
   établissement de rattachement des composantes. Renvoie true si la colonne désigne bien un site. */
async function preparerRefSite(ds) {
  try {
    const cible = ds.type.split(":")[1];
    if (!cible || cible === ETAB.table || cible === etatSaisie.tableId) return false;
    // référentiel des établissements : celui de la recherche, ou celui que vise la colonne Établissement du formulaire
    const mr = col("Etablissement") && etatSaisie.metaSig[col("Etablissement")],
      visee = mr && ((mr.type || "").match(/^Ref:(.+)$/) || [])[1];
    const m = Object.values((await metaColonnes(cible)) || {}),
      versEtab = m.filter((c) => c.type === `Ref:${ETAB.table}` || (visee && c.type === `Ref:${visee}`));
    const ce = versEtab.find((c) => c.colId === "Etablissement") || versEtab.find((c) => !/compos/i.test(c.colId)),
      cc = versEtab.find((c) => c !== ce && /compos/i.test(c.colId));
    if (!ce) return false;
    const t = await lireTableReference(cible);
    ds._siteEtab = new Map(t.id.map((id, i) => [id, refId(t[ce.colId][i])]));
    if (cc) ds._siteComp = new Map(t.id.map((id, i) => [id, refId(t[cc.colId][i])]));
    // mots-clés des sites (Mots_cles, Autres_noms…) : retrouvent le site quand l'agent tape un autre nom
    const cm = m
      .filter((c) => /^Text/.test(c.type || "") && /^(mots?_?cles?|autres?_noms?|alias)/i.test(c.colId))
      .map((c) => c.colId);
    ds._motsSite = new Map(
      t.id.map((id, i) => [
        id,
        cm
          .map((c) => t[c] && t[c][i])
          .filter((x) => typeof x === "string" && x.trim())
          .join(" | "),
      ]),
    );
    const cv = m.find((c) => /^commune$/i.test(c.colId));
    if (cv) ds._communeSite = new Map(t.id.map((id, i) => [id, String(t[cv.colId][i] ?? "")]));
    // sites désactivés (colonne Actif décochée) : plus proposés, sauf sur une ligne qui y renvoie déjà
    const ca = m.find((c) => /^actif$/i.test(c.colId) && c.type === "Bool");
    if (ca) ds._inactifs = new Set(t.id.filter((id, i) => t[ca.colId][i] === false));
    // composante (IUT, école interne…) : ses propres sites, sinon ceux de son établissement de rattachement
    const me = Object.values((await metaColonnes(ETAB.table)) || {}).find(
      (c) => c.type === `Ref:${ETAB.table}` && /rattach|parent/i.test(c.colId),
    );
    if (me) {
      const te = await lireTableReference(ETAB.table);
      ds._parent = new Map(te.id.map((id, i) => [id, refId(te[me.colId][i])]));
    }
    return true;
  } catch (_) {
    return false;
  } // illisible : menu de tous les sites
}
/* Sites proposés pour un établissement : les siens (ou, pour une composante, ceux qui la concernent) ; une composante ou un
   site sans site propre au référentiel reprend ceux de son établissement de rattachement. Le site déjà choisi reste. */
function sitesDeLEtablissement(d, e, opts, choisi) {
  if (d._inactifs && d._inactifs.size) opts = opts.filter((o) => !d._inactifs.has(o.id) || o.id === choisi);
  const a = opts.filter(
    (o) => d._siteEtab.get(o.id) === e || (d._siteComp && d._siteComp.get(o.id) === e) || o.id === choisi,
  );
  const p = d._parent && d._parent.get(e);
  const r =
    !p || a.some((o) => o.id !== choisi) ? a : opts.filter((o) => d._siteEtab.get(o.id) === p || o.id === choisi);
  // dossier ouvert depuis une composante : ses sites d'abord
  const c = etatSaisie.composanteChoisie && d._siteComp ? etatSaisie.composanteChoisie.id : null;
  return c ? [...r.filter((o) => d._siteComp.get(o.id) === c), ...r.filter((o) => d._siteComp.get(o.id) !== c)] : r;
}
function etablissementDuFormulaire() {
  if (etatSaisie.initiale) return refId(val(etatSaisie.initiale, "Etablissement"));
  if (etatSaisie.modeEtab) return etatSaisie.etabs[0] ? etatSaisie.etabs[0].id : null;
  return etatSaisie.etabCourant ? etatSaisie.etabCourant.id : null; // établissement pas encore dans le référentiel : aucune ligne
}
// Jour calendaire d'une date des faits : une colonne Date est à minuit UTC, on la lit donc en UTC
/* Date de saisie : si la colonne a une formule (formule d'initialisation NOW() « à la création »,
   ou colonne formule), c'est Grist qui la remplit avec l'heure de son serveur, et le widget n'envoie rien.
   Sinon, le widget écrit l'heure de l'ordinateur, qui peut être fausse si son horloge est déréglée. */
const dateParGrist = () => !!(etatSaisie.metaDate && String(etatSaisie.metaDate.texteFormule || "").trim());

function jourFaits(sec) {
  const tz =
    etatSaisie.metaFaits && (etatSaisie.metaFaits.type || "").startsWith("DateTime") ? Outils.dates.FUSEAU : "UTC";
  return formateur(`jour|${tz || ""}`, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(new Date(sec * 1000));
}
function jourDuFormulaire() {
  return col("Date_faits") && lireDateFaits() != null ? jourFaits(lireDateFaits()) : jourCalendaire(Date.now() / 1000);
}
function jourDeLaVersion(l) {
  const f = col("Date_faits") ? secondes(val(l, "Date_faits")) : null;
  if (f != null) return jourFaits(f);
  const s = secondes(val(l, "Date"));
  return s != null ? jourCalendaire(s) : null;
}
// Site comparé sans accents, majuscules, ponctuation ni mots « bâtiment / bât. / site / campus »
const cleSite = (s) =>
  normaliser(s)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(batiment|bat|site|campus|le|la|les|de|du|des)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function memeSite(a, b) {
  const x = cleSite(a),
    y = cleSite(b);
  if (!x || !y) return true; // site non renseigné d'un côté : l'établissement suffit pour alerter
  // mêmes mots significatifs, dans n'importe quel ordre (« bât. 12, campus de Beaulieu » = « Campus de Beaulieu, bâtiment 12 »)
  const mx = x.split(" "),
    my = y.split(" "),
    [court, long] = mx.length <= my.length ? [mx, my] : [my, mx];
  return x === y || court.every((m) => long.includes(m));
}
function doublonsDuJour() {
  if (etatSaisie.dossierId) return [];
  const etabId = etablissementDuFormulaire();
  if (!etabId) return [];
  const jour = jourDuFormulaire(),
    cD = col("Dossier"),
    parDossier = new Map();
  for (const l of etatSaisie.enregistrements) {
    if (refId(val(l, "Etablissement")) !== etabId) continue;
    const d = refId(cD && l[cD]) || l.id;
    if (!parDossier.has(d)) parDossier.set(d, []);
    parDossier.get(d).push(l);
  }
  const res = [];
  for (const [d, lignes] of parDossier) {
    if (!lignes.some((l) => jourDeLaVersion(l) === jour)) continue;
    const derniere = [...lignes].sort(comparerVersions).pop();
    if (col("Site") && !memeSite($("site").value, val(derniere, "Site"))) continue; // autre site du même établissement
    res.push({ dossier: d, derniere, nb: lignes.length });
  }
  return res;
}
const cleDoublon = () =>
  `${etablissementDuFormulaire()}|${jourDuFormulaire()}|${col("Site") ? cleSite($("site").value) : ""}`;
function extraitDescription(l) {
  const t = String(val(l, "Description") || "")
    .replace(/\*\*|==/g, "")
    .replace(/^[^:]{0,120}:\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 140 ? t.slice(0, 140) + "…" : t;
}
const lieuDoublon = () => {
  const s = col("Site") ? $("site").value.trim() : "";
  return s ? ` (site « ${esc(s)} »)` : "";
};
function verifierDoublons() {
  const bloc = $("alerte-doublon");
  const liste = doublonsDuJour();
  if (!liste.length) {
    bloc.hidden = true;
    bloc.innerHTML = "";
    return;
  }
  const jour = jourDuFormulaire(),
    confirme = etatSaisie.doublonConfirme === cleDoublon();
  bloc.hidden = false;
  bloc.classList.toggle("confirme", confirme);
  const items = liste
    .map((x) => {
      const q = listeQualif(val(x.derniere, "Qualification")).join(", ");
      const suivis = x.nb > 1 ? ` — ${x.nb - 1} mise${x.nb > 2 ? "s" : ""} à jour` : "";
      const s = col("Site") ? String(val(x.derniere, "Site") || "").trim() : "";
      return `<li><strong>Dossier n° ${x.dossier}</strong>${s ? ` — site « ${esc(s)} »` : ""}${q ? ` (${esc(q)})` : ""}${suivis}<br>
      <span class="extrait">${esc(extraitDescription(x.derniere))}</span><br>
      <button type="button" class="secondaire petit" data-ouvrir-dossier="${x.dossier}">Ouvrir ce signalement pour le mettre à jour</button></li>`;
    })
    .join("");
  bloc.innerHTML = confirme
    ? `Un signalement existe déjà pour cet établissement${lieuDoublon()} le ${esc(jour)}. Vous avez confirmé qu'il s'agit d'un <strong>nouveau signalement distinct</strong>.
       <div class="actions-doublon"><button type="button" class="lien-texte" id="btn-annuler-doublon">Revenir sur ce choix</button></div>`
    : `<strong>⚠ ${liste.length > 1 ? `${liste.length} signalements existent` : "Un signalement existe"} déjà pour cet établissement${lieuDoublon()} le ${esc(jour)}.</strong>
       S'il s'agit des mêmes faits, mettez plutôt à jour le signalement existant (la saisie en cours sera abandonnée) :
       <ul>${items}</ul>
       <div class="actions-doublon"><button type="button" class="lien-texte" id="btn-confirmer-doublon">Non, il s'agit de faits distincts : créer un nouveau signalement</button></div>`;
}
$("alerte-doublon").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.dataset.ouvrirDossier) {
    const id = +b.dataset.ouvrirDossier;
    enFile(async () => {
      try {
        await grist.setCursorPos({ rowId: id });
      } catch (_) {}
      await ouvrirDossier(id, true);
      verifierDoublons();
    });
  } else if (b.id === "btn-confirmer-doublon") {
    etatSaisie.doublonConfirme = cleDoublon();
    verifierDoublons();
    statut("statut-signalement", "");
  } else if (b.id === "btn-annuler-doublon") {
    etatSaisie.doublonConfirme = null;
    verifierDoublons();
  }
});

function jourDeMobilisation(cible, serie) {
  // cible : jour (secondes) d'une étape reprise ; serie : jours repris en même temps
  const etabId = etablissementDuFormulaire();
  const avecFaits = !!col("Date_faits");
  // jour du signalement en cours : la date des faits saisie, sinon aujourd'hui
  const courant =
    cible != null
      ? jourFaits(cible)
      : avecFaits && lireDateFaits() != null
        ? jourFaits(lireDateFaits())
        : jourCalendaire(Date.now() / 1000);
  // Seuls comptent les jours antérieurs ou égaux à celui du signalement en cours : des faits saisis
  // après coup pour une date passée ne sont pas numérotés d'après les jours qui les ont suivis.
  const cle = (j) => String(j).split(/\D+/).filter(Boolean).reverse().join("-"); // « 25/09/2026 » -> « 2026-09-25 »
  const limite = cle(courant);
  const jours = new Set([courant]);
  const ajouter = (j) => {
    if (cle(j) <= limite) jours.add(j);
  };
  if (etabId)
    for (const l of etatSaisie.enregistrements) {
      if (refId(val(l, "Etablissement")) !== etabId) continue;
      if (col("Qualification") && qualificationRas(val(l, "Qualification"))) continue; // jour « RAS » : non compté
      const f = avecFaits ? secondes(val(l, "Date_faits")) : null;
      if (f != null) {
        ajouter(jourFaits(f));
        continue;
      }
      const sec = secondes(val(l, "Date")); // versions antérieures sans date des faits
      if (sec != null) ajouter(jourCalendaire(sec));
    }
  if (serie && !signalementEnCoursRas())
    for (const t of [lireDateFaits(), ...serie]) if (t != null) ajouter(jourFaits(t));
  return jours.size;
}
const mentionMobilisation = (n) => `(${ordinal(n)} jour de mobilisation)`;
// Qualification « RAS » (rien à signaler) : la ligne ne compte pas comme jour de mobilisation.
// Choix multiples : écartée seulement si « RAS » est son seul choix.
function qualificationRas(q) {
  const l = Array.isArray(q) ? q.filter((x) => x !== "L") : q == null || q === "" ? [] : [q];
  const retour = new Set(
    (etatSaisie.socleGeneral.retour_normale && etatSaisie.socleGeneral.retour_normale.length
      ? etatSaisie.socleGeneral.retour_normale
      : ["RAS"]
    ).map((x) => String(x).trim().toUpperCase()),
  );
  return l.length > 0 && l.every((x) => retour.has(String(x).trim().toUpperCase()));
}
const signalementEnCoursRas = () => !!col("Qualification") && qualificationRas(lireQualificationInitiale());
function ajouterMobilisation(texte, o = etatSaisie.optionsAuto, n = jourDeMobilisation()) {
  const base = String(texte || "").replace(MOTIF_MOBILISATION, "");
  if (!o.mobilisation || signalementEnCoursRas()) return base; // signalement « RAS » : pas de mention
  const sep = o.separateur === "ligne" && base ? "\n" : base ? " " : "";
  return `${base}${sep}${mentionMobilisation(n)}`;
}

// Établissement et commune du formulaire : établissement connu, ou établissement choisi dans l'annuaire
// (ou saisi à la main) en cours de création
function identiteDuFormulaire() {
  const e = etatSaisie.etabCourant || (etatSaisie.modeEtab ? etatSaisie.etabs[0] : null);
  const site = col("Site") ? $("site").value.trim() : "";
  if (e) return { ...valeursEtab(e), site };
  return {
    nom: $("nom").value.trim(),
    commune: (etatSaisie.ligneAnnuaire && etatSaisie.ligneAnnuaire.commune) || "",
    site,
    uai: $("uai").value.trim(),
    type: $("type").value.trim(),
    academie: $("academie").value.trim(),
    departement: $("departement").value.trim(),
  };
}
// En-tête : modèle du formulaire (« **{nom}**, **{commune}** », « **{nom}** ({site})»…), en gras au format Markdown
function enTeteDescription(ident) {
  return String(ident.nom || "").trim() ? appliquerModele(S().entete, ident) : "";
}

function elementsTableau(m, fmt, o) {
  // Question « tableau » : l'en-tête (nombre et décomptes), puis une ligne par élément saisi ; chacun est un
  // élément de la description, séparé comme les autres questions. « Ne pas inclure » ne retire que l'en-tête.
  const [tete = "", ...lignes] = String(m.valeur ?? "")
    .split(/\s*\n\s*/)
    .filter(Boolean);
  let enTete = "";
  if (fmt === "exclure")
    enTete = tete.replace(/^\d+\s*(—\s*)?/, "").replace(/^\((.*)\)$/, "$1"); // décomptes seuls
  else if (tete) enTete = fmt === "valeur" ? tete : `${m.libelle} : ${tete}`;
  return [enTete, ...lignes].filter(Boolean).map((x) => `${o.puce || ""}${x}`);
}
function descriptionGeneree(o = etatSaisie.optionsAuto, items = elementsDescription(o), n, ident) {
  const corps = joindre(
    items.flatMap((m) => {
      const fmt = formatPour(m.def, o);
      if (m.def && m.def.tableau) return elementsTableau(m, fmt, o);
      if (fmt === "exclure") return [];
      const v = String(m.valeur ?? "")
        .replace(/\s*\n\s*/g, " ")
        .trim();
      return [`${o.puce || ""}${fmt === "valeur" ? v : `${m.libelle} : ${v}`}`];
    }),
    o,
  );
  const tete = o.entete ? enTeteDescription(ident || identiteDuFormulaire()) : "";
  const texte = tete && corps ? `${tete} : ${corps}` : tete || corps;
  return ajouterMobilisation(texte, o, n);
}

function majEtatDescription() {
  const bloc = $("etat-description"),
    actif = !!etatSaisie.optionsAuto.actif;
  bloc.hidden = !actif;
  if (!actif) {
    $("apercu-generee").hidden = true;
    return;
  }
  bloc.classList.toggle("manuel", etatSaisie.descriptionManuelle);
  $("etat-description-texte").textContent = etatSaisie.descriptionManuelle
    ? "✎ Texte modifié à la main : il ne suit plus les réponses du formulaire."
    : "↻ Rédigé automatiquement : le texte suit les réponses du formulaire.";
  $("etat-description-actions").hidden = !etatSaisie.descriptionManuelle;
  if (!etatSaisie.descriptionManuelle) {
    $("apercu-generee").hidden = true;
    $("btn-voir-auto").setAttribute("aria-expanded", "false");
    $("btn-voir-auto").textContent = "Voir le texte automatique";
  } else if (!$("apercu-generee").hidden) $("apercu-generee").textContent = descriptionGeneree();
}
$("btn-voir-auto").addEventListener("click", () => {
  const ouvrir = $("apercu-generee").hidden;
  $("apercu-generee").hidden = !ouvrir;
  $("btn-voir-auto").setAttribute("aria-expanded", String(ouvrir));
  $("btn-voir-auto").textContent = ouvrir ? "Masquer le texte automatique" : "Voir le texte automatique";
  if (ouvrir) $("apercu-generee").textContent = descriptionGeneree();
});

function majDescriptionAuto() {
  majFormulesEnDirect();
  majEtatDescription();
  if (!etatSaisie.optionsAuto.actif) return;
  if (etatSaisie.descriptionManuelle) {
    // Texte modifié à la main : on ne touche qu'à la mention de mobilisation si elle y figure déjà
    const t = $("description").value;
    if (etatSaisie.optionsAuto.mobilisation && MOTIF_MOBILISATION.test(t)) {
      const maj = signalementEnCoursRas()
        ? t.replace(MOTIF_MOBILISATION, "")
        : t.replace(/\(\d+(?:er|e) jour de mobilisation\)(\s*)$/, `${mentionMobilisation(jourDeMobilisation())}$1`);
      if (maj !== t) $("description").value = maj;
    }
    return;
  }
  $("description").value = descriptionGeneree();
}

// Au chargement d'une version : la description est considérée comme automatique si elle correspond
// exactement à ce que produiraient les réponses, et comme modifiée à la main sinon.
function evaluerDescriptionManuelle() {
  const actuelle = $("description").value.trim();
  const sansMention = (t) => t.replace(MOTIF_MOBILISATION, "").trim();
  etatSaisie.descriptionManuelle =
    !!actuelle && etatSaisie.optionsAuto.actif && sansMention(actuelle) !== sansMention(descriptionGeneree().trim());
  majDescriptionAuto();
}

$("description").addEventListener("input", () => {
  etatSaisie.descriptionManuelle = true;
  majEtatDescription();
});
$("btn-regenerer").addEventListener("click", () => {
  etatSaisie.descriptionManuelle = false;
  majDescriptionAuto();
  appliquerConditions("q", etatSaisie.defsQuestions);
  majApercuAuto();
});

function majApercuAuto() {
  if (!etatSaisie.dossierId || !col("Commentaire")) {
    $("apercu-auto").hidden = true;
    return;
  }
  const auto = texteAutomatique();
  $("apercu-auto").hidden = false;
  $("apercu-auto").classList.toggle("vide", !auto);
  $("apercu-texte").textContent =
    auto ||
    (etatSaisie.optionsAuto.actif
      ? "Aucune réponse modifiée pour l'instant : modifiez la qualification, la description ou une question, le résumé s'écrira ici."
      : "Résumé automatique désactivé (bouton « ⚙ Réglages »).");
}
["input", "change"].forEach((evt) =>
  $("form-signalement").addEventListener(evt, (ev) => {
    const id = ev.target && ev.target.id;
    if (id === "commentaire") return;
    if (id !== "description") majDescriptionAuto();
    majApercuAuto();
    majCouleur();
  }),
);

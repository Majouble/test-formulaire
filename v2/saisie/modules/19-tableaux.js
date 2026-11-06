/* PRISME — widget de saisie, module 19/34 : Questions « tableau » : plusieurs lignes dans une même question ; structure, lecture et contrôle.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Questions « tableau » : plusieurs lignes dans une même question (ex. une ligne par blessé)
   ---------------------------------------------------------
   - Dans la table des signalements, une colonne texte porte le repère [tableau NomDeTable] : elle
     conserve, pour chaque version, la liste des lignes au format JSON (sans les champs confidentiels).
   - Les champs de chaque ligne sont les colonnes de la table NomDeTable (type, choix, libellé et
     repères de description : *, [si …], [liste], [boutons], [positif], [min], [max], [confidentiel]).
     Sont ignorées : les colonnes formules, Dossier (référence vers les signalements), Ligne_id, Ordre.
   - Table historisée (colonne Version, référence vers la table des signalements) : chaque version du signalement
     écrit sa propre copie des lignes (Dossier, Version, Ligne_id, Ordre, Mouvement + les champs). Mouvement compare
     à la version précédente du dossier : Ajout, Modification, Inchangée, ou Retrait (ligne retirée, recopiée avec ses
     dernières valeurs). Une correction de version réécrit les lignes de cette version. Stock = colonne formule
     Etat_actuel (lignes de la version la plus récente, hors retraits) ; flux = Mouvement par Date_version.
   - Table sans colonne Version (ancienne) : réécrite pour le dossier à partir de sa dernière version, une ligne Grist
     par ligne saisie (Dossier, Ligne_id, Ordre + les champs) ; aucun historique.
   - Les champs [confidentiel] ne sont enregistrés que dans NomDeTable (protégeables par une règle
     d'accès de colonne), jamais dans la colonne JSON, l'historique ni la description.
   ========================================================= */
const tableaux = {}; // identifiant du champ → contrôleur
const RESERVES_TABLEAU = ["id", "manualSort", "Ligne_id", "Ordre", "Version", "Mouvement"];
const nouvelIdLigne = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const videSous = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
function lireTableauJson(v) {
  if (!v || typeof v !== "string") return [];
  try {
    const l = JSON.parse(v);
    return Array.isArray(l) ? l.filter((x) => x && typeof x === "object") : [];
  } catch (_) {
    return [];
  }
}
// Colonnes d'une table, dans l'ordre de Grist
async function colonnesDeTable(tid) {
  const [tables, cols] = await lireMeta();
  const tRef = tables.id[tables.tableId.indexOf(tid)];
  if (tRef == null) return null;
  const res = [];
  for (let i = 0; i < cols.id.length; i++) {
    if (cols.parentId[i] !== tRef) continue;
    let opts = {};
    try {
      opts = JSON.parse(cols.widgetOptions[i] || "{}");
    } catch (_) {}
    const visible = cols.visibleCol ? cols.visibleCol[i] : 0;
    res.push({
      colId: cols.colId[i],
      libelle: cols.label[i],
      type: cols.type[i],
      opts,
      description: (cols.description && cols.description[i]) || "",
      formule: !!(cols.isFormula && cols.isFormula[i] && cols.formula[i]),
      colAffichee: visible ? cols.colId[cols.id.indexOf(visible)] : null,
      pos: cols.parentPos ? cols.parentPos[i] : i,
    });
  }
  return res.sort((a, b) => a.pos - b.pos);
}
function evaluerConditionLigne(cond, sousDefs, valeurs) {
  const n = normaliser(cond.ref);
  const d =
    sousDefs.find((x) => x.colId === cond.ref) ||
    sousDefs.find((x) => normaliser(x.colId) === n || normaliser(x.libelle) === n);
  if (!d) return true; // colonne inconnue : le champ reste affiché
  const v = valeurs[d.colId];
  return evaluerCondition(Array.isArray(v) ? ["L", ...v] : v, cond);
}
// Rangement d'un champ dans la ligne : en tête (champs courts), sur sa propre ligne (choix multiples), ou en bas (textes)
function zoneSousChamp(d) {
  const t = typeBase(d.type),
    ch = (d.opts && d.opts.choices) || [];
  if (t === "ChoiceList" || t === "RefList") return "large";
  // choix unique en pastilles (plus de 5 options) : sur sa propre ligne, comme les choix multiples
  if (
    t === "Choice" &&
    ch.length &&
    d.forcer !== "liste" &&
    !(d.forcer === "boutons" || ch.length <= 5) &&
    pastillesPossibles(d)
  )
    return "large";
  if (["Choice", "Bool", "Numeric", "Int", "Date", "DateTime", "Ref"].includes(t)) return "tete";
  return "texte";
}
const pastillesPossibles = (d) => {
  const ch = (d.opts && d.opts.choices) || [];
  if (d.forcer === "liste") return false;
  if (d.forcer === "boutons") return true;
  if (S().pastilles === "toujours") return true; // toujours des pastilles, quel que soit le nombre de choix ([liste] pour un menu déroulant)
  return ch.length <= 8 && ch.join("").length <= 70; // au-delà : menu déroulant
};
function texteSousValeur(d, v) {
  if (videSous(v)) return "";
  const t = typeBase(d.type);
  if (t === "Bool") return v ? "Oui" : "Non";
  if (t === "Ref") return ((d._options || []).find((o) => o.id === +v) || {}).libelle || `n° ${v}`;
  if (t === "RefList")
    return v.map((x) => ((d._options || []).find((o) => o.id === +x) || {}).libelle || `n° ${x}`).join(", ");
  if (Array.isArray(v)) return v.join(", ");
  if (t === "Date" || t === "DateTime") return dateFr(v, d);
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  return String(v);
}
// Synthèse : nombre de lignes, et répartition selon les colonnes à choix (hors confidentielles)
function syntheseTableau(sousDefs, lignes, court) {
  const n = lignes.length;
  if (!n) return "";
  const parts = [];
  for (const d of sousDefs
    .filter((x) => !x.confidentiel && ["Choice", "ChoiceList", "Bool"].includes(typeBase(x.type)))
    .slice(0, 3)) {
    const compte = new Map();
    for (const l of lignes) {
      if (d.condition && !evaluerConditionLigne(d.condition, sousDefs, l.valeurs || l)) continue;
      const v = (l.valeurs || l)[d.colId];
      for (const x of Array.isArray(v) ? v : videSous(v) ? [] : [typeBase(d.type) === "Bool" ? (v ? "Oui" : "Non") : v])
        compte.set(x, (compte.get(x) || 0) + 1);
    }
    if (!compte.size) continue;
    const ordre = (d.opts && d.opts.choices) || [];
    const rang = (x) => {
      const i = ordre.indexOf(x);
      return i < 0 ? 1e9 : i;
    };
    parts.push(
      `${d.libelle || d.colId} : ${[...compte]
        .sort((a, b) => rang(a[0]) - rang(b[0]))
        .map(([x, c]) => `${x} ${c}`)
        .join(", ")}`,
    );
  }
  return court ? `${n}${parts.length ? ` (${parts.join(" ; ")})` : ""}` : [`Total : ${n}`, ...parts].join(" · ");
}

/* ---------- Description automatique d'une question « tableau » ----------
   Pour chaque colonne de la table (réglage ⚙ « Format question par question ») :
   dans la ligne de chaque élément : « Libellé : valeur », « Valeur seule », ou rien (« Par défaut » suit le
   format de la question) ; et, en option, un décompte en tête (somme pour un nombre).
   Les colonnes [confidentiel] ne sont jamais incluses. */
const TYPES_DECOMPTE = ["Choice", "ChoiceList", "Bool", "Ref", "RefList"];
const decomptable = (d) => TYPES_DECOMPTE.includes(typeBase(d.type)) || ["Numeric", "Int"].includes(typeBase(d.type));
// Réglage d'une colonne : dans la ligne de chaque élément (format), et décompte en tête (ou somme pour un nombre)
function modeSous(def, d, o = etatSaisie.optionsAuto) {
  const m = ((o.formatsTableau || {})[def.colId] || {})[d.colId];
  const anciens = {
    detail: { ligne: "defaut", decompte: false },
    decompte: { ligne: "exclure", decompte: true },
    les2: { ligne: "defaut", decompte: true },
    exclure: { ligne: "exclure", decompte: false },
  }; // réglages précédents
  const r = typeof m === "string" ? anciens[m] : m && typeof m === "object" ? m : null;
  const ligne = r && ["defaut", "libelle", "valeur", "exclure"].includes(r.ligne) ? r.ligne : "defaut";
  if (!r && estQualifSous(d)) return { ligne, decompte: true }; // qualification : décompte en tête sauf réglage contraire
  return { ligne, decompte: !!(r && r.decompte && decomptable(d)) };
}
// Champ « qualification » d'une ligne de tableau (ex. qualification de chaque site) : choix unique nommé Qualification…
const estQualifSous = (d) =>
  !!d && typeBase(d.type) === "Choice" && (/qualif/i.test(d.colId) || /qualif/i.test(d.libelle || ""));
// Valeurs d'une ligne de tableau mises en forme selon les réglages de la description automatique
function valeursLigneTableau(def, l, o = etatSaisie.optionsAuto) {
  const tous = def._sousDefs || [];
  const vis = (d) => !d.condition || evaluerConditionLigne(d.condition, tous, l);
  const formatGeneral = (d) => {
    const f = (o.formatsType || {})[famille(d)];
    return f && f !== "defaut" ? f : o.format;
  };
  const libelleDe = (d) => {
    const m = modeSous(def, d, o).ligne;
    return m === "libelle" || (m === "defaut" && formatGeneral(d) !== "valeur");
  };
  return tous
    .filter((d) => !d.confidentiel && !d.auto && modeSous(def, d, o).ligne !== "exclure" && vis(d))
    .map((d) => {
      const txt = texteSousValeur(d, l[d.colId]),
        avecLibelle = libelleDe(d);
      // oui / non sans libellé : le libellé seul quand c'est « Oui », rien sinon
      if (!avecLibelle && typeBase(d.type) === "Bool") return l[d.colId] ? d.libelle || d.colId : "";
      return txt ? (avecLibelle ? `${d.libelle || d.colId} : ${txt}` : txt) : "";
    })
    .filter(Boolean);
}
// Texte proposé pour un champ [auto] d'une ligne
const texteAutoLigne = (def, l, o = etatSaisie.optionsAuto) => valeursLigneTableau(def, l, o).join(" — ");
/* Évolution depuis la version précédente du dossier (même jour) : chaque décompte en tête reçoit l'écart entre
   parenthèses (« RAS 19 (−1) ») ; la qualification d'une ligne qui a changé est écrite « Blocage → ==RAS== »
   (== : surlignage dans Word, soulignement dans Tchap). Les lignes sont retrouvées d'une version à l'autre par leur
   identifiant, sinon par le premier champ texte (nom du site…). */
function texteTableauDescription(def, lignesBrutes, o = etatSaisie.optionsAuto, avantBrutes = null) {
  const tous = def._sousDefs || [],
    sous = tous.filter((d) => !d.confidentiel);
  const vis = (l, d) => !d.condition || evaluerConditionLigne(d.condition, tous, l);
  const nonVide = (l) => tous.some((d) => vis(l, d) && !videSous(l[d.colId]));
  const lignes = lignesBrutes.map((l) => l.valeurs || l).filter(nonVide);
  if (!lignes.length) return "";
  const avant = Array.isArray(avantBrutes) ? avantBrutes.map((l) => l.valeurs || l).filter(nonVide) : null;
  const dQ = sous.find(estQualifSous);
  const ecart = (v, a) => {
    const e = v - a;
    return e ? ` (${e > 0 ? "+" : "−"}${Math.abs(e).toLocaleString("fr-FR")})` : "";
  };
  const parts = [];
  for (const d of sous.filter((d) => modeSous(def, d, o).decompte)) {
    const t = typeBase(d.type),
      lib = d.libelle || d.colId;
    if (t === "Numeric" || t === "Int") {
      const somme = (ls) => ls.filter((l) => vis(l, d) && typeof l[d.colId] === "number").map((l) => l[d.colId]);
      const vals = somme(lignes),
        va = avant ? somme(avant) : [];
      if (vals.length || va.length) {
        const s = vals.reduce((a, b) => a + b, 0),
          sa = va.reduce((a, b) => a + b, 0);
        parts.push(`${lib} : ${s.toLocaleString("fr-FR")}${avant ? ecart(s, sa) : ""}`);
      }
      continue;
    }
    const compter = (ls) => {
      const compte = new Map();
      for (const l of ls) {
        if (!vis(l, d) || videSous(l[d.colId])) continue;
        const v = l[d.colId];
        const items = Array.isArray(v)
          ? v.map((x) => (t === "RefList" ? texteSousValeur({ ...d, type: "Ref" }, x) : x))
          : [texteSousValeur(d, v)];
        for (const x of items) compte.set(x, (compte.get(x) || 0) + 1);
      }
      return compte;
    };
    const compte = compter(lignes),
      compteAvant = avant ? compter(avant) : new Map();
    if (!compte.size && !compteAvant.size) continue;
    const ordre = (d.opts && d.opts.choices) || [];
    const rang = (x) => {
      const i = ordre.indexOf(x);
      return i < 0 ? 1e9 : i;
    };
    const cles = [...new Set([...compte.keys(), ...compteAvant.keys()])].sort((a, b) => rang(a) - rang(b));
    parts.push(
      `${lib} : ${cles.map((x) => `${x} ${compte.get(x) || 0}${avant ? ecart(compte.get(x) || 0, compteAvant.get(x) || 0) : ""}`).join(", ")}`,
    );
  }
  // tableau avec une qualification : « 22 — Qualification : Blocage 1 (+1), RAS 19 (−1) » (pas de parenthèses imbriquées)
  const tete = dQ
    ? `${lignes.length}${parts.length ? ` — ${parts.join(" ; ")}` : ""}`
    : `${lignes.length}${parts.length ? ` (${parts.join(" ; ")})` : ""}`;
  const det = sous.filter((d) => !d.auto && modeSous(def, d, o).ligne !== "exclure");
  // Champ [auto] utilisé : la ligne reprend son texte (éventuellement retouché par l'agent)
  const autos = sous.filter((d) => d.auto && modeSous(def, d, o).ligne !== "exclure");
  if (!det.length && !autos.length) return tete;
  // qualification précédente d'une ligne, quand elle a changé
  const dNom = sous.find((d) => typeBase(d.type) === "Text" && !d.auto);
  const nomDe = (l) => (dNom ? normaliser(l[dNom.colId]) : "");
  const passage = (l) => {
    if (!avant || !dQ) return null;
    const a =
      avant.find((x) => l._id && x._id === l._id) || (nomDe(l) ? avant.find((x) => nomDe(x) === nomDe(l)) : null);
    if (!a || String(a[dQ.colId] ?? "") === String(l[dQ.colId] ?? "")) return null;
    return texteSousValeur(dQ, a[dQ.colId]) || "Sans qualification";
  };
  // La flèche prend la place de la qualification dans le texte de la ligne : la nouvelle (texte automatique à jour)
  // ou l'ancienne (texte retouché par l'agent, resté sur l'ancienne qualification) ; la plus longue est cherchée d'abord
  // (« Blocage partiel » avant « Blocage »). Introuvable : la flèche est ajoutée en fin de ligne.
  const avecFleche = (t, l) => {
    const a = passage(l);
    if (!a) return t;
    const q = texteSousValeur(dQ, l[dQ.colId]) || "Sans qualification",
      fleche = `${a} → ==${q}==`;
    for (const v of [a, q].sort((x, y) => y.length - x.length)) {
      const re = new RegExp(`(^|[\\s—:(,;])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u");
      if (re.test(t)) return t.replace(re, (m, avant) => `${avant}${fleche}`);
    }
    return `${t} — ${fleche}`;
  };
  const lignesTxt = lignes
    .map((l, k) => {
      const repris = autos
        .filter((d) => vis(l, d))
        .map((d) => String(l[d.colId] ?? "").trim())
        .filter(Boolean)
        .join(" — ");
      const vals = repris ? [repris] : valeursLigneTableau(def, l, o);
      return vals.length ? `${k + 1}. ${avecFleche(vals.join(" — "), l)}` : "";
    })
    .filter(Boolean);
  return [tete, ...lignesTxt].join("\n");
}
// Version précédente du dossier, si elle est du même jour (un nouveau dossier chaque jour) : base de comparaison
function versionDuJour() {
  if (!etatSaisie.dossierId || !etatSaisie.derniere) return false;
  const s = secondes(val(etatSaisie.derniere, "Date"));
  if (s == null) return true;
  const jour = (d) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  return jour(new Date(s * 1000)) === jour(new Date());
}
const lignesPrecedentes = (def) =>
  def.tableau && versionDuJour() ? lireTableauJson(etatSaisie.derniere[def.colId]) : null;
function lignesExemple(def) {
  // deux lignes fictives pour l'exemple des réglages
  return [0, 1].map((k) => {
    const l = {};
    for (const d of def._sousDefs || []) {
      const t = typeBase(d.type),
        ch = (d.opts && d.opts.choices) || [];
      if (t === "Choice") l[d.colId] = ch[k % Math.max(ch.length, 1)] || "Oui";
      else if (t === "ChoiceList") l[d.colId] = ch.length ? [ch[k % ch.length]] : null;
      else if (t === "Bool") l[d.colId] = k === 0;
      else if (t === "Numeric" || t === "Int") l[d.colId] = k + 1;
      else if (t === "Date" || t === "DateTime") l[d.colId] = Math.floor(Date.now() / 86400000) * 86400;
      else if (t === "Ref" || t === "RefList") l[d.colId] = null;
      else l[d.colId] = k === 0 ? "texte saisi" : "autre texte";
    }
    return l;
  });
}

class Tableau {
  constructor(def, prefix, conteneur, surChangement) {
    Object.assign(this, {
      def,
      prefix,
      el: conteneur,
      surChangement,
      id: `${prefix}-${def.colId}`,
      lignes: [],
      sousDefs: [],
      pret: false,
      erreur: "",
      confLisible: true,
      montrerErreurs: false,
    });
    this.ecouter();
    this.promesse = this.preparer();
  }
  async preparer() {
    const tid = this.def.tableau.table;
    let cols = null;
    try {
      cols = await colonnesDeTable(tid);
    } catch (_) {}
    if (!cols) {
      this.erreur = `Table « ${tid} » introuvable : vérifiez le repère [tableau ${tid}] dans la description de la colonne « ${this.def.libelle} ».`;
      this.dessiner();
      return;
    }
    this.table = tid;
    this.colDossier =
      (
        cols.find((c) => c.colId === "Dossier") ||
        cols.find((c) => c.type === `Ref:${etatSaisie.tableId}` && c.colId !== "Version") ||
        {}
      ).colId || null;
    this.colLigne = cols.some((c) => c.colId === "Ligne_id") ? "Ligne_id" : null;
    this.colOrdre = cols.some((c) => c.colId === "Ordre") ? "Ordre" : null;
    // historique : une copie des lignes par version (colonne Version vers la table des signalements)
    this.colVersion = cols.some((c) => c.colId === "Version" && c.type === `Ref:${etatSaisie.tableId}`)
      ? "Version"
      : null;
    this.colMouvement = this.colVersion && cols.some((c) => c.colId === "Mouvement") ? "Mouvement" : null;
    this.sousDefs = cols
      .filter(
        (c) =>
          !c.formule &&
          !RESERVES_TABLEAU.includes(c.colId) &&
          c.colId !== this.colDossier &&
          !c.colId.startsWith("gristHelper"),
      )
      .map(avecRegles)
      .filter((d) => !d.masque); // [masqué] : colonne absente du formulaire (sa valeur dans la table est conservée)
    // [ordre N] : les champs numérotés d'abord, dans cet ordre, puis les autres dans l'ordre des colonnes de Grist
    this.ordonne = this.sousDefs.some((d) => d.ordre != null);
    if (this.ordonne)
      this.sousDefs = this.sousDefs
        .map((d, i) => [d, i])
        .sort((a, b) => (a[0].ordre ?? 1e9) - (b[0].ordre ?? 1e9) || a[1] - b[1])
        .map(([d]) => d);
    for (const d of this.sousDefs)
      if (["Ref", "RefList"].includes(typeBase(d.type))) {
        try {
          d._options = await optionsReference({ ...d });
        } catch (_) {
          d._options = [];
        }
      }
    // tableau des sites : colonne du site (référence au référentiel des sites, ou identifiant texte), nom hors
    // référentiel, qualification du site ; historique d'autres questions (anciens formulaires) pour la reprise
    const st = this.def.tableau && this.def.tableau.sites,
      a = (c) => (c && cols.some((x) => x.colId === c) ? c : null);
    /* colonne renommée par Grist d'après son libellé (Site_libre → Site_hors_referentiel, Qualification →
 Qualification_du_site : tables créées par les versions 2.14.0 à 2.14.2) : retrouvée par son type et son nom */
    const parNom = (re, ty) =>
      (
        cols.find(
          (c) =>
            !RESERVES_TABLEAU.includes(c.colId) &&
            ty.test(c.type || "") &&
            re.test(normColonne(`${c.colId} ${c.libelle || ""}`)),
        ) || {}
      ).colId || null;
    const sSite = st && (a(st.site) || parNom(/(^|_)site/, /^Ref:/)),
      sLibre = st && st.libre ? a(st.libre) || parNom(/libre|hors_referentiel/, /^Text/) : null; // « — » dans l'administration : pas de nom libre
    const sQualif = st && (a(st.qualif) || parNom(/qualif/, /^Choice/));
    this.sites =
      st && (sSite || sLibre)
        ? {
            site: sSite,
            libre: sLibre,
            qualif: sQualif,
            avecRas: st.avecRas !== false, // reprise du dernier état des sites : "auto" (ancien réglage true), "bouton" (à la demande), "non" (par défaut)
            reprise: st.reprise === true || st.reprise === "auto" ? "auto" : st.reprise === "bouton" ? "bouton" : "non",
            historique: Array.isArray(st.historique) ? st.historique.filter((h) => h && h.colonne) : [],
            alias: st.alias || "Sites_correspondances",
          }
        : null;
    this.alias = new Map();
    this.aliasParSite = new Map();
    // colonnes qui désignent un site du référentiel (table des sites reliée aux établissements) : sites de l'établissement
    // du formulaire seulement, champ de recherche (nom, mots-clés, commune) au lieu d'un menu de tous les sites
    for (const d of this.sousDefs) if (typeBase(d.type) === "Ref") await preparerRefSite(d);
    if (this.sites && this.sites.site) {
      // tableau des sites : une autre colonne de site (créée en double) est écartée du formulaire
      const enDouble = this.sousDefs.filter((d) => d._siteEtab && d.colId !== this.sites.site);
      if (enDouble.length) {
        this.sousDefs = this.sousDefs.filter((d) => !enDouble.includes(d));
        this.doublons = enDouble.map((d) =>
          d.libelle && d.libelle !== d.colId ? `${d.libelle} (${d.colId})` : d.colId,
        );
      }
    }
    if (this.sites) {
      // correspondances validées : libellé saisi (par établissement) → site du référentiel
      try {
        const m = await metaColonnes(this.sites.alias);
        if (m && m.Libelle && m.Site) {
          const t = await Donnees.lire(this.sites.alias);
          t.id.forEach((id, i) => {
            if (/cart/i.test(String((t.Statut || [])[i] || ""))) return;
            const s = refId(t.Site[i]);
            if (!s) return;
            this.alias.set(`${refId((t.Etablissement || [])[i]) || 0}|${normaliser(t.Libelle[i])}`, s);
            if (!this.aliasParSite.has(s)) this.aliasParSite.set(s, []);
            this.aliasParSite.get(s).push(String(t.Libelle[i] ?? ""));
          });
        }
      } catch (_) {
        /* sans correspondances */
      }
    }
    const manque = [
      !this.colDossier && "Dossier (référence vers la table des signalements)",
      !this.colLigne && "Ligne_id (texte)",
    ].filter(Boolean);
    this.avertissement = manque.length
      ? `Table « ${tid} » : ajoutez la colonne ${manque.join(" et la colonne ")} pour qu'elle soit tenue à jour.`
      : "";
    if (this.doublons)
      this.avertissement = [
        this.avertissement,
        `Colonne${this.doublons.length > 1 ? "s" : ""} « ${this.doublons.join(" », « ")} » de la table « ${tid} » écartée${this.doublons.length > 1 ? "s" : ""} du formulaire : elle désigne aussi un site, en double avec « ${(this.sousDefs.find((d) => d.colId === this.sites.site) || {}).libelle || this.sites.site} » (voir l'administration des formulaires).`,
      ]
        .filter(Boolean)
        .join(" ");
    this.autos = this.sousDefs.filter((d) => d.auto && typeBase(d.type) === "Text");
    // site du référentiel et nom libre réunis en un seul champ (le nom libre seulement si le tableau des sites a sa colonne)
    this.combo = !!(
      this.sites &&
      this.sites.site &&
      this.sites.libre &&
      this.sousDefs.some((d) => d.colId === this.sites.site && d._siteEtab)
    );
    this.def._sousDefs = this.sousDefs;
    this.pret = true;
    this.dessiner();
    if (this.sites) setTimeout(reprendreSitesAuto, 0);
  }
  // ----- nombre de lignes piloté par une colonne nombre : lignes= du repère, sinon colonne de la condition [si …]
  colonneNombre() {
    const ref = (this.def.tableau && this.def.tableau.lignes) || (this.def.condition && this.def.condition.ref);
    if (!ref) return null;
    const defs =
      this.prefix === "q" ? etatSaisie.defsQuestions : this.prefix === "vd" ? etatSaisie.defsDep : etatSaisie.defsAca;
    const c = resoudreColonne(ref, defs);
    return c && ["Numeric", "Int"].includes(typeBase(c.def.type)) ? c : null;
  }
  nombreAttendu() {
    const c = this.colonneNombre();
    if (!c) return null;
    let v = null;
    if (c.genre === "question" && !c.def.formule) {
      const bloc = document.querySelector(`[data-champ="${this.prefix}-${c.def.colId}"]`);
      v = bloc && !bloc.hidden ? lireUnChamp(this.prefix, c.def) : null;
    } else {
      const r = etatSaisie.derniere || etatSaisie.initiale;
      v = r ? r[c.def.colId] : null;
    }
    return typeof v === "number" && v > 0 ? Math.min(200, Math.floor(v)) : 0;
  }
  // Ajoute des lignes vides jusqu'au nombre indiqué ; en cas de baisse, ne retire que des lignes vides
  ajuster() {
    if (!this.pret) return;
    const n = this.nombreAttendu();
    if (n == null || n === this.dernierN) return;
    this.dernierN = n;
    let change = false;
    while (this.lignes.length < n) {
      this.lignes.push({ _id: nouvelIdLigne(), valeurs: {} });
      change = true;
    }
    while (this.lignes.length > n && this.ligneVide(this.lignes[this.lignes.length - 1])) {
      this.lignes.pop();
      change = true;
    }
    if (change) this.dessiner();
    else this.majLignes();
  }
  // ----- état
  visible(l, d) {
    return !d.condition || evaluerConditionLigne(d.condition, this.sousDefs, l.valeurs);
  }
  ligneVide(l) {
    return this.sousDefs.every((d) => !this.visible(l, d) || videSous(l.valeurs[d.colId]));
  }
  lignesValides() {
    return this.lignes.filter((l) => !this.ligneVide(l));
  }
  valeur() {
    // JSON enregistré dans la colonne de la version (sans champs confidentiels ni champs masqués)
    const l = this.lignesValides().map((x) => {
      const o = { _id: x._id };
      for (const d of this.sousDefs)
        if (!d.confidentiel && this.visible(x, d) && !videSous(x.valeurs[d.colId])) o[d.colId] = x.valeurs[d.colId];
      return o;
    });
    return l.length ? JSON.stringify(l) : "";
  }
  async charger(json, dossier) {
    await this.promesse;
    const conf = await this.lireConfidentiels(dossier);
    this.lignes = lireTableauJson(json).map((o) => {
      const { _id, ...valeurs } = o;
      const id = _id || nouvelIdLigne();
      return {
        _id: id,
        valeurs: { ...valeurs, ...(conf.get(id) || {}) },
        ...(this.sites && dossier ? { _fixe: true } : {}),
      };
    });
    this.lignes.forEach((l) => this.initAuto(l));
    this.montrerErreurs = false;
    this.confModifie = false;
    this.dernierN = undefined;
    this.supprimes = [];
    this.dessiner();
  }
  async lireConfidentiels(dossier) {
    const res = new Map();
    const confs = this.sousDefs.filter((d) => d.confidentiel);
    this.confLisible = true;
    if (!dossier || !confs.length || !this.colDossier || !this.colLigne) return res;
    try {
      const t = await Donnees.lire(this.table);
      if (confs.some((d) => !(d.colId in t))) this.confLisible = false;
      // table historisée : les lignes de la version la plus récente qui en a (sinon les lignes sans version)
      const duDossier = t.id
        .map((_, i) => i)
        .filter((i) => refId(t[this.colDossier][i]) === dossier || t[this.colDossier][i] === dossier);
      const vDe = (i) => (this.colVersion && t[this.colVersion] ? refId(t[this.colVersion][i]) || 0 : 0);
      const vMax = Math.max(0, ...duDossier.map(vDe));
      t.id.forEach((id, i) => {
        if (refId(t[this.colDossier][i]) !== dossier && t[this.colDossier][i] !== dossier) return;
        if (vDe(i) !== vMax || (this.colMouvement && t[this.colMouvement] && t[this.colMouvement][i] === "Retrait"))
          return;
        const v = {};
        for (const d of confs) {
          const x = t[d.colId] ? t[d.colId][i] : undefined;
          if (x === undefined || (Array.isArray(x) && x[0] === "C")) {
            this.confLisible = false;
            continue;
          }
          v[d.colId] = this.depuisGrist(d, x);
        }
        res.set(t[this.colLigne][i], v);
      });
    } catch (_) {
      this.confLisible = false;
    }
    return res;
  }
  depuisGrist(d, x) {
    const t = typeBase(d.type);
    if (Array.isArray(x) && x[0] === "L") return x.slice(1);
    if (t === "Ref") return x || null;
    return x === "" ? null : x;
  }
  versGrist(d, v) {
    const t = typeBase(d.type);
    if (videSous(v)) return t === "Bool" ? false : t === "Ref" ? 0 : null;
    if (t === "ChoiceList" || t === "RefList") return ["L", ...v];
    if (t === "Ref") return +v || 0;
    return v;
  }
  // ----- contrôles
  verifier() {
    // messages des lignes incomplètes (sans rien marquer)
    const res = [];
    this.lignes.forEach((l, k) => {
      if (this.ligneVide(l)) return;
      const pb = this.sousDefs
        .filter((d) => this.visible(l, d) && this.erreurChamp(l, d))
        .map((d) => d.libelle || d.colId);
      if (pb.length) res.push(`ligne ${k + 1} : ${pb.join(", ")}`);
    });
    return res;
  }
  erreurChamp(l, d) {
    const v = l.valeurs[d.colId];
    // site obligatoire : un nom hors référentiel (colonne du nom libre) le renseigne aussi
    const libre = d._siteEtab && this.colLibre(d),
      parLibre = libre && !videSous(l.valeurs[libre]);
    if (d.obligatoire && videSous(v) && !parLibre && !(d.confidentiel && !this.confLisible)) return "À préciser";
    if (typeof v === "number" && horsBornes(d, v)) return `Valeur ${horsBornes(d, v)} attendue`;
    return "";
  }
  marquer() {
    this.montrerErreurs = true;
    this.majLignes();
    const el = this.el.querySelector(".ligne-rep.incomplete");
    if (el) {
      el.scrollIntoView({ block: "center" });
      const c = el.querySelector("[aria-invalid] input, [aria-invalid], input, select, textarea");
      if (c) c.focus();
    }
  }
}

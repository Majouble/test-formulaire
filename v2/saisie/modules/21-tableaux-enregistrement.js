/* PRISME — widget de saisie, module 21/34 : Questions « tableau », fin : écriture dans la table dédiée, versions, reconstruction.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Méthodes de la classe Tableau qui écrivent les lignes dans la table dédiée, puis les fonctions appelées après
   l'enregistrement d'un signalement. */
Object.assign(Tableau.prototype, {
  // ----- table dédiée : réécriture des lignes d'un dossier
  async synchroniser(dossier, complet, t, lignesSource, avecConf = true, version = null) {
    if (!this.pret || !this.colDossier) return 0;
    t = t || (await Donnees.lire(this.table));
    if (this.colVersion && t[this.colVersion])
      return this.synchroniserVersions(dossier, complet, t, lignesSource, avecConf, version);
    const lignes = lignesSource || this.lignesValides();
    const existantes = t.id
      .map((id, i) => ({ id, d: t[this.colDossier][i], ligne: this.colLigne ? t[this.colLigne][i] : null }))
      .filter((x) => refId(x.d) === dossier || x.d === dossier);
    const parLigne = new Map(existantes.filter((x) => x.ligne).map((x) => [x.ligne, x]));
    const ops = grist.getTable(this.table);
    const champs = (l, k, seulementConf) => {
      const f = {};
      for (const d of this.sousDefs) {
        if (seulementConf && !d.confidentiel) continue;
        const vis = this.visible(l, d),
          v = vis ? l.valeurs[d.colId] : null;
        if (d.confidentiel && (!avecConf || (!this.confLisible && videSous(v)))) continue; // valeur non lue : conservée
        f[d.colId] = this.versGrist(d, v);
      }
      if (seulementConf) return f;
      f[this.colDossier] = dossier;
      if (this.colLigne) f[this.colLigne] = l._id;
      if (this.colOrdre) f[this.colOrdre] = k + 1;
      return f;
    };
    if (!complet) {
      // version qui ne devient pas la dernière : seules les données confidentielles des lignes existantes changent
      const maj = lignes
        .map((l) => parLigne.get(l._id) && { id: parLigne.get(l._id).id, fields: champs(l, 0, true) })
        .filter((x) => x && Object.keys(x.fields).length);
      if (maj.length && avecConf) await ops.update(maj);
      return maj.length;
    }
    const maj = [],
      ajout = [],
      gardees = new Set();
    lignes.forEach((l, k) => {
      const x = parLigne.get(l._id);
      if (x && !gardees.has(x.id)) {
        maj.push({ id: x.id, fields: champs(l, k) });
        gardees.add(x.id);
      } else ajout.push({ fields: champs(l, k) });
    });
    const suppr = existantes.filter((x) => !gardees.has(x.id)).map((x) => x.id);
    if (maj.length) await ops.update(maj);
    if (ajout.length) await ops.create(ajout);
    if (suppr.length) await ops.destroy(suppr);
    return maj.length + ajout.length + suppr.length;
  },
  /* ----- table historisée : copie des lignes pour une version du dossier
     version : la version écrite (création, mise à jour, correction, reconstruction) ; absente et complet = false :
     seules les données confidentielles des lignes de la version la plus récente changent (aucune nouvelle version). */
  async synchroniserVersions(dossier, complet, t, lignesSource, avecConf, version) {
    const ops = grist.getTable(this.table),
      cV = this.colVersion,
      cM = this.colMouvement && t[this.colMouvement] ? this.colMouvement : null;
    const lignes = lignesSource || this.lignesValides();
    const lignesT = t.id
      .map((id, i) => ({
        id,
        i,
        v: refId(t[cV][i]) || 0,
        ligne: this.colLigne ? t[this.colLigne][i] : null,
        m: cM ? t[cM][i] : null,
      }))
      .filter((x) => refId(t[this.colDossier][x.i]) === dossier || t[this.colDossier][x.i] === dossier);
    // versions connues du dossier (ordre de création)
    const cD = col("Dossier"),
      versionsDossier = etatSaisie.enregistrements
        .filter((l) => (refId(cD && l[cD]) || l.id) === dossier)
        .map((l) => l.id)
        .sort((a, b) => a - b);
    const plusRecente = Math.max(0, ...versionsDossier, ...lignesT.map((x) => x.v));
    let n = 0;
    // lignes d'avant l'historique (sans version) : rattachées à la version qui précède celle écrite (ou à la plus récente)
    const anciennes = lignesT.filter((x) => !x.v);
    if (anciennes.length) {
      const avant = version ? Math.max(0, ...versionsDossier.filter((v) => v < version)) : 0;
      const cible = avant || version || plusRecente || dossier;
      await ops.update(
        anciennes.map((x) => ({ id: x.id, fields: { [cV]: cible, ...(cM && !x.m ? { [cM]: "Ajout" } : {}) } })),
      );
      anciennes.forEach((x) => {
        x.v = cible;
        if (cM && !x.m) x.m = "Ajout";
      });
      n += anciennes.length;
    }
    const brut = (x, d) => (t[d.colId] ? t[d.colId][x.i] : undefined);
    const lisibleBrut = (v) => v !== undefined && !(Array.isArray(v) && v[0] === "C");
    // données confidentielles seules : lignes de la version la plus récente du dossier
    if (!version && !complet) {
      const vMax = Math.max(0, ...lignesT.map((x) => x.v)),
        parLigne = new Map(lignesT.filter((x) => x.v === vMax && x.m !== "Retrait").map((x) => [x.ligne, x]));
      const maj = lignes
        .map(
          (l) => parLigne.get(l._id) && { id: parLigne.get(l._id).id, fields: this.champsGrist(l, 0, true, avecConf) },
        )
        .filter((x) => x && Object.keys(x.fields).length);
      if (maj.length && avecConf) await ops.update(maj);
      return n + maj.length;
    }
    const v = version || plusRecente || dossier;
    const courantes = lignesT.filter((x) => x.v === v);
    const vPrec = Math.max(0, ...lignesT.filter((x) => x.v && x.v < v).map((x) => x.v));
    const prec = new Map(lignesT.filter((x) => x.v === vPrec && x.m !== "Retrait").map((x) => [x.ligne, x]));
    const norm = (x) =>
      x == null || x === "" || (Array.isArray(x) && x.length <= 1 && (x[0] === "L" || !x.length))
        ? null
        : JSON.stringify(x);
    const voulues = [];
    lignes.forEach((l, k) => {
      const f = this.champsGrist(l, k, false, avecConf),
        p = prec.get(l._id);
      // confidentiel non lu ou non écrit : repris de la version précédente
      if (p)
        for (const d of this.sousDefs)
          if (d.confidentiel && !(d.colId in f) && lisibleBrut(brut(p, d))) f[d.colId] = brut(p, d);
      const identique =
        p && this.sousDefs.filter((d) => !d.confidentiel).every((d) => norm(brut(p, d)) === norm(f[d.colId]));
      f[this.colDossier] = dossier;
      f[cV] = v;
      if (cM) f[cM] = !p ? "Ajout" : identique ? "Inchangée" : "Modification";
      voulues.push({ ligne: l._id, fields: f });
    });
    // lignes retirées depuis la version précédente : recopiées avec leurs dernières valeurs
    const gardes = new Set(lignes.map((l) => l._id));
    for (const [lid, p] of prec) {
      if (gardes.has(lid)) continue;
      const f = { [this.colDossier]: dossier, [cV]: v };
      if (this.colLigne) f[this.colLigne] = lid;
      if (this.colOrdre && t[this.colOrdre]) f[this.colOrdre] = t[this.colOrdre][p.i];
      for (const d of this.sousDefs) {
        const x = brut(p, d);
        if (lisibleBrut(x)) f[d.colId] = x;
      }
      if (cM) f[cM] = "Retrait";
      voulues.push({ ligne: lid, fields: f });
    }
    // lignes de cette version : mises à jour (correction), ajoutées, ou supprimées si elles n'ont plus lieu d'être
    const parLigne = new Map(courantes.filter((x) => x.ligne).map((x) => [x.ligne, x])),
      maj = [],
      ajout = [],
      gardees = new Set();
    for (const w of voulues) {
      const x = parLigne.get(w.ligne);
      if (x && !gardees.has(x.id)) {
        maj.push({ id: x.id, fields: w.fields });
        gardees.add(x.id);
      } else ajout.push({ fields: w.fields });
    }
    const suppr = courantes.filter((x) => !gardees.has(x.id)).map((x) => x.id);
    if (maj.length) await ops.update(maj);
    if (ajout.length) await ops.create(ajout);
    if (suppr.length) await ops.destroy(suppr);
    return n + maj.length + ajout.length + suppr.length;
  },
  // champs Grist d'une ligne saisie (seulementConf : les confidentiels seuls) ; un confidentiel non lu n'est pas écrit
  champsGrist(l, k, seulementConf, avecConf = true) {
    const f = {};
    for (const d of this.sousDefs) {
      if (seulementConf && !d.confidentiel) continue;
      const vis = this.visible(l, d),
        v = vis ? l.valeurs[d.colId] : null;
      if (d.confidentiel && (!avecConf || (!this.confLisible && videSous(v)))) continue;
      f[d.colId] = this.versGrist(d, v);
    }
    if (seulementConf) return f;
    if (this.colLigne) f[this.colLigne] = l._id;
    if (this.colOrdre) f[this.colOrdre] = k + 1;
    return f;
  },
  lignesDepuisJson(json) {
    return lireTableauJson(json)
      .map((o) => {
        const { _id, ...valeurs } = o;
        return { _id: _id || nouvelIdLigne(), valeurs };
      })
      .filter((l) => !this.ligneVide(l));
  },
});
const controleursTableau = (prefix) =>
  Object.values(tableaux).filter((c) => c.prefix === prefix && document.body.contains(c.el));
// Après enregistrement d'une version : réécrit les tables dédiées pour ce dossier
// version : ligne de la version écrite (tables historisées) ; sans elle et complet = false : confidentiels seuls
async function synchroniserTableaux(dossier, complet, version = null) {
  const erreurs = [];
  for (const c of controleursTableau("q")) {
    try {
      await c.synchroniser(dossier, complet, null, null, true, version);
    } catch (e) {
      erreurs.push(`table « ${c.table} » : ${e.message || e}`);
    }
  }
  return erreurs;
}
/* Sites supprimés du dossier (saisis à tort, 2.50) : après l'enregistrement, leurs lignes sont retirées de toutes les
   versions du dossier (colonne de la question et questions des formulaires précédents) et de la table dédiée (lignes
   de toutes les versions, retraits compris). Une ligne est visée par son identifiant (même corrigée entre-temps) ou par
   la clé de son site. */
async function purgerSitesSupprimes(dossier) {
  const erreurs = [];
  for (const c of controleursTableau("q")) {
    const sup = c.supprimes || [];
    if (!sup.length || !c.sites) continue;
    const etab =
      refId(val(etatSaisie.initiale, "Etablissement")) || (etatSaisie.etabCourant && etatSaisie.etabCourant.id) || 0;
    // un site encore présent dans le tableau (ressaisi sur une autre ligne) n'est visé que par l'identifiant de la ligne supprimée
    const gardees = new Set(
      c
        .lignesValides()
        .map((l) => c.cleSite(etab, l.valeurs))
        .filter(Boolean),
    );
    const ids = new Set(sup.map((x) => x._id).filter(Boolean)),
      cles = new Set(sup.map((x) => x.cle).filter((k) => k && !gardees.has(k)));
    const vise = (o, v) => (o._id && ids.has(o._id)) || cles.has(c.cleSite(etab, v || o));
    const cD = col("Dossier"),
      maj = [];
    for (const l of etatSaisie.enregistrements.filter((r) => (refId(cD && r[cD]) || r.id) === dossier)) {
      const f = {},
        filtrer = (colonne, vue) => {
          const a = lireTableauJson(l[colonne]),
            b = a.filter((o) => !vise(o, vue ? vue(o) : null));
          if (b.length !== a.length) f[colonne] = b.length ? JSON.stringify(b) : "";
        };
      filtrer(c.def.colId);
      for (const h of c.sites.historique || []) filtrer(h.colonne, (o) => c.vueHistorique(h, o));
      if (Object.keys(f).length) maj.push({ id: l.id, fields: f });
    }
    try {
      if (maj.length) await grist.getTable().update(maj);
    } catch (e) {
      erreurs.push(`suppression des sites dans les étapes du dossier : ${e.message || e}`);
    }
    if (c.pret && c.colDossier)
      try {
        const t = await Donnees.lire(c.table),
          suppr = [];
        t.id.forEach((id, i) => {
          if (refId(t[c.colDossier][i]) !== dossier && t[c.colDossier][i] !== dossier) return;
          const v = {};
          for (const d of c.sousDefs) if (t[d.colId]) v[d.colId] = t[d.colId][i];
          if ((c.colLigne && ids.has(t[c.colLigne][i])) || cles.has(c.cleSite(etab, v))) suppr.push(id);
        });
        if (suppr.length) await grist.getTable(c.table).destroy(suppr);
      } catch (e) {
        erreurs.push(`table « ${c.table} » (sites supprimés) : ${e.message || e}`);
      }
    c.supprimes = [];
    c.dessiner();
  }
  return erreurs;
}
// Réglages : reconstruit les tables dédiées à partir de la dernière version de chaque dossier ;
// table historisée : à partir de chaque version, dans l'ordre (tout l'historique, mouvements compris)
async function reconstruireTableaux() {
  const ctrl = controleursTableau("q").filter((c) => c.pret && c.colDossier);
  if (!ctrl.length) {
    statut("statut-tableaux", "Aucune question « tableau » associée au widget.", "err");
    return;
  }
  let n = 0;
  try {
    for (const c of ctrl) {
      const t = await Donnees.lire(c.table);
      if (c.colVersion && t[c.colVersion]) {
        const cD = col("Dossier");
        for (const l of etatSaisie.dossiersInit) {
          const vs = etatSaisie.enregistrements
            .filter((x) => (refId(cD && x[cD]) || x.id) === l.id)
            .sort((a, b) => a.id - b.id);
          for (const v of vs)
            n += await c.synchroniser(l.id, true, null, c.lignesDepuisJson(v[c.def.colId]), false, v.id);
        }
        continue;
      }
      for (const l of etatSaisie.dossiersInit) {
        const der = derniereDe(l);
        n += await c.synchroniser(l.id, true, t, c.lignesDepuisJson(der[c.def.colId]), false);
      }
    }
    statut(
      "statut-tableaux",
      `Tables reconstruites (${n} ligne(s) ajoutée(s), mise(s) à jour ou supprimée(s)). Les données confidentielles déjà saisies sont conservées.`,
      "ok",
    );
  } catch (e) {
    statut("statut-tableaux", `Échec : ${e.message || e}`, "err");
  }
}
document.addEventListener("click", (ev) => {
  // ferme les menus déroulants des tableaux au clic à l'extérieur
  document.querySelectorAll(".tableau-rep .multi[open]").forEach((x) => {
    if (!x.contains(ev.target)) x.open = false;
  });
});

const texteErreursTableaux = (e) => (e.length ? ` Attention, mise à jour incomplète de ${e.join(" ; ")}.` : "");
const confidentielsModifies = () => controleursTableau("q").some((c) => c.confModifie);
const finConfidentiels = () =>
  controleursTableau("q").forEach((c) => {
    c.confModifie = false;
  });
$("btn-reconstruire").addEventListener("click", () => enFile(reconstruireTableaux));

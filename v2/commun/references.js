/* =====================================================================
   Socle v2 — report des références vers des lignes remplacées
   ---------------------------------------------------------------------
   Quand une ligne d'une table est retirée au profit d'une autre (établissement fusionné ou devenu site, site fusionné),
   les colonnes Référence et Liste de références qui la désignent, dans toutes les tables du document (signalements,
   sites, correspondances, Membre de…), doivent désigner la ligne qui la remplace.
   Les tables de synthèse (résumés de Grist) sont ignorées : elles se recalculent d'elles-mêmes.
   Utilisé par l'administration (import du référentiel ESR) et par le widget « Référentiel des sites » (file de vérification).
   API : References.chercher(meta, table, ids, { exclure(table, colId) }) → [{ table, col, id, liste, valeur }]
         References.actions(refs, vers) → actions UpdateRecord (vers : Map ligne retirée → ligne qui la remplace)
   ===================================================================== */
(function () {
  "use strict";
  const refId = v => typeof v === "number" ? v : (v && typeof v === "object" && "rowId" in v) ? v.rowId : (Array.isArray(v) && v[0] === "R") ? v[2] : null;
  const liste = v => Array.isArray(v) ? v.slice(v[0] === "L" ? 1 : 0) : [];

  async function chercher(meta, table, ids, opts = {}) {
    const cherche = ids instanceof Set ? ids : new Set(ids), exclure = opts.exclure || (() => false), refs = [];
    if (!cherche.size) return refs;
    // tables de synthèse (résumés) : calculées par Grist, leurs colonnes de regroupement ne s'écrivent pas
    const resumes = new Set();
    try { const gt = await grist.docApi.fetchTable("_grist_Tables"); (gt.summarySourceTable || []).forEach((src, i) => { if (src) resumes.add(gt.tableId[i]); }); } catch (_) { /* métadonnées illisibles */ }
    for (const [t, m] of Object.entries(meta)) {
      if (t.startsWith("_grist") || resumes.has(t) || /_summary_/.test(t)) continue;
      const cols = Object.values(m.colonnes).filter(c => !c.isFormula && (c.type === `Ref:${table}` || c.type === `RefList:${table}`) && !exclure(t, c.colId));
      if (!cols.length) continue;
      const d = await grist.docApi.fetchTable(t);
      for (const c of cols) (d[c.colId] || []).forEach((v, i) => {
        const estListe = c.type.startsWith("RefList"), l = estListe ? liste(v) : [refId(v)];
        if (l.some(x => cherche.has(x))) refs.push({ table: t, col: c.colId, id: d.id[i], liste: estListe, valeur: v });
      });
    }
    return refs;
  }

  function actions(refs, vers) {
    return refs.map(r => {
      const v = r.liste ? ["L", ...new Set(liste(r.valeur).map(x => vers.get(x) || x))] : (vers.get(refId(r.valeur)) || refId(r.valeur));
      return ["UpdateRecord", r.table, r.id, { [r.col]: v }];
    });
  }

  window.References = { chercher, actions };
})();

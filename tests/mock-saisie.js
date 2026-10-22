// Compléments du faux Grist pour le widget de saisie (table liée Reponses)
(function(){
 const D = window.__DOC__, data = D.__data;
 let cbRecords = null, cbRecord = null;
 const lignes = tid => { const t = data[tid]; const cols = Object.keys(t).filter(k=>k!=='id'); return t.id.map((id,i)=>{ const r={id}; cols.forEach(c=>r[c]=t[c][i]===undefined?null:t[c][i]); return r; }); };
 window.__emit = () => { if (cbRecords) cbRecords(lignes('Reponses'), null); };
 const _apply = grist.docApi.applyUserActions;
 grist.docApi.applyUserActions = async acts => { const r = await _apply(acts); setTimeout(window.__emit, 10); return r; };
 const tableObj = tid => ({ getTableId: async () => tid,
   create: async recs => { const l = Array.isArray(recs) ? recs : [recs], ids = [];
     for (const {fields} of l) { await grist.docApi.applyUserActions([["AddRecord", tid, null, fields]]); ids.push({ id: data[tid].id[data[tid].id.length-1] }); }
     return Array.isArray(recs) ? ids : ids[0]; },
   update: async recs => grist.docApi.applyUserActions((Array.isArray(recs) ? recs : [recs]).map(({id, fields}) => ["UpdateRecord", tid, id, fields])),
   destroy: async ids => grist.docApi.applyUserActions((Array.isArray(ids) ? ids : [ids]).map(id => ["RemoveRecord", tid, id])) });
 Object.assign(grist, {
   getTable: tid => tableObj(tid || 'Reponses'),
   onRecords: (cb) => { cbRecords = cb; setTimeout(window.__emit, 50); },
   onRecord: cb => { cbRecord = cb; }, onNewRecord: () => {}, onOptions: () => {},
   getOption: async k => (window.__OPTS__ || {})[k] ?? null, setOption: async () => {}, setCursorPos: async () => {},
 });
 grist.docApi.listTables = async () => D._grist_Tables.tableId.slice();
 grist.docApi.getAccessToken = async () => ({ token: 't', baseUrl: 'http://localhost/x' });
 grist.docApi.getDocName = async () => 'doc';
})();

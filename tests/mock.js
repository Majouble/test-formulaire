// Faux Grist en mémoire : métadonnées + tables, actions utilisateur principales
(function(){
const D = window.__DOC__;
let nextT = Math.max(100, ...D._grist_Tables.id), nextC = Math.max(1000, ...D._grist_Tables_column.id);
const T = D._grist_Tables, C = D._grist_Tables_column;
const data = D.__data || (D.__data = {});
function tref(tid){ return T.id[T.tableId.indexOf(tid)]; }
function addCol(tid, colId, info){ C.id.push(++nextC); C.parentId.push(tref(tid)); C.colId.push(colId); C.type.push(info.type||'Any'); C.label.push(colId); C.isFormula.push(!!info.isFormula); C.formula.push(info.formula||''); C.widgetOptions.push(info.widgetOptions||''); }
function addTable(tid, cols){ if (T.tableId.includes(tid)) throw new Error('table exists '+tid); T.id.push(++nextT); T.tableId.push(tid); data[tid]={id:[]}; cols.forEach(c=>addCol(tid,c.id,c)); }
const actions = {
  SetDisplayFormula:()=>{},
  AddRawTable:(tid)=>{ addTable(tid,[{id:'A'},{id:'B'},{id:'C'}]); },
  AddTable:(tid,cols)=>{ addTable(tid,cols); },
  // RenameTable de Grist : identifiant de la table, données, références (Ref:/RefList:) des autres colonnes
  RenameTable:(ancien,nouveau)=>{ if(!T.tableId.includes(ancien)) throw new Error('no table '+ancien); if(T.tableId.includes(nouveau)) throw new Error('table exists '+nouveau);
    T.tableId[T.tableId.indexOf(ancien)]=nouveau; data[nouveau]=data[ancien]; delete data[ancien];
    C.type.forEach((ty,k)=>{ if(ty==='Ref:'+ancien) C.type[k]='Ref:'+nouveau; else if(ty==='RefList:'+ancien) C.type[k]='RefList:'+nouveau; }); },
  AddColumn:(tid,colId,info)=>{ if(!T.tableId.includes(tid)) throw new Error('no table '+tid); addCol(tid,colId,info); },
  RemoveColumn:(tid,colId)=>{ const r=tref(tid); const i=C.id.findIndex((_,k)=>C.parentId[k]===r&&C.colId[k]===colId); if(i<0) throw new Error('no col'); for(const k of Object.keys(C)) C[k].splice(i,1); },
  ModifyColumn:(tid,colId,info)=>{ const r=tref(tid); const i=C.id.findIndex((_,k)=>C.parentId[k]===r&&C.colId[k]===colId); if(i<0) throw new Error('no col '+colId); for(const [k,v] of Object.entries(info)) { if (k==='untieColIdFromLabel') continue; if(!C[k]) C[k]=C.id.map(()=>''); C[k][i]=v; } },
  AddRecord:(tid,_,f)=>{ const t=data[tid]; if(!t) throw new Error('no table '+tid); const id=(t.id.length?Math.max(...t.id):0)+1; t.id.push(id); for(const [k,v] of Object.entries(f)){ (t[k]=t[k]||[])[t.id.length-1]=v; } return id; },
  BulkAddRecord:(tid,ids,cols)=>{ const n=ids.length; for(let k=0;k<n;k++){ const f={}; for(const [c,v] of Object.entries(cols)) f[c]=v[k]; actions.AddRecord(tid,null,f);} },
  BulkRemoveRecord:(tid,ids)=>{ ids.forEach(id=>actions.RemoveRecord(tid,id)); },
  RemoveRecord:(tid,id)=>{ const t=data[tid]; const i=t.id.indexOf(id); if(i<0) throw new Error('no rec'); for(const k of Object.keys(t)) if(Array.isArray(t[k])) t[k].splice(i,1); },
  BulkUpdateRecord:(tid,ids,cols)=>{ ids.forEach((id,k)=>{ const f={}; for(const [c,v] of Object.entries(cols)) f[c]=v[k]; actions.UpdateRecord(tid,id,f); }); },
  UpdateRecord:(tid,id,f)=>{ const t=data[tid]; const i=t.id.indexOf(id); for(const [k,v] of Object.entries(f)){ (t[k]=t[k]||[])[i]=v; } },
};
window.__LOG__=[];
if(!data._grist_ACLResources){ data._grist_ACLResources={id:[1],tableId:[''],colIds:['']}; data._grist_ACLRules={id:[1],resource:[1],aclFormula:[''],permissionsText:[''],rulePos:[1],memo:[''],userAttributes:['']}; }
D._grist_Views = D._grist_Views || {id:[],name:[]};
D._grist_Views_section = D._grist_Views_section || {id:[],parentId:[],parentKey:[],tableRef:[],options:[],title:[]};
D._grist_Pages = D._grist_Pages || {id:[],viewRef:[]};
const META_EXTRA = ['_grist_Views','_grist_Views_section','_grist_Pages'];
actions.CreateViewSection = (tableRef, viewRef, kind)=>{ const V=D._grist_Views, Sx=D._grist_Views_section; const vid=(V.id.length?Math.max(...V.id):0)+1; V.id.push(vid); V.name.push('Nouvelle'); const sid=(Sx.id.length?Math.max(...Sx.id):0)+1; Sx.id.push(sid); Sx.parentId.push(vid); Sx.parentKey.push(kind); Sx.tableRef.push(tableRef); Sx.options.push('{}'); Sx.title.push(''); const P=D._grist_Pages; if(!viewRef){ const pid=(P.id.length?Math.max(...P.id):0)+1; P.id.push(pid); P.viewRef.push(vid); if(P.pagePos) P.pagePos.push(P.id.length); if(P.indentation) P.indentation.push(0);} return {sectionRef:sid, viewRef:vid}; };
const _upd = actions.UpdateRecord;
actions.UpdateRecord = (tid,id,f)=>{ if (META_EXTRA.includes(tid)) { const t=D[tid]; const i=t.id.indexOf(id); for (const [k,v] of Object.entries(f)) t[k][i]=v; return; } return _upd(tid,id,f); };
window.grist = { ready(){}, docApi: {
  async fetchTable(n){ if (n==='_grist_Tables'||n==='_grist_Tables_column'||(n.startsWith('_grist_')&&D[n])) return JSON.parse(JSON.stringify(D[n])); if(!data[n]) throw new Error('KeyError '+n); return JSON.parse(JSON.stringify(data[n])); },
  async applyUserActions(acts){ window.__LOG__.push(acts); const rv=[]; for(const [a,...args] of acts){ if(!actions[a]) throw new Error('action inconnue '+a); rv.push(actions[a](...args));} return {retValues:rv}; } } };
})();

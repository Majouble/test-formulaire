window.__FETCHLOG__=[];
const ROWS=[
 {identifiant_de_l_etablissement:"0781234A",nom_etablissement:"Collège Jean Moulin",type_etablissement:"Collège",nom_commune:"Versailles",libelle_academie:"Versailles",libelle_departement:"Yvelines",mail:"ce.0781234a@ac-versailles.fr",statut_public_prive:"Public",libelle_nature:"COLLEGE",nom_circonscription:"Circ test",latitude:48.8,longitude:2.1,etat:"OUVERT"},
 {identifiant_de_l_etablissement:"0941111B",nom_etablissement:"Lycée Romain Rolland",type_etablissement:"Lycée",nom_commune:"Ivry-sur-Seine",libelle_academie:"Créteil",libelle_departement:"Val-de-Marne",mail:null,statut_public_prive:"Public",libelle_nature:"COLLEGE",nom_circonscription:"Circ test",latitude:48.8,longitude:2.1,etat:"OUVERT"},
 {identifiant_de_l_etablissement:"0942222C",nom_etablissement:"Ecole Jules Ferry",type_etablissement:"Ecole",nom_commune:"Vitry",libelle_academie:"Créteil",libelle_departement:"Val-de-Marne",mail:null,statut_public_prive:"Public",libelle_nature:"COLLEGE",nom_circonscription:"Circ test",latitude:48.8,longitude:2.1,etat:"OUVERT"},
];
window.fetch = async (url)=>{ window.__FETCHLOG__.push(decodeURIComponent(url)); const u=new URL(url);
 const ok=b=>({ok:true,status:200,json:async()=>b});
 if (u.pathname.endsWith('fr-en-annuaire-education')) return ok({fields:[...Object.keys(ROWS[0]).map(n=>({name:n,label:n.replace(/_/g,' '),type:'text'})),{name:'latitude',label:'Latitude',type:'double'}]});
 const where=u.searchParams.get('where')||''; const rows=ROWS.filter(r=>!/type_etablissement=/.test(where)||where.includes(`"${r.type_etablissement}"`));
 if (u.pathname.endsWith('/records')) { const g=u.searchParams.get('group_by'); const m={}; rows.forEach(r=>m[r[g]]=(m[r[g]]||0)+1); return ok({results:Object.entries(m).map(([k,n])=>({[g]:k,n}))}); }
 if (u.pathname.endsWith('/exports/json')) { const sel=u.searchParams.get('select').split(','); return ok(rows.map(r=>Object.fromEntries(sel.map(c=>[c,r[c]===undefined?null:r[c]])))); }
 return {ok:false,status:404,json:async()=>({message:'?'})};
};

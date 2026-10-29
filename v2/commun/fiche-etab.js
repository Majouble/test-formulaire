/* =====================================================================
   Socle v2 — fiche d'un établissement du référentiel, modifiable sur place
   ---------------------------------------------------------------------
   Utilisée par l'administration (onglet Référentiel) et par le widget « Référentiel des sites ».
   - toutes les colonnes du référentiel des établissements, sauf la clé et le lien d'accès (UUID, Lien) ;
     les principales d'abord (nom, sigle, type, rattachement, secteur, tutelle, effectif, localisation…),
     les autres repliées ; les formules en lecture seule ;
   - champ adapté au type de la colonne (nombre, date, liste de choix, case, référence vers une autre table) ;
   - chaque modification est enregistrée aussitôt (UpdateRecord) ;
   - « Ajouter une information au référentiel » crée une colonne (texte, nombre, liste de choix, case, date).
   Sert aussi à modifier une saisie (table des réponses, « À vérifier ») : options de charger { exclure: [colonnes],
   lectureSeule(colId, valeur, fiche) → vrai pour afficher sans modifier, ordre: "table" (ordre des colonnes, sans « Autres
   informations »), sansAjout: vrai (pas d'ajout de colonne) }.
   API : FicheEtab.charger(meta, table, options?) → fiche ; FicheEtab.html(fiche, idLigne, prefixe) ;
         FicheEtab.lier(racine, fiche, idLigne, { prefixe, dire(texte, erreur), apresAjout() }).
   ===================================================================== */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const refId = v => typeof v === "number" ? v : (v && typeof v === "object" && "rowId" in v) ? v.rowId : (Array.isArray(v) && v[0] === "R") ? v[2] : null;
  const cibleRef = t => (/^Ref(?:List)?:(.+)$/.exec(String(t || "")) || [])[1] || null;
  const PRIORITE = [/^(nom|etablissement)$/, /libelle_consolide/, /^sigle/, /^type|typologie/, /^niveau$/, /rattach/, /secteur|public_prive/, /tutelle|ministere/,
    /effectif|nombre.*etudiant|nb.*etudiant/, /^academie/, /^region/, /^departement/, /^commune/, /uai/, /^etat$/, /mots_cles/, /^mail|courriel/, /^site_web|url/, /^latitude/, /^longitude/];
  const cleTxt = x => norm(x).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const rang = c => { const k = PRIORITE.findIndex(re => re.test(cleTxt(c.colId)) || re.test(cleTxt(c.label))); return k < 0 ? 999 : k; };

  async function charger(meta, table, opts = {}) {
    const tm = meta[table]; if (!tm) return null;
    const t = await grist.docApi.fetchTable(table), exclure = new Set(opts.exclure || []);
    const cols = Object.values(tm.colonnes).filter(c => !/^(manualSort|gristHelper)/.test(c.colId) && !/^(uuid|lien|cle)$/i.test(c.colId) && !exclure.has(c.colId));
    const nomCol = (cols.find(c => /^(nom|etablissement)$/i.test(c.colId) && /^Text/.test(c.type)) || cols.find(c => /^Text/.test(c.type)) || {}).colId;
    if (opts.ordre !== "table") cols.sort((a, b) => rang(a) - rang(b));
    // libellés des colonnes Référence (académie, établissement de rattachement…)
    const refs = {};
    for (const c of cols) {
      const cible = cibleRef(c.type); if (!cible || refs[cible]) continue;
      try {
        const tc = cible === table ? t : await grist.docApi.fetchTable(cible);
        const cn = cible === table ? nomCol : (Object.keys(tc).find(k => /^(nom|libelle|intitule|etablissement)/i.test(k) && (tc[k] || []).some(x => typeof x === "string"))
          || Object.keys(tc).find(k => k !== "id" && (tc[k] || []).some(x => typeof x === "string")));
        refs[cible] = tc.id.map((id, i) => ({ id, lib: String(cn ? tc[cn][i] ?? "" : id) })).sort((a, b) => a.lib.localeCompare(b.lib, "fr"));
      } catch (_) { refs[cible] = []; }
    }
    return { table, meta: tm, cols, t, nomCol, pos: new Map(t.id.map((id, i) => [id, i])), principales: opts.ordre === "table" ? cols.length : cols.filter(c => rang(c) < 999).length, refs, opts };
  }
  const versDate = s => typeof s === "number" ? new Date(s * 1000).toISOString().slice(0, 10) : "";
  function champ(fe, c, i, px) {
    const v = fe.t[c.colId] ? fe.t[c.colId][i] : null, ty = String(c.type).split(":")[0], id = `${px}${c.colId}`;
    const lecture = c.isFormula || !!(fe.opts && fe.opts.lectureSeule && fe.opts.lectureSeule(c.colId, v, fe));
    const lab = `<label for="${id}">${esc(c.label)}${c.isFormula ? ` <span class="aide">(formule)</span>` : lecture ? ` <span class="aide">(non modifiable ici)</span>` : ""}</label>`;
    let ctl;
    const montre = Array.isArray(v) ? v.slice(1).join(", ") : v == null ? "—" : typeof v === "number" && /^Date/.test(ty) ? new Date(v * 1000).toLocaleString("fr-FR", ty === "Date" ? { timeZone: "UTC", dateStyle: "short" } : { dateStyle: "short", timeStyle: "short" }) : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (lecture) ctl = `<div class="aide fe-lecture" id="${id}">${esc(montre.length > 240 ? montre.slice(0, 240) + "…" : montre)}</div>`;
    else if (ty === "Bool") ctl = `<input type="checkbox" id="${id}" data-fe="${esc(c.colId)}"${v ? " checked" : ""}>`;
    else if (ty === "Int" || ty === "Numeric") ctl = `<input type="number" id="${id}" data-fe="${esc(c.colId)}" step="${ty === "Int" ? 1 : "any"}" value="${v ?? ""}">`;
    else if (ty === "Date") ctl = `<input type="date" id="${id}" data-fe="${esc(c.colId)}" value="${versDate(v)}">`;
    else if (ty === "DateTime") ctl = `<input type="datetime-local" id="${id}" data-fe="${esc(c.colId)}" value="${typeof v === "number" ? (d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16))(new Date(v * 1000)) : ""}">`;
    else if (ty === "Choice") {
      let ch = []; try { ch = JSON.parse(c.widgetOptions || "{}").choices || []; } catch (_) { ch = []; }
      if (v && !ch.includes(v)) ch = [v, ...ch];
      ctl = `<select id="${id}" data-fe="${esc(c.colId)}"><option value="">—</option>${ch.map(x => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
    } else if (ty === "Ref") {
      const l = fe.refs[cibleRef(c.type)] || [], r = refId(v);
      ctl = `<select id="${id}" data-fe="${esc(c.colId)}"><option value="">—</option>${l.map(o => `<option value="${o.id}"${o.id === r ? " selected" : ""}>${esc(o.lib)}</option>`).join("")}</select>`;
    } else if (ty === "ChoiceList" || ty === "RefList") ctl = `<input type="text" id="${id}" data-fe="${esc(c.colId)}" data-liste="1" value="${esc(Array.isArray(v) ? v.slice(1).join(", ") : "")}" placeholder="valeurs séparées par des virgules"${ty === "RefList" ? " disabled" : ""}>`;
    else { const txt = v == null ? "" : String(v); ctl = txt.length > 90 ? `<textarea id="${id}" data-fe="${esc(c.colId)}" rows="2">${esc(txt)}</textarea>` : `<input type="text" id="${id}" data-fe="${esc(c.colId)}" value="${esc(txt)}">`; }
    return `<div class="fe-champ">${lab}${ctl}</div>`;
  }
  function html(fe, idLigne, px = "fe-") {
    const i = fe && fe.pos.get(+idLigne); if (i === undefined) return "";
    if (fe.opts && fe.opts.sansAjout) return `<div class="fe-grille">${fe.cols.slice(0, fe.principales).map(c => champ(fe, c, i, px)).join("")}</div>`;
    return `<div class="fe-grille">${fe.cols.slice(0, fe.principales).map(c => champ(fe, c, i, px)).join("")}</div>
      ${fe.cols.length > fe.principales ? `<details class="fe-autres"><summary>Autres informations (${fe.cols.length - fe.principales})</summary><div class="fe-grille">${fe.cols.slice(fe.principales).map(c => champ(fe, c, i, px)).join("")}</div></details>` : ""}
      <details class="fe-autres"><summary>Ajouter une information au référentiel</summary>
        <div class="sites-outils fe-ajout-ligne"><label>Nom <input type="text" id="${px}nouv" placeholder="ex. Tutelle, Effectif 2026"></label>
          <label>Type <select id="${px}type"><option value="Text">Texte</option><option value="Int">Nombre entier</option><option value="Numeric">Nombre décimal</option><option value="Choice">Liste de choix</option><option value="Bool">Case à cocher</option><option value="Date">Date</option></select></label>
          <button type="button" class="secondaire" id="${px}ajout">Ajouter la colonne</button></div>
        <p class="aide">La colonne est créée dans « ${esc(fe.table)} » pour tous les établissements. Pour une liste de choix, les choix se règlent ensuite dans Grist (options de la colonne).</p></details>`;
  }
  function lier(racine, fe, idLigne, opts = {}) {
    const px = opts.prefixe || "fe-", dire = opts.dire || (() => {}), id = +idLigne, i = fe && fe.pos.get(id);
    if (i === undefined) return;
    racine.querySelectorAll("[data-fe]").forEach(el => el.addEventListener("change", async () => {
      const c = fe.cols.find(x => x.colId === el.dataset.fe), ty = String(c.type).split(":")[0];
      let v;
      if (ty === "Bool") v = el.checked;
      else if (ty === "Int" || ty === "Numeric") v = el.value === "" ? null : (ty === "Int" ? parseInt(el.value, 10) : parseFloat(el.value));
      else if (ty === "Date") v = el.value ? Date.parse(el.value + "T00:00:00Z") / 1000 : null;
      else if (ty === "DateTime") v = el.value ? new Date(el.value).getTime() / 1000 : null;
      else if (ty === "Ref") v = +el.value || 0;
      else if (el.dataset.liste) { const l = el.value.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean); v = l.length ? ["L", ...l] : null; }
      else v = el.value.trim() === "" ? null : el.value;
      try {
        await grist.docApi.applyUserActions([["UpdateRecord", fe.table, id, { [c.colId]: v }]]);
        if (!fe.t[c.colId]) fe.t[c.colId] = fe.t.id.map(() => null);
        fe.t[c.colId][i] = v; dire(`${c.label} enregistré.`);
        if (opts.apresModif) opts.apresModif(c.colId, v);
      } catch (e) { dire(`${c.label} non enregistré (${e.message || e}).`, true); }
    }));
    const aj = racine.querySelector(`#${px}ajout`);
    if (aj) aj.addEventListener("click", async () => {
      const champNom = racine.querySelector(`#${px}nouv`), lib = champNom.value.trim(), type = racine.querySelector(`#${px}type`).value;
      if (!lib) { champNom.focus(); return; }
      let cid = cleTxt(lib).replace(/^(\d)/, "C_$1") || "Information"; cid = cid.charAt(0).toUpperCase() + cid.slice(1);
      while (fe.meta.colonnes[cid]) cid += "_2";
      aj.disabled = true;
      try {
        await grist.docApi.applyUserActions([["AddColumn", fe.table, cid, { type, isFormula: false, label: lib, untieColIdFromLabel: true }]]);
        if (opts.apresAjout) await opts.apresAjout(cid, lib);
      } catch (e) { aj.disabled = false; dire(`Colonne non créée (${e.message || e}).`, true); }
    });
  }
  window.FicheEtab = { charger, html, lier };
})();

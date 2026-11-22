/* =====================================================================
   Demandes de compléments (2.62.0-alpha.41) : moteur et fenêtre de création communs
   ---------------------------------------------------------------------
   Une demande sollicite les partenaires (DSDEN, rectorats, ouverts par leur lien) sur une liste d'établissements choisie
   avec les filtres des Extractions ou de la Fiche établissement :
   - données de l'établissement : colonnes du référentiel demandées aux services (Administration › Référentiel, carte
     « Données demandées aux services »), toutes ou une partie ;
   - et, au besoin, éléments réservés (partie « r » du formulaire) du signalement le plus récent de chaque établissement.
   Chaque partenaire voit, sur sa page des compléments, les établissements de la demande qui sont dans son périmètre ;
   la cellule suit l'avancement dans Administration › Établissements.
   Clé « demandes » de Config = { liste: [{ id, nom, referentiel, etabs: [id], donnees: [colonne], reserves, consigne,
   echeance: "AAAA-MM-JJ", cree_le: ISO, source, close }] } ; illisible des établissements (règles d'accès).
   Un établissement est complet quand chaque donnée demandée est renseignée et, si les éléments réservés sont demandés,
   qu'au moins l'un d'eux est renseigné sur la version la plus récente de son dernier signalement (un établissement sans
   signalement n'a pas d'éléments réservés à donner).
   Définit : window.Demandes = { CLE, liste, enregistrer, vide, tablesReservees, reservesParEtab, avancement, ouvrirCreation }.
   Utilise : Socle (commun/socle.js).
   ===================================================================== */
(function () {
  "use strict";
  const S = () => window.Socle;
  const CLE = "demandes";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const refId = v => typeof v === "number" ? v : (Array.isArray(v) && v[0] === "R") ? v[2] : (v && typeof v === "object" && "rowId" in v) ? v.rowId : null;
  // valeur absente : vide, liste vide, référence nulle (une case décochée vaut « Non » : elle compte comme renseignée)
  const vide = v => v == null || (Array.isArray(v) && v.length <= 1) || (typeof v === "string" && !v.trim());
  const ECHELONS = { dep: "départemental", aca: "académique" };

  const liste = config => ((config && config.valeurs && config.valeurs[CLE] && config.valeurs[CLE].liste) || []).filter(d => d && d.id && Array.isArray(d.etabs));
  // Modifie la liste (relue juste avant, pour ne rien perdre d'une modification faite ailleurs)
  async function enregistrer(fn) {
    const c = await S().lireConfig(), v = (c && c.valeurs[CLE]) || {};
    const l = fn(liste(c));
    await S().ecrireConfig(CLE, { ...v, liste: l });
    return l;
  }

  /* ---------- Éléments réservés ---------- */
  function reserveesDe(conf) {
    const ps = Array.isArray(conf && conf.parties) ? conf.parties : [];
    const ids = new Set(ps.filter(x => x.role === "r").map(x => x.id));
    return ((conf && conf.blocs) || []).filter(b => b.genre === "question" && b.colonne && ids.has(b.section || "q")).map(b => b.colonne);
  }
  // Tables de signalements des formulaires publiés qui visent ce référentiel et ont une partie réservée
  async function tablesReservees(referentiel, config, meta) {
    const g = S().general(config);
    let t; try { t = await grist.docApi.fetchTable(g.formulaires); } catch (_) { return []; }
    const parTable = new Map();
    (t.id || []).forEach((id, i) => {
      let conf = null; try { conf = t.Publie && t.Publie[i] ? JSON.parse(t.Publie[i]) : null; } catch (_) { conf = null; }
      const table = String((t.Table || [])[i] || ""), type = String((t.Type || [])[i] || "etablissement");
      if (!conf || !table || type !== "etablissement" || !meta[table]) return;
      const res = reserveesDe(conf).filter(c => meta[table].colonnes[c]);
      if (!res.length) return;
      const assoc = table === g.reponses ? ((config && config.valeurs.roles && config.valeurs.roles.reponses) || {}) : {};
      const rr = S().resoudreRoles("reponses", meta[table], { reponses: table, referentiel }, assoc, {});
      const col = r => (rr[r] && rr[r].col) || null, etab = col("Etablissement");
      if (!etab || !meta[table].colonnes[etab] || S().cibleRef(meta[table].colonnes[etab].type) !== referentiel) return;
      const x = parTable.get(table) || { table, etab, dossier: col("Dossier"), cree: col("Cree_le"), reservees: [], echelons: [] };
      res.forEach(c => { if (!x.reservees.includes(c)) x.reservees.push(c); });
      conf.parties.filter(p => p.role === "r").forEach(p => (p.echelons || ["dep", "aca"]).forEach(e => { if (!x.echelons.includes(e)) x.echelons.push(e); }));
      parTable.set(table, x);
    });
    return [...parTable.values()];
  }
  // Signalement le plus récent de chaque établissement (version saisie en dernier) : Map(etab -> { table, ligne, dossier, rempli })
  async function reservesParEtab(tables) {
    const out = new Map();
    for (const x of tables) {
      let t; try { t = await grist.docApi.fetchTable(x.table); } catch (_) { continue; }
      (t.id || []).forEach((id, i) => {
        const e = refId((t[x.etab] || [])[i]); if (!e) return;
        const quand = Number((x.cree && t[x.cree] && t[x.cree][i]) || 0), avant = out.get(e);
        if (avant && (avant.quand > quand || (avant.quand === quand && avant.ligne > id))) return;
        out.set(e, { table: x.table, ligne: id, dossier: refId(x.dossier && t[x.dossier] ? t[x.dossier][i] : null) || id, quand,
          rempli: x.reservees.some(c => !vide(t[c] && t[c][i])) });
      });
    }
    return out;
  }

  /* ---------- Avancement ----------
     ref : référentiel lu (fetchTable) ; les établissements absents (hors du périmètre du lecteur) sont ignorés. */
  function avancement(d, ref, reserves) {
    const pos = new Map((ref.id || []).map((id, i) => [id, i])), lignes = [];
    for (const id of d.etabs) {
      const i = pos.get(id); if (i === undefined) continue;
      const manque = (d.donnees || []).filter(c => ref[c] && vide(ref[c][i]));
      const r = d.reserves ? (reserves && reserves.get(id)) || null : null;
      const reserveAFaire = !!(r && !r.rempli);
      lignes.push({ id, i, manque, reserve: r, reserveAFaire, complet: !manque.length && !reserveAFaire });
    }
    return { lignes, total: lignes.length, complets: lignes.filter(l => l.complet).length, ailleurs: d.etabs.length - lignes.length };
  }

  /* ---------- Fenêtre de création ----------
     ouvrirCreation({ referentiel, etabs: [id], source, dire(texte, erreur) }) : nom, données demandées, éléments réservés,
     consigne, échéance ; la demande est ajoutée à la clé « demandes » de Config (propriétaires). */
  const STYLE = `
    dialog.dm { border: 1px solid #ccc; border-radius: 10px; padding: 0; width: min(620px, 94vw); max-height: 90vh; color: inherit; background: var(--carte, var(--fond-carte, #fff)); }
    dialog.dm::backdrop { background: rgba(0,0,0,.35); }
    dialog.dm form { padding: 16px 18px; display: grid; gap: 12px; }
    dialog.dm h2 { margin: 0; font-size: 16px; }
    dialog.dm label.ch { display: grid; gap: 4px; font-weight: 600; }
    dialog.dm label.ch :is(input, textarea) { font: inherit; padding: 6px 8px; border: 1px solid #bbb; border-radius: 4px; width: 100%; box-sizing: border-box; background: inherit; color: inherit; }
    dialog.dm fieldset { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; margin: 0; }
    dialog.dm legend { font-weight: 600; padding: 0 4px; }
    dialog.dm .cases { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px 12px; }
    dialog.dm .cases label { font-weight: 400; }
    dialog.dm .aide { color: #666; font-size: 12px; margin: 4px 0 0; font-weight: 400; }
    dialog.dm .boutons { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    dialog.dm .statut { font-size: 13px; }
    dialog.dm .statut.err { color: #c9191e; }
    dialog.dm button { font: inherit; padding: 6px 12px; border-radius: 4px; border: 1px solid #bbb; background: inherit; color: inherit; cursor: pointer; }
    dialog.dm button.primaire { background: #000091; border-color: #000091; color: #fff; }`;
  const jourFr = iso => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "";
  async function ouvrirCreation({ referentiel, etabs, source, dire }) {
    dire = dire || (() => {});
    const ids = [...new Set((etabs || []).map(Number).filter(n => n > 0))];
    if (!ids.length) { dire("Aucun établissement dans la sélection.", true); return null; }
    const config = await S().lireConfig(), meta = await S().lireMeta();
    if (!config || !meta[referentiel]) { dire("Réglages ou référentiel illisibles.", true); return null; }
    const st = S().reglagesStructurel(config, referentiel), colsRef = meta[referentiel].colonnes;
    const donnees = st ? Object.keys(st.colonnes).filter(c => colsRef[c]) : [];
    const tables = await tablesReservees(referentiel, config, meta);
    const echRes = [...new Set(tables.flatMap(x => x.echelons))];
    if (!document.getElementById("dm-style")) { const s = document.createElement("style"); s.id = "dm-style"; s.textContent = STYLE; document.head.appendChild(s); }
    const vieille = document.getElementById("dm-dialog"); if (vieille) vieille.remove();
    const dlg = document.createElement("dialog"); dlg.className = "dm"; dlg.id = "dm-dialog";
    const qui = ech => (ech || []).map(e => ECHELONS[e]).filter(Boolean).join(" et ") || "—";
    const rien = !donnees.length && !tables.length;
    dlg.innerHTML = `<form method="dialog" novalidate>
      <h2>Demander des compléments aux partenaires</h2>
      <p class="aide" style="margin:0">${ids.length} établissement${ids.length > 1 ? "s" : ""}${source ? ` · ${esc(source)}` : ""}. Chaque partenaire (DSDEN, rectorat…) verra, sur sa page des compléments, ceux de son périmètre.</p>
      ${rien ? `<p class="statut err">Rien à demander : aucune donnée demandée aux services n'est réglée pour « ${esc(referentiel)} » (Administration › Référentiel, carte « Données demandées aux services ») et aucun formulaire n'a de partie réservée aux services.</p>` : `
      <label class="ch">Nom de la demande <input type="text" id="dm-nom" required value="${esc(`Compléments du ${new Date().toLocaleDateString("fr-FR")}`)}"></label>
      ${donnees.length ? `<fieldset><legend>Données de l'établissement à compléter</legend>
        <div class="cases">${donnees.map(c => `<label><input type="checkbox" data-dm-col="${esc(c)}" checked> ${esc((colsRef[c] && colsRef[c].label) || c)}</label>`).join("")}</div>
        <p class="aide">Colonnes du référentiel, renseignées par les partenaires de l'échelon ${qui(st.echelons)} (et nationaux), dans leur périmètre.</p></fieldset>`
      : `<p class="aide">Aucune donnée de l'établissement n'est demandée aux services pour ce référentiel (Administration › Référentiel).</p>`}
      ${tables.length ? `<label><input type="checkbox" id="dm-reserves"${donnees.length ? "" : " checked"}> Éléments réservés du dernier signalement de chaque établissement</label>
        <p class="aide" style="margin-top:-8px">Partie réservée aux services du formulaire (${esc(tables.map(x => x.table).join(", "))}), renseignée par l'échelon ${qui(echRes)} (et nationaux). Établissement sans signalement : rien à donner.</p>` : ""}
      <label class="ch">Consigne pour les partenaires <textarea id="dm-consigne" rows="3" placeholder="Ce que vous attendez, à qui s'adresser…"></textarea></label>
      <label class="ch" style="max-width:220px">Échéance (facultative) <input type="date" id="dm-echeance"></label>`}
      <div class="boutons">${rien ? "" : `<button type="submit" class="primaire" id="dm-creer">Créer la demande</button>`}<button type="button" id="dm-annuler">${rien ? "Fermer" : "Annuler"}</button><span class="statut" id="dm-statut" role="status"></span></div>
    </form>`;
    document.body.appendChild(dlg);
    const $d = id => dlg.querySelector("#" + id);
    return new Promise(fin => {
      const fermer = res => { try { dlg.close(); } catch (_) {} dlg.remove(); fin(res); };
      $d("dm-annuler").addEventListener("click", () => fermer(null));
      dlg.addEventListener("cancel", ev => { ev.preventDefault(); fermer(null); });
      if (!rien) dlg.querySelector("form").addEventListener("submit", async ev => {
        ev.preventDefault();
        const statut = (t, err) => { $d("dm-statut").textContent = t; $d("dm-statut").className = "statut" + (err ? " err" : ""); };
        const nom = $d("dm-nom").value.trim(), cols = [...dlg.querySelectorAll("[data-dm-col]:checked")].map(x => x.dataset.dmCol);
        const reserves = !!($d("dm-reserves") && $d("dm-reserves").checked);
        if (!nom) { statut("Donnez un nom à la demande.", true); $d("dm-nom").focus(); return; }
        if (!cols.length && !reserves) { statut("Cochez au moins une donnée ou les éléments réservés.", true); return; }
        const d = { id: "dm" + Date.now().toString(36), nom, referentiel, etabs: ids, donnees: cols, reserves, consigne: $d("dm-consigne").value.trim(),
          echeance: $d("dm-echeance").value || "", cree_le: new Date().toISOString(), source: source || "", close: false };
        $d("dm-creer").disabled = true; statut("Enregistrement…");
        try {
          await enregistrer(l => [...l, d]);
          dire(`Demande « ${nom} » créée : ${ids.length} établissement${ids.length > 1 ? "s" : ""}${d.echeance ? `, échéance le ${jourFr(d.echeance)}` : ""}. Suivi : Administration › Établissements.`);
          fermer(d);
        } catch (e) {
          $d("dm-creer").disabled = false;
          statut(`Demande non enregistrée (${e.message || e}). Seuls les propriétaires du document créent des demandes.`, true);
        }
      });
      dlg.showModal();
      const n = $d("dm-nom"); if (n) n.select();
    });
  }

  window.Demandes = { CLE, liste, enregistrer, vide, reserveesDe, tablesReservees, reservesParEtab, avancement, ouvrirCreation, jourFr };
})();

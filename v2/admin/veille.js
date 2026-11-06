/* =====================================================================
   Administration v2 — onglet « Veille » : vigilances météorologiques (2.43)
   ---------------------------------------------------------------------
   - Lecture de la table Vigilances, écrite par le relais n8n (veille/relais-vigilance-n8n.json) à partir de la carte de
     vigilance de Météo-France : une ligne par département, phénomène et échéance (aujourd'hui, demain), jaune à rouge.
   - Pour chaque échéance : carte des départements au-dessus du seuil, synthèse par phénomène, établissements et élèves
     concernés (référentiel, colonne Effectif de la 2.42), détail par département ; « Préparer une campagne » ouvre une
     campagne (onglet Établissements) qui vise les établissements de ces départements.
   - Réglages (clé « veille » de Config) : seuil (jaune, orange, rouge), phénomènes suivis.
   - Relais n8n téléchargé préréglé pour le document (adresse de l'API, document, tables, départements du référentiel,
     seuil d'alerte) ; restent à saisir dans n8n la clé Météo-France, la clé d'API Grist et, si besoin, le salon Tchap.
   - Journal des derniers changements de vigilance.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle,
    G = () => window.Geo;
  const { esc, $ } = Outils;
  const nf = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR");
  const PASTILLE = ["", "🟢", "🟡", "🟠", "🔴"];
  const couleur = (n) => S.COULEURS_VIGILANCE.find((c) => c.niveau === n) || S.COULEURS_VIGILANCE[0];
  const heure = (s) =>
    s
      ? Outils.dates.dateHeure(s, {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  let config,
    general,
    meta,
    vigilances,
    journal,
    ref,
    reglages,
    racine,
    echeance = S.ECHEANCES_VIGILANCE[0];

  /* ---------- Lecture ---------- */
  async function charger() {
    meta = await S.lireMeta();
    config = await S.lireConfig(meta);
    general = S.general(config);
    reglages = S.reglagesVeille(config);
    vigilances = meta[general.vigilances] ? await S.lireVigilances(general) : null;
    journal = [];
    if (meta[general.vigilances_journal])
      try {
        const t = await Donnees.lire(general.vigilances_journal),
          v = (k, i) => (t[k] || [])[i];
        journal = t.id
          .map((id, i) => ({
            id,
            le: v("Le", i),
            dep: v("Departement", i),
            code: v("Departement_code", i),
            phen: v("Phenomene", i),
            ech: v("Echeance", i),
            avant: v("Avant", i),
            apres: v("Apres", i),
            niveau: Number(v("Niveau", i)) || 1,
          }))
          .sort((a, b) => (b.le || 0) - (a.le || 0) || b.id - a.id)
          .slice(0, 25);
      } catch (_) {
        journal = [];
      }
    ref = await referentiel();
  }
  // Établissements du référentiel par département (code) : { parDep: { code: { n, e, valeurs: Set, aca } }, colDep, colEff, table }
  async function referentiel() {
    const table = general.referentiel;
    if (!meta[table]) return null;
    const assoc = (config && config.valeurs.roles && config.valeurs.roles.referentiel) || {};
    const roles = S.resoudreRoles(
      "referentiel",
      meta[table],
      { reponses: general.reponses, referentiel: table },
      assoc,
      {},
    );
    const colDep = roles.Departement && roles.Departement.col,
      colUai = roles.UAI && roles.UAI.col,
      colAca = roles.Academie && roles.Academie.col;
    const colEff = meta[table].colonnes.Effectif ? "Effectif" : null;
    const t = await Donnees.lire(table),
      parDep = {};
    t.id.forEach((_, i) => {
      const brut = colDep ? t[colDep][i] : null,
        code = (brut && G().depKey(brut)) || (colUai && G().depFromUai(t[colUai][i]));
      if (!code) return;
      const x = parDep[code] || (parDep[code] = { n: 0, e: 0, valeurs: new Set(), aca: "" });
      x.n++;
      x.e += Number(colEff ? t[colEff][i] : 0) || 0;
      if (brut != null && brut !== "") x.valeurs.add(String(brut));
      if (!x.aca && colAca && t[colAca][i]) x.aca = String(t[colAca][i]);
    });
    return { table, parDep, colDep, colEff };
  }

  /* ---------- Calculs ---------- */
  const retenue = (v) =>
    v.niveau >= reglages.seuil && (!reglages.phenomenes.length || reglages.phenomenes.includes(v.phenomene));
  // départements au-dessus du seuil pour l'échéance : [{ code, nom, niveau, phenomenes: [{ phenomene, niveau }] }]
  function departements(ech) {
    const m = new Map();
    for (const v of (vigilances || []).filter((x) => x.echeance === ech && retenue(x))) {
      const d = m.get(v.code) || {
        code: v.code,
        nom: v.departement || G().DEP_NAMES[v.code] || v.code,
        niveau: 0,
        phenomenes: [],
        fin: v.fin,
      };
      d.niveau = Math.max(d.niveau, v.niveau);
      d.phenomenes.push({ phenomene: v.phenomene, niveau: v.niveau, littoral: v.littoral });
      d.fin = Math.max(d.fin || 0, v.fin || 0) || null;
      m.set(v.code, d);
    }
    return [...m.values()].sort((a, b) => b.niveau - a.niveau || a.code.localeCompare(b.code));
  }
  const chiffres = (codes) =>
    codes.reduce(
      (s, c) => {
        const x = ref && ref.parDep[c];
        return { n: s.n + (x ? x.n : 0), e: s.e + (x ? x.e : 0) };
      },
      { n: 0, e: 0 },
    );
  const derniereMaj = () => (vigilances || []).reduce((m, v) => Math.max(m, v.maj || 0), 0) || null;

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) {
      racine.innerHTML = `<div class="bandeau alerte">La table Config est absente : lancez d'abord l'installation.</div>`;
      return;
    }
    if (!vigilances) {
      racine.innerHTML = `<div class="bandeau alerte">Tables ${esc(general.vigilances)} et ${esc(general.vigilances_journal)} absentes : onglet Installation, « Appliquer la sélection ».</div>${carteRelais()}`;
      lier();
      return;
    }
    const maj = derniereMaj(),
      age = maj ? (Date.now() / 1000 - maj) / 3600 : null;
    const etat =
      !vigilances.length && !journal.length
        ? `<div class="bandeau info">Le relais n8n n'a encore rien écrit. Téléchargez-le ci-dessous, réglez-le dans n8n et activez-le : la carte se remplira à son premier passage.</div>`
        : age != null && age > 3
          ? `<div class="bandeau alerte">Dernière carte de Météo-France reçue ${heure(maj)}, il y a plus de ${Math.floor(age)} heures : le relais n8n ne tourne peut-être plus (vérifiez ses exécutions).</div>`
          : `<div class="bandeau ok">Carte de vigilance de Météo-France du ${heure(maj)}${vigilances.length ? "" : " : aucune vigilance jaune, orange ou rouge"}.</div>`;
    racine.innerHTML = `${etat}
      <div class="sous-onglets" role="tablist">${S.ECHEANCES_VIGILANCE.map((e) => {
        const n = departements(e).length;
        return `<button type="button" role="tab" data-ech="${esc(e)}" aria-selected="${e === echeance}">${esc(e)}${n ? ` · ${n} dép.` : ""}</button>`;
      }).join("")}</div>
      ${carteEcheance(echeance)}${carteReglages()}${carteJournal()}${carteRelais()}`;
    lier();
  }
  function carteEcheance(ech) {
    const deps = departements(ech),
      tot = chiffres(deps.map((d) => d.code)),
      seuil = couleur(reglages.seuil);
    const parPhen = new Map();
    for (const d of deps)
      for (const p of d.phenomenes) {
        const k = `${p.niveau}|${p.phenomene}`;
        if (!parPhen.has(k)) parPhen.set(k, []);
        parPhen.get(k).push(d);
      }
    const puce = (n) => {
      const c = couleur(n);
      return `<span class="vg-puce" style="background:${c.fond};color:${c.texte}">${esc(c.nom)}</span>`;
    };
    const lignesPhen = [...parPhen.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, ds]) => {
        const [n, phen] = k.split("|"),
          t = chiffres(ds.map((d) => d.code));
        return `<li>${puce(+n)} <strong>${esc(phen)}</strong> : ${ds.map((d) => `${esc(d.nom)} (${esc(d.code)})`).join(", ")}${t.n ? ` <span class="aide">— ${nf(t.n)} établissement(s)${ref && ref.colEff ? `, ${nf(t.e)} élèves` : ""}</span>` : ""}</li>`;
      })
      .join("");
    const lignesDep = deps
      .map((d) => {
        const x = (ref && ref.parDep[d.code]) || { n: 0, e: 0, aca: "" };
        return `<tr><td><strong>${esc(d.nom)}</strong> <span class="aide">${esc(d.code)}</span></td><td>${esc(x.aca || G().DEP_ACA[d.code] || "")}</td>
        <td>${d.phenomenes
          .sort((a, b) => b.niveau - a.niveau)
          .map((p) => `${puce(p.niveau)} ${esc(p.phenomene)}${p.littoral ? " (littoral)" : ""}`)
          .join("<br>")}</td>
        <td class="va-n">${nf(x.n)}</td>${ref && ref.colEff ? `<td class="va-n">${nf(x.e)}</td>` : ""}</tr>`;
      })
      .join("");
    return `<section class="carte"><h2>Vigilances ${esc(ech.toLowerCase())} — ${esc(seuil.nom.toLowerCase())} et plus${reglages.phenomenes.length ? ` (${esc(reglages.phenomenes.join(", "))})` : ""}</h2>
      <div class="vg-grille">
        <div class="vg-carte">${carteSvg(deps)}</div>
        <div>
          <div class="vg-chiffres"><div><b>${nf(deps.length)}</b><span>département(s)</span></div><div><b>${nf(tot.n)}</b><span>établissement(s)</span></div>
            ${ref && ref.colEff ? `<div><b>${nf(tot.e)}</b><span>élèves</span></div>` : ""}</div>
          ${deps.length ? `<ul class="vg-phen">${lignesPhen}</ul>` : `<p class="vide">Aucun département ${esc(seuil.nom.toLowerCase())} ou plus${ech === "Demain" ? " demain" : " aujourd'hui"}.</p>`}
          ${ref && !ref.colEff ? `<p class="aide">Effectifs inconnus : onglet Référentiel, carte « Effectifs ».</p>` : ""}
          ${deps.length && ref ? `<div class="boutons"><button class="primaire" data-vg="campagne" data-ech="${esc(ech)}">Préparer une campagne pour ces ${nf(deps.length)} département(s) (${nf(tot.n)} établissements)…</button></div>` : ""}
        </div>
      </div>
      ${deps.length ? `<table class="va-table"><thead><tr><th>Département</th><th>Académie</th><th>Phénomènes</th><th class="va-n">Établissements</th>${ref && ref.colEff ? `<th class="va-n">Élèves</th>` : ""}</tr></thead><tbody>${lignesDep}</tbody></table>` : ""}
      <span class="statut" id="vg-statut" role="status"></span></section>`;
  }
  function carteSvg(deps) {
    const geo = G();
    if (!geo || !geo.fondSvg) return "";
    const W = geo.GEO.w,
      H = geo.GEO.h,
      par = new Map(deps.map((d) => [d.code, d]));
    const svg = geo
      .fondSvg(1, { fond: "#e6e8ef" })
      .replace(/<path d="([^"]+)" fill="#e6e8ef"([^>]*?) data-dep="([^"]+)">/g, (m, d, reste, k) => {
        const x = par.get(k);
        return x ? `<path d="${d}" fill="${couleur(x.niveau).fond}"${reste} data-dep="${k}">` : m;
      });
    const cadres = (geo.GEO.frames || [])
      .map(
        (f) =>
          `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="none" stroke="#c9ccd8" stroke-width="1.5" rx="6"/><text x="${f.x + 6}" y="${f.y + 16}" font-size="13" fill="#666">${esc(f.t)}</text>`,
      )
      .join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Carte des vigilances par département">${cadres}${svg}</svg>`;
  }
  function carteReglages() {
    return `<section class="carte"><h2>Réglages de la veille</h2>
      <div class="grille">
        <label class="champ"><span>Seuil affiché (et proposé pour l'alerte Tchap)</span><select id="vg-seuil">${[2, 3, 4].map((n) => `<option value="${n}"${n === reglages.seuil ? " selected" : ""}>${esc(couleur(n).nom)} et plus</option>`).join("")}</select></label>
        <div class="champ"><span class="va-titre">Phénomènes suivis <small>(aucun coché : tous)</small></span>
          <div class="vg-phenomenes">${Object.values(S.PHENOMENES_VIGILANCE)
            .map(
              (p) =>
                `<label class="va-case"><input type="checkbox" data-vg-phen="${esc(p)}"${reglages.phenomenes.includes(p) ? " checked" : ""}> ${esc(p)}</label>`,
            )
            .join("")}</div></div>
      </div>
      <div class="boutons"><button class="secondaire" data-vg="reglages">Enregistrer</button><span class="statut" id="vg-statut-r" role="status"></span></div></section>`;
  }
  function carteJournal() {
    if (!journal.length) return "";
    return `<section class="carte"><h2>Derniers changements</h2><table class="va-table"><thead><tr><th>Reçu</th><th>Département</th><th>Phénomène</th><th>Échéance</th><th>Couleur</th></tr></thead><tbody>
      ${journal.map((j) => `<tr><td>${heure(j.le)}</td><td>${esc(j.dep)} <span class="aide">${esc(j.code)}</span></td><td>${esc(j.phen)}</td><td>${esc(j.ech)}</td><td>${esc(j.avant || "Vert")} → <strong>${esc(j.apres)}</strong> ${PASTILLE[j.niveau] || ""}</td></tr>`).join("")}</tbody></table></section>`;
  }
  function carteRelais() {
    return `<section class="carte"><h2>Relais n8n (Météo-France → Grist)</h2>
      <p class="aide">Le navigateur ne peut pas interroger Météo-France (clé d'API à garder secrète) : un workflow n8n lit la carte de vigilance toutes les 30 minutes, réécrit la table ${esc(general.vigilances)},
        note chaque changement dans ${esc(general.vigilances_journal)} et, si vous le réglez, publie une alerte dans un salon Tchap au passage du seuil, avec les établissements et les élèves concernés.</p>
      <ol class="vg-etapes"><li>Créer un compte sur <strong>portail-api.meteofrance.fr</strong>, s'abonner à l'API « DonneesPubliquesVigilance » et générer une clé en mode « API Key » (le jeton expire au bout d'une heure).</li>
        <li>Télécharger le relais préréglé pour ce document, l'importer dans n8n, ouvrir le nœud « Vigilance vers Grist » et saisir la clé Météo-France et la clé d'API Grist d'un propriétaire du document.</li>
        <li>Pour l'alerte : serveur, jeton et identifiant du salon Tchap (laisser vide sinon), puis « Essai manuel » et activer le workflow.</li></ol>
      <p class="aide">La vigilance publique de Météo-France couvre la métropole ; l'outre-mer n'y figure pas.</p>
      <div class="boutons"><button class="primaire" data-vg="relais">Télécharger le relais n8n</button><span class="statut" id="vg-statut-x" role="status"></span></div></section>`;
  }

  /* ---------- Actions ---------- */
  const dire = (id, t, err) => {
    const st = $(id);
    if (st) {
      st.textContent = t;
      st.className = `statut${err ? " err" : " ok"}`;
    }
  };
  function telecharger(nom, texte) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texte], { type: "application/json" }));
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 2000);
  }
  async function relais() {
    try {
      const r = await fetch(new URL("../veille/relais-vigilance-n8n.json", location.href).href, { cache: "no-store" });
      if (!r.ok) throw new Error(`relais introuvable (HTTP ${r.status})`);
      const w = await r.json(),
        noeud = w.nodes.find((n) => n.type === "n8n-nodes-base.code");
      let api = "",
        doc = "";
      try {
        const j = await grist.docApi.getAccessToken({ readOnly: true });
        const m = String(j.baseUrl || "").match(/^(.*\/api)\/docs\/([^/?#]+)/);
        if (m) {
          api = m[1];
          doc = m[2];
        }
      } catch (_) {}
      if (!doc) throw new Error("adresse du document indisponible (le widget doit avoir l'accès complet)");
      let js = noeud.parameters.jsCode;
      const regler = (nom, val) => {
        const re = new RegExp(`const ${nom} = '[^']*';`);
        if (!re.test(js)) throw new Error(`réglage ${nom} introuvable`);
        js = js.replace(re, `const ${nom} = '${String(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}';`);
      };
      regler("API_GRIST", api);
      regler("DOC", doc);
      regler("TABLE", general.vigilances);
      regler("JOURNAL", general.vigilances_journal);
      regler("REFERENTIEL", ref ? ref.table : general.referentiel);
      regler("COL_DEP", (ref && ref.colDep) || "Departement");
      regler("COL_EFFECTIF", (ref && ref.colEff) || "");
      regler("DEPARTEMENTS", ref ? Object.keys(ref.parDep).sort().join(",") : "");
      regler("SEUIL_ALERTE", String(reglages.seuil));
      js = js.replace(/const DEP_NOMS = \{[^\n]*\};/, `const DEP_NOMS = ${JSON.stringify(G().DEP_NAMES)};`);
      noeud.parameters.jsCode = js;
      w.name = `Veille PRISME — vigilance météo — ${general.situation || doc}`;
      telecharger(`relais-vigilance-${doc.slice(0, 8)}.json`, JSON.stringify(w, null, 2));
      dire(
        "vg-statut-x",
        `Relais téléchargé, préréglé pour ce document (${ref ? Object.keys(ref.parDep).length : "tous les"} départements suivis).`,
      );
    } catch (e) {
      dire("vg-statut-x", `Échec : ${e.message || e}`, true);
    }
  }
  async function campagne(ech) {
    const deps = departements(ech),
      codes = new Set(deps.map((d) => d.code));
    if (!ref || !ref.colDep) {
      dire("vg-statut", "Colonne Département du référentiel introuvable.", true);
      return;
    }
    const valeurs = [...new Set(deps.flatMap((d) => [...((ref.parDep[d.code] || {}).valeurs || [])]))];
    const niveauMax = Math.max(...deps.map((d) => d.niveau)),
      phens = [
        ...new Set(deps.flatMap((d) => d.phenomenes.filter((p) => p.niveau === niveauMax).map((p) => p.phenomene))),
      ];
    const fin = deps.reduce((m, d) => Math.max(m, d.fin || 0), 0);
    const jour = Outils.dates.date(ech === "Demain" ? Date.now() + 86400000 : Date.now());
    const sel = {
      referentiel: ref.table,
      crit: { [ref.colDep]: valeurs },
      libelles: { [ref.colDep]: "Département" },
      recherche: "",
      avecMail: false,
      n: chiffres([...codes]).n,
      nom: `Vigilance ${couleur(niveauMax).nom.toLowerCase()} ${phens.join(", ").toLowerCase()} — ${jour}`,
      mode: "quotidienne",
      fin: fin ? Outils.dates.jour(fin) : "",
    };
    if (!window.OngletCampagnes || !window.OngletCampagnes.preparerDepuis) {
      dire("vg-statut", "Module des campagnes indisponible.", true);
      return;
    }
    await window.OngletCampagnes.preparerDepuis(sel);
  }
  function lier() {
    racine.querySelectorAll("[data-ech]").forEach((b) => {
      if (b.getAttribute("role") === "tab")
        b.addEventListener("click", () => {
          echeance = b.dataset.ech;
          dessiner();
        });
    });
    racine.querySelectorAll("[data-vg]").forEach((b) =>
      b.addEventListener("click", async () => {
        const a = b.dataset.vg;
        if (a === "relais") return relais();
        if (a === "campagne") return campagne(b.dataset.ech);
        if (a === "reglages") {
          const v = {
            ...((config && config.valeurs.veille) || {}),
            seuil: Number($("vg-seuil").value),
            phenomenes: [...racine.querySelectorAll("[data-vg-phen]:checked")].map((c) => c.dataset.vgPhen),
          };
          try {
            await S.ecrireConfig("veille", v);
            await recharger();
            dire(
              "vg-statut-r",
              "Réglages enregistrés. Le seuil de l'alerte Tchap se règle dans le relais (SEUIL_ALERTE).",
            );
          } catch (e) {
            dire("vg-statut-r", `Échec : ${e.message || e}`, true);
          }
        }
      }),
    );
  }
  async function recharger() {
    await charger();
    dessiner();
  }
  async function afficher() {
    racine = $("veille");
    racine.innerHTML = `<div class="bandeau info">Lecture des vigilances…</div>`;
    try {
      await recharger();
    } catch (e) {
      racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`;
    }
  }
  window.OngletVeille = { afficher };
})();

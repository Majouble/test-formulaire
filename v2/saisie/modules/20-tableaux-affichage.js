/* PRISME — widget de saisie, module 20/34 : Questions « tableau », suite : affichage des lignes, saisie, sites proposés, écoute des événements.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Méthodes de la classe Tableau (module précédent) qui dessinent les lignes et réagissent à la saisie. */
Object.assign(Tableau.prototype, {
  // ----- rendu
  champHtml(d, k, l) {
    const nom = `${this.id}-${k}-${d.colId}`,
      v = l.valeurs[d.colId],
      t = typeBase(d.type);
    const ch = (d.opts && d.opts.choices) || [],
      couleurs = (d.opts && d.opts.choiceOptions) || {};
    const coul = (x) => {
      const c = couleurs[x] || {};
      return c.fillColor ? `--c:${c.textColor || "#161616"};--c-bg:${c.fillColor}` : "--c:#fff;--c-bg:var(--bleu)";
    };
    const titre =
      `<span class="etiq" id="${nom}-etiq">${esc(d.libelle || d.colId)}${d.obligatoire ? ' <span class="req">*</span>' : ""}` +
      `${d.confidentiel ? ' <span class="confid" title="Donnée confidentielle : enregistrée uniquement dans la table ' + esc(this.table) + '">confidentiel</span>' : ""}` +
      `${d.auto && typeBase(d.type) === "Text" ? ' <span class="badge-auto" title="Rempli à partir des autres champs de la ligne ; vous pouvez le modifier">auto</span>' : ""}</span>`;
    let ctl;
    const masque =
      d.confidentiel && !this.confLisible
        ? ` placeholder="Valeur masquée par vos droits : laissez vide pour la conserver"`
        : "";
    if (
      (t === "Choice" && ch.length && d.forcer !== "liste" && (d.forcer === "boutons" || ch.length <= 5)) ||
      t === "Bool"
    ) {
      const opts =
        t === "Bool"
          ? [
              ["true", "Oui"],
              ["false", "Non"],
            ]
          : ch.map((x) => [x, x]);
      const actuel = t === "Bool" ? (v == null ? null : String(!!v)) : v;
      ctl = `<span class="seg" role="radiogroup" aria-labelledby="${nom}-etiq">${opts
        .map(
          ([val, lib]) =>
            `<label style="${t === "Bool" ? "--c:#fff;--c-bg:var(--bleu)" : coul(val)}"><input type="radio" name="${nom}" value="${esc(val)}"${val === actuel ? " checked" : ""}><span>${esc(lib)}</span></label>`,
        )
        .join("")}</span>`;
    } else if (t === "Choice" && ch.length && pastillesPossibles(d)) {
      // choix unique au-delà de 5 options : pastilles (un clic sur la pastille choisie la décoche) ; [liste] pour un menu déroulant
      ctl = `<div class="puces unique" role="radiogroup" aria-labelledby="${nom}-etiq">${ch.map((x) => `<label class="puce${x === v ? " on" : ""}" style="${coul(x)}"><input type="radio" name="${nom}" value="${esc(x)}"${x === v ? " checked" : ""}>${esc(x)}</label>`).join("")}</div>`;
    } else if (t === "Choice" && ch.length) {
      ctl = `<select aria-labelledby="${nom}-etiq"><option value="">Choisir…</option>${ch.map((x) => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
    } else if (t === "ChoiceList" && ch.length && pastillesPossibles(d)) {
      const sel = Array.isArray(v) ? v : [];
      ctl = `<div class="puces" role="group" aria-labelledby="${nom}-etiq">${ch.map((x) => `<label class="puce${sel.includes(x) ? " on" : ""}" style="${coul(x)}"><input type="checkbox" value="${esc(x)}"${sel.includes(x) ? " checked" : ""}>${esc(x)}</label>`).join("")}</div>`;
    } else if ((t === "ChoiceList" && ch.length) || t === "RefList") {
      const sel = Array.isArray(v) ? v.map(String) : [];
      const opts = t === "RefList" ? (d._options || []).map((o) => [String(o.id), o.libelle]) : ch.map((x) => [x, x]);
      const resume = opts
        .filter(([val]) => sel.includes(val))
        .map(([, lib]) => lib)
        .join(", ");
      ctl =
        `<details class="multi"><summary aria-labelledby="${nom}-etiq"><span class="resume">${esc(resume) || "Choisir…"}</span></summary>` +
        `<div class="multi-liste">${opts.map(([val, lib]) => `<label><input type="checkbox" value="${esc(val)}"${sel.includes(val) ? " checked" : ""}> ${esc(lib)}</label>`).join("")}</div></details>`;
    } else if (t === "Numeric" || t === "Int") {
      ctl = `<input type="number" class="nb" step="${t === "Int" ? 1 : "any"}"${d.min != null ? ` min="${d.min}"` : ""}${d.max != null ? ` max="${d.max}"` : ""} value="${v ?? ""}" aria-labelledby="${nom}-etiq">`;
    } else if (t === "Date" || t === "DateTime") {
      const s = secondes(v);
      const txt =
        s == null
          ? ""
          : t === "Date"
            ? new Date(s * 1000).toISOString().slice(0, 10)
            : valeurLocale(new Date(s * 1000), true);
      ctl = `<input type="${t === "Date" ? "date" : "datetime-local"}" value="${txt}" aria-labelledby="${nom}-etiq">`;
    } else if (t === "Ref" && d._siteEtab) {
      // ancien nom resté en texte dans une colonne référence (référence non résolue) : affiché, à rattacher
      const libre = this.colLibre(d),
        id = refId(v),
        ancien = !id && typeof v === "string" && v.trim() ? v.trim() : "";
      const lib = id ? this.libelleSite(d, id) : ancien || String((libre && l.valeurs[libre]) ?? "");
      // site du dossier relié au référentiel : il ne se remplace pas (sauf « Corriger le site ») ; un nom libre ou ancien se corrige
      const fige =
        l._fixe && id && !l._deverrouille
          ? ` disabled title="Site du dossier : il ne se remplace pas ; passez-le en RAS s'il est revenu à la normale, ou « Corriger le site » en cas d'erreur"`
          : "";
      ctl = `<div class="site-combo"><input type="text" class="site-txt" value="${esc(lib)}"${id ? ` data-id="${id}"` : ""} autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-labelledby="${nom}-etiq" placeholder="${libre ? "Nom du site ou mot-clé (un nom absent de la liste est accepté)" : "Nom du site, mot-clé ou commune"}"${fige}>
        <span class="site-etat">${!id && lib ? (ancien ? "ancien nom, absent du référentiel : choisissez le site dans la liste" : "hors référentiel") : ""}</span><ul class="suggestions site-sugg" role="listbox" hidden></ul></div>`;
    } else if (t === "Ref") {
      let opts = d._options || [];
      if (d._siteEtab) {
        const e = etablissementDuFormulaire();
        if (e) opts = sitesDeLEtablissement(d, e, opts, +v);
      }
      const libSite = (o) =>
        d._siteComp && d._siteComp.get(o.id) && nomEtabId(d._siteComp.get(o.id))
          ? `${o.libelle} — ${nomEtabId(d._siteComp.get(o.id))}`
          : o.libelle;
      ctl = `<select aria-labelledby="${nom}-etiq"><option value="">${d._siteEtab && !opts.length ? "Aucun site de cet établissement au référentiel" : "Choisir…"}</option>${opts.map((o) => `<option value="${o.id}"${+v === o.id ? " selected" : ""}>${esc(libSite(o))}</option>`).join("")}</select>`;
    } else if (d.court) {
      ctl = `<input type="text" value="${esc(v ?? "")}" aria-labelledby="${nom}-etiq"${masque}>`;
    } else {
      ctl = `<textarea rows="2" aria-labelledby="${nom}-etiq"${masque}>${esc(v ?? "")}</textarea>`;
    }
    // tableau des sites : le site d'une ligne du dossier (ou reprise) ne change pas ; seul son état change
    if (
      this.sites &&
      l._fixe &&
      !l._deverrouille &&
      [this.sites.site, this.sites.libre].includes(d.colId) &&
      !videSous(v) &&
      !(d._siteEtab && t === "Ref")
    )
      ctl = ctl.replace(
        /^<(select|input|textarea)/,
        '<$1 disabled title="Site du dossier : il ne se remplace pas ; passez-le en RAS s\'il est revenu à la normale"',
      );
    const regen =
      d.auto && typeBase(d.type) === "Text"
        ? `<button type="button" class="lien-texte regen" data-action="regenerer" data-sous="${esc(d.colId)}"${(l._touche || {})[d.colId] ? "" : " hidden"}>↻ Revenir au texte automatique</button>`
        : "";
    const aide = (d.aide ? `<span class="aide-sous">${esc(d.aide)}</span>` : "") + regen;
    return `<div class="sous-champ zone-${zoneSousChamp(d)}${d._siteEtab ? " zone-site" : ""}${d.condition ? " cond-ligne" : ""}" data-sous="${esc(d.colId)}">${titre}${ctl}${aide}<span class="msg-ligne" hidden></span></div>`;
  },
  // tableau des sites : un site du dossier (ou repris du dernier état connu) ne se retire pas, il passe en RAS
  actionsLigne(l, k) {
    const fixe = this.sites && l._fixe;
    const corriger =
      fixe && !l._deverrouille && this.sites.site && refId(l.valeurs[this.sites.site])
        ? `<button type="button" class="icone" data-action="corriger-site" title="Corriger le site de cette ligne (erreur de saisie)" aria-label="Corriger le site de la ligne ${k + 1}">✎</button>`
        : "";
    // site repris dans un nouveau signalement : peut être laissé de côté (pas d'information nouvelle), son dernier état reste connu
    const retirer =
      fixe && l._repris && !etatSaisie.dossierId
        ? `<button type="button" class="icone" data-action="retirer-repris" title="Ne pas faire figurer ce site dans ce signalement : il ne sera plus proposé ensuite (seuls les sites du dernier dossier sont repris)" aria-label="Retirer le site de la ligne ${k + 1} de ce signalement">✕</button>`
        : "";
    // site d'un dossier saisi à tort : supprimé de toutes les versions du dossier à l'enregistrement (2.50)
    const supprimer =
      fixe && etatSaisie.dossierId && !l._repris
        ? `<button type="button" class="icone" data-action="supprimer-site" title="Supprimer ce site du dossier (saisi à tort) : il disparaît de toutes les étapes du dossier" aria-label="Supprimer le site de la ligne ${k + 1} du dossier">🗑</button>`
        : "";
    return `<span class="actions-ligne"><button type="button" class="icone" data-action="dupliquer" title="Dupliquer cette ligne" aria-label="Dupliquer la ligne ${k + 1}">⧉</button>${corriger}${
      fixe
        ? `<button type="button" class="icone icone-texte" data-action="ras-site" title="Site revenu à la normale : il reste dans le dossier, en ${esc(this.valeurRas() || "RAS")}" aria-label="Passer le site de la ligne ${k + 1} en ${esc(this.valeurRas() || "RAS")}">${esc(this.valeurRas() || "RAS")}</button>${retirer}${supprimer}`
        : `<button type="button" class="icone" data-action="supprimer" title="Supprimer cette ligne" aria-label="Supprimer la ligne ${k + 1}">✕</button>`
    }</span>`;
  },
  valeurRas() {
    const d = this.sites && this.sites.qualif && this.sousDefs.find((x) => x.colId === this.sites.qualif);
    if (!d) return null;
    const ch = (d.opts && d.opts.choices) || [],
      r = retourNormale();
    return ch.find((x) => r.has(String(x).trim().toUpperCase())) || [...r][0] || "RAS";
  },
  ligneHtml(l, k) {
    const actions = `${this.actionsLigne(l, k)}`;
    // Ordre imposé par [ordre N] : les champs se suivent dans cet ordre (les champs courts côte à côte)
    if (this.ordonne)
      return `<div class="ligne-rep ordonnee${l._repris ? " reprise" : ""}" data-k="${k}">${l._repris ? `<div class="repris" aria-live="polite">${this.texteRepris(l)}</div>` : ""}<div class="tete-ligne"><span class="num" aria-label="Ligne ${k + 1}">${k + 1}</span>
      <div class="champs-ordonnes">${this.sousDefs.map((d) => this.champHtml(d, k, l)).join("")}</div>${actions}</div></div>`;
    const parZone = (z) =>
      this.sousDefs
        .filter((d) => zoneSousChamp(d) === z)
        .map((d) => this.champHtml(d, k, l))
        .join("");
    const textes = parZone("texte");
    return `<div class="ligne-rep${l._repris ? " reprise" : ""}" data-k="${k}">${l._repris ? `<div class="repris" aria-live="polite">${this.texteRepris(l)}</div>` : ""}
      <div class="tete-ligne"><span class="num" aria-label="Ligne ${k + 1}">${k + 1}</span>${parZone("tete")}
        ${this.actionsLigne(l, k)}</div>
      ${parZone("large")}${textes ? `<div class="textes-ligne">${textes}</div>` : ""}</div>`;
  },
  // site repris du dernier état connu : mention, et confirmation ou modification par l'agent
  texteRepris(l) {
    const r = l._repris,
      quand = r.quand
        ? Outils.dates
            .dateHeure(r.quand, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
            .replace(" ", " ")
        : "";
    const etat =
      r.etat === "confirme"
        ? `<span class="repris-ok">confirmé</span>`
        : r.etat === "modifie"
          ? `<span class="repris-ok">modifié</span>`
          : r.etat === "normal"
            ? `<span class="repris-ok">revenu à la normale</span>`
            : `<button type="button" class="lien-texte" data-action="confirmer-site">Confirmer cet état</button>`;
    return `Dernier état : <strong>${esc(r.qualif || "sans qualification")}</strong>${quand ? ` (${esc(quand)})` : ""} · ${etat}`;
  },
  dessiner() {
    if (this.erreur) {
      this.el.innerHTML = `<p class="bandeau">${esc(this.erreur)}</p>`;
      return;
    }
    if (!this.pret) {
      this.el.innerHTML = `<p class="note">Chargement…</p>`;
      return;
    }
    if (!this.sousDefs.length) {
      this.el.innerHTML = `<p class="bandeau">La table « ${esc(this.table)} » n'a aucune colonne à saisir (colonnes non formules autres que Dossier, Ligne_id et Ordre).</p>`;
      return;
    }
    this.el.innerHTML =
      (this.avertissement && !etatSaisie.modeEtab ? `<p class="bandeau">${esc(this.avertissement)}</p>` : "") +
      (this.noteAuto && this.lignes.some((l) => l._repris) ? `<p class="note">${esc(this.noteAuto)}</p>` : "") +
      (this.retires && this.retires.length
        ? `<p class="note retires">${this.retires.length} site${this.retires.length > 1 ? "s" : ""} laissé${this.retires.length > 1 ? "s" : ""} de côté pour ce signalement (${this.retires.map((x) => esc(this.nomLigne(x.l))).join(", ")})  : ${this.retires.length > 1 ? "ils ne seront plus proposés" : "il ne sera plus proposé"} ensuite. <button type="button" class="lien-texte" data-action="remettre-retires">Remettre</button></p>`
        : "") +
      (this.supprimes && this.supprimes.length
        ? `<p class="note retires supprimes">${this.supprimes.length > 1 ? `${this.supprimes.length} sites seront supprimés` : "1 site sera supprimé"} du dossier à l'enregistrement, dans toutes ses étapes (${this.supprimes.map((x) => esc(this.nomLigne(x.l))).join(", ")}). <button type="button" class="lien-texte" data-action="annuler-supprimes">Annuler la suppression</button></p>`
        : "") +
      (this.offreReprise &&
      etatSaisie.etabCourant &&
      this.offreReprise.etab === etatSaisie.etabCourant.id &&
      !this.lignes.some((l) => l._repris)
        ? `<p class="note offre-reprise">${this.offreReprise.n} site${this.offreReprise.n > 1 ? "s" : ""} dans le dernier signalement de cet établissement. <button type="button" class="secondaire petit" data-action="reprendre-sites">Reprendre leur dernier état</button></p>`
        : "") +
      `<div class="lignes-rep">${this.lignes.map((l, k) => this.ligneHtml(l, k)).join("") || `<p class="vide-tableau">Aucune ligne pour l'instant.</p>`}</div>
      <div class="pied-tableau"><span class="ajout-lignes"><button type="button" class="secondaire petit" data-action="ajouter">+ Ajouter</button>
        <input type="number" class="qte" min="1" max="50" value="1" aria-label="Nombre de lignes à ajouter"><span class="note-qte">ligne(s)</span></span>
        <span class="synthese" aria-live="polite"></span><span class="ecart" hidden></span></div>`;
    this.majLignes();
  },
  majLignes() {
    this.el.querySelectorAll(".ligne-rep").forEach((div) => {
      const l = this.lignes[+div.dataset.k];
      let incomplete = false;
      div.querySelectorAll(".sous-champ").forEach((sc) => {
        const d = this.sousDefs.find((x) => x.colId === sc.dataset.sous);
        sc.hidden = !this.visible(l, d) || (this.combo && d.colId === this.sites.libre); // nom libre : saisi dans le champ du site
        const msg = this.montrerErreurs && !sc.hidden && !this.ligneVide(l) ? this.erreurChamp(l, d) : "";
        const m = sc.querySelector(".msg-ligne");
        m.textContent = msg;
        m.hidden = !msg;
        sc.classList.toggle("en-erreur", !!msg);
        if (msg) incomplete = true;
      });
      div.classList.toggle("incomplete", incomplete);
      div.querySelectorAll(".regen").forEach((b) => {
        b.hidden = !(l._touche || {})[b.dataset.sous];
      });
      const rp = div.querySelector(".repris");
      if (rp && l._repris) rp.innerHTML = this.texteRepris(l);
    });
    const s = this.el.querySelector(".synthese");
    if (s) s.textContent = syntheseTableau(this.sousDefs, this.lignesValides(), false);
    const e = this.el.querySelector(".ecart"),
      n = this.nombreAttendu();
    if (e) {
      const k = this.lignesValides().length,
        nom = n != null ? this.colonneNombre().def.libelle || this.colonneNombre().def.colId : "";
      e.hidden = !n || k === n;
      e.textContent =
        k > n
          ? `${k} lignes remplies pour ${n} indiqué(s) dans « ${nom} » : vérifiez le nombre.`
          : `${k} ligne(s) remplie(s) sur ${n}`;
      e.classList.toggle("alerte", k > n);
    }
  },
  lireControle(sc, d) {
    const t = typeBase(d.type);
    if (t === "Bool") {
      const r = sc.querySelector("input:checked");
      return r ? r.value === "true" : null;
    }
    if (sc.querySelector(".seg, .puces.unique")) {
      const r = sc.querySelector("input:checked");
      return r ? r.value : null;
    }
    if (t === "ChoiceList" || t === "RefList") {
      const l = [...sc.querySelectorAll('input[type="checkbox"]:checked')].map((c) =>
        t === "RefList" ? +c.value : c.value,
      );
      return l.length ? l : null;
    }
    const c = sc.querySelector("select, input, textarea");
    if (!c || c.value === "") return null;
    if (t === "Numeric" || t === "Int") return t === "Int" ? parseInt(c.value, 10) : parseFloat(c.value);
    if (t === "Date") return Date.parse(c.value + "T00:00:00Z") / 1000;
    if (t === "DateTime") return Outils.dates.depuisChamp(c.value) / 1000;
    if (t === "Ref") return +c.value;
    return t === "Any" || t === "Text" ? c.value : c.value;
  },
  /* Champs [auto] : un texte enregistré différent du texte calculé a été retouché par l'agent et n'est plus remplacé
     (jusqu'au clic sur « Revenir au texte automatique », ou s'il est vidé). */
  initAuto(l) {
    l._touche = {};
    for (const a of this.autos || []) {
      const v = l.valeurs[a.colId];
      l._touche[a.colId] = !videSous(v) && String(v).trim() !== texteAutoLigne(this.def, l.valeurs).trim();
    }
  },
  majAutos(l, div, forcer) {
    for (const a of this.autos || []) {
      if (!l._touche) l._touche = {};
      if (forcer === a.colId) l._touche[a.colId] = false;
      if (l._touche[a.colId]) continue;
      const t = texteAutoLigne(this.def, l.valeurs);
      l.valeurs[a.colId] = t || null;
      const c =
        div &&
        div.querySelector(`[data-sous="${CSS.escape(a.colId)}"] textarea, [data-sous="${CSS.escape(a.colId)}"] input`);
      if (c && c !== document.activeElement) c.value = t;
      else if (c && forcer) c.value = t;
    }
  },
  changement(sc) {
    const div = sc.closest(".ligne-rep"),
      l = this.lignes[+div.dataset.k];
    const d = this.sousDefs.find((x) => x.colId === sc.dataset.sous);
    if (sc.querySelector(".site-combo")) this.lireSite(sc, l, d);
    else l.valeurs[d.colId] = this.lireControle(sc, d);
    if (l._repris && l._repris.etat !== "modifie") l._repris.etat = "modifie";
    if (d.auto) {
      if (!l._touche) l._touche = {};
      l._touche[d.colId] =
        !videSous(l.valeurs[d.colId]) &&
        String(l.valeurs[d.colId]).trim() !== texteAutoLigne(this.def, l.valeurs).trim();
    } else this.majAutos(l, div);
    if (d.confidentiel) this.confModifie = true;
    sc.querySelectorAll(".puce").forEach((p) => p.classList.toggle("on", p.querySelector("input").checked));
    const r = sc.querySelector(".multi .resume");
    if (r)
      r.textContent =
        [...sc.querySelectorAll(".multi-liste input:checked")].map((c) => c.parentNode.textContent.trim()).join(", ") ||
        "Choisir…";
    this.majLignes();
    this.signaler();
  },
  signaler() {
    if (this.surChangement) this.surChangement();
    if (this.prefix === "q") {
      appliquerConditions("q", etatSaisie.defsQuestions);
      majDescriptionAuto();
      majApercuAuto();
      if (this.sites) majQualifDeduite();
    }
  },
  // ----- champ du site : site du référentiel (nom, mots-clés, correspondances validées) ou nom libre
  colLibre(d) {
    return this.combo && this.sites && d.colId === this.sites.site ? this.sites.libre : null;
  },
  libelleSite(d, id) {
    const o = (d._options || []).find((x) => x.id === id);
    return o ? o.libelle : "";
  },
  // nom du site d'une ligne (site du référentiel, ancien nom ou nom libre)
  nomLigne(l) {
    const s = this.sites || {},
      v = s.site ? l.valeurs[s.site] : null,
      d = s.site && this.sousDefs.find((x) => x.colId === s.site),
      id = refId(v);
    return (
      (id && d ? this.libelleSite(d, id) : typeof v === "string" ? v.trim() : "") ||
      String((s.libre && l.valeurs[s.libre]) ?? "").trim() ||
      "site sans nom"
    );
  },
  sitesProposables(d) {
    const e = etablissementDuFormulaire();
    return d._siteEtab && e ? sitesDeLEtablissement(d, e, d._options || [], 0) : d._options || [];
  },
  // site désigné exactement par un texte : son nom, un de ses mots-clés, ou un libellé validé pour l'établissement
  siteExact(d, txt) {
    const n = normaliser(txt);
    if (!n) return 0;
    const opts = this.sitesProposables(d),
      e = etablissementDuFormulaire();
    const parNom = opts.find((o) => normaliser(o.libelle) === n);
    if (parNom) return parNom.id;
    const parMot = opts.find((o) =>
      String((d._motsSite && d._motsSite.get(o.id)) || "")
        .split(/\s*[|,;]\s*/)
        .some((x) => normaliser(x) === n),
    );
    if (parMot) return parMot.id;
    const a = this.alias.get(`${e || 0}|${n}`);
    return a && opts.some((o) => o.id === a) ? a : 0;
  },
  suggestionsSite(d, q) {
    const mots = normaliser(q).split(" ").filter(Boolean),
      res = [];
    for (const o of this.sitesProposables(d)) {
      const nomN = normaliser(o.libelle),
        cles = [
          ...String((d._motsSite && d._motsSite.get(o.id)) || "").split(/\s*[|,;]\s*/),
          ...(this.aliasParSite.get(o.id) || []),
        ].filter((x) => x && x.trim());
      const commune = (d._communeSite && d._communeSite.get(o.id)) || "";
      const tout = `${nomN} ${cles.map(normaliser).join(" ")} ${normaliser(commune)}`;
      if (!mots.every((m) => tout.includes(m))) continue;
      const parNom = mots.every((m) => nomN.includes(m));
      // mots-clés et autres appellations du site (sans doublon ni le nom lui-même), ceux qui répondent à la saisie d'abord
      const vus = new Set([nomN]),
        autres = [];
      cles
        .map((x) => x.trim())
        .forEach((x) => {
          const n = normaliser(x);
          if (n && !vus.has(n)) {
            vus.add(n);
            autres.push({ x, trouve: !parNom && mots.length > 0 && mots.some((m) => n.includes(m)) });
          }
        });
      autres.sort((a, b) => b.trouve - a.trouve);
      res.push({
        o,
        parNom,
        commune,
        comp: d._siteComp && d._siteComp.get(o.id) ? nomEtabId(d._siteComp.get(o.id)) : "",
        autres,
      });
    }
    return res.sort((a, b) => b.parNom - a.parNom).slice(0, 30);
  },
  montrerSites(inp) {
    const sc = inp.closest(".sous-champ"),
      d = this.sousDefs.find((x) => x.colId === sc.dataset.sous),
      ul = sc.querySelector(".site-sugg");
    const q = inp.value.trim(),
      res = this.suggestionsSite(d, q);
    const avecLibre = !!this.colLibre(d),
      libre = avecLibre && q && !res.some((r) => normaliser(r.o.libelle) === normaliser(q)) && !this.siteExact(d, q);
    // même présentation que la recherche d'établissement : nom, puis commune, composante, mot-clé retrouvé
    const MAX_AUTRES = 8;
    ul.innerHTML =
      res
        .map(
          (r) =>
            `<li role="option" data-id="${r.o.id}"><div class="nom">${esc(r.o.libelle)}</div>${r.commune || r.comp ? `<div class="meta">${esc([r.commune, r.comp].filter(Boolean).join(" · "))}</div>` : ""}${
              r.autres.length
                ? `<div class="meta autres-noms" title="${esc(r.autres.map((a) => a.x).join(", "))}">Aussi : ${r.autres
                    .slice(0, MAX_AUTRES)
                    .map((a) => (a.trouve ? `<strong>${esc(a.x)}</strong>` : esc(a.x)))
                    .join(", ")}${r.autres.length > MAX_AUTRES ? `, … (+${r.autres.length - MAX_AUTRES})` : ""}</div>`
                : ""
            }</li>`,
        )
        .join("") +
      (libre
        ? `<li role="option" data-libre="1"><div class="nom">« ${esc(q)} »</div><div class="meta">site hors référentiel</div></li>`
        : "") +
      (!res.length && !libre
        ? `<li class="etat" aria-disabled="true">${!etablissementDuFormulaire() ? "Choisissez d'abord l'établissement." : q ? "Aucun site de cet établissement ne correspond." : "Aucun site de cet établissement au référentiel."}${avecLibre ? "" : " Complétez le référentiel des sites."}</li>`
        : "");
    ul.hidden = !ul.children.length;
    inp.setAttribute("aria-expanded", String(!ul.hidden));
  },
  choisirSite(li) {
    const sc = li.closest(".sous-champ"),
      inp = sc.querySelector(".site-txt"),
      d = this.sousDefs.find((x) => x.colId === sc.dataset.sous);
    if (li.dataset.id) {
      inp.value = this.libelleSite(d, +li.dataset.id);
      inp.dataset.id = li.dataset.id;
    } else delete inp.dataset.id;
    sc.querySelector(".site-sugg").hidden = true;
    inp.setAttribute("aria-expanded", "false");
    this.changement(sc);
  },
  lireSite(sc, l, d) {
    const inp = sc.querySelector(".site-txt"),
      txt = inp.value.trim();
    let id = inp.dataset.id && this.libelleSite(d, +inp.dataset.id) === txt ? +inp.dataset.id : this.siteExact(d, txt);
    const libre = this.colLibre(d);
    l.valeurs[d.colId] = id || null;
    if (libre) l.valeurs[libre] = id ? null : txt || null;
    const et = sc.querySelector(".site-etat");
    if (et)
      et.textContent =
        txt && !id ? (libre ? "hors référentiel" : "absent du référentiel : choisissez un site dans la liste") : "";
  },
  // ligne d'une question d'un formulaire précédent (historique), vue avec les colonnes du tableau actuel
  vueHistorique(h, o) {
    const s = this.sites,
      v = {};
    for (const [k, x] of Object.entries(o)) if (k !== "_id" && this.sousDefs.some((d) => d.colId === k)) v[k] = x;
    if (h.libre && s.libre) v[s.libre] = o[h.libre];
    if (h.site && s.site) v[s.site] = o[h.site];
    if (h.qualif && s.qualif) v[s.qualif] = o[h.qualif];
    return v;
  },
  // clé d'un site : son identifiant au référentiel, sinon le libellé saisi (rattaché par les correspondances validées)
  cleSite(etab, v) {
    const s = this.sites,
      id = s.site ? refId(v[s.site]) || (typeof v[s.site] === "number" ? v[s.site] : 0) : 0;
    if (id) return `s${id}`;
    // nom libre, sinon ancien nom resté en texte dans la colonne référence du site
    const lib =
      (s.libre ? String(v[s.libre] ?? "").trim() : "") ||
      (s.site && typeof v[s.site] === "string" ? v[s.site].trim() : "");
    if (!lib) return null;
    const a = this.alias.get(`${etab || 0}|${normaliser(lib)}`) || this.alias.get(`0|${normaliser(lib)}`);
    return a ? `s${a}` : `t${normaliser(lib)}`;
  },
  ecouter() {
    const el = this.el;
    // un bouton déjà choisi se désélectionne d'un second clic (champ facultatif)
    el.addEventListener("pointerdown", (ev) => {
      const lab = ev.target.closest(".seg label, .puces.unique label");
      if (lab) lab.querySelector("input").dataset.etait = String(lab.querySelector("input").checked);
    });
    el.addEventListener("click", (ev) => this.surClic(ev));
    // champ du site : suggestions au fil de la frappe, choix à la souris ou au clavier
    el.addEventListener("focusin", (ev) => {
      if (ev.target.classList && ev.target.classList.contains("site-txt")) this.montrerSites(ev.target);
    });
    el.addEventListener("focusout", (ev) => {
      if (ev.target.classList && ev.target.classList.contains("site-txt"))
        setTimeout(() => {
          const ul = ev.target.closest(".site-combo") && ev.target.closest(".site-combo").querySelector(".site-sugg");
          if (ul) ul.hidden = true;
          ev.target.setAttribute("aria-expanded", "false");
        }, 150);
    });
    el.addEventListener("mousedown", (ev) => {
      const li = ev.target.closest(".site-sugg li[role=option]");
      if (li) {
        ev.preventDefault();
        this.choisirSite(li);
      }
    });
    el.addEventListener("keydown", (ev) => this.surToucheSite(ev));
    const surSaisie = (ev) => {
      if (ev.target.classList.contains("qte")) return;
      if (ev.target.classList.contains("site-txt") && ev.type === "input") {
        delete ev.target.dataset.id;
        this.montrerSites(ev.target);
      }
      const sc = ev.target.closest(".sous-champ");
      if (sc) this.changement(sc);
    };
    el.addEventListener("input", surSaisie);
    el.addEventListener("change", surSaisie);
    el.addEventListener(
      "toggle",
      (ev) => {
        // un seul menu déroulant ouvert à la fois
        if (ev.target.matches && ev.target.matches(".multi[open]"))
          el.querySelectorAll(".multi[open]").forEach((x) => {
            if (x !== ev.target) x.open = false;
          });
      },
      true,
    );
  },
  // Clic dans la question : bouton déjà choisi qu'on désélectionne, ou bouton d'action (data-action)
  surClic(ev) {
    const inp = ev.target.closest('.seg input[type="radio"], .puces.unique input[type="radio"]');
    if (inp && inp.dataset.etait === "true") {
      inp.checked = false;
      inp.dataset.etait = "false";
      this.changement(inp.closest(".sous-champ"));
      return;
    }
    const b = ev.target.closest("button[data-action]");
    if (!b) return;
    const action = b.dataset.action;
    if (this.actionSurQuestion(action)) return;
    const k = +b.closest(".ligne-rep").dataset.k,
      l = this.lignes[k];
    this.actionSurLigne(action, b, k, l);
  },
  // Actions qui portent sur toute la question ; renvoie true si l'action a été traitée
  actionSurQuestion(action) {
    if (action === "reprendre-sites") {
      // reprise à la demande (reprise automatique désactivée) : les lignes déjà saisies sont gardées après les sites repris
      const deja = this.lignes.filter((l) => !this.ligneVide(l)),
        e = this.offreReprise.etab;
      const n = reprendreEtatSites(this, e),
        cles = new Set(this.lignes.map((l) => this.cleSite(e, l.valeurs)).filter(Boolean));
      this.lignes.push(
        ...deja.filter((l) => {
          const k = this.cleSite(e, l.valeurs);
          return !k || !cles.has(k);
        }),
      );
      this.offreReprise = null;
      this.noteAuto = n
        ? `${n} site${n > 1 ? "s" : ""} du dernier signalement de cet établissement, dans leur dernier état : confirmez ou modifiez ceux qui ne sont pas revenus à la normale, ajoutez les nouveaux.`
        : "";
      this.dessiner();
      this.signaler();
      etatSaisie.qualifTouchee = false;
      majQualifDeduite();
      etatSaisie.modifie = true;
      return true;
    }
    if (action === "ajouter") {
      const n = Math.max(1, Math.min(50, parseInt(this.el.querySelector(".qte").value, 10) || 1));
      for (let i = 0; i < n; i++) this.lignes.push({ _id: nouvelIdLigne(), valeurs: {} });
      this.dessiner();
      this.signaler();
      const lignes = this.el.querySelectorAll(".ligne-rep");
      const premiere = lignes[lignes.length - n];
      if (premiere) {
        const c = premiere.querySelector("input, select, textarea, summary");
        if (c) c.focus();
      }
      return true;
    }
    if (action === "annuler-supprimes") {
      for (const x of (this.supprimes || []).sort((a, b) => a.k - b.k))
        this.lignes.splice(Math.min(x.k, this.lignes.length), 0, x.l);
      this.supprimes = [];
      this.dessiner();
      this.signaler();
      return true;
    }
    if (action === "remettre-retires") {
      // sites laissés de côté : remis à leur place d'origine
      for (const x of (this.retires || []).sort((a, b) => a.k - b.k))
        this.lignes.splice(Math.min(x.k, this.lignes.length), 0, x.l);
      this.retires = [];
      this.dessiner();
      this.signaler();
      return true;
    }
    return false;
  },
  // Actions sur une ligne : b, le bouton ; k, la position de la ligne ; l, la ligne
  actionSurLigne(action, b, k, l) {
    if (action === "supprimer-site") {
      const nom = this.nomLigne(l);
      if (
        !confirm(
          `Supprimer « ${nom} » de ce dossier ?\n\nÀ réserver à un site saisi à tort : à l'enregistrement, ses réponses sont effacées de toutes les étapes du dossier et il ne sera plus proposé. Un site revenu à la normale se passe en RAS.`,
        )
      )
        return;
      const etab = etatSaisie.etabCourant ? etatSaisie.etabCourant.id : 0;
      (this.supprimes = this.supprimes || []).push({ k, l, _id: l._id, cle: this.cleSite(etab, l.valeurs) });
      this.lignes.splice(k, 1);
      this.dessiner();
      this.signaler();
      return;
    }
    if (action === "retirer-repris") {
      (this.retires = this.retires || []).push({ k, l });
      this.lignes.splice(k, 1);
      this.dessiner();
      this.signaler();
      return;
    }
    if (action === "corriger-site") {
      if (
        !confirm(
          "Corriger le site de cette ligne ?\n\nÀ réserver à une erreur de saisie : un site revenu à la normale reste dans le dossier, passez-le en RAS.",
        )
      )
        return;
      l._deverrouille = true;
      this.dessiner();
      const c = this.el.querySelectorAll(".ligne-rep")[k];
      const inp = c && c.querySelector(".site-txt");
      if (inp) inp.focus();
      return;
    }
    if (action === "confirmer-site") {
      if (l._repris) l._repris.etat = "confirme";
      this.majLignes();
      this.signaler();
      return;
    }
    if (action === "regenerer") {
      this.majAutos(l, b.closest(".ligne-rep"), b.dataset.sous);
      this.majLignes();
      this.signaler();
      const c = b.closest(".sous-champ").querySelector("textarea, input");
      if (c) c.focus();
      return;
    }
    if (action === "dupliquer") {
      const copie = {};
      for (const d of this.sousDefs)
        if (!d.confidentiel && !videSous(l.valeurs[d.colId]))
          copie[d.colId] = Array.isArray(l.valeurs[d.colId]) ? [...l.valeurs[d.colId]] : l.valeurs[d.colId];
      this.lignes.splice(k + 1, 0, { _id: nouvelIdLigne(), valeurs: copie, _touche: { ...(l._touche || {}) } });
    } else if (action === "ras-site" || (action === "supprimer" && this.sites && l._fixe)) {
      // un site ne se retire pas d'un dossier : il passe en RAS (retour à la normale)
      const d = this.sousDefs.find((x) => x.colId === this.sites.qualif),
        ras = this.valeurRas();
      if (d && ras) l.valeurs[d.colId] = typeBase(d.type) === "ChoiceList" ? [ras] : ras;
      if (l._repris) l._repris.etat = "modifie";
    } else if (action === "supprimer") {
      if (!this.ligneVide(l) && !confirm(`Supprimer la ligne ${k + 1} ?`)) return;
      this.lignes.splice(k, 1);
    }
    this.dessiner();
    this.signaler();
  },
  // Champ du site : flèches pour parcourir les suggestions, Entrée pour choisir, Échap pour fermer
  surToucheSite(ev) {
    if (!ev.target.classList || !ev.target.classList.contains("site-txt")) return;
    const ul = ev.target.closest(".site-combo").querySelector(".site-sugg"),
      lis = [...ul.querySelectorAll("li[role=option]")];
    const i = lis.findIndex((x) => x.getAttribute("aria-selected") === "true");
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (ul.hidden) this.montrerSites(ev.target);
      const j = Math.max(0, Math.min(lis.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1)));
      lis.forEach((x, k) => x.setAttribute("aria-selected", String(k === j)));
      if (lis[j]) lis[j].scrollIntoView({ block: "nearest" });
    } else if (ev.key === "Enter" && !ul.hidden && i >= 0) {
      ev.preventDefault();
      this.choisirSite(lis[i]);
    } else if (ev.key === "Escape") {
      ul.hidden = true;
    }
  },
});

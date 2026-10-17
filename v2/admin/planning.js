/* =====================================================================
   Administration v2 — onglet « Planning » : créneaux de la cellule et agents mobilisés
   ---------------------------------------------------------------------
   - Tableau de la semaine : une colonne par jour, une ligne par fonction (opérateur, rédacteur…) ; chaque case
     donne les agents mobilisés. En tête : nombre de personnes mobilisées par jour, et créneaux du jour.
   - Creneaux : créneaux nommés de chaque jour (Matin 8 h–13 h…), créés un par un ou à partir des modèles de journée.
   - Affectations : un agent sur un créneau, avec sa fonction, son champ (EN et/ou ESR : les formulaires concernés)
     et son périmètre pour ce créneau (vide = tous les établissements). La page de saisie de l'agent applique le
     périmètre du créneau en cours.
   - Cellule du jour, suivi individuel (créneaux et heures par agent).
   - Émargement (table Emargements, bouton « Je prends mon service » de la page de saisie) : prévu / émargé dans la
     cellule du jour et le suivi individuel ; clôture des services restés ouverts.
   - Réglages (clé « planning » de Config) : critères de périmètre, fonctions (lignes du tableau, ordre, affichage,
     saisie ; un renommage est reporté sur l'équipe et le planning), modèles de journée.
   Heures : celles du navigateur (la cellule travaille à l'heure de Paris).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  let config, general, ref, agents, planning, reglages, racine;
  let emargements = null;    // null : pas de table Emargements
  let lundi = null;          // premier jour de la semaine affichée (AAAA-MM-JJ)
  let edition = null;        // { mode: "cellule", jour, fonction, lignes, origine } ou { mode: "jour", jour, creneaux }
  let suivi = null;          // agent dont le détail est affiché
  let reglagesEdites = null; // copie des réglages en cours de modification
  let reglagesOuverts = false;

  /* ---------- Dates (heure locale) ---------- */
  const pad = n => String(n).padStart(2, "0");
  const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateDe = iso => { const [y, m, j] = iso.split("-").map(Number); return new Date(y, m - 1, j); };
  const plusJours = (iso, n) => { const d = dateDe(iso); d.setDate(d.getDate() + n); return isoLocal(d); };
  const lundiDe = iso => { const d = dateDe(iso); return plusJours(iso, -((d.getDay() + 6) % 7)); };
  const aujourdhui = () => isoLocal(new Date());
  const dateGrist = iso => { const [y, m, j] = iso.split("-").map(Number); return Date.UTC(y, m - 1, j) / 1000; };
  const isoDeGrist = sec => new Date(sec * 1000).toISOString().slice(0, 10);
  const instant = (iso, hhmm) => { const [h, mi] = String(hhmm || "0:0").split(":").map(Number); const d = dateDe(iso); d.setHours(h || 0, mi || 0, 0, 0); return d.getTime() / 1000; };
  const hhmm = sec => { const d = new Date(sec * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const heure = sec => { const d = new Date(sec * 1000); return `${d.getHours()} h${d.getMinutes() ? ` ${pad(d.getMinutes())}` : ""}`; };
  const plage = c => c.debut && c.fin ? `${heure(c.debut)}–${heure(c.fin)}` : "horaires à préciser";
  const jourCourt = iso => { const d = dateDe(iso); return `${JOURS[d.getDay()].slice(0, 3)}. ${d.getDate()}`; };
  const jourLong = iso => { const d = dateDe(iso); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
  const duree = h => { const t = Math.round(h * 60); return `${Math.floor(t / 60)} h${t % 60 ? ` ${pad(t % 60)}` : ""}`; };
  const jourDuCreneau = c => c.date ? isoDeGrist(c.date) : (c.debut ? isoLocal(new Date(c.debut * 1000)) : "");
  const heures = c => c.debut && c.fin && c.fin > c.debut ? (c.fin - c.debut) / 3600 : 0;
  // Fin avant début : le créneau finit le lendemain (créneau de nuit)
  const bornes = (iso, debut, fin) => { const d = instant(iso, debut); let f = instant(iso, fin); if (f <= d) f = instant(plusJours(iso, 1), fin); return [d, f]; };

  /* ---------- Lecture ---------- */
  const T = () => ({ creneaux: general.creneaux || "Creneaux", affectations: general.affectations || "Affectations", agents: general.agents || "Agents", emargements: general.emargements || "Emargements" });
  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    reglages = S.reglagesPlanning(config);
    ref = await R.lireReferentiel(general, config);
    agents = await R.lireAgents(general, ref);
    planning = await S.lirePlanning(general);
    emargements = await S.lireEmargements(general);
    // tables créées par une version antérieure : colonnes du socle manquantes (Champ…)
    const meta = await S.lireMeta(), ids = [...[T().agents, T().creneaux, T().affectations, T().emargements].map(n => `cols-${n}`), `formule-${T().agents}`, `table-${T().emargements}`];
    manquantes = !meta[T().affectations] ? [] : S.planInstallation(meta, config).etapes.filter(e => ids.includes(e.id))
      .map(e => e.id.startsWith("formule-") ? e.titre.replace(/^Ajouter /, "") : e.id.startsWith("table-") ? `table ${e.titre.replace(/^Créer la table /, "")}` : `${e.titre.replace(/^Compléter la table /, "")} : ${e.detail.replace(/^Colonnes ajoutées : /, "").replace(/\.$/, "")}`);
  }
  let manquantes = [];
  const agentDe = id => (agents || []).find(a => a.id === id) || null;
  const creneauxDu = iso => planning.creneaux.filter(c => jourDuCreneau(c) === iso);
  const affectationsDe = cId => planning.affectations.filter(a => a.creneau === cId);
  const fonctionDeSaisie = nom => !!(reglages.fonctions.find(f => f.nom === nom) || {}).saisie;
  // Périmètre d'une affectation (vide = tous les établissements)
  const perimetreAff = a => ({ perimetre: R.perimetreObjet(ref, a.perimetre), propre: false });
  const resume = p => R.resumePerimetre(p) || "tous les établissements";
  const nomCourt = c => c.nom.toLowerCase();
  // Lignes du tableau : les fonctions de la liste, puis celles trouvées sur le planning et absentes de la liste
  // (fonctions absentes de la liste mais présentes sur le planning de la semaine : ajoutées à la fin, pour ne rien cacher)
  const lignesFonctions = jours => {
    const ids = new Set(jours.flatMap(iso => creneauxDu(iso).map(c => c.id)));
    const vues = [...new Set(planning.affectations.filter(a => ids.has(a.creneau)).map(a => a.fonction || "(sans fonction)"))];
    return [...reglages.fonctions.filter(f => f.ligne).map(f => f.nom), ...vues.filter(f => !reglages.fonctions.some(x => x.nom === f))];
  };
  const fonctionsMasquees = () => reglages.fonctions.filter(f => !f.ligne).map(f => f.nom);
  const CHAMPS = S.CHAMPS.map(c => c.id);
  const texteChamps = l => (!l || !l.length || l.length === CHAMPS.length) ? "EN et ESR" : l.join(" et ");
  // Dernier champ connu d'un agent : proposé par défaut quand on le mobilise
  function dernierChamp(agentId, avant) {
    const parId = new Map(planning.creneaux.map(c => [c.id, c]));
    const l = planning.affectations.filter(a => a.agent === agentId && parId.get(a.creneau) && parId.get(a.creneau).debut <= avant)
      .sort((x, y) => parId.get(y.creneau).debut - parId.get(x.creneau).debut);
    return l.length ? S.champsDe(l[0]) : [...CHAMPS];
  }
  // Dernier périmètre connu d'un agent avant un instant : proposé par défaut quand on l'affecte
  function dernierPerimetre(agentId, avant) {
    const parId = new Map(planning.creneaux.map(c => [c.id, c]));
    const l = planning.affectations.filter(a => a.agent === agentId && parId.get(a.creneau) && parId.get(a.creneau).debut <= avant)
      .sort((x, y) => parId.get(y.creneau).debut - parId.get(x.creneau).debut);
    return l.length ? R.perimetreObjet(ref, l[0].perimetre) : {};
  }

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) { racine.innerHTML = `<div class="bandeau alerte">La table Config est absente : lancez d'abord l'installation.</div>`; return; }
    if (agents === null || planning === null) {
      const manque = [agents === null ? T().agents : null, planning === null ? `${T().creneaux} et ${T().affectations}` : null].filter(Boolean).join(", ");
      racine.innerHTML = `<div class="bandeau info">Tables à créer : ${esc(manque)}.</div>
        <section class="carte"><h2>Planning de la cellule</h2>
        <p class="aide">Des créneaux nommés pour chaque jour (matin, après-midi, astreinte…), et pour chacun les agents mobilisés, avec leur fonction et leur périmètre. La page de saisie d'un agent applique le périmètre du créneau en cours.</p>
        <div class="boutons"><button class="primaire" id="pl-creer-tables">Créer les tables du planning</button><span class="statut" id="pl-statut"></span></div></section>`;
      $("pl-creer-tables").addEventListener("click", creerTables);
      return;
    }
    racine.innerHTML = `${manquantes.length ? `<div class="bandeau alerte">Les tables du planning datent d'une version antérieure (à ajouter : ${esc(manquantes.join(", "))}). <button class="primaire" id="pl-completer" style="margin-left:8px">Compléter les tables</button></div>` : ""}${carteSemaine()}${edition ? carteEdition() : ""}${carteDuJour()}${carteSuivi()}${carteReglages()}`;
    if ($("pl-completer")) $("pl-completer").addEventListener("click", creerTables);
    lier();
  }

  // Alertes de couverture d'un créneau : personne ; aucune fonction de saisie ; valeurs du premier critère sans agent de saisie
  function alertesCreneau(c) {
    const affs = affectationsDe(c.id), saisie = affs.filter(a => fonctionDeSaisie(a.fonction));
    if (!affs.length) return ["aucun agent mobilisé"];
    const out = [];
    if (!saisie.length) out.push("aucun agent de saisie");
    const crit = R.criteres(ref, config), c0 = crit[0];
    if (c0 && saisie.length) {
      const perims = saisie.map(a => perimetreAff(a).perimetre);
      if (!perims.some(p => !(p[c0] || []).length)) {
        const sans = ref.valeurs[c0].map(x => x.v).filter(v => !perims.some(p => (p[c0] || []).includes(v)));
        if (sans.length) out.push(`${R.libelleCritere(ref, c0).toLowerCase()} sans agent de saisie : ${sans.join(", ")}`);
      }
    }
    return out;
  }

  function carteSemaine() {
    const jours = [...Array(7)].map((_, i) => plusJours(lundi, i)), d0 = dateDe(lundi), d6 = dateDe(jours[6]);
    const titre = `Semaine du ${d0.getDate()}${d0.getMonth() !== d6.getMonth() ? ` ${MOIS[d0.getMonth()]}` : ""} au ${d6.getDate()} ${MOIS[d6.getMonth()]} ${d6.getFullYear()}`;
    const auj = aujourdhui(), cls = iso => [iso === auj ? "auj" : "", edition && edition.jour === iso ? "choisi-col" : ""].filter(Boolean).join(" ");
    const mobilises = iso => new Set(creneauxDu(iso).flatMap(c => affectationsDe(c.id).map(a => a.agent))).size;
    const tete = jours.map(iso => `<th class="${cls(iso)}" scope="col">${esc(jourCourt(iso))}</th>`).join("");
    const parChamp = (iso, ch) => new Set(creneauxDu(iso).flatMap(c => affectationsDe(c.id).filter(a => S.champsDe(a).includes(ch)).map(a => a.agent))).size;
    const compte = jours.map(iso => { const n = mobilises(iso);
      return `<td class="${cls(iso)}"><span class="pl-nb${n ? "" : " zero"}">${n}</span>${n ? `<span class="pl-nb-champs">${CHAMPS.map(ch => `${ch} ${parChamp(iso, ch)}`).join(" · ")}</span>` : ""}</td>`; }).join("");
    const masquees = fonctionsMasquees().filter(f => jours.some(iso => creneauxDu(iso).some(c => affectationsDe(c.id).some(a => a.fonction === f))));
    const creneaux = jours.map(iso => {
      const cs = creneauxDu(iso), al = cs.flatMap(c => alertesCreneau(c).map(x => `${c.nom} : ${x}`));
      return `<td class="${cls(iso)}"><button type="button" class="pl-cr-jour${al.length ? " alerte" : ""}" data-jour="${iso}" title="${esc(al.join("\n"))}">
        ${cs.length ? cs.map(c => `<span>${esc(c.nom)} <small>${esc(plage(c))}</small></span>`).join("") : `<span class="pl-c-vide">+ créneaux</span>`}${al.length ? `<span class="pl-alerte-ic" aria-label="${al.length} alerte(s)">⚠</span>` : ""}</button></td>`;
    }).join("");
    const lignes = lignesFonctions(jours).map(f => `<tr><th scope="row">${esc(f)}</th>${jours.map(iso => {
      const cs = creneauxDu(iso), parAgent = new Map();
      cs.forEach(c => affectationsDe(c.id).filter(a => (a.fonction || "(sans fonction)") === f).forEach(a => {
        if (!parAgent.has(a.agent)) parAgent.set(a.agent, []);
        parAgent.get(a.agent).push({ c, a });
      }));
      const nomDe = id => (agentDe(id) || { nom: "?" }).nom;
      const noms = [...parAgent.entries()].sort(([x], [y]) => nomDe(x).localeCompare(nomDe(y), "fr")).map(([id, l]) => {
        const ag = agentDe(id), partiel = cs.length > 1 && l.length < cs.length;
        const titreP = l.map(({ c, a }) => `${c.nom} : ${texteChamps(S.champsDe(a))} · ${resume(perimetreAff(a).perimetre)}`).join("\n");
        const champs = [...new Set(l.flatMap(x => S.champsDe(x.a)))];
        const tag = champs.length < CHAMPS.length ? `<span class="pl-champ pl-champ-${esc(champs[0] || "").toLowerCase()}">${esc(champs.join("+"))}</span>` : "";
        return `<span class="pl-nom" title="${esc(titreP)}">${esc(ag ? ag.nom : "?")}${tag}${partiel ? ` <small>${esc(l.map(x => nomCourt(x.c)).join(", "))}</small>` : ""}</span>`;
      }).join("");
      const choisie = edition && edition.mode === "cellule" && edition.jour === iso && edition.fonction === f;
      return `<td class="${cls(iso)}"><button type="button" class="pl-cellule${choisie ? " choisie" : ""}" data-cellule="${iso}" data-fonction="${esc(f)}" aria-label="${esc(f)}, ${esc(jourLong(iso))}">${noms || `<span class="pl-plus">+</span>`}</button></td>`;
    }).join("")}</tr>`).join("");
    const modeles = reglages.modeles;
    const choixModele = iso => { const we = [0, 6].includes(dateDe(iso).getDay()); const def = modeles.find(m => S.norm(m.nom).includes(we ? "week" : "semaine")) || (we ? null : modeles[0]);
      return `<label class="pl-modele"><span>${esc(jourCourt(iso))}</span><select data-modele-jour="${iso}"><option value="">—</option>${modeles.map((m, i) => `<option value="${i}"${def === m && !creneauxDu(iso).length ? " selected" : ""}>${esc(m.nom)}</option>`).join("")}</select></label>`; };
    return `<section class="carte"><div class="pl-barre"><h2>${esc(titre)}</h2>
        <button type="button" class="secondaire petit" id="pl-prec" aria-label="Semaine précédente">◀</button>
        <button type="button" class="secondaire petit" id="pl-auj">Cette semaine</button>
        <button type="button" class="secondaire petit" id="pl-suiv" aria-label="Semaine suivante">▶</button>
        <button type="button" class="secondaire petit" id="pl-ouvrir-reglages" style="margin-left:auto">⚙ Lignes et réglages</button></div>
      <div class="pl-defile"><table class="pl-tableau">
        <thead><tr><th></th>${tete}</tr>
          <tr class="pl-ligne-compte"><th scope="row">Mobilisés</th>${compte}</tr>
          <tr class="pl-ligne-creneaux"><th scope="row">Créneaux</th>${creneaux}</tr></thead>
        <tbody>${lignes}</tbody></table></div>
      ${masquees.length ? `<p class="aide">Agents mobilisés cette semaine dans des fonctions masquées : ${esc(masquees.join(", "))} (comptés dans « Mobilisés »).</p>` : ""}
      <p class="aide">Cliquez sur une case pour mobiliser des agents dans cette fonction ce jour-là, avec leur périmètre ; sur la ligne « Créneaux » pour régler les créneaux du jour. Un nom suivi d'un créneau (« matin ») n'est mobilisé que sur ce créneau. Une étiquette EN ou ESR signale un agent mobilisé sur un seul champ ; sans étiquette, sur les deux. Survolez un nom pour voir son champ et son périmètre.</p>
      <details class="pl-outils"><summary>Remplir la semaine</summary>
        <p class="aide">Créer les créneaux d'un modèle de journée (réglages en bas de page) pour chaque jour choisi. Un créneau de même nom déjà présent ce jour-là n'est pas recréé.</p>
        ${modeles.length ? `<div class="pl-modeles">${jours.map(choixModele).join("")}</div>
          <div class="boutons"><button class="primaire" id="pl-appliquer-modeles">Créer les créneaux</button></div>` : `<p class="vide">Aucun modèle de journée.</p>`}
        <p class="aide" style="margin-top:12px">Ou reprendre la semaine précédente : ses créneaux et ses agents mobilisés sont recopiés sur les jours de cette semaine qui n'ont encore aucun créneau.</p>
        <div class="boutons"><button class="secondaire" id="pl-copier">Copier la semaine précédente</button></div></details>
      <p class="statut" id="pl-statut" role="status"></p></section>`;
  }

  /* Édition : une case (jour × fonction) ou les créneaux d'un jour */
  function puces(perimetre, attrs) {
    const crit = R.criteres(ref, config);
    if (!crit.length) return `<small class="aide">Aucun critère de répartition (réglages en bas de page) : tous les établissements.</small>`;
    return crit.map(c => `<div class="pl-crit"><span class="eq-crit-lib">${esc(R.libelleCritere(ref, c))}</span><span class="eq-puces">${ref.valeurs[c].map(x => {
      const on = (perimetre[c] || []).includes(x.v);
      return `<button type="button" class="eq-puce${on ? " on" : ""}" ${attrs} data-col="${esc(c)}" data-val="${esc(x.v)}" aria-pressed="${on}" title="${x.n} établissement(s)">${esc(x.v)}</button>`; }).join("")}</span></div>`).join("");
  }
  function carteEdition() { return edition.mode === "jour" ? carteJour() : carteCellule(); }
  function carteCellule() {
    const e = edition, cs = creneauxDu(e.jour);
    if (!cs.length) return `<section class="carte" id="pl-edition"><h2>${esc(e.fonction)} — ${esc(jourLong(e.jour))}</h2>
      <p class="vide">Aucun créneau ce jour-là : créez d'abord les créneaux du jour.</p>
      <div class="boutons"><button class="primaire" data-jour="${e.jour}">Régler les créneaux du jour</button><button class="secondaire" id="pl-fermer">Fermer</button></div></section>`;
    const actifs = agents.filter(a => a.actif);
    const surCreneau = (cId, agentId) => e.lignes.find(l => l.creneau === cId && l.agent === agentId)
      || planning.affectations.find(a => a.creneau === cId && a.agent === agentId && a.fonction !== e.fonction);
    const option = (a, cId) => { const x = cId ? surCreneau(cId, a.id) : null;
      const autre = x && x.fonction && x.fonction !== e.fonction && !e.lignes.includes(x) ? x.fonction : null;
      return `<option value="${a.id}"${x ? " disabled" : ""}>${esc(a.nom)}${a.fonction && a.fonction !== e.fonction ? ` (habituellement ${esc(a.fonction.toLowerCase())})` : ""}${autre ? ` — déjà ${esc(autre.toLowerCase())}` : x ? " — déjà là" : ""}</option>`; };
    const blocs = cs.map(c => {
      const ls = e.lignes.map((l, i) => ({ l, i })).filter(x => x.l.creneau === c.id);
      return `<div class="pl-bloc-creneau"><div class="pl-bloc-tete"><strong>${esc(c.nom)}</strong> <span class="aide">${esc(plage(c))}</span></div>
        ${ls.map(({ l, i }) => { const ag = agentDe(l.agent); return `<div class="pl-aff" data-i="${i}">
          <div class="pl-aff-haut"><strong>${esc(ag ? ag.nom : "?")}</strong><small class="aide">${esc(texteChamps(l.champ))} · ${esc(resume(l.perimetre))}</small>
            <button type="button" class="pl-mini danger" data-retirer="${i}" title="Retirer de ce créneau" aria-label="Retirer ${esc(ag ? ag.nom : "")} du créneau ${esc(c.nom)}">×</button></div>
          <div class="pl-crit"><span class="eq-crit-lib">Champ</span><span class="eq-puces">${CHAMPS.map(ch => { const on = l.champ.includes(ch);
            return `<button type="button" class="eq-puce${on ? " on" : ""}" data-champ-ligne="${i}" data-val="${ch}" aria-pressed="${on}" title="${esc((S.CHAMPS.find(x => x.id === ch) || {}).libelle || ch)}">${ch}</button>`; }).join("")}</span></div>
          ${puces(l.perimetre, `data-ligne="${i}"`)}</div>`; }).join("") || `<p class="vide">Personne sur ce créneau.</p>`}
        <select data-ajout-creneau="${c.id}" aria-label="Mobiliser un agent sur le créneau ${esc(c.nom)}"><option value="">+ mobiliser sur ce créneau…</option>${actifs.map(a => option(a, c.id)).join("")}</select></div>`;
    }).join("");
    return `<section class="carte" id="pl-edition"><h2>${esc(e.fonction)} — ${esc(jourLong(e.jour))}</h2>
      ${cs.length > 1 ? `<div class="pl-ajout-agent"><select id="pl-ajout-journee"><option value="">+ mobiliser sur toute la journée…</option>${actifs.map(a => `<option value="${a.id}">${esc(a.nom)}${a.fonction && a.fonction !== e.fonction ? ` (habituellement ${esc(a.fonction.toLowerCase())})` : ""}</option>`).join("")}</select>
        <small class="aide">L'agent est ajouté à chaque créneau du jour où il n'est pas déjà.</small></div>` : ""}
      ${blocs}
      <p class="aide">Champ : les formulaires (EN, ESR) sur lesquels l'agent est mobilisé ; sa page de saisie de l'autre champ le lui signale. Le champ et le périmètre proposés sont ceux de son dernier créneau. Aucune valeur cochée : tous les établissements. Un agent absent de la liste se crée dans l'onglet Équipe.</p>
      <div class="boutons"><button class="primaire" id="pl-enregistrer">Enregistrer</button>
        <button class="secondaire" id="pl-fermer">Fermer</button>
        <span class="statut" id="pl-edition-statut" role="status"></span></div></section>`;
  }
  function carteJour() {
    const e = edition;
    return `<section class="carte" id="pl-edition"><h2>Créneaux du ${esc(jourLong(e.jour))}</h2>
      ${e.creneaux.map((c, i) => c.suppr ? "" : `<div class="pl-reg-ligne" data-cr="${i}">
        <input type="text" data-champ="nom" value="${esc(c.nom)}" placeholder="Matin, astreinte…" aria-label="Nom du créneau">
        <input type="time" data-champ="debut" value="${esc(c.debut)}" aria-label="Début"><input type="time" data-champ="fin" value="${esc(c.fin)}" aria-label="Fin">
        <input type="text" data-champ="note" value="${esc(c.note)}" placeholder="Note" aria-label="Note" class="pl-note">
        ${c.id ? `<small class="aide">${affectationsDe(c.id).length} agent(s)</small>` : `<small class="aide">nouveau</small>`}
        <button type="button" class="pl-mini danger" data-suppr-cr="${i}" aria-label="Supprimer le créneau">×</button></div>`).join("") || `<p class="vide">Aucun créneau.</p>`}
      <div class="pl-ajout-agent"><button type="button" class="lien" id="pl-plus-cr">+ créneau</button>
        ${reglages.modeles.length ? `<select id="pl-modele-jour"><option value="">Ajouter les créneaux d'un modèle…</option>${reglages.modeles.map((m, i) => `<option value="${i}">${esc(m.nom)} (${esc(m.creneaux.map(c => c.nom).join(", "))})</option>`).join("")}</select>` : ""}</div>
      <p class="aide">Fin avant le début : le créneau finit le lendemain. Supprimer un créneau retire aussi ses agents.</p>
      <div class="boutons"><button class="primaire" id="pl-enregistrer">Enregistrer les créneaux</button>
        <button class="secondaire" id="pl-fermer">Fermer</button>
        <span class="statut" id="pl-edition-statut" role="status"></span></div></section>`;
  }

  /* ---------- Émargement ---------- */
  const emargementsDe = agentId => (emargements || []).filter(e => e.agent === agentId && e.debut);
  const finE = e => e.fin || Date.now() / 1000;
  const heuresE = e => Math.max(0, finE(e) - e.debut) / 3600;
  // Émargements d'un agent qui couvrent un créneau (même créneau noté, ou chevauchement des horaires)
  const emargementsSur = (agentId, c) => emargementsDe(agentId).filter(e => e.creneau === c.id || (c.debut && c.fin && e.debut < c.fin && finE(e) > c.debut));
  const plageE = e => `${heure(e.debut)}–${e.fin ? heure(e.fin) : "…"}`;
  function etatEmargement(agentId, c) {
    if (!emargements) return "";
    const t = Date.now() / 1000, l = emargementsSur(agentId, c);
    if (l.length) return l.map(e => e.fin ? `<span class="pastille">émargé ${esc(plageE(e))}</span>` : `<span class="pastille ok">en service depuis ${esc(heure(e.debut))}</span>`).join(" ");
    if (c.debut <= t) return `<span class="pastille manque">non émargé</span>`;
    return "";
  }
  function carteDuJour() {
    const iso = aujourdhui(), t = Date.now() / 1000, cs = creneauxDu(iso);
    const html = cs.map(c => {
      const etat = c.debut <= t && t < c.fin ? `<span class="pastille ok">en cours</span>` : t < c.debut ? `<span class="pastille">à venir</span>` : `<span class="pastille">terminé</span>`;
      const al = alertesCreneau(c), affs = affectationsDe(c.id);
      const ordre = f => { const i = reglages.fonctions.findIndex(x => x.nom === f); return i < 0 ? 99 : i; };
      return `<div class="pl-jour-creneau${c.debut <= t && t < c.fin ? " en-cours" : ""}"><div><strong>${esc(c.nom)}</strong> ${esc(plage(c))} ${etat}</div>
        <ul>${affs.sort((x, y) => ordre(x.fonction) - ordre(y.fonction)).map(a => { const ag = agentDe(a.agent);
          return `<li><strong>${esc(ag ? ag.nom : "?")}</strong> · ${esc(a.fonction || "fonction ?")} · ${esc(texteChamps(S.champsDe(a)))} · ${esc(resume(perimetreAff(a).perimetre))}${ag && ag.telephone ? ` · ${esc(ag.telephone)}` : ""} ${etatEmargement(a.agent, c)}</li>`; }).join("")}</ul>
        ${al.map(x => `<p class="avert">${esc(x)}</p>`).join("")}</div>`;
    }).join("");
    // Services ouverts : hors planning du jour, ou restés ouverts (oubli de fin de service)
    const ouverts = (emargements || []).filter(e => e.debut && !e.fin);
    const prevus = new Set(cs.flatMap(c => affectationsDe(c.id).map(a => a.agent)));
    const horsPlanning = ouverts.filter(e => !prevus.has(e.agent));
    const anciens = ouverts.filter(e => t - e.debut > 14 * 3600);
    return `<section class="carte"><h2>Cellule du jour — ${esc(jourLong(iso))}</h2>
      ${cs.length ? html : `<p class="vide">Aucun créneau aujourd'hui.</p>`}
      ${horsPlanning.length ? `<p class="aide">En service hors planning du jour : ${horsPlanning.map(e => `${esc((agentDe(e.agent) || { nom: "?" }).nom)} (depuis ${esc(heure(e.debut))})`).join(", ")}.</p>` : ""}
      ${anciens.length ? `<div class="avert">Services ouverts depuis plus de 14 h (fin de service oubliée ?) :
        ${anciens.map(e => `${esc((agentDe(e.agent) || { nom: "?" }).nom)}, ${esc(jourLong(isoLocal(new Date(e.debut * 1000))))} ${esc(heure(e.debut))} <button type="button" class="lien" data-clore="${e.id}">clore à la fin du créneau</button>`).join(" ; ")}</div>` : ""}
      ${emargements === null ? `<p class="aide">Émargement : la table ${esc(T().emargements)} n'existe pas encore (bandeau « Compléter les tables »).</p>` : ""}</section>`;
  }

  function carteSuivi() {
    const t = Date.now() / 1000, jours = new Set([...Array(7)].map((_, i) => plusJours(lundi, i)));
    const parAgent = new Map();
    const parId = new Map(planning.creneaux.map(c => [c.id, c]));
    for (const a of planning.affectations) {
      const c = parId.get(a.creneau); if (!c) continue;
      if (!parAgent.has(a.agent)) parAgent.set(a.agent, []);
      parAgent.get(a.agent).push({ a, c });
    }
    const lignes = agents.filter(ag => ag.actif || parAgent.has(ag.id)).map(ag => {
      const l = parAgent.get(ag.id) || [], sem = l.filter(x => jours.has(jourDuCreneau(x.c)));
      const faits = l.filter(x => x.c.fin <= t), prochain = l.filter(x => x.c.fin > t).sort((x, y) => x.c.debut - y.c.debut)[0];
      const emSem = emargementsDe(ag.id).filter(e => jours.has(isoLocal(new Date(e.debut * 1000))));
      const manques = faits.filter(x => jours.has(jourDuCreneau(x.c)) && !emargementsSur(ag.id, x.c).length).length;
      return `<tr data-suivi="${ag.id}" class="eq-ligne${suivi === ag.id ? " choisi" : ""}" tabindex="0"><td><strong>${esc(ag.nom)}</strong></td><td>${esc(ag.fonction)}</td>
        <td>${sem.length}</td><td>${duree(sem.reduce((n, x) => n + heures(x.c), 0))}</td>
        ${emargements ? `<td>${duree(emSem.reduce((n, e) => n + heuresE(e), 0))}${manques ? ` <span class="pastille manque">${manques} non émargé${manques > 1 ? "s" : ""}</span>` : ""}</td>` : ""}
        <td>${faits.length} · ${duree(faits.reduce((n, x) => n + heures(x.c), 0))}</td>
        <td>${prochain ? `${esc(jourCourt(jourDuCreneau(prochain.c)))} ${esc(prochain.c.nom)} (${esc(heure(prochain.c.debut))})` : `<span class="vide">—</span>`}</td></tr>`;
    }).join("");
    let detail = "";
    const ag = suivi != null ? agentDe(suivi) : null;
    if (ag) {
      const l = (parAgent.get(ag.id) || []).sort((x, y) => (y.c.debut || 0) - (x.c.debut || 0));
      const ems = emargementsDe(ag.id), couverts = new Set(l.flatMap(({ c }) => emargementsSur(ag.id, c).map(e => e.id)));
      const hors = ems.filter(e => !couverts.has(e.id)).sort((x, y) => y.debut - x.debut);
      detail = `<div class="pl-detail"><h3>${esc(ag.nom)} — ${l.length} créneau${l.length > 1 ? "x" : ""}, ${duree(l.reduce((n, x) => n + heures(x.c), 0))} prévues${emargements ? `, ${duree(ems.reduce((n, e) => n + heuresE(e), 0))} émargées` : ""}</h3>
        ${l.length ? `<table><thead><tr><th>Jour</th><th>Créneau</th><th>Fonction</th><th>Périmètre</th><th>Prévu</th>${emargements ? "<th>Émargé</th>" : ""}</tr></thead><tbody>
          ${l.map(({ a, c }) => { const p = perimetreAff(a), em = emargementsSur(ag.id, c);
            return `<tr${c.fin <= t ? "" : ` class="avenir"`}><td>${esc(jourLong(jourDuCreneau(c)))}</td><td>${esc(c.nom)} ${esc(plage(c))}</td><td>${esc(a.fonction)}</td>
            <td>${esc(resume(p.perimetre))}</td><td>${duree(heures(c))}</td>
            ${emargements ? `<td>${em.length ? em.map(e => `${esc(plageE(e))} (${duree(heuresE(e))})`).join("<br>") : c.debut <= t ? `<span class="pastille manque">non émargé</span>` : ""}</td>` : ""}</tr>`; }).join("")}</tbody></table>` : `<p class="vide">Aucun créneau.</p>`}
        ${hors.length ? `<p class="aide">Émargements hors créneau prévu : ${hors.map(e => `${esc(jourLong(isoLocal(new Date(e.debut * 1000))))} ${esc(plageE(e))}`).join(" ; ")}.</p>` : ""}</div>`;
    }
    return `<section class="carte"><h2>Suivi individuel</h2>
      <p class="aide">Créneaux et heures prévus au planning, par agent ; heures émargées depuis les pages de saisie (« Je prends mon service »). « Effectués » compte les créneaux terminés. Cliquez sur un agent pour le détail.</p>
      <table class="eq-table"><thead><tr><th>Agent</th><th>Fonction habituelle</th><th>Créneaux (semaine affichée)</th><th>Heures prévues (semaine)</th>${emargements ? "<th>Heures émargées (semaine)</th>" : ""}<th>Créneaux effectués</th><th>Prochain créneau</th></tr></thead><tbody>${lignes}</tbody></table>
      ${emargements ? `<p class="aide">L'émargement est un traitement de données personnelles sur les agents : à inscrire au registre des traitements, avec une durée de conservation, et à porter à la connaissance des agents.</p>` : ""}
      ${detail}</section>`;
  }

  function carteReglages() {
    const r = reglagesEdites || { ...JSON.parse(JSON.stringify(reglages)), fonctions: reglages.fonctions.map(f => ({ ...f, ancien: f.nom })) };
    reglagesEdites = r;
    return `<section class="carte"><details id="pl-reglages"${reglagesOuverts ? " open" : ""}><summary><strong>Réglages : périmètres, fonctions et modèles de journée</strong></summary>
      <div class="eq-lib" style="margin-top:8px">Périmètres définis selon</div>
      <p class="aide">Les critères proposés pour le périmètre de chaque agent sur un créneau (un établissement en fait partie s'il remplit chaque critère coché).</p>
      <div class="eq-criteres">${R.criteres(ref, config).map(c => `<span class="crit">${esc(R.libelleCritere(ref, c))}<button type="button" data-crit-retirer="${esc(c)}" title="Retirer ce critère" aria-label="Retirer ${esc(R.libelleCritere(ref, c))}">×</button></span>`).join("") || `<span class="vide">aucun critère : chaque agent couvre tous les établissements</span>`}
        ${(() => { const aj = R.criteresAjoutables(ref, config); return aj.length ? `<select id="pl-crit-ajouter" aria-label="Ajouter un critère"><option value="">+ critère…</option>${aj.map(c => `<option value="${esc(c)}">${esc(R.libelleCritere(ref, c))} (${ref.valeurs[c].length})</option>`).join("")}</select>` : ""; })()}</div>
      ${ref.absent ? `<p class="avert">Le référentiel « ${esc(ref.table)} » est introuvable : terminez l'installation.</p>` : ""}
      <div class="eq-lib" style="margin-top:14px">Fonctions : lignes du tableau</div>
      <p class="aide">Une ligne par fonction, dans cet ordre (↑ ↓). « Ligne affichée » : la fonction a sa ligne dans le tableau. « Saisit » : les agents de cette fonction ont une page de saisie (cochée d'office dans l'onglet Formulaires) et comptent pour la couverture des créneaux. Renommer une fonction met à jour l'équipe et le planning.</p>
      ${r.fonctions.map((f, i) => `<div class="pl-reg-ligne" data-fonction="${i}">
        <button type="button" class="pl-mini" data-monter-fonction="${i}"${i ? "" : " disabled"} aria-label="Monter">↑</button>
        <button type="button" class="pl-mini" data-descendre-fonction="${i}"${i < r.fonctions.length - 1 ? "" : " disabled"} aria-label="Descendre">↓</button>
        <input type="text" data-champ="nom" value="${esc(f.nom)}" aria-label="Nom de la fonction">
        <label class="pl-case"><input type="checkbox" data-champ="ligne"${f.ligne ? " checked" : ""}> ligne affichée</label>
        <label class="pl-case"><input type="checkbox" data-champ="saisie"${f.saisie ? " checked" : ""}> saisit</label>
        ${f.ancien && f.ancien !== f.nom.trim() ? `<small class="aide">renommée (« ${esc(f.ancien)} »)</small>` : ""}
        <button type="button" class="pl-mini danger" data-suppr-fonction="${i}" aria-label="Supprimer la fonction">×</button></div>`).join("")}
      <button type="button" class="lien" id="pl-plus-fonction">+ fonction</button>
      <div class="eq-lib" style="margin-top:14px">Modèles de journée</div>
      ${r.modeles.map((m, i) => `<div class="pl-reg-modele" data-modele="${i}"><div class="pl-reg-ligne"><input type="text" data-champ="nom" value="${esc(m.nom)}" aria-label="Nom du modèle">
          <button type="button" class="pl-mini danger" data-suppr-modele="${i}" aria-label="Supprimer le modèle">×</button></div>
        ${m.creneaux.map((c, j) => `<div class="pl-reg-ligne pl-reg-creneau" data-creneau="${j}"><input type="text" data-champ="nom" value="${esc(c.nom)}" aria-label="Nom du créneau">
          <input type="time" data-champ="debut" value="${esc(c.debut)}" aria-label="Début"><input type="time" data-champ="fin" value="${esc(c.fin)}" aria-label="Fin">
          <button type="button" class="pl-mini danger" data-suppr-creneau="${j}" aria-label="Supprimer le créneau">×</button></div>`).join("")}
        <button type="button" class="lien" data-plus-creneau="${i}">+ créneau</button></div>`).join("")}
      <button type="button" class="lien" id="pl-plus-modele">+ modèle</button>
      <div class="boutons"><button class="primaire" id="pl-reg-enregistrer">Enregistrer les réglages</button><span class="statut" id="pl-reg-statut" role="status"></span></div>
      </details></section>`;
  }

  /* ---------- Événements ---------- */
  function lier() {
    racine.querySelectorAll("[data-cellule]").forEach(b => b.addEventListener("click", () => ouvrirCellule(b.dataset.cellule, b.dataset.fonction)));
    racine.querySelectorAll("[data-jour]").forEach(b => b.addEventListener("click", () => ouvrirJour(b.dataset.jour)));
    $("pl-prec").addEventListener("click", () => { lundi = plusJours(lundi, -7); dessiner(); });
    $("pl-suiv").addEventListener("click", () => { lundi = plusJours(lundi, 7); dessiner(); });
    $("pl-auj").addEventListener("click", () => { lundi = lundiDe(aujourdhui()); dessiner(); });
    $("pl-ouvrir-reglages").addEventListener("click", () => { const d = $("pl-reglages"); d.open = true; reglagesOuverts = true; d.scrollIntoView({ block: "start" }); });
    if ($("pl-appliquer-modeles")) $("pl-appliquer-modeles").addEventListener("click", appliquerModeles);
    $("pl-copier").addEventListener("click", copierSemaine);
    racine.querySelectorAll("[data-suivi]").forEach(tr => {
      const f = () => { suivi = suivi === +tr.dataset.suivi ? null : +tr.dataset.suivi; dessiner(); };
      tr.addEventListener("click", f); tr.addEventListener("keydown", e => { if (e.key === "Enter") f(); });
    });
    racine.querySelectorAll("[data-clore]").forEach(b => b.addEventListener("click", () => clore(+b.dataset.clore)));
    if (edition) edition.mode === "jour" ? lierJour() : lierCellule();
    lierReglages();
    lierCriteres();
  }
  const versEdition = () => { const el = $("pl-edition"); if (el) el.scrollIntoView({ block: "nearest" }); };
  function ouvrirCellule(iso, fonction) {
    const ids = new Set(creneauxDu(iso).map(c => c.id));
    const lignes = planning.affectations.filter(a => ids.has(a.creneau) && (a.fonction || "(sans fonction)") === fonction)
      .map(a => ({ id: a.id, creneau: a.creneau, agent: a.agent, perimetre: R.perimetreObjet(ref, a.perimetre), champ: S.champsDe(a), note: a.note }));
    edition = { mode: "cellule", jour: iso, fonction, lignes, origine: JSON.parse(JSON.stringify(lignes)) };
    dessiner(); versEdition();
  }
  function ouvrirJour(iso) {
    const creneaux = creneauxDu(iso).map(c => ({ id: c.id, nom: c.nom, debut: c.debut ? hhmm(c.debut) : "", fin: c.fin ? hhmm(c.fin) : "", note: c.note, suppr: false }));
    if (!creneaux.length) {
      const we = [0, 6].includes(dateDe(iso).getDay()), m = reglages.modeles.find(x => S.norm(x.nom).includes(we ? "week" : "semaine")) || reglages.modeles[0];
      (m ? m.creneaux : [{ nom: "Journée", debut: "09:00", fin: "18:00" }]).forEach(c => creneaux.push({ id: null, nom: c.nom, debut: c.debut, fin: c.fin, note: "", suppr: false }));
    }
    edition = { mode: "jour", jour: iso, creneaux };
    dessiner(); versEdition();
  }
  function lierCellule() {
    const e = edition, zone = $("pl-edition");
    $("pl-fermer").addEventListener("click", () => { edition = null; dessiner(); });
    if (!$("pl-enregistrer")) return;
    const ajouter = (agentId, cId) => {
      if (e.lignes.some(l => l.creneau === cId && l.agent === agentId)) return;
      if (planning.affectations.some(a => a.creneau === cId && a.agent === agentId && (a.fonction || "(sans fonction)") !== e.fonction)) return;
      const c = planning.creneaux.find(x => x.id === cId);
      const t = c ? c.debut : Date.now() / 1000;
      e.lignes.push({ id: null, creneau: cId, agent: agentId, perimetre: dernierPerimetre(agentId, t), champ: dernierChamp(agentId, t), note: "" });
    };
    zone.addEventListener("change", ev => {
      const t = ev.target, v = +t.value;
      if (!v) return;
      if (t.id === "pl-ajout-journee") creneauxDu(e.jour).forEach(c => ajouter(v, c.id));
      else if (t.dataset.ajoutCreneau) ajouter(v, +t.dataset.ajoutCreneau);
      else return;
      dessiner(); versEdition();
    });
    zone.addEventListener("click", ev => {
      const ch = ev.target.closest(".eq-puce[data-champ-ligne]");
      if (ch) {
        const l = e.lignes[+ch.dataset.champLigne], v = ch.dataset.val;
        l.champ = l.champ.includes(v) ? l.champ.filter(x => x !== v) : CHAMPS.filter(x => x === v || l.champ.includes(x));
        if (!l.champ.length) l.champ = CHAMPS.filter(x => x !== v);   // au moins un champ
        dessiner(); versEdition(); return;
      }
      const p = ev.target.closest(".eq-puce[data-ligne]");
      if (p) {
        const l = e.lignes[+p.dataset.ligne], c = p.dataset.col, v = p.dataset.val, liste = l.perimetre[c] || [];
        l.perimetre[c] = liste.includes(v) ? liste.filter(x => x !== v) : [...liste, v];
        if (!l.perimetre[c].length) delete l.perimetre[c];
        const on = (l.perimetre[c] || []).includes(v);
        p.classList.toggle("on", on); p.setAttribute("aria-pressed", String(on));
        const r = p.closest(".pl-aff").querySelector(".pl-aff-haut small"); if (r) r.textContent = `${texteChamps(l.champ)} · ${resume(l.perimetre)}`;
        return;
      }
      const r = ev.target.closest("[data-retirer]");
      if (r) { e.lignes.splice(+r.dataset.retirer, 1); dessiner(); versEdition(); }
    });
    $("pl-enregistrer").addEventListener("click", enregistrerCellule);
  }
  function lierJour() {
    const e = edition, zone = $("pl-edition");
    zone.addEventListener("input", ev => { const d = ev.target.closest("[data-cr]"); if (d && ev.target.dataset.champ) e.creneaux[+d.dataset.cr][ev.target.dataset.champ] = ev.target.value; });
    zone.addEventListener("click", ev => {
      const s = ev.target.closest("[data-suppr-cr]");
      if (s) { const c = e.creneaux[+s.dataset.supprCr]; if (c.id) c.suppr = true; else e.creneaux.splice(+s.dataset.supprCr, 1); dessiner(); versEdition(); }
    });
    $("pl-plus-cr").addEventListener("click", () => { e.creneaux.push({ id: null, nom: "", debut: "08:00", fin: "13:00", note: "", suppr: false }); dessiner(); versEdition(); });
    if ($("pl-modele-jour")) $("pl-modele-jour").addEventListener("change", ev => {
      const m = reglages.modeles[+ev.target.value]; if (!m) return;
      const deja = new Set(e.creneaux.filter(c => !c.suppr).map(c => S.norm(c.nom)));
      m.creneaux.filter(c => !deja.has(S.norm(c.nom))).forEach(c => e.creneaux.push({ id: null, nom: c.nom, debut: c.debut, fin: c.fin, note: "", suppr: false }));
      dessiner(); versEdition();
    });
    $("pl-fermer").addEventListener("click", () => { edition = null; dessiner(); });
    $("pl-enregistrer").addEventListener("click", enregistrerJour);
  }
  function lierCriteres() {
    const sel = $("pl-crit-ajouter");
    if (sel) sel.addEventListener("change", async () => { if (!sel.value) return; await changerCriteres([...R.criteres(ref, config), sel.value]); });
    racine.querySelectorAll("[data-crit-retirer]").forEach(b => b.addEventListener("click", async () => {
      const c = b.dataset.critRetirer;
      if (!confirm(`Ne plus proposer le critère « ${R.libelleCritere(ref, c)} » ? Les périmètres déjà enregistrés sur le planning restent inchangés.`)) return;
      await changerCriteres(R.criteres(ref, config).filter(k => k !== c));
    }));
  }
  async function changerCriteres(liste) {
    try { config = await R.enregistrerCriteres(config, liste); } catch (err) { dire("pl-reg-statut", `Critères non enregistrés : ${err.message || err}`, true); return; }
    reglagesOuverts = true; dessiner();
  }
  function lierReglages() {
    const det = $("pl-reglages"), r = reglagesEdites;
    det.addEventListener("toggle", () => { reglagesOuverts = det.open; });
    det.addEventListener("input", ev => {
      const t = ev.target, f = t.closest("[data-fonction]"), m = t.closest("[data-modele]"), c = t.closest("[data-creneau]");
      if (f) { const x = r.fonctions[+f.dataset.fonction]; if (t.dataset.champ === "nom") x.nom = t.value; if (t.dataset.champ === "saisie") x.saisie = t.checked; if (t.dataset.champ === "ligne") x.ligne = t.checked; return; }
      if (m && c) { r.modeles[+m.dataset.modele].creneaux[+c.dataset.creneau][t.dataset.champ] = t.value; return; }
      if (m && t.dataset.champ === "nom") r.modeles[+m.dataset.modele].nom = t.value;
    });
    det.addEventListener("change", ev => { const t = ev.target, f = t.closest("[data-fonction]"); if (f && (t.dataset.champ === "saisie" || t.dataset.champ === "ligne")) r.fonctions[+f.dataset.fonction][t.dataset.champ] = t.checked; });
    det.addEventListener("click", ev => {
      const t = ev.target.closest("button"); if (!t) return;
      const m = t.closest("[data-modele]");
      const echanger = (i, j) => { [r.fonctions[i], r.fonctions[j]] = [r.fonctions[j], r.fonctions[i]]; };
      if (t.id === "pl-plus-fonction") r.fonctions.push({ nom: "", saisie: false, ligne: true });
      else if (t.dataset.monterFonction != null) echanger(+t.dataset.monterFonction, +t.dataset.monterFonction - 1);
      else if (t.dataset.descendreFonction != null) echanger(+t.dataset.descendreFonction, +t.dataset.descendreFonction + 1);
      else if (t.dataset.supprFonction != null) r.fonctions.splice(+t.dataset.supprFonction, 1);
      else if (t.id === "pl-plus-modele") r.modeles.push({ nom: "Nouveau modèle", creneaux: [{ nom: "Journée", debut: "09:00", fin: "18:00" }] });
      else if (t.dataset.supprModele != null) r.modeles.splice(+t.dataset.supprModele, 1);
      else if (t.dataset.plusCreneau != null) r.modeles[+t.dataset.plusCreneau].creneaux.push({ nom: "", debut: "08:00", fin: "13:00" });
      else if (t.dataset.supprCreneau != null && m) r.modeles[+m.dataset.modele].creneaux.splice(+t.dataset.supprCreneau, 1);
      else if (t.id === "pl-reg-enregistrer") { enregistrerReglages(); return; }
      else return;
      dessiner();
    });
  }
  const dire = (id, t, err) => { const st = $(id); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  const maintenant = () => Date.now() / 1000;
  async function actions(acts) { if (acts.length) return grist.docApi.applyUserActions(acts); }
  async function recharger() { planning = await S.lirePlanning(general); emargements = await S.lireEmargements(general); dessiner(); }

  /* ---------- Écritures ---------- */
  const champsAff = (l, fonction) => ({ Creneau: l.creneau, Agent: l.agent, Fonction: fonction,
    Perimetre: JSON.stringify(R.nettoyer(l.perimetre)), Champ: ["L", ...l.champ], Note: l.note || "", Modifie_le: maintenant() });
  async function enregistrerCellule() {
    const e = edition, avant = new Map(e.origine.map(l => [l.id, l])), gardes = new Set(e.lignes.filter(l => l.id).map(l => l.id));
    const acts = [
      ...e.origine.filter(l => !gardes.has(l.id)).map(l => ["RemoveRecord", T().affectations, l.id]),
      ...e.lignes.filter(l => !l.id).map(l => ["AddRecord", T().affectations, null, champsAff(l, e.fonction)]),
      ...e.lignes.filter(l => l.id && JSON.stringify(l) !== JSON.stringify(avant.get(l.id))).map(l => ["UpdateRecord", T().affectations, l.id, champsAff(l, e.fonction)]),
    ];
    try {
      await actions(acts);
      edition = null; await recharger();
      dire("pl-statut", acts.length ? `${e.fonction}, ${jourLong(e.jour)} : enregistré.` : "Aucun changement.");
    } catch (err) { dire("pl-edition-statut", `Enregistrement refusé par Grist (${err.message || err}).`, true); }
  }
  // Service resté ouvert : clos à la fin de son créneau (ou 8 h après le début, à défaut de créneau)
  async function clore(id) {
    const e = (emargements || []).find(x => x.id === id); if (!e) return;
    const c = planning.creneaux.find(x => x.id === e.creneau) || planning.creneaux.find(x => affectationsDe(x.id).some(a => a.agent === e.agent) && x.debut <= e.debut + 3600 && e.debut < x.fin);
    const fin = c && c.fin > e.debut ? c.fin : e.debut + 8 * 3600;
    try {
      await actions([["UpdateRecord", T().emargements, id, { Fin: fin, Note: `${e.note ? `${e.note} ; ` : ""}clos par l'administration (${new Date().toLocaleString("fr-FR")})` }]]);
      emargements = await S.lireEmargements(general); dessiner();
      dire("pl-statut", "Service clos.");
    } catch (err) { dire("pl-statut", `Clôture refusée par Grist (${err.message || err}).`, true); }
  }
  async function enregistrerJour() {
    const e = edition, garder = e.creneaux.filter(c => !c.suppr), suppr = e.creneaux.filter(c => c.suppr && c.id);
    const vide = garder.find(c => !c.nom.trim() || !c.debut || !c.fin);
    if (vide) { dire("pl-edition-statut", "Chaque créneau a besoin d'un nom, d'un début et d'une fin.", true); return; }
    const noms = garder.map(c => S.norm(c.nom));
    if (noms.some((n, i) => noms.indexOf(n) !== i)) { dire("pl-edition-statut", "Deux créneaux du jour portent le même nom.", true); return; }
    const nAff = suppr.reduce((n, c) => n + affectationsDe(c.id).length, 0);
    if (suppr.length && !confirm(`Supprimer ${suppr.length} créneau(x)${nAff ? ` et ${nAff} agent(s) mobilisé(s) dessus` : ""} ?`)) return;
    const champs = c => { const [d, f] = bornes(e.jour, c.debut, c.fin); return { Date: dateGrist(e.jour), Nom: c.nom.trim(), Debut: d, Fin: f, Note: (c.note || "").trim() }; };
    const acts = [
      ...suppr.flatMap(c => [...affectationsDe(c.id).map(a => ["RemoveRecord", T().affectations, a.id]), ["RemoveRecord", T().creneaux, c.id]]),
      ...garder.filter(c => c.id).map(c => ["UpdateRecord", T().creneaux, c.id, champs(c)]),
      ...garder.filter(c => !c.id).map(c => ["AddRecord", T().creneaux, null, champs(c)]),
    ];
    try { await actions(acts); edition = null; await recharger(); dire("pl-statut", `Créneaux du ${jourLong(e.jour)} enregistrés.`); }
    catch (err) { dire("pl-edition-statut", `Enregistrement refusé par Grist (${err.message || err}).`, true); }
  }
  async function appliquerModeles() {
    const acts = [];
    racine.querySelectorAll("[data-modele-jour]").forEach(sel => {
      if (sel.value === "") return;
      const iso = sel.dataset.modeleJour, m = reglages.modeles[+sel.value], deja = new Set(creneauxDu(iso).map(c => S.norm(c.nom)));
      for (const c of m.creneaux) {
        if (!c.nom || deja.has(S.norm(c.nom))) continue;
        const [d, f] = bornes(iso, c.debut, c.fin);
        acts.push(["AddRecord", T().creneaux, null, { Date: dateGrist(iso), Nom: c.nom, Debut: d, Fin: f, Note: "" }]);
      }
    });
    if (!acts.length) { dire("pl-statut", "Aucun créneau à créer (jours sans modèle, ou créneaux déjà présents)."); return; }
    try { await actions(acts); await recharger(); dire("pl-statut", `${acts.length} créneau(x) créé(s). Affectez maintenant les agents.`); }
    catch (err) { dire("pl-statut", `Création refusée par Grist (${err.message || err}).`, true); }
  }
  async function copierSemaine() {
    const jours = [...Array(7)].map((_, i) => plusJours(lundi, i)).filter(iso => !creneauxDu(iso).length);
    const sources = jours.flatMap(iso => creneauxDu(plusJours(iso, -7)).map(c => ({ c, iso })));
    if (!sources.length) { dire("pl-statut", "Rien à copier : la semaine précédente n'a pas de créneau sur les jours encore vides.", true); return; }
    try {
      const res = await actions(sources.map(({ c, iso }) => { const [d, f] = bornes(iso, hhmm(c.debut), hhmm(c.fin));
        return ["AddRecord", T().creneaux, null, { Date: dateGrist(iso), Nom: c.nom, Debut: d, Fin: f, Note: c.note }]; }));
      const ids = res.retValues;
      const affs = sources.flatMap(({ c }, k) => affectationsDe(c.id).filter(a => { const ag = agentDe(a.agent); return ag && ag.actif; })
        .map(a => ["AddRecord", T().affectations, null, { Creneau: ids[k], Agent: a.agent, Fonction: a.fonction, Perimetre: a.perimetre || "", Champ: ["L", ...S.champsDe(a)], Note: a.note, Modifie_le: maintenant() }]));
      await actions(affs);
      await recharger();
      dire("pl-statut", `${sources.length} créneau(x) et ${affs.length} affectation(s) recopiés de la semaine précédente.`);
    } catch (err) { dire("pl-statut", `Copie refusée par Grist (${err.message || err}).`, true); }
  }
  async function enregistrerReglages() {
    const r = reglagesEdites;
    const renommages = r.fonctions.filter(f => f.ancien && f.nom.trim() && f.ancien !== f.nom.trim()).map(f => [f.ancien, f.nom.trim()]);
    const supprimees = reglages.fonctions.map(f => f.nom).filter(n => !r.fonctions.some(f => f.ancien === n));
    r.fonctions = r.fonctions.map(f => ({ nom: f.nom.trim(), saisie: !!f.saisie, ligne: f.ligne !== false })).filter(f => f.nom);
    r.modeles = r.modeles.map(m => ({ nom: m.nom.trim(), creneaux: m.creneaux.map(c => ({ nom: c.nom.trim(), debut: c.debut, fin: c.fin })).filter(c => c.nom && c.debut && c.fin) })).filter(m => m.nom);
    if (!r.fonctions.length) { dire("pl-reg-statut", "Gardez au moins une fonction.", true); return; }
    const noms = r.fonctions.map(f => S.norm(f.nom));
    if (noms.some((n, i) => noms.indexOf(n) !== i)) { dire("pl-reg-statut", "Deux fonctions portent le même nom.", true); return; }
    const utilisees = supprimees.filter(n => planning.affectations.some(a => a.fonction === n) || agents.some(a => a.fonction === n));
    if (utilisees.length && !confirm(`Fonction(s) supprimée(s) mais encore utilisée(s) par l'équipe ou le planning : ${utilisees.join(", ")}. Elles resteront affichées là où elles sont utilisées. Continuer ?`)) return;
    try {
      const meta = await S.lireMeta(), choix = JSON.stringify({ choices: r.fonctions.map(f => f.nom) }), acts = [];
      // renommage reporté sur les fiches et sur le planning
      for (const [ancien, nouveau] of renommages) {
        agents.filter(a => a.fonction === ancien).forEach(a => acts.push(["UpdateRecord", T().agents, a.id, { Fonction: nouveau }]));
        planning.affectations.filter(a => a.fonction === ancien).forEach(a => acts.push(["UpdateRecord", T().affectations, a.id, { Fonction: nouveau }]));
      }
      for (const t of [T().agents, T().affectations]) {
        const c = meta[t] && meta[t].colonnes.Fonction;
        if (!c || !/^Choice/.test(c.type)) continue;
        let o = {}; try { o = JSON.parse(c.widgetOptions || "{}") || {}; } catch (_) { o = {}; }
        acts.push(["ModifyColumn", t, "Fonction", { widgetOptions: JSON.stringify({ ...o, choices: JSON.parse(choix).choices }) }]);
      }
      await actions([S.actionConfig(config, "planning", r), ...acts]);
      await charger(); reglagesEdites = null; reglagesOuverts = true;
      dessiner(); dire("pl-reg-statut", `Réglages enregistrés.${renommages.length ? ` Renommage reporté sur l'équipe et le planning : ${renommages.map(([a, b]) => `${a} → ${b}`).join(", ")}.` : ""}`);
    } catch (err) { dire("pl-reg-statut", `Enregistrement refusé par Grist (${err.message || err}).`, true); }
  }
  async function creerTables() {
    const meta = await S.lireMeta(), plan = S.planInstallation(meta, config);
    const noms = [T().agents, T().creneaux, T().affectations, T().emargements];
    const etapes = plan.etapes.filter(e => noms.some(n => e.id === `table-${n}` || e.id === `cols-${n}`) || e.id === `formule-${T().agents}`);
    const res = await S.appliquer(etapes), ko = res.find(r => !r.ok);
    if (ko) { dire("pl-statut", `Création refusée par Grist (${ko.erreur}).`, true); return; }
    await charger(); dessiner();
  }

  async function afficher() {
    racine = $("planning");
    racine.innerHTML = `<div class="bandeau info">Lecture du planning…</div>`;
    try { await charger(); } catch (e) { racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`; return; }
    if (!lundi) lundi = lundiDe(aujourdhui());
    edition = null;
    dessiner();
  }
  window.OngletPlanning = { afficher };
})();

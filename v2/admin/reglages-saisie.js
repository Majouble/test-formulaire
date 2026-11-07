/* =====================================================================
   Administration v2 — onglet « Installation », carte « Saisie : réglages communs et pages »
   ---------------------------------------------------------------------
   Réglages du widget de saisie qui se faisaient autrefois dans son panneau ⚙ :
   - nombres : valeurs négatives interdites dans toutes les questions numériques (clé resume_auto de Config,
     nombresPositifs) ; limites communes question par question (resume_auto.bornes), affichées et effaçables : les
     limites d'une question se règlent désormais dans le formulaire (onglet Formulaires, réglages de la question) ;
   - table de recherche des établissements forcée (resume_auto.tableEtablissementsESR) : affichée, avec retour à la
     table du référentiel des réglages généraux ;
   - pages de saisie : formulaire affiché et version (EN, ESR) de chaque page, enregistrés dans les options de la vue
     personnalisée (comme le faisait le widget avec grist.setOption).
   La description automatique commune se règle dans l'onglet Formulaires (panneau Description, mode « Communs »).
   Dépend de ../commun/socle.js (window.Socle) et de repartition.js (window.Repartition).
   ===================================================================== */
(function () {
  "use strict";
  const { esc, $ } = Outils;
  const R = window.Repartition;
  const CLE_TABLE_FORCEE = "tableEtablissementsESR";
  const VERSIONS = { en: "Établissements scolaires", esr: "Enseignement supérieur et recherche" };

  let config = null,
    general = null,
    meta = null,
    pages = null,
    formulaires = [];

  const reglagesCommuns = () => (config && config.valeurs.resume_auto) || {};
  function statut(texte, type) {
    const zone = $("rs-statut");
    if (!zone) return;
    zone.textContent = texte || "";
    zone.className = `statut ${type || ""}`;
  }
  async function enregistrerCommuns(modification) {
    const valeur = { ...reglagesCommuns(), ...modification };
    for (const [cle, v] of Object.entries(modification)) if (v === undefined) delete valeur[cle];
    await Socle.ecrireConfig("resume_auto", valeur);
    config.valeurs.resume_auto = valeur;
  }

  /* ---------- lecture ---------- */
  async function charger() {
    config = await Socle.lireConfig();
    if (!config) return;
    general = Socle.general(config);
    const [m, pg, fs] = await Promise.all([Socle.lireMeta(), R.lirePages(), R.lireFormulairesPublies(general)]);
    meta = m;
    pages = pg;
    formulaires = fs.filter((f) => f.type === "etablissement");
  }
  // libellé d'une colonne des tables de réponses (les limites communes sont rangées par identifiant de colonne)
  function libelleColonne(colId) {
    for (const espace of Socle.espaces(general)) {
      const colonne = meta && meta[espace.reponses] && meta[espace.reponses].colonnes[colId];
      if (colonne) return colonne.label !== colId ? `${colonne.label} (${colId})` : colId;
    }
    return colId;
  }
  const formulaireDe = (page) => formulaires.find((f) => f.nom === page.formulaire && f.table === page.table) || null;
  const versionFixee = (page) => {
    const f = formulaireDe(page);
    return (f && f.conf && f.conf.saisie && VERSIONS[f.conf.saisie.version] && f.conf.saisie.version) || null;
  };

  /* ---------- affichage ---------- */
  function htmlNombres() {
    const communs = reglagesCommuns(),
      bornes = Object.entries(communs.bornes || {}).filter(([, b]) => b && (b.min != null || b.max != null));
    return `<div class="groupe">Saisie des nombres</div>
      <label class="eq-case"><input type="checkbox" id="rs-positifs"${communs.nombresPositifs ? " checked" : ""}>
        Interdire les valeurs négatives dans toutes les questions numériques</label>
      <p class="aide" style="margin:4px 0 0">Les limites d'une question (minimum, maximum) se règlent dans son formulaire : onglet Formulaires, réglages de la question. Elles priment sur ce réglage.</p>
      ${
        bornes.length
          ? `<p class="aide" style="margin:10px 0 4px">Limites réglées autrefois dans le widget de saisie, appliquées quand le formulaire n'en fixe pas :</p>
        <table><thead><tr><th>Question</th><th style="width:18%">Minimum</th><th style="width:18%">Maximum</th></tr></thead><tbody>${bornes
          .map(
            ([colId, b]) =>
              `<tr><td>${esc(libelleColonne(colId))}</td><td>${b.min ?? "—"}</td><td>${b.max ?? "—"}</td></tr>`,
          )
          .join("")}</tbody></table>
        <div class="boutons"><button type="button" class="secondaire petit" id="rs-effacer-bornes">Effacer ces limites</button></div>`
          : ""
      }`;
  }
  function htmlTableForcee() {
    const forcee = reglagesCommuns()[CLE_TABLE_FORCEE];
    if (!forcee) return "";
    return `<div class="groupe" style="margin-top:14px">Recherche d'établissement</div>
      <p class="aide" style="margin:0 0 6px">La recherche d'établissement des pages de saisie porte sur la table <b>${esc(forcee)}</b>, choisie autrefois dans le widget de saisie, et non sur la table du référentiel des réglages généraux (<b>${esc(general.referentiel || "?")}</b>).</p>
      <div class="boutons"><button type="button" class="secondaire petit" id="rs-table-auto">Utiliser la table du référentiel</button></div>`;
  }
  function htmlPages() {
    if (pages === null)
      return `<div class="groupe" style="margin-top:14px">Pages de saisie</div><p class="vide">Pages illisibles : le widget doit avoir l'accès complet au document.</p>`;
    if (!pages.length)
      return `<div class="groupe" style="margin-top:14px">Pages de saisie</div><p class="vide">Aucune page n'affiche le widget de saisie.</p>`;
    const lignes = pages
      .map((page) => {
        const proposes = formulaires.filter((f) => f.table === page.table),
          pageAgent = page.agent != null,
          fixee = versionFixee(page);
        const choixFormulaire = pageAgent
          ? `${esc(page.formulaire || "Automatique")}<br><span class="detail" style="color:var(--doux);font-size:12px">page d'agent : Équipe › Pages de saisie</span>`
          : `<select data-page-formulaire="${page.sectionRef}" aria-label="Formulaire affiché sur la page ${esc(page.page)}">
              <option value="">Automatique (premier formulaire publié pour ${esc(page.table)})</option>
              ${proposes.map((f) => `<option value="${esc(f.nom)}"${f.nom === page.formulaire ? " selected" : ""}>${esc(f.nom)}</option>`).join("")}
              ${page.formulaire && !proposes.some((f) => f.nom === page.formulaire) ? `<option value="${esc(page.formulaire)}" selected>${esc(page.formulaire)} (introuvable ou non publié)</option>` : ""}
            </select>`;
        const choixVersion = fixee
          ? `${esc(VERSIONS[fixee])}<br><span class="detail" style="color:var(--doux);font-size:12px">fixée par le formulaire</span>`
          : `<select data-page-version="${page.sectionRef}" aria-label="Version de la page ${esc(page.page)}">
              <option value="">Automatique</option>
              ${Object.entries(VERSIONS)
                .map(([v, lib]) => `<option value="${v}"${v === page.version ? " selected" : ""}>${esc(lib)}</option>`)
                .join("")}
            </select>`;
        return `<tr><td><strong>${esc(page.page || `vue n° ${page.sectionRef}`)}</strong><br><span class="detail" style="color:var(--doux);font-size:12px">table ${esc(page.table)}</span></td><td>${choixFormulaire}</td><td>${choixVersion}</td></tr>`;
      })
      .join("");
    return `<div class="groupe" style="margin-top:14px">Pages de saisie</div>
      <p class="aide" style="margin:0 0 6px">Formulaire affiché et version de chaque page. « Automatique » : premier formulaire publié pour la table de la page ; version déduite de la table (colonne Site, ou référentiel autre que « Etablissements » : enseignement supérieur). Enregistré dans la page, qui le garde si elle est dupliquée.</p>
      <table><thead><tr><th style="width:30%">Page</th><th>Formulaire affiché</th><th style="width:28%">Version</th></tr></thead><tbody>${lignes}</tbody></table>`;
  }
  function dessiner() {
    const carte = $("carte-reglages-saisie");
    if (!carte) return;
    if (!config) {
      carte.innerHTML = `<h2>Saisie : réglages communs et pages</h2><p class="vide">Appliquez d'abord la création de la table Config.</p>`;
      return;
    }
    carte.innerHTML = `<h2>Saisie : réglages communs et pages</h2>
      <p class="aide">Réglages des pages de saisie, communs à tous les formulaires (clé <code>resume_auto</code> de Config) ou propres à chaque page. La description automatique se règle dans l'onglet Formulaires (panneau Description).</p>
      ${htmlNombres()}${htmlTableForcee()}${htmlPages()}
      <span class="statut" id="rs-statut" role="status"></span>`;
    lier();
  }

  /* ---------- actions ---------- */
  async function agir(action, message) {
    try {
      await action();
      dessiner();
      statut(message, "ok");
    } catch (e) {
      dessiner();
      statut(`Échec : ${e.message || e}`, "err");
    }
  }
  // options du widget d'une page : customView.widgetOptions de la vue personnalisée
  async function ecrireOptionPage(sectionRef, cle, valeur) {
    const sections = await Donnees.lire("_grist_Views_section"),
      i = sections.id.indexOf(sectionRef);
    if (i < 0) throw new Error("page introuvable");
    const { o, cv } = R.optionsVue(sections.options[i]),
      options = { ...(cv.widgetOptions || {}) };
    if (valeur) options[cle] = valeur;
    else delete options[cle];
    o.customView = JSON.stringify({ ...cv, widgetOptions: options });
    await Donnees.ecrire([["UpdateRecord", "_grist_Views_section", sectionRef, { options: JSON.stringify(o) }]]);
    pages = await R.lirePages();
  }
  function lier() {
    $("rs-positifs").addEventListener("change", (e) =>
      agir(
        () => enregistrerCommuns({ nombresPositifs: e.target.checked }),
        e.target.checked ? "Valeurs négatives interdites." : "Valeurs négatives autorisées.",
      ),
    );
    if ($("rs-effacer-bornes"))
      $("rs-effacer-bornes").addEventListener("click", () => {
        if (!confirm("Effacer les limites communes ? Les limites réglées dans les formulaires ne changent pas."))
          return;
        agir(() => enregistrerCommuns({ bornes: {} }), "Limites communes effacées.");
      });
    if ($("rs-table-auto"))
      $("rs-table-auto").addEventListener("click", () =>
        agir(
          () => enregistrerCommuns({ [CLE_TABLE_FORCEE]: undefined }),
          "La recherche d'établissement porte désormais sur la table du référentiel.",
        ),
      );
    document
      .querySelectorAll("#carte-reglages-saisie [data-page-formulaire]")
      .forEach((menu) =>
        menu.addEventListener("change", () =>
          agir(
            () => ecrireOptionPage(Number(menu.dataset.pageFormulaire), "formulaire", menu.value || null),
            "Formulaire de la page enregistré : il s'affiche à la prochaine ouverture de la page.",
          ),
        ),
      );
    document
      .querySelectorAll("#carte-reglages-saisie [data-page-version]")
      .forEach((menu) =>
        menu.addEventListener("change", () =>
          agir(
            () => ecrireOptionPage(Number(menu.dataset.pageVersion), "version", menu.value || null),
            "Version de la page enregistrée : elle s'applique à la prochaine ouverture de la page.",
          ),
        ),
      );
  }

  async function afficher() {
    try {
      await charger();
    } catch (e) {
      const carte = $("carte-reglages-saisie");
      if (carte)
        carte.innerHTML = `<h2>Saisie : réglages communs et pages</h2><p class="vide">Lecture impossible : ${esc(e.message || e)}</p>`;
      return;
    }
    dessiner();
  }
  window.CarteReglagesSaisie = { afficher };
  afficher();
})();

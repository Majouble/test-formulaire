/* =====================================================================
   Socle v2 — « À vérifier » : modifier ou supprimer une saisie erronée
   ---------------------------------------------------------------------
   Commun à l'onglet « À vérifier » de l'administration et au widget « Référentiel des sites ».
   Pour un dossier en cause : ses saisies (première saisie, mises à jour), chacune modifiable sur place (toutes les colonnes
   de la table des réponses, sauf l'établissement — à changer par le rattachement —, le dossier, la date de saisie et les
   formules ; les réponses aux questions tableau restent en lecture : à corriger dans le formulaire) ou supprimable ;
   et la suppression du dossier entier. Chaque modification est enregistrée aussitôt (commun/fiche-etab.js) ; une
   suppression demande confirmation et emporte les lignes liées (sous-tables…) : QualiteMoteur.supprimer.
   API : QualiteEdition.html(esp, fiche) ; QualiteEdition.lier(racine, esp, fiche, { dire(texte, erreur), apres(message) }).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dateHeure = s => typeof s === "number" ? new Date(s * 1000).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "date inconnue";
  const tri = f => f.lignes.slice().sort((a, b) => (a.cree || 0) - (b.cree || 0) || a.id - b.id);

  function html(esp, f) {
    const seulePremiere = l => l.id === f.id && f.lignes.length > 1;
    return `<div class="qe" data-dossier="${f.id}">
      <table class="qe-table"><thead><tr><th>Saisie</th><th>Qualification</th><th>Description</th><th></th></tr></thead><tbody>
      ${tri(f).map(l => `<tr data-v="${l.id}"><td>${l.id === f.id ? "Première saisie" : "Mise à jour"} <span class="aide">n° ${l.id}</span><br><span class="aide">${esc(dateHeure(l.cree))}${l.auteur ? ` · ${esc(l.auteur)}` : ""}${l === f.derniere ? " · dernière version" : ""}</span></td>
        <td>${esc(l.qualif || "—")}</td><td>${esc((l.desc || "").slice(0, 120))}${(l.desc || "").length > 120 ? "…" : ""}</td>
        <td class="qe-actions"><button type="button" class="secondaire petit" data-qe="modifier" aria-expanded="false">Modifier</button>
          <button type="button" class="secondaire petit qe-danger" data-qe="supprimer"${seulePremiere(l) ? ` disabled title="La première saisie porte le numéro du dossier : supprimez une mise à jour, ou le dossier entier"` : ""}>Supprimer</button></td></tr>
        <tr class="qe-editeur" data-pour="${l.id}" hidden><td colspan="4"></td></tr>`).join("")}
      </tbody></table>
      <div class="qe-pied"><button type="button" class="secondaire petit qe-danger" data-qe="supprimer-dossier">Supprimer le dossier n° ${f.id}${f.lignes.length > 1 ? ` (${f.lignes.length} saisies)` : ""}</button>
        <span class="aide">Suppression définitive (récupérable seulement par l'historique du document Grist).</span></div></div>`;
  }

  function lier(racine, esp, f, opts = {}) {
    const dire = opts.dire || (() => {}), apres = opts.apres || (() => {});
    const C = esp.colonnes, rr = C.rr || {}, col = r => rr[r] && rr[r].col, rep = esp.espace.reponses;
    const exclure = [col("Dossier"), col("Derniere_version"), C.etab].filter(Boolean), cree = col("Cree_le");
    // date de saisie ; réponses aux questions tableau (JSON dans une ligne au moins de la colonne) : à corriger dans le formulaire
    const json = x => typeof x === "string" && /^\s*\[\s*\{/.test(x);
    const lectureSeule = (c, v, fe) => c === cree || json(v) || !!(fe && (fe.t[c] || []).some(json));
    const modifiees = new Set();
    const libelle = l => `${l.id === f.id ? "la première saisie" : "la mise à jour"} n° ${l.id} du ${dateHeure(l.cree)}`;
    racine.querySelectorAll('[data-qe="modifier"]').forEach(b => b.addEventListener("click", async () => {
      const id = +b.closest("tr").dataset.v, tr = racine.querySelector(`.qe-editeur[data-pour="${id}"]`), cell = tr.firstElementChild;
      if (!tr.hidden) { tr.hidden = true; b.setAttribute("aria-expanded", "false"); if (modifiees.has(id)) { modifiees.delete(id); apres(`Saisie n° ${id} modifiée.`); } return; }
      tr.hidden = false; b.setAttribute("aria-expanded", "true"); cell.innerHTML = `<p class="aide">Lecture de la saisie…</p>`;
      try {
        const fe = await window.FicheEtab.charger(await S.lireMeta(), rep, { exclure, lectureSeule, ordre: "table", sansAjout: true });
        const px = `qe${id}-`;
        cell.innerHTML = `<p class="aide">Chaque champ est enregistré dès qu'il change. L'établissement se change par le rattachement du dossier (widget « Référentiel des sites », vue « À vérifier ») ; les tableaux (sites…), dans le formulaire.</p>
          ${window.FicheEtab.html(fe, id, px)}<div class="outils"><button type="button" class="primaire petit" data-qe="terminer">Terminer</button></div>`;
        window.FicheEtab.lier(cell, fe, id, { prefixe: px, dire, apresModif: () => modifiees.add(id) });
        cell.querySelector('[data-qe="terminer"]').addEventListener("click", () => b.click());
      } catch (e) { cell.innerHTML = `<p class="statut err">Saisie illisible : ${esc(e.message || e)}</p>`; }
    }));
    const supprimer = async (versionId, question) => {
      if (!confirm(question)) return;
      try {
        const r = await window.QualiteMoteur.supprimer(esp, f, versionId);
        apres(`${r.entier ? `Dossier n° ${f.id} supprimé (${r.versions} saisie(s))` : `Saisie n° ${versionId} supprimée`}${r.liees.length ? `, avec ${r.liees.join(", ")}` : ""}.`);
      } catch (e) { dire(`Suppression impossible : ${e.message || e}.`, true); }
    };
    racine.querySelectorAll('[data-qe="supprimer"]').forEach(b => b.addEventListener("click", () => {
      const l = f.lignes.find(x => x.id === +b.closest("tr").dataset.v); if (!l) return;
      supprimer(l.id, f.lignes.length === 1 ? `Supprimer le dossier n° ${f.id} (sa seule saisie, ${dateHeure(l.cree)}) ?\n\nLes lignes liées (sites, tableaux…) sont supprimées avec lui.`
        : `Supprimer ${libelle(l)} ?\n\nLe dossier garde ses autres saisies${l === f.derniere ? " ; la saisie précédente redevient la dernière version" : ""}. Les lignes liées à cette saisie (sites, tableaux…) sont supprimées avec elle.`);
    }));
    const bd = racine.querySelector('[data-qe="supprimer-dossier"]');
    if (bd) bd.addEventListener("click", () => supprimer(null, `Supprimer tout le dossier n° ${f.id} (${f.lignes.length} saisie(s)) ?\n\nToutes ses saisies et les lignes liées (sites, tableaux…) sont supprimées. À réserver à une saisie erronée ou en double.`));
  }
  window.QualiteEdition = { html, lier };
})();

/* PRISME — widget de saisie, module 22/34 : Choix du formulaire de la page.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
async function remplirChoixFormulaire() {
  const sel = $("cfg-formulaire");
  let voulu = null;
  try {
    voulu = grist.getOption ? await grist.getOption("formulaire") : null;
  } catch (_) {}
  const liste = (await lireFormulaires()).filter((f) => f.table === etatSaisie.tableId);
  sel.innerHTML =
    `<option value="">Automatique (premier formulaire publié pour la table ${esc(etatSaisie.tableId || "")})</option>` +
    liste
      .map(
        (f) =>
          `<option value="${esc(f.nom)}"${f.nom === voulu ? " selected" : ""}${f.publie ? "" : " disabled"}>${esc(f.nom)}${f.publie ? "" : " (jamais publié)"}</option>`,
      )
      .join("");
  sel.value = voulu || "";
  $("cfg-formulaire-info").textContent =
    (etatSaisie.formulaireActif
      ? `Affiché actuellement : « ${etatSaisie.formulaireActif.nom} ». `
      : "Aucun formulaire publié pour cette table : questions issues des associations du widget. ") +
    "Ce choix est enregistré avec la page (il suit la page dupliquée). Il nécessite un widget ouvert depuis une adresse (pas le Custom Widget Builder, dont les options contiennent le code).";
}
$("cfg-formulaire").addEventListener("change", async () => {
  try {
    await grist.setOption("formulaire", $("cfg-formulaire").value || null);
    statut("cfg-statut", "Formulaire de la page enregistré.", "ok");
    enFile(async () => {
      await chargerConfiguration();
      await rafraichir();
    });
  } catch (e) {
    statut("cfg-statut", `Choix non enregistré : ${e.message || e}`, "err");
  }
});

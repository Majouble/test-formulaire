/* PRISME — widget de saisie, domaines/veille/affichage.js
   Domaine : le bandeau des vigilances météo — affichage (page et événements).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : majBandeauVeille.
   Utilise :
     fondations/etat : etatSaisie.
     domaines/veille/donnees : lireVeille. */
function majBandeauVeille() {
  const bandeau = $("bandeau-veille");
  if (!bandeau) return;
  if (Date.now() - etatSaisie.dernierVeille > 600000) lireVeille().then(majBandeauVeille); // relue toutes les 10 minutes
  if (etatSaisie.modeEtab || !etatSaisie.vigilancesPage) {
    bandeau.hidden = true;
    return;
  }
  const reglagesVeille = Socle.reglagesVeille(etatSaisie.socleConfig),
    groupes = new Map();
  for (const vigilance of etatSaisie.vigilancesPage) {
    if (
      vigilance.niveau < reglagesVeille.seuil ||
      (reglagesVeille.phenomenes.length && !reglagesVeille.phenomenes.includes(vigilance.phenomene))
    )
      continue;
    const k = `${vigilance.niveau}|${vigilance.echeance === "Demain" ? 1 : 0}|${vigilance.phenomene}`;
    if (!groupes.has(k)) groupes.set(k, { v: vigilance, deps: [] });
    if (!groupes.get(k).deps.includes(vigilance.departement)) groupes.get(k).deps.push(vigilance.departement);
  }
  if (!groupes.size) {
    bandeau.hidden = true;
    return;
  }
  const pastille = ["", "🟢", "🟡", "🟠", "🔴"];
  bandeau.hidden = false;
  bandeau.innerHTML =
    [...groupes.entries()]
      .sort((entreeA, entreeB) => entreeB[0].localeCompare(entreeA[0]))
      .slice(0, 4)
      .map(
        ([, groupe]) =>
          `<p>${pastille[groupe.v.niveau] || ""} <strong>Vigilance ${esc(String(groupe.v.couleur).toLowerCase())} ${esc(groupe.v.phenomene.toLowerCase())}</strong> ${groupe.v.echeance === "Demain" ? "demain" : "aujourd'hui"} : ${esc(groupe.deps.slice(0, 8).join(", "))}${groupe.deps.length > 8 ? ` et ${groupe.deps.length - 8} autres` : ""}</p>`,
      )
      .join("") + (groupes.size > 4 ? `<p>… et ${groupes.size - 4} autre(s) vigilance(s).</p>` : "");
}

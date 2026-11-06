/* PRISME — widget de saisie, module 29/34 : Historique des versions.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : afficherHistorique.
   Utilise :
     03 variantes : lisible.
     04 date-faits : dateFr, secondes.
     05 etat : colonneDe, etatSaisie, valeurLigne.
     09 dossier : estiloPastille, listeQualif, styleChoix.
     10 champs : cheminsRef, egal, norm.
     13 coherence : formatValeur.
   Modifie etatSaisie : modifie. */
/* =========================================================
   Historique
   ========================================================= */
async function afficherHistorique() {
  await Promise.all(Object.values(cheminsRef));
  if (!etatSaisie.initiale) return;
  const etat = {};
  etatSaisie.champsVersion.forEach(
    (champVersion) => (etat[champVersion.colId] = norm(champVersion, etatSaisie.initiale[champVersion.colId])),
  );
  const entrees = etatSaisie.versions.map((version) => {
    const changements = [];
    if (version !== etatSaisie.initiale)
      for (const champVersion of etatSaisie.champsVersion) {
        const valeur = norm(champVersion, version[champVersion.colId]);
        if (egal(valeur, etat[champVersion.colId])) continue;
        changements.push({
          libelle: champVersion.libelle,
          avant: formatValeur(champVersion, etat[champVersion.colId]),
          apres: formatValeur(champVersion, valeur),
        });
        etat[champVersion.colId] = valeur;
      }
    return {
      date: valeurLigne(version, "Date"),
      faits: colonneDe("Date_faits") ? valeurLigne(version, "Date_faits") : null,
      qualification: listeQualif(valeurLigne(version, "Qualification")),
      auteur: lisible(valeurLigne(version, "Auteur")) ? valeurLigne(version, "Auteur") : null,
      changements,
      commentaire:
        version === etatSaisie.initiale
          ? ["Signalement initial", valeurLigne(version, "Commentaire")].filter(Boolean).join("\n")
          : valeurLigne(version, "Commentaire"),
    };
  });
  const listeChronologie = $("chrono");
  listeChronologie.innerHTML = "";
  entrees.reverse().forEach((entree) => {
    const elementListe = document.createElement("li");
    if (entree.qualification.length) styleChoix(elementListe, entree.qualification[0]); // couleur du repère : première valeur
    const pastille =
      entree.qualification
        .map(
          (qualification) =>
            `<span class="pastille" style="${estiloPastille(qualification)}">${esc(qualification)}</span>`,
        )
        .join(" ") + (entree.qualification.length ? " " : "");
    const qui = entree.auteur ? `, ${esc(entree.auteur)}` : "";
    const chg = entree.changements.length
      ? `<ul class="changements">${entree.changements
          .map(
            (changement) =>
              `<li><strong>${esc(changement.libelle)}</strong> : <span class="avant">${esc(changement.avant)}</span> → ${esc(changement.apres)}</li>`,
          )
          .join("")}</ul>`
      : "";
    elementListe.innerHTML = `<div>${pastille}<span class="quand">${secondes(entree.faits) != null ? `Faits du ${esc(dateFr(entree.faits, { ...(etatSaisie.metaFaits || {}), type: (etatSaisie.metaFaits && etatSaisie.metaFaits.type) || "Date" }))} — saisi le ` : ""}${esc(dateFr(entree.date, etatSaisie.metaDate) || "date inconnue")}${qui}</span></div>
                    ${chg}${entree.commentaire ? `<div class="texte">${esc(entree.commentaire)}</div>` : ""}`;
    listeChronologie.appendChild(elementListe);
  });
}

$("commentaire").addEventListener("input", () => {
  etatSaisie.modifie = true;
});

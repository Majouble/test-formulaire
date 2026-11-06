/* PRISME — widget de saisie, module 26/31 : Historique des versions.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Historique
   ========================================================= */
async function afficherHistorique() {
  await Promise.all(Object.values(cheminsRef));
  if (!initiale) return;
  const etat = {};
  champsVersion.forEach((d) => (etat[d.colId] = norm(d, initiale[d.colId])));
  const entrees = versions.map((l) => {
    const changements = [];
    if (l !== initiale)
      for (const d of champsVersion) {
        const v = norm(d, l[d.colId]);
        if (egal(v, etat[d.colId])) continue;
        changements.push({
          libelle: d.libelle,
          avant: formatValeur(d, etat[d.colId]),
          apres: formatValeur(d, v),
        });
        etat[d.colId] = v;
      }
    return {
      date: val(l, "Date"),
      faits: col("Date_faits") ? val(l, "Date_faits") : null,
      qualification: listeQualif(val(l, "Qualification")),
      auteur: lisible(val(l, "Auteur")) ? val(l, "Auteur") : null,
      changements,
      commentaire:
        l === initiale
          ? ["Signalement initial", val(l, "Commentaire")].filter(Boolean).join("\n")
          : val(l, "Commentaire"),
    };
  });
  const ol = $("chrono");
  ol.innerHTML = "";
  entrees.reverse().forEach((it) => {
    const li = document.createElement("li");
    if (it.qualification.length) styleChoix(li, it.qualification[0]); // couleur du repère : première valeur
    const pastille =
      it.qualification.map((q) => `<span class="pastille" style="${estiloPastille(q)}">${esc(q)}</span>`).join(" ") +
      (it.qualification.length ? " " : "");
    const qui = it.auteur ? `, ${esc(it.auteur)}` : "";
    const chg = it.changements.length
      ? `<ul class="changements">${it.changements
          .map(
            (c) =>
              `<li><strong>${esc(c.libelle)}</strong> : <span class="avant">${esc(c.avant)}</span> → ${esc(c.apres)}</li>`,
          )
          .join("")}</ul>`
      : "";
    li.innerHTML = `<div>${pastille}<span class="quand">${secondes(it.faits) != null ? `Faits du ${esc(dateFr(it.faits, { ...(metaFaits || {}), type: (metaFaits && metaFaits.type) || "Date" }))} — saisi le ` : ""}${esc(dateFr(it.date, metaDate) || "date inconnue")}${qui}</span></div>
                    ${chg}${it.commentaire ? `<div class="texte">${esc(it.commentaire)}</div>` : ""}`;
    ol.appendChild(li);
  });
}

$("commentaire").addEventListener("input", () => {
  modifie = true;
});

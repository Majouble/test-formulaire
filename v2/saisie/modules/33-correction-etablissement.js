/* PRISME — widget de saisie, module 33/34 : Corriger l'établissement d'un signalement.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : majBoutonsCorrection, quitterReaffectation, proposerRattachement, creerEtabDepuisSuggestion.
   Utilise :
     01 configuration : ETAB, ORIGINE.
     02 utilitaires : colonnesEtab.
     03 variantes : colonneChampFiche, idDe, libelleChampFiche, reglagesSaisie, statut.
     05 etat : colonneDe, etabDe, etatSaisie.
     06 grist : enFile, metaColonnes.
     08 referentiel-local : chargerEtabs.
     10 champs : typeBase.
     14 etablissement : afficherEtablissement, etabParUai.
     15 onglets : afficherDossier.
     16 description : majDescriptionAuto.
     31 autocompletion : fermer.
     34 parcours : majResumeEtab.
   Modifie etatSaisie : champsFiche, dossierCorrection, etabCourant, etabPropose, reaffectation. */
/* =========================================================
   Corriger l'établissement d'un signalement (agents)
   ---------------------------------------------------------
   • « Rattacher à un autre établissement » : signalement saisi sur le mauvais établissement. Toutes les
     versions du dossier sont rattachées à l'établissement choisi (aucune nouvelle version).
   • « Corriger la fiche » : erreur dans la fiche elle-même (nom, UAI, commune…), corrigée dans le
     référentiel ; la correction vaut pour tous les signalements de cet établissement.
   ========================================================= */
function majBoutonsCorrection() {
  if (etatSaisie.dossierCorrection !== etatSaisie.dossierId) {
    // autre signalement ouvert (ou nouveau) : on referme les corrections en cours
    etatSaisie.dossierCorrection = etatSaisie.dossierId;
    etatSaisie.reaffectation = false;
    etatSaisie.etabPropose = null;
    $("bloc-rattacher").hidden = true;
    $("bloc-fiche").hidden = true;
  }
  const connu = !!etatSaisie.etabCourant,
    dossier = !!etatSaisie.dossierId;
  $("btn-rattacher").hidden = !(dossier && !etatSaisie.modeEtab && connu && !etatSaisie.reaffectation);
  $("btn-corriger-fiche").hidden = !(
    !etatSaisie.modeEtab &&
    connu &&
    !etatSaisie.reaffectation &&
    $("bloc-fiche").hidden
  );
  if (etatSaisie.reaffectation) {
    $("bloc-recherche").hidden = false;
  }
  majResumeEtab();
  $("bloc-reaffectation").hidden = !etatSaisie.reaffectation;
}
function quitterReaffectation() {
  etatSaisie.reaffectation = false;
  etatSaisie.etabPropose = null;
  $("nom").value = "";
  fermer();
  $("bloc-rattacher").hidden = true;
  statut("statut-rattacher", "");
  afficherEtablissement();
}
$("btn-rattacher").addEventListener("click", () => {
  etatSaisie.reaffectation = true;
  etatSaisie.etabPropose = null;
  $("bloc-fiche").hidden = true;
  $("nom").value = "";
  afficherEtablissement();
  $("nom").focus();
});
$("btn-reaffectation-annuler").addEventListener("click", () => {
  quitterReaffectation();
  $("btn-rattacher").focus();
});
// Choix dans la liste en mode rattachement : demande de confirmation
function proposerRattachement(resultat) {
  fermer();
  const existant = (resultat.ligne && etabDe(resultat.ligne.id)) || resultat.ligne || etabParUai(resultat.uai);
  if (existant && etatSaisie.etabCourant && existant.id === etatSaisie.etabCourant.id) {
    statut("statut-rattacher", "C'est déjà l'établissement de ce signalement.", "err");
    $("bloc-rattacher").hidden = false;
    $("btn-rattacher-ok").hidden = true;
    return;
  }
  etatSaisie.etabPropose = existant || { suggestion: resultat };
  const nomNouveau = existant ? existant[colonnesEtab.nom] : resultat.nom,
    uaiNouveau = existant ? existant[colonnesEtab.uai] : resultat.uai;
  const nombreVersions = etatSaisie.versions.length;
  $("rattacher-texte").innerHTML =
    `Rattacher le dossier n° ${etatSaisie.dossierId} (${nombreVersions} version${nombreVersions > 1 ? "s" : ""}) à <strong>${esc(nomNouveau || "")}</strong>${uaiNouveau ? ` (${esc(uaiNouveau)})` : ""}` +
    ` au lieu de <strong>${esc(etatSaisie.etabCourant ? etatSaisie.etabCourant[colonnesEtab.nom] : "")}</strong> ?` +
    (existant ? "" : " Cet établissement sera ajouté au référentiel.");
  $("btn-rattacher-ok").hidden = false;
  statut("statut-rattacher", "");
  $("bloc-rattacher").hidden = false;
  $("btn-rattacher-ok").focus();
}
async function creerEtabDepuisSuggestion(suggestion) {
  await chargerEtabs();
  const deja = etabParUai(suggestion.uai);
  if (deja) return deja.id;
  const candidats = {
    [colonnesEtab.nom]: suggestion.nom || "",
    [colonnesEtab.uai]: String(suggestion.uai || "").toUpperCase(),
    [colonnesEtab.type]: suggestion.type || "",
    [colonnesEtab.academie]: suggestion.academie || "",
    [colonnesEtab.departement]: suggestion.departement || "",
    [colonnesEtab.commune]: suggestion.commune || "",
    [colonnesEtab.mail]: suggestion.mail || "",
    [colonnesEtab.mailAnnuaire]: suggestion.mail || "",
    [colonnesEtab.origine]: (typeof ORIGINE !== "undefined" && (ORIGINE[suggestion.source] || ORIGINE.manuel)) || "",
    [colonnesEtab.present]: suggestion.source && suggestion.source !== "local" ? true : null,
  };
  const fields = {};
  for (const [colonne, valeur] of Object.entries(candidats))
    if (etatSaisie.colsEtab.includes(colonne) && valeur !== null && valeur !== "") fields[colonne] = valeur;
  const id = idDe(await grist.getTable(ETAB.table).create({ fields }));
  await chargerEtabs();
  return id;
}
$("btn-rattacher-annuler").addEventListener("click", () => {
  $("bloc-rattacher").hidden = true;
  etatSaisie.etabPropose = null;
  $("nom").focus();
});
$("btn-rattacher-ok").addEventListener("click", () =>
  enFile(async () => {
    if (!etatSaisie.etabPropose || !etatSaisie.dossierId) return;
    const boutonConfirmer = $("btn-rattacher-ok");
    boutonConfirmer.disabled = true;
    try {
      const nouvelId = etatSaisie.etabPropose.suggestion
        ? await creerEtabDepuisSuggestion(etatSaisie.etabPropose.suggestion)
        : etatSaisie.etabPropose.id;
      if (!nouvelId) throw new Error("établissement introuvable");
      const colonneEtablissement = colonneDe("Etablissement");
      await grist
        .getTable()
        .update(
          etatSaisie.versions.map((version) => ({ id: version.id, fields: { [colonneEtablissement]: nouvelId } })),
        );
      for (const version of etatSaisie.versions) version[colonneEtablissement] = nouvelId; // en attendant le retour de Grist
      etatSaisie.etabCourant = etabDe(nouvelId);
      quitterReaffectation();
      afficherDossier();
      majDescriptionAuto();
      statut(
        "statut-signalement",
        "Signalement rattaché au nouvel établissement. Si la description cite l'ancien nom, corrigez-la puis enregistrez.",
        "ok",
      );
    } catch (erreur) {
      statut(
        "statut-rattacher",
        `Échec : ${erreur.message || erreur}. Vos droits ne permettent peut-être pas de modifier ce signalement.`,
        "err",
      );
    } finally {
      boutonConfirmer.disabled = false;
    }
  }),
);

$("btn-corriger-fiche").addEventListener("click", async () => {
  if (!etatSaisie.etabCourant) return;
  let meta = {};
  try {
    meta = (await metaColonnes(ETAB.table)) || {};
  } catch (_) {
    // structure illisible (lien d'établissement, règles d'accès) : on continue sans
  }
  const vus = new Set();
  etatSaisie.champsFiche = [
    ["@nom", "Nom"],
    ...reglagesSaisie().fiche.map((champFiche) => [
      champFiche.col,
      champFiche.lib || libelleChampFiche(champFiche.col),
    ]),
  ]
    .map(([k, libelle]) => [k.replace(/^@/, "").replace(/[^\w-]/g, "_"), libelle, colonneChampFiche(k)])
    .filter(([, , colonne]) => {
      if (!colonne || vus.has(colonne)) return false;
      vus.add(colonne);
      const metaColonne = meta[colonne];
      return (
        etatSaisie.colsEtab.includes(colonne) &&
        (!metaColonne || (!metaColonne.formule && ["Text", "Choice", "Any"].includes(typeBase(metaColonne.type))))
      );
    });
  if (!etatSaisie.champsFiche.length) {
    statut("statut-fiche", "Aucune colonne modifiable dans la fiche (colonnes formules ou références).", "err");
    $("bloc-fiche").hidden = false;
    return;
  }
  $("fiche-champs").innerHTML = etatSaisie.champsFiche
    .map(
      ([k, libelle, colonne]) =>
        `<div class="champ"><label for="fiche-${k}">${esc(libelle)}</label><input type="text" id="fiche-${k}" value="${esc(etatSaisie.etabCourant[colonne] ?? "")}"${colonne === colonnesEtab.uai ? ' maxlength="8"' : ""}></div>`,
    )
    .join("");
  statut("statut-fiche", "");
  $("bloc-fiche").hidden = false;
  etatSaisie.reaffectation = false;
  afficherEtablissement();
  $(`fiche-${etatSaisie.champsFiche[0][0]}`).focus();
});
$("btn-fiche-annuler").addEventListener("click", () => {
  $("bloc-fiche").hidden = true;
  afficherEtablissement();
  $("btn-corriger-fiche").focus();
});
$("btn-fiche-ok").addEventListener("click", () =>
  enFile(async () => {
    if (!etatSaisie.etabCourant) return;
    const fields = {};
    for (const [k, , colonne] of etatSaisie.champsFiche) {
      let valeur = $(`fiche-${k}`).value.trim();
      if (colonne === colonnesEtab.uai) valeur = valeur.toUpperCase();
      if (valeur !== String(etatSaisie.etabCourant[colonne] ?? "")) fields[colonne] = valeur;
    }
    if (!Object.keys(fields).length) {
      statut("statut-fiche", "Aucune modification.", "err");
      return;
    }
    if (colonnesEtab.nom in fields && !fields[colonnesEtab.nom]) {
      statut("statut-fiche", "Le nom ne peut pas être vide.", "err");
      return;
    }
    if (colonnesEtab.uai in fields && fields[colonnesEtab.uai]) {
      const autre = etabParUai(fields[colonnesEtab.uai]);
      if (autre && autre.id !== etatSaisie.etabCourant.id) {
        statut(
          "statut-fiche",
          `L'UAI ${fields[colonnesEtab.uai]} est déjà celui de « ${autre[colonnesEtab.nom]} ».`,
          "err",
        );
        return;
      }
    }
    try {
      await grist.getTable(ETAB.table).update({ id: etatSaisie.etabCourant.id, fields });
      Object.assign(etatSaisie.etabCourant, fields);
      $("bloc-fiche").hidden = true;
      if (etatSaisie.dossierId) afficherDossier();
      else afficherEtablissement();
      majDescriptionAuto();
      statut("statut-signalement", "Fiche de l'établissement corrigée (pour tous ses signalements).", "ok");
    } catch (erreur) {
      statut(
        "statut-fiche",
        `Échec : ${erreur.message || erreur}. Vos droits ne permettent peut-être pas de modifier le référentiel.`,
        "err",
      );
    }
  }),
);

/* PRISME — widget de saisie, module 33/34 : Corriger l'établissement d'un signalement.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
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
function proposerRattachement(e) {
  fermer();
  const existant = (e.ligne && etabDe(e.ligne.id)) || e.ligne || etabParUai(e.uai);
  if (existant && etatSaisie.etabCourant && existant.id === etatSaisie.etabCourant.id) {
    statut("statut-rattacher", "C'est déjà l'établissement de ce signalement.", "err");
    $("bloc-rattacher").hidden = false;
    $("btn-rattacher-ok").hidden = true;
    return;
  }
  etatSaisie.etabPropose = existant || { suggestion: e };
  const nomNouveau = existant ? existant[E.nom] : e.nom,
    uaiNouveau = existant ? existant[E.uai] : e.uai;
  const n = etatSaisie.versions.length;
  $("rattacher-texte").innerHTML =
    `Rattacher le dossier n° ${etatSaisie.dossierId} (${n} version${n > 1 ? "s" : ""}) à <strong>${esc(nomNouveau || "")}</strong>${uaiNouveau ? ` (${esc(uaiNouveau)})` : ""}` +
    ` au lieu de <strong>${esc(etatSaisie.etabCourant ? etatSaisie.etabCourant[E.nom] : "")}</strong> ?` +
    (existant ? "" : " Cet établissement sera ajouté au référentiel.");
  $("btn-rattacher-ok").hidden = false;
  statut("statut-rattacher", "");
  $("bloc-rattacher").hidden = false;
  $("btn-rattacher-ok").focus();
}
async function creerEtabDepuisSuggestion(e) {
  await chargerEtabs();
  const deja = etabParUai(e.uai);
  if (deja) return deja.id;
  const candidats = {
    [E.nom]: e.nom || "",
    [E.uai]: String(e.uai || "").toUpperCase(),
    [E.type]: e.type || "",
    [E.academie]: e.academie || "",
    [E.departement]: e.departement || "",
    [E.commune]: e.commune || "",
    [E.mail]: e.mail || "",
    [E.mailAnnuaire]: e.mail || "",
    [E.origine]: (typeof ORIGINE !== "undefined" && (ORIGINE[e.source] || ORIGINE.manuel)) || "",
    [E.present]: e.source && e.source !== "local" ? true : null,
  };
  const fields = {};
  for (const [c, v] of Object.entries(candidats))
    if (etatSaisie.colsEtab.includes(c) && v !== null && v !== "") fields[c] = v;
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
    const btn = $("btn-rattacher-ok");
    btn.disabled = true;
    try {
      const nouvelId = etatSaisie.etabPropose.suggestion
        ? await creerEtabDepuisSuggestion(etatSaisie.etabPropose.suggestion)
        : etatSaisie.etabPropose.id;
      if (!nouvelId) throw new Error("établissement introuvable");
      const cE = col("Etablissement");
      await grist.getTable().update(etatSaisie.versions.map((v) => ({ id: v.id, fields: { [cE]: nouvelId } })));
      for (const v of etatSaisie.versions) v[cE] = nouvelId; // en attendant le retour de Grist
      etatSaisie.etabCourant = etabDe(nouvelId);
      quitterReaffectation();
      afficherDossier();
      majDescriptionAuto();
      statut(
        "statut-signalement",
        "Signalement rattaché au nouvel établissement. Si la description cite l'ancien nom, corrigez-la puis enregistrez.",
        "ok",
      );
    } catch (e) {
      statut(
        "statut-rattacher",
        `Échec : ${e.message || e}. Vos droits ne permettent peut-être pas de modifier ce signalement.`,
        "err",
      );
    } finally {
      btn.disabled = false;
    }
  }),
);

$("btn-corriger-fiche").addEventListener("click", async () => {
  if (!etatSaisie.etabCourant) return;
  let meta = {};
  try {
    meta = (await metaColonnes(ETAB.table)) || {};
  } catch (_) {}
  const vus = new Set();
  etatSaisie.champsFiche = [["@nom", "Nom"], ...S().fiche.map((f) => [f.col, f.lib || libelleChampFiche(f.col)])]
    .map(([k, lib]) => [k.replace(/^@/, "").replace(/[^\w-]/g, "_"), lib, colonneChampFiche(k)])
    .filter(([, , c]) => {
      if (!c || vus.has(c)) return false;
      vus.add(c);
      const m = meta[c];
      return (
        etatSaisie.colsEtab.includes(c) && (!m || (!m.formule && ["Text", "Choice", "Any"].includes(typeBase(m.type))))
      );
    });
  if (!etatSaisie.champsFiche.length) {
    statut("statut-fiche", "Aucune colonne modifiable dans la fiche (colonnes formules ou références).", "err");
    $("bloc-fiche").hidden = false;
    return;
  }
  $("fiche-champs").innerHTML = etatSaisie.champsFiche
    .map(
      ([k, lib, c]) =>
        `<div class="champ"><label for="fiche-${k}">${esc(lib)}</label><input type="text" id="fiche-${k}" value="${esc(etatSaisie.etabCourant[c] ?? "")}"${c === E.uai ? ' maxlength="8"' : ""}></div>`,
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
    for (const [k, , c] of etatSaisie.champsFiche) {
      let v = $(`fiche-${k}`).value.trim();
      if (c === E.uai) v = v.toUpperCase();
      if (v !== String(etatSaisie.etabCourant[c] ?? "")) fields[c] = v;
    }
    if (!Object.keys(fields).length) {
      statut("statut-fiche", "Aucune modification.", "err");
      return;
    }
    if (E.nom in fields && !fields[E.nom]) {
      statut("statut-fiche", "Le nom ne peut pas être vide.", "err");
      return;
    }
    if (E.uai in fields && fields[E.uai]) {
      const autre = etabParUai(fields[E.uai]);
      if (autre && autre.id !== etatSaisie.etabCourant.id) {
        statut("statut-fiche", `L'UAI ${fields[E.uai]} est déjà celui de « ${autre[E.nom]} ».`, "err");
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
    } catch (e) {
      statut(
        "statut-fiche",
        `Échec : ${e.message || e}. Vos droits ne permettent peut-être pas de modifier le référentiel.`,
        "err",
      );
    }
  }),
);

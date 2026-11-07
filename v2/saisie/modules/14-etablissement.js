/* PRISME — widget de saisie, module 14/34 : Établissement : identification, mail et lien d'accès.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : infoSection, calculerRattachementSection, alerterSection, colRattachement, rattachementDe,
     versEtablissement, nomEtabId, alerterRattachement, afficherEtablissement, extraireUrl, nettoieMail, carteHtml,
     construireMailto, majBoutonEnvoi, etabParUai, lireSaisieNouvelEtab, creerEtablissement,
     etablissementPourCreation.
   Utilise :
     01 configuration : ETAB, MESSAGE, ORIGINE.
     02 utilitaires : colonnesEtab.
     03 variantes : CHAMPS_NOUVEL_ETAB, etape, idDe, libelleChampFiche, lisible, refId, reglagesSaisie, statut,
       valeurChampFiche.
     05 etat : colonneDe, etabDe, etatSaisie.
     08 referentiel-local : chargerEtabs, completerLienEtab.
     16 description : majDescriptionAuto, verifierDoublons.
     26 sites-esr : reprendreSitesAuto.
     33 correction-etablissement : majBoutonsCorrection.
     34 parcours : majProposition, majResumeEtab.
   Modifie etatSaisie : composanteChoisie, etabCourant, ligneAnnuaire, modifie, sectionCalculee, sectionGardee. */
/* =========================================================
   Établissement : identification, mail et lien
   ========================================================= */

/* Section d'établissement (SEGPA, SEP, SGT, SES) choisie à la création : le signalement doit porter sur
   l'établissement ; celui de rattachement probable (même adresse ou presque) est proposé en un clic. */
function infoSection(etablissement) {
  if (!etablissement) return null;
  const trouverColonneParMotif = (motif) => (etatSaisie.colsEtab || []).find((k) => motif.test(k));
  const cNat = trouverColonneParMotif(/libelle_?nature|^nature/i),
    cLat = trouverColonneParMotif(/^(etab_)?lat(itude)?$/i),
    cLon = trouverColonneParMotif(/^(etab_)?(lon|lng|longitude)$/i);
  const texteSimple = (valeur) => (valeur == null || typeof valeur === "object" ? "" : String(valeur));
  const lat = cLat ? +etablissement[cLat] : NaN,
    lon = cLon ? +etablissement[cLon] : NaN;
  return {
    id: etablissement.id,
    ligne: etablissement,
    nom: texteSimple(etablissement[colonnesEtab.nom]),
    type: texteSimple(etablissement[colonnesEtab.type]),
    nature: cNat ? texteSimple(etablissement[cNat]) : "",
    commune: texteSimple(etablissement[colonnesEtab.commune]),
    lat: isFinite(lat) && lat ? lat : null,
    lon: isFinite(lon) && lon ? lon : null,
  };
}
// Calcule (avec cache dans etatSaisie.sectionCalculee) l'établissement de rattachement proposé pour une section
function calculerRattachementSection(section, genre) {
  if (etatSaisie.sectionCalculee.id !== section.id) {
    const cLat = (etatSaisie.colsEtab || []).find((k) => /^(etab_)?lat(itude)?$/i.test(k));
    const proches = etatSaisie.etabs
      .filter(
        (autreEtablissement) =>
          autreEtablissement.id !== section.id &&
          (section.lat == null || !cLat || Math.abs(+autreEtablissement[cLat] - section.lat) < 0.01),
      )
      .map(infoSection);
    etatSaisie.sectionCalculee = {
      id: section.id,
      r: Socle.rattachementSection({ ...section, section: genre }, proches),
    };
  }
  return etatSaisie.sectionCalculee.r;
}
function alerterSection(etablissement) {
  const bloc = $("alerte-section");
  const section = etablissement && Socle && Socle.genreSection ? infoSection(etablissement) : null,
    genre = section ? Socle.genreSection(section.nature, section.type, section.nom) : null;
  if (!genre || etatSaisie.sectionGardee === section.id) {
    bloc.hidden = !(genre && etatSaisie.sectionGardee === section.id);
    if (bloc.hidden) bloc.innerHTML = "";
    return;
  }
  const rattachementPropose = calculerRattachementSection(section, genre);
  bloc.innerHTML = `<strong>⚠ Vous avez choisi une ${esc(genre)}</strong>, section rattachée à un ${genre === "SEP" || genre === "SGT" ? "lycée" : "collège"} :
    le signalement doit porter sur l'établissement, sinon il est compté à part (et souvent deux fois).
    ${
      rattachementPropose
        ? `<div class="actions-doublon"><button type="button" class="lien-texte" id="btn-choisir-rattachement">Choisir ${esc(rattachementPropose.etab.nom || "l'établissement")}${rattachementPropose.etab.commune ? ` (${esc(rattachementPropose.etab.commune)})` : ""} à la place</button>
      <button type="button" class="lien-texte" id="btn-garder-section">Garder la ${esc(genre)}</button></div>`
        : `<div class="extrait">Établissement de rattachement introuvable à proximité : recherchez-le par son nom. <button type="button" class="lien-texte" id="btn-garder-section">Garder la ${esc(genre)}</button></div>`
    }`;
  bloc.classList.remove("confirme");
  bloc.hidden = false;
  if (rattachementPropose)
    $("btn-choisir-rattachement").addEventListener("click", () => {
      etatSaisie.etabCourant = rattachementPropose.etab.ligne;
      etatSaisie.ligneAnnuaire = null;
      etatSaisie.modifie = true;
      afficherEtablissement();
    });
  $("btn-garder-section").addEventListener("click", () => {
    etatSaisie.sectionGardee = section.id;
    bloc.classList.add("confirme");
    bloc.innerHTML = `${esc(genre)} conservée à votre demande.`;
  });
}
const colRattachement = () =>
  (etatSaisie.colsEtab || []).find((k) =>
    /^(rattachement|etablissement_de_rattachement|etablissement_parent)$/i.test(k),
  ) || null;
function rattachementDe(composante) {
  const colonneRattachement = colRattachement();
  if (!composante || !colonneRattachement) return null;
  const vus = new Set([composante.id]);
  let etablissementParent = etabDe(refId(composante[colonneRattachement]));
  while (
    etablissementParent &&
    !vus.has(etablissementParent.id) &&
    refId(etablissementParent[colonneRattachement]) &&
    etabDe(refId(etablissementParent[colonneRattachement]))
  ) {
    vus.add(etablissementParent.id);
    etablissementParent = etabDe(refId(etablissementParent[colonneRattachement]));
  } // composante d'une composante
  return etablissementParent && etablissementParent.id !== composante.id ? etablissementParent : null;
}
function versEtablissement(composante) {
  const etablissementParent = rattachementDe(composante);
  etatSaisie.composanteChoisie = etablissementParent ? composante : null;
  return etablissementParent || composante;
}
const nomEtabId = (id) => {
  const etablissement = etabDe(id);
  return etablissement ? String(etablissement[colonnesEtab.nom] ?? "") : "";
};
function alerterRattachement() {
  const bandeau = $("alerte-rattachement");
  if (!bandeau) return;
  const composante = etatSaisie.composanteChoisie,
    etablissementParent = composante && rattachementDe(composante);
  if (
    !composante ||
    !etablissementParent ||
    !etatSaisie.etabCourant ||
    etablissementParent.id !== etatSaisie.etabCourant.id ||
    etatSaisie.dossierId ||
    etatSaisie.modeEtab
  ) {
    bandeau.hidden = true;
    bandeau.innerHTML = "";
    return;
  }
  const niveau = String(composante.Niveau || ""),
    quoi = /site|campus/i.test(niveau) ? "un site rattaché" : "une composante rattachée";
  bandeau.innerHTML = `<strong>${esc(composante[colonnesEtab.nom])}</strong> est ${quoi} à <strong>${esc(etablissementParent[colonnesEtab.nom])}</strong> : le dossier est ouvert sur l'établissement,
    pour qu'il ne soit pas compté deux fois. Précisez la composante ou son site dans le signalement.`;
  bandeau.hidden = false;
  const colonneSite = colonneDe("Site"),
    champSite = colonneSite && $(`q-${colonneSite}`);
  if (champSite && /^(INPUT|TEXTAREA)$/.test(champSite.tagName) && !champSite.value.trim()) {
    champSite.value = String(composante[colonnesEtab.nom] ?? "");
    champSite.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
function afficherEtablissement() {
  queueMicrotask(majDescriptionAuto); // le jour de mobilisation dépend de l'établissement
  queueMicrotask(verifierDoublons);
  const creation = !etatSaisie.dossierId;
  const connu = !!etatSaisie.etabCourant;
  $("bloc-recherche").hidden = !(creation && !etatSaisie.modeEtab && !connu);
  $("btn-changer-etab").hidden = !(creation && !etatSaisie.modeEtab && connu);
  if (typeof majBoutonsCorrection === "function") majBoutonsCorrection();
  $("carte-etab").innerHTML = connu ? carteHtml(etatSaisie.etabCourant) : "";
  alerterSection(creation && connu && !etatSaisie.modeEtab ? etatSaisie.etabCourant : null);
  alerterRattachement();
  if (creation && connu) setTimeout(reprendreSitesAuto, 0);
  majResumeEtab();
  majProposition();

  // Contact et lien : réservés aux agents
  $("bloc-contact").hidden = etatSaisie.modeEtab || !(connu || etatSaisie.ligneAnnuaire || $("nom").value.trim());
  if (etatSaisie.modeEtab) return;
  const mailEnregistre = connu ? nettoieMail(etatSaisie.etabCourant[colonnesEtab.mail]) : "";
  const mailAnnuaire = connu
    ? nettoieMail(etatSaisie.etabCourant[colonnesEtab.mailAnnuaire])
    : nettoieMail($("mail").dataset.saisi);
  if (document.activeElement !== $("mail"))
    $("mail").value = connu ? mailEnregistre || mailAnnuaire : $("mail").dataset.saisi || "";
  const aide = $("aide-mail");
  if (connu && !mailEnregistre && mailAnnuaire) {
    aide.innerHTML =
      "Adresse issue de l'annuaire. Cliquez sur « Enregistrer » pour la conserver comme adresse de l'établissement.";
    aide.hidden = false;
  } else if (connu && mailAnnuaire && mailEnregistre !== mailAnnuaire) {
    aide.innerHTML = `Adresse de l'annuaire : <strong>${esc(mailAnnuaire)}</strong> <button type="button" class="lien-texte" id="btn-mail-annuaire">utiliser celle-ci</button>`;
    aide.hidden = false;
    $("btn-mail-annuaire").addEventListener("click", () => {
      $("mail").value = mailAnnuaire;
      majBoutonEnvoi();
    });
  } else if (!connu && mailAnnuaire) {
    aide.textContent = "Adresse issue de l'annuaire, enregistrée avec l'établissement.";
    aide.hidden = false;
  } else aide.hidden = true;
  $("btn-mail").hidden = !connu;
  if (connu) completerLienEtab(etatSaisie.etabCourant);
  const lien =
    connu && lisible(etatSaisie.etabCourant[colonnesEtab.lien])
      ? extraireUrl(etatSaisie.etabCourant[colonnesEtab.lien])
      : "";
  $("lien").value = lien;
  $("lien").placeholder = connu
    ? `Lien absent : vérifiez les formules des colonnes ${colonnesEtab.cle} et ${colonnesEtab.lien}`
    : "Disponible après l'enregistrement du signalement";
  $("btn-copier").disabled = !lien;
  majBoutonEnvoi();
  const aMail = !!$("mail").value.trim();
  $("resume-contact").textContent =
    `(${aMail ? "mail renseigné" : "pas de mail"}, ${lien ? "lien disponible" : "lien indisponible"})`;
}

// SELF_HYPERLINK renvoie « URL » ou « libellé URL » : on garde l'adresse
const extraireUrl = (texte) => {
  const adresses = String(texte ?? "").match(/https?:\/\/\S+/g);
  return adresses ? adresses[adresses.length - 1] : "";
};
const nettoieMail = (valeur) => (typeof valeur === "string" ? valeur.trim() : "");

function carteHtml(etablissement) {
  return reglagesSaisie()
    .fiche.map((champFiche) => [
      champFiche.lib || libelleChampFiche(champFiche.col),
      valeurChampFiche(etablissement, champFiche.col),
    ])
    .filter(([, valeur]) => valeur != null && valeur !== "")
    .map(([libelle, valeur]) => `<dt>${esc(libelle)}</dt><dd>${esc(valeur)}</dd>`)
    .join("");
}

// Calcule le lien mailto (objet et corps d'après les modèles de message) pour le mail, le lien et le nom donnés
function construireMailto(mail, lien, nomEtab) {
  // message réglé dans l'administration (onglet Établissements, clé « liens » de Config), sinon message par défaut
  const messageConfigure =
      etatSaisie.socleConfig && etatSaisie.socleConfig.valeurs.liens && etatSaisie.socleConfig.valeurs.liens.message,
    etablissement = etatSaisie.etabCourant || {};
  const remplir = (modele) =>
    String(modele).replace(/\{(nom|uai|commune|lien|situation)\}/g, (_, k) =>
      k === "nom"
        ? nomEtab || ""
        : k === "lien"
          ? lien
          : k === "situation"
            ? (etatSaisie.socleConfig &&
                etatSaisie.socleConfig.valeurs.general &&
                etatSaisie.socleConfig.valeurs.general.situation) ||
              ""
            : String(etablissement[colonnesEtab[k]] ?? ""),
    );
  const objet = messageConfigure && messageConfigure.objet ? remplir(messageConfigure.objet) : MESSAGE.objet(nomEtab),
    corps = messageConfigure && messageConfigure.corps ? remplir(messageConfigure.corps) : MESSAGE.corps(nomEtab, lien);
  return `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
}
function majBoutonEnvoi() {
  const boutonEnvoi = $("btn-envoyer");
  const lien = $("lien").value,
    mail = $("mail").value.trim();
  const nomEtab = etatSaisie.etabCourant ? etatSaisie.etabCourant[colonnesEtab.nom] : $("nom").value.trim();
  if (!lien || !mail) {
    boutonEnvoi.setAttribute("aria-disabled", "true");
    boutonEnvoi.removeAttribute("href");
    boutonEnvoi.title = !mail ? "Renseignez le mail de l'établissement" : "Le lien n'est pas encore disponible";
    return;
  }
  boutonEnvoi.removeAttribute("aria-disabled");
  boutonEnvoi.title = "";
  boutonEnvoi.href = construireMailto(mail, lien, nomEtab);
}

$("mail").addEventListener("input", () => {
  if (!etatSaisie.etabCourant) $("mail").dataset.saisi = $("mail").value;
  majBoutonEnvoi();
});

$("btn-mail").addEventListener("click", async () => {
  if (!etatSaisie.etabCourant) return;
  const mail = $("mail").value.trim();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    statut("statut-signalement", "Adresse mail invalide.", "err");
    return;
  }
  try {
    await grist.getTable(ETAB.table).update({ id: etatSaisie.etabCourant.id, fields: { [colonnesEtab.mail]: mail } });
    etatSaisie.etabCourant[colonnesEtab.mail] = mail;
    statut("statut-signalement", "Mail de l'établissement enregistré.", "ok");
  } catch (erreur) {
    statut("statut-signalement", `Échec : ${erreur.message || erreur}`, "err");
  }
});

$("btn-copier").addEventListener("click", async () => {
  const champ = $("lien");
  try {
    await navigator.clipboard.writeText(champ.value);
  } catch (_) {
    champ.select();
    document.execCommand("copy");
  }
  $("btn-copier").textContent = "Copié";
  setTimeout(() => {
    $("btn-copier").textContent = "Copier";
  }, 1500);
});

$("btn-changer-etab").addEventListener("click", () => {
  etatSaisie.etabCourant = null;
  etatSaisie.ligneAnnuaire = null;
  ["nom", ...CHAMPS_NOUVEL_ETAB].forEach((k) => {
    $(k).value = "";
    $(k).classList.remove("auto");
  });
  $("mail").dataset.saisi = "";
  afficherEtablissement();
  $("nom").focus();
});

function etabParUai(uai) {
  const uaiNormalise = (uai || "").trim().toUpperCase();
  return uaiNormalise
    ? etatSaisie.etabs.find(
        (etablissement) => String(etablissement[colonnesEtab.uai] || "").toUpperCase() === uaiNormalise,
      ) || null
    : null;
}

// Lit dans la page les champs de l'établissement à créer (uai brut et valeurs nettoyées)
function lireSaisieNouvelEtab() {
  return {
    uaiBrut: $("uai").value,
    uai: $("uai").value.trim().toUpperCase(),
    nom: $("nom").value.trim(),
    type: $("type").value.trim(),
    academie: $("academie").value.trim(),
    departement: $("departement").value.trim(),
    mail: $("mail").value.trim(),
  };
}

// Crée l'établissement dans le référentiel (colonnes connues seulement), le recharge et renvoie son identifiant
async function creerEtablissement(candidats) {
  const fields = {};
  for (const [colonne, valeur] of Object.entries(candidats))
    if (etatSaisie.colsEtab.includes(colonne) && valeur !== null) fields[colonne] = valeur;
  const id = idDe(
    await etape("Création de l'établissement dans le référentiel", ETAB.table, () =>
      grist.getTable(ETAB.table).create({ fields }),
    ),
  );
  await chargerEtabs(); // récupère la clé et le lien calculés par Grist
  return id;
}

// Retourne l'identifiant de l'établissement du signalement, en le créant si besoin
async function etablissementPourCreation() {
  if (etatSaisie.modeEtab) return etatSaisie.etabs[0] ? etatSaisie.etabs[0].id : null;
  if (etatSaisie.etabCourant) return etatSaisie.etabCourant.id;
  await chargerEtabs(); // un collègue l'a peut-être créé entre-temps
  const saisie = lireSaisieNouvelEtab();
  const existant = etabParUai(saisie.uaiBrut);
  if (existant) {
    etatSaisie.etabCourant = existant;
    return existant.id;
  }
  const uai = saisie.uai;
  // Origine « annuaire » seulement si l'établissement vient d'une suggestion et que l'UAI n'a pas été modifié
  const depuisAnnuaire =
    etatSaisie.ligneAnnuaire &&
    etatSaisie.ligneAnnuaire.uai &&
    String(etatSaisie.ligneAnnuaire.uai).toUpperCase() === uai;
  const candidats = {
    [colonnesEtab.nom]: saisie.nom,
    [colonnesEtab.uai]: uai,
    [colonnesEtab.type]: saisie.type,
    [colonnesEtab.academie]: saisie.academie,
    [colonnesEtab.departement]: saisie.departement,
    [colonnesEtab.mail]: saisie.mail,
    [colonnesEtab.commune]: depuisAnnuaire ? etatSaisie.ligneAnnuaire.commune || "" : "",
    [colonnesEtab.origine]: depuisAnnuaire
      ? ORIGINE[etatSaisie.ligneAnnuaire.source] || ORIGINE.manuel
      : ORIGINE.manuel,
    [colonnesEtab.present]: depuisAnnuaire ? true : null,
    [colonnesEtab.mailAnnuaire]: depuisAnnuaire ? etatSaisie.ligneAnnuaire.mail || "" : "",
  };
  const id = await creerEtablissement(candidats);
  etatSaisie.etabCourant = etabDe(id);
  return id;
}

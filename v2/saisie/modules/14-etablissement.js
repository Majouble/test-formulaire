/* PRISME — widget de saisie, module 14/34 : Établissement : identification, mail et lien d'accès.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Établissement : identification, mail et lien
   ========================================================= */

/* Section d'établissement (SEGPA, SEP, SGT, SES) choisie à la création : le signalement doit porter sur
   l'établissement ; celui de rattachement probable (même adresse ou presque) est proposé en un clic. */
function infoSection(e) {
  if (!e) return null;
  const c = (re) => (etatSaisie.colsEtab || []).find((k) => re.test(k));
  const cNat = c(/libelle_?nature|^nature/i),
    cLat = c(/^(etab_)?lat(itude)?$/i),
    cLon = c(/^(etab_)?(lon|lng|longitude)$/i);
  const txt = (v) => (v == null || typeof v === "object" ? "" : String(v));
  const lat = cLat ? +e[cLat] : NaN,
    lon = cLon ? +e[cLon] : NaN;
  return {
    id: e.id,
    ligne: e,
    nom: txt(e[E.nom]),
    type: txt(e[E.type]),
    nature: cNat ? txt(e[cNat]) : "",
    commune: txt(e[E.commune]),
    lat: isFinite(lat) && lat ? lat : null,
    lon: isFinite(lon) && lon ? lon : null,
  };
}
function alerterSection(e) {
  const bloc = $("alerte-section");
  const x = e && Socle && Socle.genreSection ? infoSection(e) : null,
    genre = x ? Socle.genreSection(x.nature, x.type, x.nom) : null;
  if (!genre || etatSaisie.sectionGardee === x.id) {
    bloc.hidden = !(genre && etatSaisie.sectionGardee === x.id);
    if (bloc.hidden) bloc.innerHTML = "";
    return;
  }
  if (etatSaisie.sectionCalculee.id !== x.id) {
    const cLat = (etatSaisie.colsEtab || []).find((k) => /^(etab_)?lat(itude)?$/i.test(k));
    const proches = etatSaisie.etabs
      .filter((y) => y.id !== x.id && (x.lat == null || !cLat || Math.abs(+y[cLat] - x.lat) < 0.01))
      .map(infoSection);
    etatSaisie.sectionCalculee = { id: x.id, r: Socle.rattachementSection({ ...x, section: genre }, proches) };
  }
  const r = etatSaisie.sectionCalculee.r;
  bloc.innerHTML = `<strong>⚠ Vous avez choisi une ${esc(genre)}</strong>, section rattachée à un ${genre === "SEP" || genre === "SGT" ? "lycée" : "collège"} :
    le signalement doit porter sur l'établissement, sinon il est compté à part (et souvent deux fois).
    ${
      r
        ? `<div class="actions-doublon"><button type="button" class="lien-texte" id="btn-choisir-rattachement">Choisir ${esc(r.etab.nom || "l'établissement")}${r.etab.commune ? ` (${esc(r.etab.commune)})` : ""} à la place</button>
      <button type="button" class="lien-texte" id="btn-garder-section">Garder la ${esc(genre)}</button></div>`
        : `<div class="extrait">Établissement de rattachement introuvable à proximité : recherchez-le par son nom. <button type="button" class="lien-texte" id="btn-garder-section">Garder la ${esc(genre)}</button></div>`
    }`;
  bloc.classList.remove("confirme");
  bloc.hidden = false;
  if (r)
    $("btn-choisir-rattachement").addEventListener("click", () => {
      etatSaisie.etabCourant = r.etab.ligne;
      etatSaisie.ligneAnnuaire = null;
      etatSaisie.modifie = true;
      afficherEtablissement();
    });
  $("btn-garder-section").addEventListener("click", () => {
    etatSaisie.sectionGardee = x.id;
    bloc.classList.add("confirme");
    bloc.innerHTML = `${esc(genre)} conservée à votre demande.`;
  });
}
const colRattachement = () =>
  (etatSaisie.colsEtab || []).find((k) =>
    /^(rattachement|etablissement_de_rattachement|etablissement_parent)$/i.test(k),
  ) || null;
function rattachementDe(e) {
  const c = colRattachement();
  if (!e || !c) return null;
  const vus = new Set([e.id]);
  let p = etabDe(refId(e[c]));
  while (p && !vus.has(p.id) && refId(p[c]) && etabDe(refId(p[c]))) {
    vus.add(p.id);
    p = etabDe(refId(p[c]));
  } // composante d'une composante
  return p && p.id !== e.id ? p : null;
}
function versEtablissement(e) {
  const p = rattachementDe(e);
  etatSaisie.composanteChoisie = p ? e : null;
  return p || e;
}
const nomEtabId = (id) => {
  const x = etabDe(id);
  return x ? String(x[E.nom] ?? "") : "";
};
function alerterRattachement() {
  const b = $("alerte-rattachement");
  if (!b) return;
  const x = etatSaisie.composanteChoisie,
    p = x && rattachementDe(x);
  if (
    !x ||
    !p ||
    !etatSaisie.etabCourant ||
    p.id !== etatSaisie.etabCourant.id ||
    etatSaisie.dossierId ||
    etatSaisie.modeEtab
  ) {
    b.hidden = true;
    b.innerHTML = "";
    return;
  }
  const niveau = String(x.Niveau || ""),
    quoi = /site|campus/i.test(niveau) ? "un site rattaché" : "une composante rattachée";
  b.innerHTML = `<strong>${esc(x[E.nom])}</strong> est ${quoi} à <strong>${esc(p[E.nom])}</strong> : le dossier est ouvert sur l'établissement,
    pour qu'il ne soit pas compté deux fois. Précisez la composante ou son site dans le signalement.`;
  b.hidden = false;
  const cs = col("Site"),
    q = cs && $(`q-${cs}`);
  if (q && /^(INPUT|TEXTAREA)$/.test(q.tagName) && !q.value.trim()) {
    q.value = String(x[E.nom] ?? "");
    q.dispatchEvent(new Event("input", { bubbles: true }));
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
  const mailEnregistre = connu ? nettoieMail(etatSaisie.etabCourant[E.mail]) : "";
  const mailAnnuaire = connu
    ? nettoieMail(etatSaisie.etabCourant[E.mailAnnuaire])
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
  const lien = connu && lisible(etatSaisie.etabCourant[E.lien]) ? extraireUrl(etatSaisie.etabCourant[E.lien]) : "";
  $("lien").value = lien;
  $("lien").placeholder = connu
    ? `Lien absent : vérifiez les formules des colonnes ${E.cle} et ${E.lien}`
    : "Disponible après l'enregistrement du signalement";
  $("btn-copier").disabled = !lien;
  majBoutonEnvoi();
  const aMail = !!$("mail").value.trim();
  $("resume-contact").textContent =
    `(${aMail ? "mail renseigné" : "pas de mail"}, ${lien ? "lien disponible" : "lien indisponible"})`;
}

// SELF_HYPERLINK renvoie « URL » ou « libellé URL » : on garde l'adresse
const extraireUrl = (v) => {
  const m = String(v ?? "").match(/https?:\/\/\S+/g);
  return m ? m[m.length - 1] : "";
};
const nettoieMail = (v) => (typeof v === "string" ? v.trim() : "");

function carteHtml(e) {
  return S()
    .fiche.map((f) => [f.lib || libelleChampFiche(f.col), valeurChampFiche(e, f.col)])
    .filter(([, v]) => v != null && v !== "")
    .map(([lib, v]) => `<dt>${esc(lib)}</dt><dd>${esc(v)}</dd>`)
    .join("");
}

function majBoutonEnvoi() {
  const a = $("btn-envoyer");
  const lien = $("lien").value,
    mail = $("mail").value.trim();
  const nomEtab = etatSaisie.etabCourant ? etatSaisie.etabCourant[E.nom] : $("nom").value.trim();
  if (!lien || !mail) {
    a.setAttribute("aria-disabled", "true");
    a.removeAttribute("href");
    a.title = !mail ? "Renseignez le mail de l'établissement" : "Le lien n'est pas encore disponible";
    return;
  }
  a.removeAttribute("aria-disabled");
  a.title = "";
  // message réglé dans l'administration (onglet Établissements, clé « liens » de Config), sinon message par défaut
  const m =
      etatSaisie.socleConfig && etatSaisie.socleConfig.valeurs.liens && etatSaisie.socleConfig.valeurs.liens.message,
    e = etatSaisie.etabCourant || {};
  const remplir = (t) =>
    String(t).replace(/\{(nom|uai|commune|lien|situation)\}/g, (_, k) =>
      k === "nom"
        ? nomEtab || ""
        : k === "lien"
          ? lien
          : k === "situation"
            ? (etatSaisie.socleConfig &&
                etatSaisie.socleConfig.valeurs.general &&
                etatSaisie.socleConfig.valeurs.general.situation) ||
              ""
            : String(e[E[k]] ?? ""),
    );
  const objet = m && m.objet ? remplir(m.objet) : MESSAGE.objet(nomEtab),
    corps = m && m.corps ? remplir(m.corps) : MESSAGE.corps(nomEtab, lien);
  a.href = `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
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
    await grist.getTable(ETAB.table).update({ id: etatSaisie.etabCourant.id, fields: { [E.mail]: mail } });
    etatSaisie.etabCourant[E.mail] = mail;
    statut("statut-signalement", "Mail de l'établissement enregistré.", "ok");
  } catch (e) {
    statut("statut-signalement", `Échec : ${e.message || e}`, "err");
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
  const u = (uai || "").trim().toUpperCase();
  return u ? etatSaisie.etabs.find((e) => String(e[E.uai] || "").toUpperCase() === u) || null : null;
}

// Retourne l'identifiant de l'établissement du signalement, en le créant si besoin
async function etablissementPourCreation() {
  if (etatSaisie.modeEtab) return etatSaisie.etabs[0] ? etatSaisie.etabs[0].id : null;
  if (etatSaisie.etabCourant) return etatSaisie.etabCourant.id;
  await chargerEtabs(); // un collègue l'a peut-être créé entre-temps
  const existant = etabParUai($("uai").value);
  if (existant) {
    etatSaisie.etabCourant = existant;
    return existant.id;
  }
  const uai = $("uai").value.trim().toUpperCase();
  // Origine « annuaire » seulement si l'établissement vient d'une suggestion et que l'UAI n'a pas été modifié
  const depuisAnnuaire =
    etatSaisie.ligneAnnuaire &&
    etatSaisie.ligneAnnuaire.uai &&
    String(etatSaisie.ligneAnnuaire.uai).toUpperCase() === uai;
  const candidats = {
    [E.nom]: $("nom").value.trim(),
    [E.uai]: uai,
    [E.type]: $("type").value.trim(),
    [E.academie]: $("academie").value.trim(),
    [E.departement]: $("departement").value.trim(),
    [E.mail]: $("mail").value.trim(),
    [E.commune]: depuisAnnuaire ? etatSaisie.ligneAnnuaire.commune || "" : "",
    [E.origine]: depuisAnnuaire ? ORIGINE[etatSaisie.ligneAnnuaire.source] || ORIGINE.manuel : ORIGINE.manuel,
    [E.present]: depuisAnnuaire ? true : null,
    [E.mailAnnuaire]: depuisAnnuaire ? etatSaisie.ligneAnnuaire.mail || "" : "",
  };
  const fields = {};
  for (const [c, v] of Object.entries(candidats)) if (etatSaisie.colsEtab.includes(c) && v !== null) fields[c] = v;
  const id = idDe(
    await etape("Création de l'établissement dans le référentiel", ETAB.table, () =>
      grist.getTable(ETAB.table).create({ fields }),
    ),
  );
  await chargerEtabs(); // récupère la clé et le lien calculés par Grist
  etatSaisie.etabCourant = etabDe(id);
  return id;
}

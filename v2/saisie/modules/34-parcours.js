/* PRISME — widget de saisie, module 34/34 : Parcours : accueil, vue de saisie, bandeaux, démarrage du widget.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Parcours : accueil (nouveau / retrouver), vue de saisie, bandeau de mode,
   étapes, marques « modifié », proposition du signalement en cours, confirmation
   ========================================================= */
const JOURS_EN_COURS = 7; // un signalement dont les faits datent de moins de 7 jours est « en cours » (sauf s'il est clos)
function montrerVue(v) {
  etatSaisie.vue = v;
  $("accueil").hidden = v !== "accueil";
  $("vue-saisie").hidden = v !== "saisie";
  document.body.classList.toggle("vue-accueil", v === "accueil");
  document.body.classList.toggle("vue-saisie", v === "saisie");
  fermerMenuActions();
  if (v === "accueil") {
    cacherConfirmation();
    afficherCartes();
  }
  majModeSaisie();
}
function abandonAccepte() {
  if (!(etatSaisie.modifie || etatSaisie.modifieVisa)) return true;
  if (!confirm("La saisie en cours n'est pas enregistrée. L'abandonner ?")) return false;
  etatSaisie.modifie = etatSaisie.modifieVisa = false;
  return true;
}
function allerNouveau() {
  if (!abandonAccepte()) return;
  enFile(async () => {
    cacherConfirmation();
    etatSaisie.creerEtabOuvert = false;
    etatSaisie.propositionMasquee = null;
    grist.setCursorPos({ rowId: "new" }).catch(() => {});
    await passerEnCreation();
    montrerVue("saisie");
    window.scrollTo(0, 0);
    if (etatSaisie.modeEtab) focusPremiereQuestion();
    else $("nom").focus({ preventScroll: true });
  });
}
function ouvrirDepuisListe(id) {
  if (etatSaisie.dossierId !== id && !abandonAccepte()) return;
  enFile(async () => {
    cacherConfirmation();
    etatSaisie.modifie = etatSaisie.modifieVisa = false;
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {}
    await ouvrirDossier(id, true);
    if (etatSaisie.dossierId === id) {
      montrerVue("saisie");
      window.scrollTo(0, 0);
      if (etatSaisie.fileVisa && !$("onglet-visas").hidden) afficherOnglet("visas");
    }
  });
}
$("porte-nouveau").addEventListener("click", allerNouveau);
$("porte-retrouver").addEventListener("click", () => {
  $("titre-liste").closest(".liste-accueil").scrollIntoView({ block: "start" });
  $("recherche-signalements").focus({ preventScroll: true });
});
$("btn-retour-liste").addEventListener("click", () => {
  if (!abandonAccepte()) return;
  montrerVue("accueil");
  window.scrollTo(0, 0);
});

// ---------- Liste des signalements de l'accueil (cartes)
function afficherCartes() {
  const ul = $("cartes-signalements");
  if (!ul) return;
  if (!etatSaisie.indexRecherche) construireIndexRecherche();
  $("titre-liste").textContent = etatSaisie.modeEtab ? "Vos signalements" : "Signalements";
  $("porte-nouveau-texte").textContent = etatSaisie.modeEtab
    ? "Un événement à signaler dans votre établissement."
    : "Un événement à signaler dans un établissement.";
  $("porte-retrouver-texte").textContent = etatSaisie.modeEtab
    ? "Consulter ou actualiser vos signalements."
    : "Consulter ou actualiser un signalement existant.";
  majBandeauVisa();
  majBandeauCampagne();
  majBandeauVeille();
  const q = $("recherche-signalements").value.trim(),
    mots = sansAccent(q).split(/\s+/).filter(Boolean);
  const base0 = etatSaisie.fileVisa
    ? etatSaisie.indexRecherche.filter((x) => aViserParMoi(x.l))
    : etatSaisie.indexRecherche;
  const base = filtreActif() ? base0.filter((x) => passeFiltre(x.l)) : base0;
  const trouves = mots.length ? base.filter((x) => mots.every((m) => x.cle.includes(m))) : base;
  const activite = (x) => secondes(val(x.der, "Date")) ?? jourDesFaits(x.der) ?? 0;
  const tries = [...trouves].sort((a, b) => activite(b) - activite(a) || b.l.id - a.l.id);
  const cD = col("Dossier"),
    nb = new Map();
  for (const l of etatSaisie.enregistrements) {
    const d = refId(cD && l[cD]) || l.id;
    nb.set(d, (nb.get(d) || 0) + 1);
  }
  const total = base0.length;
  $("titre-liste").textContent = etatSaisie.fileVisa ? "Dossiers à viser" : $("titre-liste").textContent;
  $("nb-liste").textContent = !total
    ? ""
    : trouves.length === total
      ? `${total} signalement${total > 1 ? "s" : ""}`
      : `${trouves.length} sur ${total}`;
  const styleQ = (v) => {
    const c = (etatSaisie.couleurs || {})[v] || {};
    return c.fillColor ? ` style="--c:${c.textColor || "#161616"};--c-bg:${c.fillColor}"` : "";
  };
  ul.innerHTML =
    tries
      .slice(0, etatSaisie.nbCartes)
      .map((x) => {
        const titre = etatSaisie.modeEtab
          ? `Signalement n° ${x.l.id}`
          : x.e[E.nom] || texteEtabBrut(x.l) || `Signalement n° ${x.l.id}`;
        const n = nb.get(x.l.id) || 1,
          clos = !!(col("Clos") && val(x.der, "Clos"));
        const site = col("Site") ? String(val(x.der, "Site") || "").trim() : "";
        const d =
          secondes(val(x.der, "Date")) != null
            ? dateFr(val(x.der, "Date"), { ...(etatSaisie.metaDate || {}), type: "Date" })
            : "";
        const jf =
          !d && secondes(val(x.der, "Date_faits")) != null ? dateFr(val(x.der, "Date_faits"), { type: "Date" }) : "";
        const meta = [
          !etatSaisie.modeEtab && x.e[E.commune],
          `n° ${x.l.id}`,
          site && `site « ${site} »`,
          d ? `dernière saisie le ${d}` : jf && `faits du ${jf}`,
          n > 1 ? `${n - 1} mise${n > 2 ? "s" : ""} à jour` : "aucune mise à jour",
        ].filter((v) => v && typeof v !== "object");
        const extrait = String(val(x.der, "Description") || "")
          .replace(/\*\*|==/g, "")
          .replace(/\s+/g, " ")
          .slice(0, 140);
        const stC = !etatSaisie.modeEtab ? statutDe(x.der) : "",
          svC = stC && (window.Socle.STATUTS_VALIDATION || []).find((y) => y.nom === stC);
        const qualifs =
          listeQualif(val(x.der, "Qualification"))
            .map((v) => `<span class="pastille"${styleQ(v)}>${esc(v)}</span>`)
            .join("") +
          (stC
            ? `<span class="pastille pastille-statut"${svC ? ` style="--c:${svC.texte};--c-bg:${svC.fond}"` : ""} title="Statut de validation">${esc(stC)}</span>`
            : "");
        return `<li><button type="button" class="carte-sig" data-id="${x.l.id}"${bandeCouleur(x.l)}>
      <span class="carte-corps"><span class="carte-titre"><strong>${surligneMots(titre, mots)}</strong>${qualifs}${clos ? '<span class="badge-clos">Clos</span>' : ""}</span>
      <span class="carte-meta">${esc(meta.join(" · "))}</span>${extrait ? `<span class="carte-extrait">${surligneMots(extrait, mots)}</span>` : ""}</span>
      <span class="carte-fleche" aria-hidden="true">›</span></button></li>`;
      })
      .join("") ||
    `<li class="vide">${total ? `Aucun signalement ne correspond${q ? ` à « ${esc(q)} »` : " au filtre"}.` : etatSaisie.fileVisa ? "Aucun dossier à viser dans votre périmètre." : "Aucun signalement pour l'instant."}</li>`;
  $("plus-cartes").hidden = tries.length <= etatSaisie.nbCartes;
}
$("cartes-signalements").addEventListener("click", (ev) => {
  const b = ev.target.closest(".carte-sig");
  if (b) ouvrirDepuisListe(+b.dataset.id);
});
$("cartes-signalements").addEventListener("keydown", (ev) => {
  if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
  const cartes = [...$("cartes-signalements").querySelectorAll(".carte-sig")],
    i = cartes.indexOf(document.activeElement);
  if (i < 0) return;
  ev.preventDefault();
  if (ev.key === "ArrowUp" && i === 0) {
    $("recherche-signalements").focus();
    return;
  }
  const c = cartes[Math.max(0, Math.min(cartes.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1)))];
  if (c) c.focus();
});
$("plus-cartes").addEventListener("click", () => {
  etatSaisie.nbCartes += 30;
  afficherCartes();
});

// ---------- Bandeau de mode (nouveau / mise à jour / clos) et menu « Autres actions »
const dossierClos = () =>
  !!(col("Clos") && etatSaisie.dossierId && etatSaisie.derniere && val(etatSaisie.derniere, "Clos"));
function majModeSaisie() {
  const maj = !!(etatSaisie.dossierId && etatSaisie.initiale),
    clos = maj && dossierClos(),
    b = document.body;
  b.classList.toggle("mode-nouveau", !maj);
  b.classList.toggle("mode-maj", maj);
  b.classList.toggle("mode-clos", clos);
  $("etiquette-mode").hidden = !maj;
  $("etiquette-mode").textContent = maj
    ? `Mise à jour · dossier n° ${etatSaisie.dossierId}${clos ? " · clos" : ""}`
    : "";
  $("phrase-mode").textContent = maj
    ? clos
      ? "Ce signalement est clos. Enregistrer une mise à jour le rouvre."
      : "Modifiez uniquement ce qui a changé : votre enregistrement s'ajoute comme nouvelle étape, l'état précédent reste dans l'historique."
    : etatSaisie.modeEtab
      ? "Décrivez les faits, puis enregistrez."
      : "Trois étapes : l'établissement, les faits, puis la description. Un dossier sera créé à l'enregistrement.";
  $("libelle-etape-etab").textContent =
    maj || etatSaisie.modeEtab ? "Établissement" : "Quel établissement est concerné ?";
  $("act-clore").hidden = !(maj && col("Clos"));
  $("act-reporter").hidden = !(maj && col("Date_faits") && S().plusieursJours && !faitsAvecHeure());
  $("act-clore-titre").textContent = clos ? "Rouvrir le signalement" : "Clore le signalement";
  $("act-clore-texte").textContent = clos ? "La situation reprend" : "La situation est terminée";
  majMarquesModif();
}
function fermerMenuActions(rendreFocus) {
  if ($("liste-actions").hidden) return;
  $("liste-actions").hidden = true;
  $("btn-autres").setAttribute("aria-expanded", "false");
  if (rendreFocus) $("btn-autres").focus();
}
$("btn-autres").addEventListener("click", () => {
  const ouvrir = $("liste-actions").hidden;
  $("liste-actions").hidden = !ouvrir;
  $("btn-autres").setAttribute("aria-expanded", String(ouvrir));
  if (ouvrir) $("act-corriger").focus();
});
$("liste-actions").addEventListener("keydown", (ev) => {
  const items = [...$("liste-actions").querySelectorAll('[role="menuitem"]')].filter((x) => !x.hidden),
    i = items.indexOf(document.activeElement);
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    const k = (i + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[k].focus();
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    fermerMenuActions(true);
  } else if (ev.key === "Tab") fermerMenuActions(false);
});
document.addEventListener("click", (ev) => {
  if (!$("menu-actions").contains(ev.target)) fermerMenuActions(false);
});
$("act-corriger").addEventListener("click", () => {
  fermerMenuActions(false);
  $("btn-corriger").click();
});
$("act-annuler").addEventListener("click", () => {
  fermerMenuActions(false);
  $("btn-effacer").click();
});
$("act-reporter").addEventListener("click", () => {
  fermerMenuActions(false);
  ouvrirReport();
});
$("act-clore").addEventListener("click", () => {
  fermerMenuActions(false);
  enFile(basculerClos);
});
async function basculerClos() {
  if (!col("Clos") || !etatSaisie.derniere) return;
  const clore = !dossierClos();
  if (
    clore &&
    !confirm(
      "Clore ce signalement ? La situation sera considérée comme terminée ; une nouvelle mise à jour le rouvrira.",
    )
  )
    return;
  try {
    await grist.getTable().update({ id: etatSaisie.derniere.id, fields: { [col("Clos")]: clore } });
    etatSaisie.derniere[col("Clos")] = clore;
    etatSaisie.indexRecherche = null;
    afficherDossier();
    confirmer(
      clore ? "Signalement clos" : "Signalement rouvert",
      clore
        ? `Le dossier n° ${etatSaisie.dossierId} est clos. Un prochain événement dans cet établissement fera l'objet d'un nouveau signalement.`
        : `Le dossier n° ${etatSaisie.dossierId} est de nouveau en cours.`,
    );
  } catch (e) {
    statut("statut-signalement", `Échec : ${e.message || e}.`, "err");
  }
}

function planifierMarques() {
  clearTimeout(etatSaisie.minuterieMarques);
  etatSaisie.minuterieMarques = setTimeout(majMarquesModif, 0);
}
function majMarquesModif() {
  document.querySelectorAll("#form-signalement .modifie").forEach((el) => el.classList.remove("modifie"));
  const recap = $("recap-modifs");
  if (!etatSaisie.dossierId || !etatSaisie.derniere) {
    recap.hidden = true;
    return;
  }
  const noms = [],
    marquer = (el, nom) => {
      if (el) el.classList.add("modifie");
      noms.push(nom);
    };
  const tri = (v) => listeQualif(v).map(String).sort().join("|");
  if (col("Qualification") && tri(lireQualificationInitiale()) !== tri(val(etatSaisie.derniere, "Qualification")))
    marquer(
      $("qualifs-initiales").closest("fieldset"),
      (etatSaisie.metaSig[col("Qualification")] || {}).libelle || "Qualification",
    );
  if (col("Site") && $("site").value.trim() !== String(val(etatSaisie.derniere, "Site") || "").trim())
    marquer($("bloc-site"), "Site / bâtiment");
  for (const def of etatSaisie.defsQuestions) {
    if (def.formule) continue;
    const bloc = document.querySelector(`[data-champ="q-${def.colId}"]`);
    if (!bloc || bloc.hidden) continue;
    if (!memeReponse(def, lireUnChamp("q", def), etatSaisie.derniere[def.colId]))
      marquer(bloc, def.libelle || def.colId);
  }
  const sansMention = (t) =>
    String(t || "")
      .replace(MOTIF_MOBILISATION, "")
      .replace(/\s+/g, " ")
      .trim();
  if (
    col("Description") &&
    sansMention($("description").value) !== sansMention(val(etatSaisie.derniere, "Description"))
  )
    marquer($("description").closest(".champ"), "Description");
  recap.hidden = false;
  recap.classList.toggle("avec", noms.length > 0);
  recap.textContent = noms.length
    ? `${noms.length} modification${noms.length > 1 ? "s" : ""} depuis l'étape précédente : ${noms.join(", ")}.`
    : "Aucune modification pour l'instant : modifiez ce qui a changé.";
}
["input", "change", "click"].forEach((t) =>
  $("form-signalement").addEventListener(t, (ev) => {
    planifierMarques();
    if (t !== "click" && ev.isTrusted) cacherConfirmation();
  }),
);

// ---------- Établissement : résumé d'une ligne, fiche dépliable, création sur demande, signalement en cours
function resumeEtabHtml(e) {
  const reste = [e[E.type], e[E.commune], e[E.uai]]
    .filter((v) => v && typeof v !== "object")
    .map((v) => esc(v))
    .join(" · ");
  return `<strong>${esc(e[E.nom] || "")}</strong>${reste ? ` <span class="meta">· ${reste}</span>` : ""}`;
}
function majResumeEtab() {
  const connu = !!etatSaisie.etabCourant;
  if (!connu || etatSaisie.etabCourant.id !== etatSaisie.ficheEtabId) {
    etatSaisie.ficheDepliee = false;
    etatSaisie.ficheEtabId = connu ? etatSaisie.etabCourant.id : null;
  }
  $("resume-etab").hidden = !connu;
  if (connu) $("resume-etab-texte").innerHTML = resumeEtabHtml(etatSaisie.etabCourant);
  $("carte-etab").hidden = !connu || !etatSaisie.ficheDepliee;
  $("btn-voir-fiche").setAttribute("aria-expanded", String(etatSaisie.ficheDepliee));
  $("btn-voir-fiche").textContent = etatSaisie.ficheDepliee ? "Masquer la fiche" : "Voir la fiche";
  const creationVisible =
    !etatSaisie.reaffectation &&
    (etatSaisie.creerEtabOuvert || !!etatSaisie.ligneAnnuaire || CHAMPS_NOUVEL_ETAB.some((k) => $(k).value.trim()));
  $("bloc-nouvel-etab").hidden = !creationVisible;
  $("btn-creer-etab").hidden = etatSaisie.reaffectation || creationVisible || etatSaisie.modeEtab;
}
$("btn-voir-fiche").addEventListener("click", () => {
  etatSaisie.ficheDepliee = !etatSaisie.ficheDepliee;
  majResumeEtab();
});
$("btn-creer-etab").addEventListener("click", () => {
  etatSaisie.creerEtabOuvert = true;
  fermer();
  majResumeEtab();
  if (!$("nom").value.trim()) $("nom").focus();
  else $("type").focus();
  statut("statut-signalement", "");
});
function dossiersEnCours(etabId) {
  if (!etabId) return [];
  const cD = col("Dossier"),
    dern = new Map(),
    nb = new Map();
  for (const l of etatSaisie.enregistrements) {
    if (refId(val(l, "Etablissement")) !== etabId) continue;
    const d = refId(cD && l[cD]) || l.id;
    nb.set(d, (nb.get(d) || 0) + 1);
    const p = dern.get(d);
    if (!p || comparerVersions(p, l) < 0) dern.set(d, l);
  }
  const limite = Date.now() / 1000 - JOURS_EN_COURS * 86400;
  return [...dern]
    .filter(
      ([, l]) =>
        !(col("Clos") && val(l, "Clos")) &&
        ((jourDesFaits(l) ?? 0) >= limite || (secondes(val(l, "Date")) ?? 0) >= limite),
    )
    .map(([d, l]) => ({ d, l, n: nb.get(d) || 1, initiale: etatSaisie.enregistrements.find((x) => x.id === d) || l }))
    .sort((a, b) => comparerVersions(b.l, a.l));
}
function majProposition() {
  const bloc = $("proposition-encours");
  const enCreation =
    !etatSaisie.dossierId &&
    etatSaisie.etabCourant &&
    !etatSaisie.reaffectation &&
    etatSaisie.propositionMasquee !== etatSaisie.etabCourant.id;
  const liste = enCreation ? dossiersEnCours(etatSaisie.etabCourant.id) : [];
  bloc.hidden = !liste.length;
  document.body.classList.toggle("proposition-visible", liste.length > 0);
  if (!liste.length) {
    bloc.innerHTML = "";
    return;
  }
  const ligne = (x) => {
    const debut = jourDesFaits(x.initiale),
      q = listeQualif(val(x.l, "Qualification")).join(", ");
    return `Dossier n° ${x.d}${q ? " · " + q : ""}${debut != null ? " · du " + jourFaits(debut) : ""} · ${x.n > 1 ? `${x.n - 1} mise${x.n > 2 ? "s" : ""} à jour` : "aucune mise à jour"}`;
  };
  // Un dossier par jour : celui du même jour s'actualise ; celui d'un jour précédent sert de point de départ
  const jour = jourDuFormulaire(),
    memeJour = liste.filter((x) => versionsDe(x.d).some((l) => jourDeLaVersion(l) === jour)),
    avant = liste.filter((x) => !memeJour.includes(x));
  // formulaire par site, reprise désactivée : rien à reprendre des jours précédents (seul le signalement du même jour est proposé)
  if (!memeJour.length && formulaireParSite() && modeRepriseSites() === "non") {
    bloc.hidden = true;
    bloc.innerHTML = "";
    document.body.classList.remove("proposition-visible");
    return;
  }
  bloc.innerHTML = memeJour.length
    ? `<p class="prop-titre">${memeJour.length > 1 ? `${memeJour.length} signalements existent` : "Un signalement existe"} déjà pour cet établissement ce jour-là</p>
      <ul>${memeJour
        .slice(0, 3)
        .map(
          (x) => `<li><span>${esc(ligne(x))}</span>
        <button type="button" class="maj-plein petit" data-actualiser="${x.d}">Actualiser ce signalement</button></li>`,
        )
        .join("")}</ul>
      <p class="note">S'il s'agit des mêmes faits, actualisez-le plutôt que d'en créer un nouveau.</p>
      <button type="button" class="maj-contour petit" data-autre-evenement="1">Non, c'est un autre événement</button>`
    : `<p class="prop-titre">${avant.length > 1 ? `${avant.length} signalements récents` : "Un signalement récent"} pour cet établissement</p>
      <ul>${avant
        .slice(0, 3)
        .map(
          (x) => `<li><span>${esc(ligne(x))}</span>
        <button type="button" class="maj-plein petit" data-reprendre="${x.d}">${formulaireParSite() ? "Reprendre ses sites" : "Reprendre ses réponses"}</button></li>`,
        )
        .join("")}</ul>
      <p class="note">Un signalement par jour : celui du ${esc(jour)} sera un nouveau dossier. ${
        formulaireParSite()
          ? "Si la situation continue, reprenez les sites du signalement choisi dans leur dernier état, puis confirmez ou modifiez chaque site."
          : "Si la situation continue, reprenez les réponses du précédent, puis modifiez ce qui a changé."
      }</p>
      <button type="button" class="maj-contour petit" data-autre-evenement="1">Partir d'un formulaire vide</button>`;
}
$("proposition-encours").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.dataset.actualiser) {
    etatSaisie.modifie = etatSaisie.modifieVisa = false;
    ouvrirDepuisListe(+b.dataset.actualiser);
  } else if (b.dataset.reprendre) enFile(() => reprendreReponses(+b.dataset.reprendre));
  else if (b.dataset.autreEvenement) {
    etatSaisie.propositionMasquee = etatSaisie.etabCourant ? etatSaisie.etabCourant.id : null;
    // vaut confirmation qu'il s'agit de faits distincts : l'alerte « même jour » ne redemande pas
    if (typeof cleDoublon === "function") {
      etatSaisie.doublonConfirme = cleDoublon();
      verifierDoublons();
    }
    majProposition();
    focusPremiereQuestion();
  }
});

// ---------- Confirmation après enregistrement
function confirmer(titre, texte, avecLien) {
  const c = $("confirmation");
  c.innerHTML = `<div class="conf-tete"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M7 12.5l3.2 3.2L17 9"></path></svg>
    <strong>${esc(titre)}</strong></div><p>${esc(texte)}</p>
    <div class="conf-actions"><button type="button" class="primaire petit" data-conf="liste">Revenir à la liste</button>
      <button type="button" class="secondaire petit" data-conf="nouveau">Nouveau signalement</button>
      ${avecLien ? `<button type="button" class="secondaire petit" data-conf="lien">Transmettre le lien à l'établissement</button>` : ""}
      <button type="button" class="lien-texte" data-conf="fermer">Continuer sur ce signalement</button></div>`;
  c.hidden = false;
  if (etatSaisie.vue === "saisie") {
    c.scrollIntoView({ block: "start" });
    c.focus({ preventScroll: true });
  }
}
function cacherConfirmation() {
  const c = $("confirmation");
  if (c && !c.hidden) {
    c.hidden = true;
    c.innerHTML = "";
  }
}
$("confirmation").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-conf]");
  if (!b) return;
  const a = b.dataset.conf;
  if (a === "liste") {
    if (abandonAccepte()) montrerVue("accueil");
  } else if (a === "nouveau") allerNouveau();
  else if (a === "lien") {
    cacherConfirmation();
    $("bloc-contact").open = true;
    $("bloc-contact").scrollIntoView({ block: "center" });
    ($("btn-envoyer").offsetParent ? $("btn-envoyer") : $("lien")).focus();
  } else cacherConfirmation();
});

montrerVue("accueil");

// tout le code du widget est chargé : branchement sur Grist (voir 06-grist.js)
brancherGrist();

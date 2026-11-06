/* PRISME — widget de saisie, module 30/34 : Visas départementaux et académiques.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Visas : portent sur la dernière version, jamais recopiés dans les suivis
   ========================================================= */
const sansAccentBas = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function classerNiveau(v) {
  const s = sansAccentBas(v);
  if (s.includes("region")) return "region"; // avant "academie" : "région académique" contient aussi "academie"
  if (s.includes("departement")) return "departement";
  if (s.includes("academie")) return "academie";
  return null;
}
async function chargerProfil() {
  etatSaisie.monNiveau = null;
  try {
    const t = await Donnees.lire(UTILISATEURS.table);
    const cols = Object.keys(t);
    const U = UTILISATEURS.colonnes;
    if (!cols.includes(U.mail) || !cols.includes(U.niveau) || t.id.length !== 1) return;
    const l = {};
    cols.forEach((c) => (l[c] = t[c][0]));
    etatSaisie.monNiveau = classerNiveau(l[U.niveau]);
  } catch (e) {
    console.warn("Table Utilisateurs illisible", e);
  }
}

async function chargerProfilViseur() {
  etatSaisie.monPerimetreVisa = null;
  try {
    etatSaisie.reglageValidation = window.Socle.reglagesValidation(etatSaisie.socleConfig, etatSaisie.tableId);
  } catch (_) {
    etatSaisie.reglageValidation = null;
  }
  if (etatSaisie.agentPage == null) return;
  try {
    const t = await Donnees.lire(etatSaisie.socleGeneral.agents || "Agents"),
      i = t.id.indexOf(etatSaisie.agentPage);
    if (i < 0 || !t.Echelon_visa) return;
    const ech = String(t.Echelon_visa[i] || ""),
      niveau = ech === "Départemental" ? "departement" : ech === "Académique" ? "academie" : null;
    if (!niveau) return;
    etatSaisie.monNiveau = niveau;
    etatSaisie.monPerimetreVisa = {
      echelon: ech,
      departements: window.Socle.listeChoix((t.Visa_departements || [])[i]),
      academies: window.Socle.listeChoix((t.Visa_academies || [])[i]),
    };
  } catch (_) {
    /* table Agents illisible : ancien fonctionnement */
  }
}
// Département et académie de l'établissement d'une ligne (référentiel, à défaut colonnes recopiées de la table des réponses)
function lieuDe(l) {
  const e = (l && etabDeLigne(l)) || {},
    d = l || {};
  return {
    dep: String((E.departement && e[E.departement]) || d.Departement || ""),
    aca: String((E.academie && e[E.academie]) || d.Academie || ""),
  };
}
const statutDe = (l) =>
  etatSaisie.reglageValidation && l ? String(l[etatSaisie.reglageValidation.colonne] || "") : "";
// Le viseur de la page peut-il viser ce dossier à cet échelon (« dep » | « aca ») ? Sans profil de viseur : les règles d'accès décident.
function peutViser(echelonVisa, l = etatSaisie.initiale) {
  if (!etatSaisie.monPerimetreVisa) return true;
  const { dep, aca } = lieuDe(l);
  return window.Socle.viseurCouvre(
    etatSaisie.monPerimetreVisa,
    echelonVisa,
    dep,
    aca,
    etatSaisie.reglageValidation || { aca_vise_dep: true },
  );
}
// Dossier (ligne initiale) en attente du visa de ce viseur, dans son périmètre
function aViserParMoi(l) {
  if (!etatSaisie.monPerimetreVisa || !etatSaisie.reglageValidation) return false;
  const s = statutDe(derniereDe(l));
  return (s === Socle.STATUT.dep && peutViser("dep", l)) || (s === Socle.STATUT.aca && peutViser("aca", l));
}
function majBandeauVisa() {
  const b = $("bandeau-visa");
  if (!b) return;
  if (!etatSaisie.monPerimetreVisa || !etatSaisie.reglageValidation || etatSaisie.modeEtab) {
    b.hidden = true;
    etatSaisie.fileVisa = false;
    return;
  }
  const n = (etatSaisie.indexRecherche || []).filter((x) => aViserParMoi(x.l)).length,
    p = etatSaisie.monPerimetreVisa;
  const zone = p.echelon === "Départemental" ? p.departements : p.academies;
  b.hidden = false;
  b.innerHTML = `<span class="grand">${n ? `${n} dossier${n > 1 ? "s" : ""} à viser` : "Aucun dossier à viser"}</span>
    <span>visa ${p.echelon === "Départemental" ? "départemental" : "académique"} · ${esc(zone.length ? zone.join(", ") : "tout le document")}</span>
    <button type="button" class="secondaire petit" id="btn-file-visa">${etatSaisie.fileVisa ? "Afficher tous les signalements" : n ? "Afficher la file" : "Afficher la file (vide)"}</button>`;
  $("btn-file-visa").addEventListener("click", () => {
    etatSaisie.fileVisa = !etatSaisie.fileVisa;
    etatSaisie.nbCartes = 30;
    afficherCartes();
  });
}
async function lireVeille() {
  etatSaisie.dernierVeille = Date.now();
  try {
    etatSaisie.vigilancesPage = await window.Socle.lireVigilances(etatSaisie.socleGeneral);
  } catch (_) {
    etatSaisie.vigilancesPage = null;
  }
}
function majBandeauVeille() {
  const b = $("bandeau-veille");
  if (!b) return;
  if (Date.now() - etatSaisie.dernierVeille > 600000) lireVeille().then(majBandeauVeille); // relue toutes les 10 minutes
  if (etatSaisie.modeEtab || !etatSaisie.vigilancesPage) {
    b.hidden = true;
    return;
  }
  const r = Socle.reglagesVeille(etatSaisie.socleConfig),
    groupes = new Map();
  for (const v of etatSaisie.vigilancesPage) {
    if (v.niveau < r.seuil || (r.phenomenes.length && !r.phenomenes.includes(v.phenomene))) continue;
    const k = `${v.niveau}|${v.echeance === "Demain" ? 1 : 0}|${v.phenomene}`;
    if (!groupes.has(k)) groupes.set(k, { v, deps: [] });
    if (!groupes.get(k).deps.includes(v.departement)) groupes.get(k).deps.push(v.departement);
  }
  if (!groupes.size) {
    b.hidden = true;
    return;
  }
  const pastille = ["", "🟢", "🟡", "🟠", "🔴"];
  b.hidden = false;
  b.innerHTML =
    [...groupes.entries()]
      .sort((x, y) => y[0].localeCompare(x[0]))
      .slice(0, 4)
      .map(
        ([, g]) =>
          `<p>${pastille[g.v.niveau] || ""} <strong>Vigilance ${esc(String(g.v.couleur).toLowerCase())} ${esc(g.v.phenomene.toLowerCase())}</strong> ${g.v.echeance === "Demain" ? "demain" : "aujourd'hui"} : ${esc(g.deps.slice(0, 8).join(", "))}${g.deps.length > 8 ? ` et ${g.deps.length - 8} autres` : ""}</p>`,
      )
      .join("") + (groupes.size > 4 ? `<p>… et ${groupes.size - 4} autre(s) vigilance(s).</p>` : "");
}
/* Campagnes (onglet Établissements de l'administration) : la page d'un établissement ouverte par son lien affiche la
   campagne qui le vise et propose « Rien à signaler », qui enregistre un signalement en retour à la normale. */
function campagnesDeLEtab() {
  if (!etatSaisie.modeEtab || !etatSaisie.etabs || !etatSaisie.etabs[0] || !etatSaisie.socleConfig || !Socle.campagnes)
    return [];
  const cols = { nom: E.nom, uai: E.uai, commune: E.commune, mail: E.mail };
  return Socle.campagnes(etatSaisie.socleConfig).filter(
    (c) =>
      Socle.campagneEnCours(c) &&
      (!c.referentiel || c.referentiel === ETAB.table) &&
      Socle.campagneVise(c, etatSaisie.etabs[0], cols),
  );
}
function majBandeauCampagne() {
  const b = $("bandeau-campagne");
  if (!b) return;
  const cs = campagnesDeLEtab();
  if (!cs.length) {
    b.hidden = true;
    return;
  }
  const saisies = etatSaisie.enregistrements.map((l) => secondes(val(l, "Date"))).filter((x) => x != null);
  const attente = cs.filter((c) => !saisies.some((x) => Socle.reponseCompte(c, x)));
  b.hidden = false;
  b.classList.toggle("ok", !attente.length);
  if (!attente.length) {
    b.innerHTML = `<p>✓ ${cs.length > 1 ? "Vos réponses sont enregistrées" : `Votre réponse à « ${esc(cs[0].nom)} » est enregistrée`}${cs.some((c) => c.mode === "quotidienne") ? " pour aujourd'hui" : ""}. Merci.</p>`;
    return;
  }
  const c = attente[0],
    jour = c.mode === "quotidienne";
  b.innerHTML = `<p><span class="grand">Réponse attendue${jour ? " aujourd'hui" : ""} : « ${esc(c.nom)} ».</span>
    Signalez tout événement concernant votre établissement ; s'il n'y a rien à signaler, répondez en un clic.</p>
    <button type="button" class="primaire" id="btn-rien-a-signaler">Rien à signaler</button>`;
  $("btn-rien-a-signaler").addEventListener("click", rienASignaler);
}
// Valeur de qualification « retour à la normale » proposée par le formulaire (RAS par défaut)
function qualificationRetourNormale() {
  const r = retourNormale(),
    trouve = (etatSaisie.choix || []).find((x) => r.has(String(x).trim().toUpperCase()));
  return trouve || (etatSaisie.choix && etatSaisie.choix.length ? null : "RAS");
}
async function rienASignaler() {
  const q = qualificationRetourNormale();
  if (!q) {
    alert("Le formulaire ne propose pas de qualification « RAS » : utilisez « Nouveau signalement ».");
    return;
  }
  if (!abandonAccepte()) return;
  // un dossier de ce jour existe déjà (un dossier par jour) : il est mis à jour en retour à la normale ; sinon, nouveau dossier
  const duJour =
    etatSaisie.modeEtab && etatSaisie.etabs && etatSaisie.etabs[0]
      ? dossierDuJour(etatSaisie.etabs[0].id, Date.now() / 1000)
      : null;
  await enFile(async () => {
    cacherConfirmation();
    if (duJour) await ouvrirDossier(duJour.d, true);
    else await passerEnCreation();
    montrerVue("saisie");
  });
  if (duJour && etatSaisie.dossierId !== duJour.d) return;
  await enFile(async () => {
    cocherQualif(q);
    $("description").value = "Rien à signaler.";
    etatSaisie.descriptionManuelle = true;
    majEtatDescription();
    etatSaisie.modifie = true;
    await enregistrerSignalement();
  });
}

async function remplirVisas() {
  // Un bloc n'est affiché que si les règles d'accès laissent lire ses colonnes
  const visibles = (defs, prefix) =>
    defs.filter((d) => {
      const ok = etatSaisie.derniere && lisible(etatSaisie.derniere[d.colId]) && d.colId in etatSaisie.derniere;
      const bloc = document.querySelector(`[data-champ="${prefix}-${d.colId}"]`);
      if (bloc) {
        bloc.hidden = !ok;
        bloc.dataset.masqueAcces = ok ? "0" : "1";
      }
      return ok;
    });
  const vd = visibles(etatSaisie.defsDep, "vd"),
    va = visibles(etatSaisie.defsAca, "va");
  // Un profil identifié dans « Utilisateurs » décide du périmètre : département → son échelon
  // seulement ; académie et région académique → les deux échelons. Sans profil reconnu (ex. le
  // propriétaire du document), on retombe sur ce que les règles d'accès laissent lire.
  let montrerDep = vd.length > 0;
  let montrerAca = va.length > 0 && (!etatSaisie.monNiveau || etatSaisie.monNiveau !== "departement");
  // Viseur de l'onglet Validation : son échelon, sur les établissements de son périmètre seulement
  if (etatSaisie.monPerimetreVisa) {
    montrerDep =
      montrerDep &&
      (!etatSaisie.reglageValidation || etatSaisie.reglageValidation.echelons === "dep_aca") &&
      peutViser("dep");
    montrerAca = montrerAca && peutViser("aca");
  }
  $("form-visa-dep").hidden = !montrerDep;
  $("form-visa-aca").hidden = !montrerAca;
  $("onglet-visas").hidden = !(montrerDep || montrerAca);
  if ($("onglet-visas").hidden && !$("panneau-visas").hidden) afficherOnglet("signalement");

  // Profil identifié : n'afficher que le geste de validation (le toggle), rien d'autre du bloc.
  [
    ["form-visa-dep", etatSaisie.defsDep, "vd", montrerDep],
    ["form-visa-aca", etatSaisie.defsAca, "va", montrerAca],
  ].forEach(([formId, defs, prefix, montrer]) => {
    $(formId).classList.toggle("mode-toggle", !!etatSaisie.monNiveau);
    if (!etatSaisie.monNiveau || !montrer) return;
    const prim = champVerdict(defs);
    defs.forEach((d) => {
      const bloc = document.querySelector(`[data-champ="${prefix}-${d.colId}"]`);
      if (bloc && d !== prim) bloc.hidden = true;
    });
  });
  await remplirChamps("vd", vd, (d) => etatSaisie.derniere[d.colId]);
  await remplirChamps("va", va, (d) => etatSaisie.derniere[d.colId]);
  if (etatSaisie.derniere) {
    const d = val(etatSaisie.derniere, "Date");
    $("note-visa").textContent =
      `Les visas portent sur la version la plus récente du signalement` +
      (secondes(d) != null
        ? ` (${etatSaisie.derniere === etatSaisie.initiale ? "signalement initial" : "suivi"} du ${dateFr(d, etatSaisie.metaDate)})`
        : "") +
      `. Tout nouveau suivi devra être visé à nouveau.`;
  }
  etatSaisie.modifieVisa = false;
}

// Le premier champ « Choix » du visa (typiquement Favorable / À revoir / Défavorable) est traité
// comme un verdict : cliquer dessus l'enregistre aussitôt, sans passer par le bouton « Enregistrer »,
// pour que l'agent du département ou de l'académie puisse valider en un geste. Les autres champs du
// bloc (observations, etc.) restent soumis par le bouton habituel.
function champVerdict(defs) {
  return defs.find(
    (d) =>
      !d.formule &&
      typeBase(d.type) === "Choice" &&
      (d.opts.choices || []).length &&
      (d.opts.choices || []).length <= 5,
  );
}

function activerVerdictRapide(prefix, defs, statutId) {
  const def = champVerdict(defs);
  if (!def) return;
  const id = `${prefix}-${def.colId}`;
  const bloc = document.querySelector(`[data-champ="${id}"]`);
  if (!bloc) return;
  bloc.classList.add("bloc-verdict");
  if (!bloc.querySelector(".aide-verdict")) {
    const p = document.createElement("p");
    p.className = "aide-verdict";
    p.textContent = "Cliquer sur une valeur l'enregistre immédiatement.";
    bloc.insertBefore(p, bloc.querySelector(".choix-groupe"));
  }
  // À la souris, un clic sur une valeur l'enregistre aussitôt. Au clavier, les flèches parcourent les
  // valeurs sans rien enregistrer (sinon chaque valeur intermédiaire serait écrite) : Entrée valide.
  let pointeur = false;
  bloc.addEventListener("pointerdown", () => {
    pointeur = true;
  });
  bloc.querySelectorAll(`input[name="${id}"]`).forEach((r) => {
    r.addEventListener("change", () => {
      if (pointeur) {
        pointeur = false;
        enFile(() => enregistrerVerdict(def, id, statutId));
        return;
      }
      const encours = lireChoix(id);
      const deja = etatSaisie.derniere && egal(norm(def, encours), norm(def, etatSaisie.derniere[def.colId]));
      statut(statutId, deja ? "" : `« ${encours} » sélectionné, non enregistré : appuyez sur Entrée pour valider.`);
    });
    r.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault(); // pas d'envoi implicite du formulaire de visa
      enFile(() => enregistrerVerdict(def, id, statutId));
    });
  });
  const aide = bloc.querySelector(".aide-verdict");
  if (aide)
    aide.textContent =
      "Un clic sur une valeur l'enregistre immédiatement. Au clavier : flèches pour choisir, Entrée pour valider.";
}

async function enregistrerVerdict(def, id, statutId) {
  if (!etatSaisie.derniere) return;
  const v = lireChoix(id);
  if (!v || egal(norm(def, v), norm(def, etatSaisie.derniere[def.colId]))) return;
  statut(statutId, "Enregistrement…");
  try {
    await grist.getTable().update({ id: etatSaisie.derniere.id, fields: { [def.colId]: v } });
    etatSaisie.derniere[def.colId] = v; // évite qu'« Enregistrer » ne renvoie inutilement cette même valeur
    statut(statutId, `Visa enregistré : ${v}.`, "ok");
  } catch (e) {
    statut(
      statutId,
      `Échec : ${e.message || e}. Vérifiez que ce visa relève bien de votre échelon et porte sur la dernière version.`,
      "err",
    );
  }
}

async function enregistrerVisa(prefix, defs, statutId) {
  if (!etatSaisie.derniere) return;
  const manquants = [];
  const valeurs = lireChamps(prefix, defs, manquants);
  if (manquants.length) {
    statut(statutId, `Renseignez ${manquants.join(", ")}.`, "err");
    return;
  }
  const fields = seulementModifies(defs, valeurs, etatSaisie.derniere);
  if (!Object.keys(fields).length) {
    statut(statutId, "Aucune modification à enregistrer.");
    return;
  }
  try {
    await grist.getTable().update({ id: etatSaisie.derniere.id, fields });
    etatSaisie.modifieVisa = false;
    statut(statutId, "Visa enregistré.", "ok");
  } catch (e) {
    statut(
      statutId,
      `Échec : ${e.message || e}. Vérifiez que ce visa relève bien de votre échelon et porte sur la dernière version.`,
      "err",
    );
  }
}
$("form-visa-dep").addEventListener("submit", (ev) => {
  ev.preventDefault();
  enFile(() => enregistrerVisa("vd", etatSaisie.defsDep, "statut-dep"));
});
$("form-visa-aca").addEventListener("submit", (ev) => {
  ev.preventDefault();
  enFile(() => enregistrerVisa("va", etatSaisie.defsAca, "statut-aca"));
});

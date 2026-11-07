/* PRISME — widget de saisie, module 18/34 : Menu et recherche des signalements.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : libelleDossier, calculerDossiersInit, majListeDossiers, construireIndexRecherche, surligneMots,
     afficherResultatsRecherche, fermerRecherche, ouvrirResultat.
   Utilise :
     02 utilitaires : colonnesEtab.
     03 variantes : refId.
     04 date-faits : dateFr, secondes.
     05 etat : afficherBandeauPerimetre, colonneDe, dansPerimetre, etabDeLigne, etatSaisie, nomEtabLigne,
       perimetreActif, texteEtabBrut, valeurLigne.
     06 grist : enFile.
     09 dossier : comparerVersions, listeQualif, ouvrirDossier.
     24 filtres-navigation : afficherOptionsDossiers, dossiersFiltres, fermerPanneauFiltre, filtreActif, majFiltre.
     31 autocompletion : sansAccent.
     34 parcours : afficherCartes, ouvrirDepuisListe.
   Modifie etatSaisie : cacheDernieres, dossiersInit, indexRecherche, nbCartes. */
function libelleDossier(ligne) {
  const dateSignalement =
    secondes(valeurLigne(ligne, "Date")) != null
      ? dateFr(valeurLigne(ligne, "Date"), { ...(etatSaisie.metaDate || {}), type: "Date" })
      : "";
  const texte = String(valeurLigne(ligne, "Description") || "").slice(0, 60);
  const etab = etatSaisie.modeEtab ? "" : nomEtabLigne(ligne);
  return {
    titre: etab || `Signalement n° ${ligne.id}`,
    detail: `${dateSignalement ? "du " + dateSignalement + " — " : ""}${texte}`,
  };
}
// Calcule les versions initiales des dossiers du périmètre, triées de la plus récente à la plus ancienne
function calculerDossiersInit() {
  const colonneDossier = colonneDe("Dossier");
  return etatSaisie.enregistrements
    .filter((ligne) => (refId(colonneDossier && ligne[colonneDossier]) || ligne.id) === ligne.id)
    .filter((ligne) => !perimetreActif() || dansPerimetre(etabDeLigne(ligne)))
    .sort((a, b) => (secondes(valeurLigne(b, "Date")) ?? 0) - (secondes(valeurLigne(a, "Date")) ?? 0));
}
function majListeDossiers() {
  $("menu-dossiers").hidden = true; // remplacé par la liste de l'accueil
  $("barre-recherche").hidden = false;
  etatSaisie.indexRecherche = null; // reconstruit à la prochaine frappe
  etatSaisie.cacheDernieres = null;
  etatSaisie.dossiersInit = calculerDossiersInit();
  majFiltre();
  if (!$("resultats-signalements").hidden) afficherResultatsRecherche();
  const courant = etatSaisie.dossiersInit.find((ligne) => ligne.id === etatSaisie.dossierId);
  const libelleCourant = courant ? libelleDossier(courant) : null;
  $("btn-dossiers").querySelector(".texte").textContent = libelleCourant
    ? `${libelleCourant.titre} — ${libelleCourant.detail}`
    : `${etatSaisie.modeEtab ? "Mes signalements" : "Signalements"} (${filtreActif() ? dossiersFiltres().length + " / " : ""}${etatSaisie.dossiersInit.length})`;
  $("recherche-dossiers").hidden = etatSaisie.dossiersInit.length < 8;
  // Le contenu de la liste n'est construit qu'à l'ouverture du menu : inutile de formater
  // des centaines de libellés à chaque changement de signalement.
  if ($("btn-dossiers").getAttribute("aria-expanded") === "true") afficherOptionsDossiers();
  if (etatSaisie.vue === "accueil") afficherCartes();
  afficherBandeauPerimetre();
}
function construireIndexRecherche() {
  const colonneDossier = colonneDe("Dossier"),
    dernieres = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    const idDossier = refId(colonneDossier && ligne[colonneDossier]) || ligne.id,
      derniereVersion = dernieres.get(idDossier);
    if (!derniereVersion || comparerVersions(derniereVersion, ligne) < 0) dernieres.set(idDossier, ligne);
  }
  etatSaisie.indexRecherche = etatSaisie.dossiersInit.map((ligne) => {
    const etablissement = etabDeLigne(ligne) || {},
      der = dernieres.get(ligne.id) || ligne;
    const texte = [
      etablissement[colonnesEtab.nom] || texteEtabBrut(ligne),
      etablissement[colonnesEtab.commune],
      etablissement[colonnesEtab.uai],
      etablissement[colonnesEtab.academie],
      etablissement[colonnesEtab.departement],
      colonneDe("Site") ? valeurLigne(der, "Site") : "",
      `n° ${ligne.id}`,
      String(ligne.id),
      valeurLigne(ligne, "Description"),
      der !== ligne ? valeurLigne(der, "Description") : "",
      listeQualif(valeurLigne(der, "Qualification")).join(" "),
    ]
      .filter((valeur) => valeur != null && typeof valeur !== "object")
      .join(" ")
      .replace(/\*\*|==/g, "");
    return { l: ligne, der, e: etablissement, cle: sansAccent(texte) };
  });
}
function surligneMots(texte, mots) {
  // repérage sans accents, sur le texte d'origine (même longueur une fois normalisé), puis échappement morceau par morceau
  const brut = String(texte ?? "").normalize("NFC"),
    norm = [...brut].map((caractere) => sansAccent(caractere) || caractere).join("");
  if (norm.length !== brut.length) return esc(brut);
  const marques = new Array(brut.length).fill(false);
  for (const mot of mots) {
    if (mot.length < 2) continue;
    let i = norm.indexOf(mot);
    while (i >= 0) {
      for (let k = i; k < i + mot.length; k++) marques[k] = true;
      i = norm.indexOf(mot, i + mot.length);
    }
  }
  let html = "",
    dans = false;
  for (let k = 0; k < brut.length; k++) {
    if (marques[k] !== dans) {
      html += marques[k] ? "<mark>" : "</mark>";
      dans = marques[k];
    }
    html += esc(brut[k]);
  }
  return html + (dans ? "</mark>" : "");
}
function afficherResultatsRecherche() {
  etatSaisie.nbCartes = 30;
  afficherCartes();
}
function fermerRecherche() {
  $("resultats-signalements").hidden = true;
  $("recherche-signalements").setAttribute("aria-expanded", "false");
}
function ouvrirResultat(itemResultat) {
  const id = +itemResultat.dataset.id;
  if (!id) return;
  fermerRecherche();
  $("recherche-signalements").value = "";
  enFile(async () => {
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {
      // placer le curseur de Grist est un confort : sans effet si Grist le refuse
    }
    await ouvrirDossier(id, true);
  });
}
$("recherche-signalements").addEventListener("input", afficherResultatsRecherche);
$("recherche-signalements").addEventListener("focus", () => {
  fermerPanneauFiltre(false);
  afficherResultatsRecherche();
});
$("recherche-signalements").addEventListener("keydown", (evenement) => {
  const premiere = $("cartes-signalements").querySelector(".carte-sig");
  if (evenement.key === "ArrowDown") {
    if (premiere) {
      evenement.preventDefault();
      premiere.focus();
    }
  } else if (evenement.key === "Enter") {
    evenement.preventDefault();
    if (premiere) ouvrirDepuisListe(+premiere.dataset.id);
  } else if (evenement.key === "Escape" && $("recherche-signalements").value) {
    evenement.preventDefault();
    $("recherche-signalements").value = "";
    afficherResultatsRecherche();
  }
});
$("resultats-signalements").addEventListener("mousedown", (evenement) => {
  const itemResultat = evenement.target.closest('[role="option"]');
  if (itemResultat) {
    evenement.preventDefault();
    ouvrirResultat(itemResultat);
  }
});
$("recherche-signalements").addEventListener("blur", () => setTimeout(fermerRecherche, 150));
// Raccourci : « / » place le curseur dans la barre de recherche (hors saisie en cours)
document.addEventListener("keydown", (evenement) => {
  if (evenement.key !== "/" || evenement.ctrlKey || evenement.metaKey || evenement.altKey) return;
  const cible = evenement.target,
    saisie = cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName));
  if (saisie || $("barre-recherche").hidden || etatSaisie.vue !== "accueil") return;
  evenement.preventDefault();
  $("recherche-signalements").focus();
});

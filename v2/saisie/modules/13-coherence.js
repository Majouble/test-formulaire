/* PRISME — widget de saisie, module 13/34 : Cohérence des dossiers.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lignesIncoherentes, afficherCoherence, appliquerConditions, fusionnerAvecVersionRecente, auteurDe,
     seulementModifies, formatValeur.
   Utilise :
     01 configuration : NATURE.
     02 utilitaires : colonnesEtab.
     03 variantes : refId, statut.
     04 date-faits : dateFr.
     05 etat : colonneDe, etabDe, etatSaisie, valeurLigne.
     06 grist : enFile.
     10 champs : egal, estVide, typeBase, valeurOuNull.
     11 pieces-jointes : piecesJointes.
     12 conditions-formules : afficherDiagnostic, conditionRemplie.
     19 tableaux : lireTableauJson, syntheseTableau.
     21 tableaux-enregistrement : controleursTableau. */
/* ---------- Cohérence des dossiers ---------- */
function lignesIncoherentes() {
  const colonneDossier = colonneDe("Dossier"),
    colonneEtablissement = colonneDe("Etablissement");
  if (!colonneDossier || !colonneEtablissement) return [];
  const parId = new Map(etatSaisie.enregistrements.map((ligne) => [ligne.id, ligne]));
  return etatSaisie.enregistrements
    .filter((ligne) => {
      const idDossier = refId(ligne[colonneDossier]);
      if (!idDossier || idDossier === ligne.id) return false;
      const init = parId.get(idDossier);
      return init && refId(init[colonneEtablissement]) !== refId(ligne[colonneEtablissement]);
    })
    .map((ligne) => ({ ligne: ligne, dossier: parId.get(refId(ligne[colonneDossier])) }));
}
function afficherCoherence() {
  if (!$("coherence-dossiers").open) return;
  const nomEtab = (id) => (etabDe(id) || {})[colonnesEtab.nom] || `n° ${id}`;
  const liste = lignesIncoherentes();
  $("coherence-lignes").innerHTML = liste.length
    ? liste
        .map(
          ({
            ligne,
            dossier,
          }) => `<tr><td>${ligne.id}</td><td>${esc(nomEtab(refId(valeurLigne(ligne, "Etablissement"))))}</td>
        <td>n° ${dossier.id}</td><td>${esc(nomEtab(refId(valeurLigne(dossier, "Etablissement"))))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="ok">Aucune incohérence : chaque version appartient au dossier de son établissement.</td></tr>`;
  $("btn-reparer").hidden = !liste.length;
  $("btn-reparer").textContent = `Réparer ${liste.length > 1 ? "ces " + liste.length + " lignes" : "cette ligne"}`;
}
$("coherence-dossiers").addEventListener("toggle", afficherCoherence);
$("btn-reparer").addEventListener("click", () =>
  enFile(async () => {
    const liste = lignesIncoherentes();
    if (!liste.length) return;
    if (
      !confirm(
        `Faire de ${liste.length > 1 ? "ces " + liste.length + " lignes des dossiers" : "cette ligne un dossier"} à part entière ?`,
      )
    )
      return;
    const maj = liste.map(({ ligne }) => {
      const fields = { [colonneDe("Dossier")]: ligne.id };
      if (colonneDe("Nature")) fields[colonneDe("Nature")] = NATURE.initial;
      return { id: ligne.id, fields };
    });
    try {
      await grist.getTable().update(maj);
      statut("statut-coherence", `${maj.length} ligne(s) réparée(s).`, "ok");
    } catch (erreur) {
      statut("statut-coherence", `Échec : ${erreur.message || erreur}`, "err");
    }
  }),
);

// Affiche ou masque les questions conditionnelles. Plusieurs passes, pour qu'une question
// conditionnée par une autre question elle-même conditionnelle suive correctement.
function appliquerConditions(prefix, questions) {
  const aCondition = questions.filter((question) => question.condition);
  if (!aCondition.length) {
    controleursTableau(prefix).forEach((controleur) => controleur.ajuster());
    return;
  }
  for (let passe = 0; passe < 3; passe++) {
    let bouge = false;
    for (const question of aCondition) {
      const bloc = document.querySelector(`[data-champ="${prefix}-${question.colId}"]`);
      if (!bloc || bloc.dataset.masqueAcces === "1") continue; // masquage par règle d'accès prioritaire
      const montrer = conditionRemplie(prefix, questions, question.condition);
      if (bloc.hidden === !montrer) continue;
      bloc.hidden = !montrer;
      bouge = true;
    }
    if (!bouge) break;
  }
  controleursTableau(prefix).forEach((controleur) => controleur.ajuster());
  if (prefix === "q") afficherDiagnostic();
}

// Ne garde que les champs dont la valeur diffère de la ligne de référence
// Une version est arrivée depuis l'ouverture du formulaire : on garde les réponses que l'agent a changées,
// et pour les autres celles de la version la plus récente (l'apport du collègue n'est pas effacé).
function fusionnerAvecVersionRecente(valeurs) {
  const resultat = { valeurs: {}, conflits: [], recuperes: [] };
  if (!etatSaisie.versionAffichee || !etatSaisie.derniere || etatSaisie.versionAffichee.id === etatSaisie.derniere.id)
    return resultat;
  const definitions = [...etatSaisie.champsVersion, ...etatSaisie.defsQuestions],
    definitionDe = (identifiantColonne) =>
      definitions.find((definition) => definition.colId === identifiantColonne) || { type: "Any" };
  const pareil = (identifiantColonne, ancienneValeur, nouvelleValeur) =>
    egal(
      valeurOuNull(definitionDe(identifiantColonne), ancienneValeur),
      valeurOuNull(definitionDe(identifiantColonne), nouvelleValeur),
    );
  for (const [identifiantColonne, valeur] of Object.entries(valeurs)) {
    const avant = etatSaisie.versionAffichee[identifiantColonne],
      recent = etatSaisie.derniere[identifiantColonne];
    const moi = !pareil(identifiantColonne, valeur, avant),
      lui = !pareil(identifiantColonne, recent, avant);
    if (!moi && lui) {
      resultat.valeurs[identifiantColonne] = recent;
      resultat.recuperes.push(definitionDe(identifiantColonne).libelle || identifiantColonne);
    } else if (moi && lui && !pareil(identifiantColonne, valeur, recent))
      resultat.conflits.push(definitionDe(identifiantColonne).libelle || identifiantColonne);
  }
  return resultat;
}
const auteurDe = (ligne) => {
  const auteur = ligne && colonneDe("Auteur") ? valeurLigne(ligne, "Auteur") : "";
  return auteur ? ` (par ${auteur})` : "";
};
function seulementModifies(definitions, valeurs, ligne) {
  const resultat = {};
  for (const [identifiantColonne, valeur] of Object.entries(valeurs)) {
    const definitionColonne = definitions.find((definition) => definition.colId === identifiantColonne) || {
      type: "Any",
    };
    if (
      !egal(
        valeurOuNull(definitionColonne, valeur),
        valeurOuNull(definitionColonne, ligne ? ligne[identifiantColonne] : null),
      )
    )
      resultat[identifiantColonne] = valeur;
  }
  return resultat;
}

function formatValeur(definition, valeur) {
  if (estVide(definition, valeur)) return "—";
  if (definition.tableau) return syntheseTableau(definition._sousDefs || [], lireTableauJson(valeur), true);
  const typeColonne = typeBase(definition.type);
  if (typeColonne === "Bool") return valeur ? "Oui" : "Non";
  if (typeColonne === "Date" || typeColonne === "DateTime") return dateFr(valeur, definition);
  if (typeColonne === "Numeric" || typeColonne === "Int")
    return typeof valeur === "number" ? valeur.toLocaleString("fr-FR") : String(valeur);
  if (typeColonne === "Ref") return (definition._labels && definition._labels.get(valeur)) || `n° ${valeur}`;
  if (typeColonne === "Attachments") return piecesJointes.texte(valeur);
  if (Array.isArray(valeur) && valeur[0] === "L") {
    const elementsListe = valeur.slice(1);
    return (
      typeColonne === "RefList"
        ? elementsListe.map(
            (numeroReference) =>
              (definition._labels && definition._labels.get(numeroReference)) || `n° ${numeroReference}`,
          )
        : elementsListe
    ).join(", ");
  }
  const texte = String(valeur);
  return texte.length > 160 ? texte.slice(0, 157) + "…" : texte;
}

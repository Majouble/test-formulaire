/* PRISME — widget de saisie, module 23/34 : Couleur du formulaire selon une réponse.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : COULEURS_NOMMEES, hexVersRvb, versHex, teinteClaire, couleurNommee, nombreRegle, lireRegleCouleur,
     construireReglesCouleur, cacheLibelles, libellesDemandes, libelleRef, textesValeur, valeursEnCours, couleurDe,
     valeurLisible, couleurLigne, bandeCouleur, majCouleur.
   Utilise :
     03 variantes : lisible.
     04 date-faits : dateFr, lireDateFaits, secondes.
     05 etat : colonneDe, etatSaisie.
     06 grist : enFile, sansGuillemets.
     09 dossier : lireQualificationInitiale, listeQualif.
     10 champs : lireUnChamp, optionsReference, typeBase.
     12 conditions-formules : normaliser.
     18 liste-dossiers : majListeDossiers.
     24 filtres-navigation : derniereDe.
   Modifie etatSaisie : reglesCouleur. */
/* ---------- Couleur du formulaire selon une réponse ----------
   Repère [couleur] dans la description d'une colonne (qualification, question, ou toute autre colonne) :
   le formulaire prend la couleur du choix sélectionné, telle que définie dans Grist (couleur de fond du choix).
   [couleur Blocage=rouge, Intrusion=#e4794a] impose les couleurs (utile pour une case à cocher : [couleur Oui=rouge]).
   Plusieurs colonnes marquées : la qualification d'abord, puis les questions dans l'ordre du formulaire.
   Plusieurs valeurs cochées : la première dans l'ordre des choix de la colonne (placez les plus graves en tête). */
const COULEURS_NOMMEES = {
  rouge: "#ce0500",
  orange: "#e4794a",
  jaune: "#f5c400",
  vert: "#18753c",
  bleu: "#000091",
  violet: "#6a1b9a",
  rose: "#e18b9f",
  gris: "#777777",
  noir: "#161616",
  marron: "#8a4b00",
  brun: "#8a4b00",
  turquoise: "#009081",
};
function hexVersRvb(codeHex) {
  const correspondanceCode = String(codeHex || "")
    .trim()
    .match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!correspondanceCode) return null;
  const hexLong =
    correspondanceCode[1].length === 3
      ? [...correspondanceCode[1]].map((caractere) => caractere + caractere).join("")
      : correspondanceCode[1];
  return [0, 2, 4].map((i) => parseInt(hexLong.slice(i, i + 2), 16));
}
const versHex = (composantes) =>
  "#" + composantes.map((composante) => Math.round(composante).toString(16).padStart(2, "0")).join("");
function teinteClaire(codeHex, part) {
  // mélange avec du blanc : part = proportion de la couleur
  const composantes = hexVersRvb(codeHex);
  return composantes ? versHex(composantes.map((composante) => composante * part + 255 * (1 - part))) : null;
}
function couleurNommee(texte) {
  const texteCouleur = sansGuillemets(texte);
  if (COULEURS_NOMMEES[normaliser(texteCouleur)]) return COULEURS_NOMMEES[normaliser(texteCouleur)];
  const composantes = hexVersRvb(texteCouleur);
  return composantes ? versHex(composantes) : null;
}
/* Règles d'un repère [couleur …], dans l'ordre où elles sont écrites (la première qui s'applique l'emporte) :
     Blocage=rouge          valeur exacte
     >50=rouge, >=10=orange comparaison (nombres ; pour une date : >0 = date renseignée, ou >2026-09-01, <01/10/2026)
     renseigné=rouge        n'importe quelle valeur (aussi : rempli, non vide, *)
     vide=gris              aucune valeur */
function nombreRegle(texte) {
  const texteNettoye = String(texte).trim();
  let correspondance;
  if ((correspondance = texteNettoye.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
    return Date.UTC(+correspondance[1], correspondance[2] - 1, +correspondance[3]) / 1000;
  if ((correspondance = texteNettoye.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)))
    return Date.UTC(+correspondance[3], correspondance[2] - 1, +correspondance[1]) / 1000;
  const nombre = parseFloat(texteNettoye.replace(/\s/g, "").replace(",", "."));
  return isNaN(nombre) ? null : nombre;
}
function lireRegleCouleur(description) {
  const correspondanceRepere = String(description || "").match(/\[\s*couleurs?\b([^\]]*)\]/i);
  if (!correspondanceRepere) return null;
  const regles = [];
  // séparateur « , » ou « ; » — sauf la virgule décimale d'un seuil (« >2,5=rouge »)
  for (const regleBrute of correspondanceRepere[1].split(/\s*;\s*|\s*,\s*(?!\d+\s*[=:])/)) {
    let k = regleBrute.lastIndexOf("=");
    if (k < 0) k = regleBrute.lastIndexOf(":");
    if (k <= 0) continue;
    const couleur = couleurNommee(regleBrute.slice(k + 1));
    if (!couleur) continue;
    const brut = sansGuillemets(regleBrute.slice(0, k)),
      cle = normaliser(brut);
    let correspondanceComparaison;
    if (
      (correspondanceComparaison = brut.match(/^(>=|<=|!=|≠|≥|≤|>|<)\s*(.+)$/)) &&
      nombreRegle(correspondanceComparaison[2]) != null
    )
      regles.push({
        type: "cmp",
        op: { "≠": "!=", "≥": ">=", "≤": "<=" }[correspondanceComparaison[1]] || correspondanceComparaison[1],
        n: nombreRegle(correspondanceComparaison[2]),
        couleur,
      });
    else if (/^(renseigne|renseignee|rempli|remplie|non vide|n est pas vide|\*)$/.test(cle))
      regles.push({ type: "rempli", couleur });
    else if (/^(est )?vide$/.test(cle)) regles.push({ type: "vide", couleur });
    else regles.push({ type: "egal", valeur: cle, couleur });
  }
  return { regles };
}
function construireReglesCouleur(alertes) {
  etatSaisie.reglesCouleur = [];
  const vus = new Set();
  const ajouter = (definitionColonne, genre) => {
    if (!definitionColonne || vus.has(definitionColonne.colId)) return;
    const reglesLues = lireRegleCouleur(definitionColonne.description);
    if (!reglesLues) return;
    vus.add(definitionColonne.colId);
    etatSaisie.reglesCouleur.push({ def: definitionColonne, genre, regles: reglesLues.regles });
    const couleursGrist = Object.values((definitionColonne.opts && definitionColonne.opts.choiceOptions) || {}).some(
      (optionChoix) => optionChoix && hexVersRvb(optionChoix.fillColor),
    );
    if (!reglesLues.regles.length && !couleursGrist)
      alertes.push(
        `La colonne « ${definitionColonne.libelle || definitionColonne.colId} » porte le repère [couleur], mais ses choix n'ont pas de couleur dans Grist : ` +
          `donnez une couleur de fond à ses choix, ou indiquez-les dans le repère, par exemple [couleur Blocage=rouge, Tentative=orange].`,
      );
  };
  ajouter(etatSaisie.metaSig[colonneDe("Qualification")], "qualification");
  etatSaisie.defsQuestions.forEach((definitionColonne) => ajouter(definitionColonne, "question"));
  Object.values(etatSaisie.metaSig).forEach((definitionColonne) => ajouter(definitionColonne, "colonne"));
}
// Libellés des colonnes Référence (lus une fois, à la demande)
const cacheLibelles = new Map(),
  libellesDemandes = new Set();
function libelleRef(definitionColonne, id) {
  if (definitionColonne._labels && definitionColonne._labels.has(id)) return definitionColonne._labels.get(id);
  const libellesColonne = cacheLibelles.get(definitionColonne.colId);
  if (libellesColonne) return libellesColonne.get(id) || `n° ${id}`;
  if (!libellesDemandes.has(definitionColonne.colId) && /^Ref(List)?:/.test(definitionColonne.type || "")) {
    libellesDemandes.add(definitionColonne.colId);
    optionsReference({ ...definitionColonne })
      .then((options) => {
        cacheLibelles.set(definitionColonne.colId, new Map(options.map((option) => [option.id, option.libelle])));
        enFile(async () => {
          majListeDossiers();
          majCouleur();
        });
      })
      .catch(() => {});
  }
  return `n° ${id}`;
}
// Valeur Grist -> textes affichés (une liste, pour les choix multiples)
function textesValeur(definitionColonne, valeur) {
  if (valeur == null || valeur === "" || !lisible(valeur)) return [];
  const typeDeBase = typeBase(definitionColonne.type);
  if (typeDeBase === "Bool") return [valeur ? "Oui" : "Non"];
  if (typeDeBase === "Date" || typeDeBase === "DateTime") {
    const secondesValeur = secondes(valeur);
    return secondesValeur == null ? [] : [String(secondesValeur)];
  }
  if (Array.isArray(valeur)) {
    if (valeur[0] === "L")
      return valeur
        .slice(1)
        .map((identifiant) =>
          typeDeBase === "RefList" ? libelleRef(definitionColonne, identifiant) : String(identifiant),
        );
    if (valeur[0] === "R") return valeur[2] ? [libelleRef(definitionColonne, valeur[2])] : [];
    return [];
  }
  if (typeDeBase === "Ref") return valeur ? [libelleRef(definitionColonne, valeur)] : [];
  return [String(valeur)];
}
function valeursEnCours(regleCouleur) {
  if (regleCouleur.genre === "qualification") return listeQualif(lireQualificationInitiale()).filter(Boolean);
  if (regleCouleur.def.colId === colonneDe("Date_faits") && !$("bloc-date-faits").hidden) {
    const secondesDateFaits = lireDateFaits();
    return secondesDateFaits == null ? [] : [String(secondesDateFaits)];
  }
  const enregistrementReference = etatSaisie.derniere || etatSaisie.initiale;
  if (regleCouleur.genre === "question" && !regleCouleur.def.formule) {
    const bloc = document.querySelector(`[data-champ="q-${regleCouleur.def.colId}"]`);
    if (!bloc || bloc.hidden) return [];
    return textesValeur(regleCouleur.def, lireUnChamp("q", regleCouleur.def));
  }
  return textesValeur(
    regleCouleur.def,
    enregistrementReference ? enregistrementReference[regleCouleur.def.colId] : null,
  );
}
function couleurDe(regleCouleur, textes) {
  const ordre = (regleCouleur.def.opts && regleCouleur.def.opts.choices) || [];
  const rang = (texte) => {
    const i = ordre.indexOf(texte);
    return i < 0 ? 1e9 : i;
  };
  const tries = [...textes].sort((a, b) => rang(a) - rang(b));
  const resultatCouleur = (fond, valeur) =>
    hexVersRvb(fond) ? { fond: versHex(hexVersRvb(fond)), valeur: valeur, def: regleCouleur.def } : null;
  if (regleCouleur.regles.length) {
    if (!textes.length) {
      const regleVide = regleCouleur.regles.find((regle) => regle.type === "vide");
      return regleVide ? resultatCouleur(regleVide.couleur, null) : null;
    }
    for (const regle of regleCouleur.regles)
      for (const texte of tries) {
        let regleApplicable = false;
        if (regle.type === "egal") regleApplicable = normaliser(texte) === regle.valeur;
        else if (regle.type === "rempli") regleApplicable = true;
        else if (regle.type === "cmp") {
          const nombre = parseFloat(String(texte).replace(",", "."));
          regleApplicable =
            !isNaN(nombre) &&
            (regle.op === ">"
              ? nombre > regle.n
              : regle.op === ">="
                ? nombre >= regle.n
                : regle.op === "<"
                  ? nombre < regle.n
                  : regle.op === "<="
                    ? nombre <= regle.n
                    : nombre !== regle.n);
        }
        if (regleApplicable) return resultatCouleur(regle.couleur, texte);
      }
    return null;
  }
  for (const texte of tries) {
    const couleurTrouvee = resultatCouleur(
      (((regleCouleur.def.opts && regleCouleur.def.opts.choiceOptions) || {})[texte] || {}).fillColor,
      texte,
    );
    if (couleurTrouvee) return couleurTrouvee;
  }
  return null;
}
// Valeur montrée dans l'étiquette de couleur (date lisible, nombre à la française)
function valeurLisible(definitionColonne, valeur) {
  if (valeur == null) return "(vide)";
  const typeDeBase = typeBase(definitionColonne.type);
  if (typeDeBase === "Date" || typeDeBase === "DateTime")
    return dateFr(Number(valeur), { ...definitionColonne, type: definitionColonne.type || "Date" });
  if ((typeDeBase === "Numeric" || typeDeBase === "Int") && !isNaN(parseFloat(valeur)))
    return parseFloat(valeur).toLocaleString("fr-FR");
  return valeur;
}
function couleurLigne(dossier) {
  if (!etatSaisie.reglesCouleur.length) return null;
  const der = derniereDe(dossier);
  for (const regleCouleur of etatSaisie.reglesCouleur) {
    const couleurTrouvee = couleurDe(regleCouleur, textesValeur(regleCouleur.def, der[regleCouleur.def.colId]));
    if (couleurTrouvee) return couleurTrouvee;
  }
  return null;
}
const bandeCouleur = (dossier) => {
  const couleurTrouvee = couleurLigne(dossier);
  return couleurTrouvee ? ` style="box-shadow: inset 4px 0 0 ${couleurTrouvee.fond}"` : "";
};
function majCouleur() {
  let couleurActive = null;
  for (const regleCouleur of etatSaisie.reglesCouleur) {
    couleurActive = couleurDe(regleCouleur, valeursEnCours(regleCouleur));
    if (couleurActive) break;
  }
  const corps = document.body,
    legende = $("legende-teinte");
  corps.classList.toggle("teinte", !!couleurActive);
  if (couleurActive) {
    corps.style.setProperty("--teinte", couleurActive.fond);
    corps.style.setProperty("--fond", teinteClaire(couleurActive.fond, 0.09));
    corps.style.setProperty("--teinte-moyenne", teinteClaire(couleurActive.fond, 0.22));
    legende.textContent = `${couleurActive.def.libelle || couleurActive.def.colId} : ${valeurLisible(couleurActive.def, couleurActive.valeur)}`;
  } else ["--teinte", "--fond", "--teinte-moyenne"].forEach((propriete) => corps.style.removeProperty(propriete));
  legende.hidden = !couleurActive;
}

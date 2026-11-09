/* PRISME — widget de saisie, composants/tableaux-structure.js
   Composant : questions « tableau » (plusieurs lignes dans une question) ; structure, lecture, contrôle, classe
   Tableau.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lireRepereTableau, tableaux, RESERVES_TABLEAU, nouvelIdLigne, videSous, lireTableauJson, Tableau,
     controleursTableau.
   Utilise :
     fondations/outils : normColonne, refId, sansGuillemets, texteComparable, typeBase.
     fondations/etat : etatSaisie.
     fondations/grist : colonnesDeTable, metaColonnes.
     composants/champs : horsBornes, lireUnChamp, optionsReference.
     composants/conditions-formules : evaluerConditionLigne, resoudreColonne.
     domaines/formulaire/regles : avecRegles.
     domaines/sites-esr/donnees : preparerRefSite.
     domaines/sites-esr/affichage : reprendreSitesAuto. */
// [tableau Blesses] ou [tableau Blesses lignes=Nb de blessés] (colonne nombre qui fixe le nombre de lignes)
function lireRepereTableau(descriptionColonne) {
  const correspondance = descriptionColonne.match(/\[\s*tableau\s+([^\]\s]+)(?:\s+lignes?\s*[=:]\s*([^\]]+?))?\s*\]/i);
  return correspondance
    ? { table: correspondance[1], lignes: correspondance[2] ? sansGuillemets(correspondance[2]) : null }
    : null;
}
const tableaux = {};
// identifiant du champ → contrôleur
const RESERVES_TABLEAU = ["id", "manualSort", "Ligne_id", "Ordre", "Version", "Mouvement"];
const nouvelIdLigne = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const videSous = (valeur) => valeur == null || valeur === "" || (Array.isArray(valeur) && !valeur.length);
function lireTableauJson(texteJson) {
  if (!texteJson || typeof texteJson !== "string") return [];
  try {
    const lignes = JSON.parse(texteJson);
    return Array.isArray(lignes) ? lignes.filter((ligne) => ligne && typeof ligne === "object") : [];
  } catch (_) {
    return [];
  }
}
class Tableau {
  constructor(definition, prefix, conteneur, surChangement) {
    Object.assign(this, {
      def: definition,
      prefix,
      el: conteneur,
      surChangement,
      id: `${prefix}-${definition.colId}`,
      lignes: [],
      sousDefs: [],
      pret: false,
      erreur: "",
      confLisible: true,
      montrerErreurs: false,
    });
    this.ecouter();
    this.promesse = this.preparer();
  }
  async preparer() {
    const tid = this.def.tableau.table;
    let colonnesTable = null;
    try {
      colonnesTable = await colonnesDeTable(tid);
    } catch (erreur) {
      console.warn("PRISME saisie : table de la question « tableau » illisible", erreur);
    }
    if (!colonnesTable) {
      this.erreur = `Table « ${tid} » introuvable : vérifiez le repère [tableau ${tid}] dans la description de la colonne « ${this.def.libelle} ».`;
      this.dessiner();
      return;
    }
    this.table = tid;
    this.colDossier =
      (
        colonnesTable.find((colonne) => colonne.colId === "Dossier") ||
        colonnesTable.find((colonne) => colonne.type === `Ref:${etatSaisie.tableId}` && colonne.colId !== "Version") ||
        {}
      ).colId || null;
    this.colLigne = colonnesTable.some((colonne) => colonne.colId === "Ligne_id") ? "Ligne_id" : null;
    this.colOrdre = colonnesTable.some((colonne) => colonne.colId === "Ordre") ? "Ordre" : null;
    // historique : une copie des lignes par version (colonne Version vers la table des signalements)
    this.colVersion = colonnesTable.some(
      (colonne) => colonne.colId === "Version" && colonne.type === `Ref:${etatSaisie.tableId}`,
    )
      ? "Version"
      : null;
    this.colMouvement =
      this.colVersion && colonnesTable.some((colonne) => colonne.colId === "Mouvement") ? "Mouvement" : null;
    this.sousDefs = colonnesTable
      .filter(
        (colonne) =>
          !colonne.formule &&
          !RESERVES_TABLEAU.includes(colonne.colId) &&
          colonne.colId !== this.colDossier &&
          !colonne.colId.startsWith("gristHelper"),
      )
      .map(avecRegles)
      .filter((sousDefinition) => !sousDefinition.masque); // [masqué] : colonne absente du formulaire (sa valeur dans la table est conservée)
    // [ordre N] : les champs numérotés d'abord, dans cet ordre, puis les autres dans l'ordre des colonnes de Grist
    this.ordonne = this.sousDefs.some((sousDefinition) => sousDefinition.ordre != null);
    if (this.ordonne)
      this.sousDefs = this.sousDefs
        .map((sousDefinition, i) => [sousDefinition, i])
        .sort((a, b) => (a[0].ordre ?? 1e9) - (b[0].ordre ?? 1e9) || a[1] - b[1])
        .map(([sousDefinition]) => sousDefinition);
    for (const sousDefinition of this.sousDefs)
      if (["Ref", "RefList"].includes(typeBase(sousDefinition.type))) {
        try {
          sousDefinition._options = await optionsReference({ ...sousDefinition });
        } catch (_) {
          sousDefinition._options = [];
        }
      }
    // tableau des sites : colonne du site (référence au référentiel des sites, ou identifiant texte), nom hors
    // référentiel, qualification du site ; historique d'autres questions (anciens formulaires) pour la reprise
    const reglageSites = this.def.tableau && this.def.tableau.sites,
      colonneSiExiste = (identifiantColonne) =>
        identifiantColonne && colonnesTable.some((colonne) => colonne.colId === identifiantColonne)
          ? identifiantColonne
          : null;
    /* colonne renommée par Grist d'après son libellé (Site_libre → Site_hors_referentiel, Qualification →
 Qualification_du_site : tables créées par les versions 2.14.0 à 2.14.2) : retrouvée par son type et son nom */
    const parNom = (motif, motifType) =>
      (
        colonnesTable.find(
          (colonne) =>
            !RESERVES_TABLEAU.includes(colonne.colId) &&
            motifType.test(colonne.type || "") &&
            motif.test(normColonne(`${colonne.colId} ${colonne.libelle || ""}`)),
        ) || {}
      ).colId || null;
    const sSite = reglageSites && (colonneSiExiste(reglageSites.site) || parNom(/(^|_)site/, /^Ref:/)),
      sLibre =
        reglageSites && reglageSites.libre
          ? colonneSiExiste(reglageSites.libre) || parNom(/libre|hors_referentiel/, /^Text/)
          : null; // « — » dans l'administration : pas de nom libre
    const sQualif = reglageSites && (colonneSiExiste(reglageSites.qualif) || parNom(/qualif/, /^Choice/));
    this.sites =
      reglageSites && (sSite || sLibre)
        ? {
            site: sSite,
            libre: sLibre,
            qualif: sQualif,
            avecRas: reglageSites.avecRas !== false, // reprise du dernier état des sites : "auto" (ancien réglage true), "bouton" (à la demande), "non" (par défaut)
            reprise:
              reglageSites.reprise === true || reglageSites.reprise === "auto"
                ? "auto"
                : reglageSites.reprise === "bouton"
                  ? "bouton"
                  : "non",
            historique: Array.isArray(reglageSites.historique)
              ? reglageSites.historique.filter((repere) => repere && repere.colonne)
              : [],
            alias: reglageSites.alias || "Sites_correspondances",
          }
        : null;
    this.alias = new Map();
    this.aliasParSite = new Map();
    // colonnes qui désignent un site du référentiel (table des sites reliée aux établissements) : sites de l'établissement
    // du formulaire seulement, champ de recherche (nom, mots-clés, commune) au lieu d'un menu de tous les sites
    for (const sousDefinition of this.sousDefs)
      if (typeBase(sousDefinition.type) === "Ref") await preparerRefSite(sousDefinition);
    if (this.sites && this.sites.site) {
      // tableau des sites : une autre colonne de site (créée en double) est écartée du formulaire
      const enDouble = this.sousDefs.filter(
        (sousDefinition) => sousDefinition._siteEtab && sousDefinition.colId !== this.sites.site,
      );
      if (enDouble.length) {
        this.sousDefs = this.sousDefs.filter((sousDefinition) => !enDouble.includes(sousDefinition));
        this.doublons = enDouble.map((sousDefinition) =>
          sousDefinition.libelle && sousDefinition.libelle !== sousDefinition.colId
            ? `${sousDefinition.libelle} (${sousDefinition.colId})`
            : sousDefinition.colId,
        );
      }
    }
    if (this.sites) {
      // correspondances validées : libellé saisi (par établissement) → site du référentiel
      try {
        const metaAlias = await metaColonnes(this.sites.alias);
        if (metaAlias && metaAlias.Libelle && metaAlias.Site) {
          const tableAlias = await Donnees.lire(this.sites.alias);
          tableAlias.id.forEach((id, i) => {
            if (/cart/i.test(String((tableAlias.Statut || [])[i] || ""))) return;
            const idSite = refId(tableAlias.Site[i]);
            if (!idSite) return;
            this.alias.set(
              `${refId((tableAlias.Etablissement || [])[i]) || 0}|${texteComparable(tableAlias.Libelle[i])}`,
              idSite,
            );
            if (!this.aliasParSite.has(idSite)) this.aliasParSite.set(idSite, []);
            this.aliasParSite.get(idSite).push(String(tableAlias.Libelle[i] ?? ""));
          });
        }
      } catch (_) {
        /* sans correspondances */
      }
    }
    const manque = [
      !this.colDossier && "Dossier (référence vers la table des signalements)",
      !this.colLigne && "Ligne_id (texte)",
    ].filter(Boolean);
    this.avertissement = manque.length
      ? `Table « ${tid} » : ajoutez la colonne ${manque.join(" et la colonne ")} pour qu'elle soit tenue à jour.`
      : "";
    if (this.doublons)
      this.avertissement = [
        this.avertissement,
        `Colonne${this.doublons.length > 1 ? "s" : ""} « ${this.doublons.join(" », « ")} » de la table « ${tid} » écartée${this.doublons.length > 1 ? "s" : ""} du formulaire : elle désigne aussi un site, en double avec « ${(this.sousDefs.find((sousDefinition) => sousDefinition.colId === this.sites.site) || {}).libelle || this.sites.site} » (voir l'administration des formulaires).`,
      ]
        .filter(Boolean)
        .join(" ");
    this.autos = this.sousDefs.filter(
      (sousDefinition) => sousDefinition.auto && typeBase(sousDefinition.type) === "Text",
    );
    // site du référentiel et nom libre réunis en un seul champ (le nom libre seulement si le tableau des sites a sa colonne)
    this.combo = !!(
      this.sites &&
      this.sites.site &&
      this.sites.libre &&
      this.sousDefs.some((sousDefinition) => sousDefinition.colId === this.sites.site && sousDefinition._siteEtab)
    );
    this.def._sousDefs = this.sousDefs;
    this.pret = true;
    this.dessiner();
    if (this.sites) setTimeout(reprendreSitesAuto, 0);
  }
  // ----- nombre de lignes piloté par une colonne nombre : lignes= du repère, sinon colonne de la condition [si …]
  colonneNombre() {
    const referenceColonne =
      (this.def.tableau && this.def.tableau.lignes) || (this.def.condition && this.def.condition.ref);
    if (!referenceColonne) return null;
    const questions =
      this.prefix === "q" ? etatSaisie.defsQuestions : this.prefix === "vd" ? etatSaisie.defsDep : etatSaisie.defsAca;
    const colonneCible = resoudreColonne(referenceColonne, questions);
    return colonneCible && ["Numeric", "Int"].includes(typeBase(colonneCible.def.type)) ? colonneCible : null;
  }
  nombreAttendu() {
    const colonneCible = this.colonneNombre();
    if (!colonneCible) return null;
    let valeur = null;
    if (colonneCible.genre === "question" && !colonneCible.def.formule) {
      const bloc = document.querySelector(`[data-champ="${this.prefix}-${colonneCible.def.colId}"]`);
      valeur = bloc && !bloc.hidden ? lireUnChamp(this.prefix, colonneCible.def) : null;
    } else {
      const ligneVersion = etatSaisie.derniere || etatSaisie.initiale;
      valeur = ligneVersion ? ligneVersion[colonneCible.def.colId] : null;
    }
    return typeof valeur === "number" && valeur > 0 ? Math.min(200, Math.floor(valeur)) : 0;
  }
  // Ajoute des lignes vides jusqu'au nombre indiqué ; en cas de baisse, ne retire que des lignes vides
  ajuster() {
    if (!this.pret) return;
    const nombre = this.nombreAttendu();
    if (nombre == null || nombre === this.dernierN) return;
    this.dernierN = nombre;
    let change = false;
    while (this.lignes.length < nombre) {
      this.lignes.push({ _id: nouvelIdLigne(), valeurs: {} });
      change = true;
    }
    while (this.lignes.length > nombre && this.ligneVide(this.lignes[this.lignes.length - 1])) {
      this.lignes.pop();
      change = true;
    }
    if (change) this.dessiner();
    else this.majLignes();
  }
  // ----- état
  visible(ligne, sousDefinition) {
    return !sousDefinition.condition || evaluerConditionLigne(sousDefinition.condition, this.sousDefs, ligne.valeurs);
  }
  ligneVide(ligne) {
    return this.sousDefs.every(
      (sousDefinition) => !this.visible(ligne, sousDefinition) || videSous(ligne.valeurs[sousDefinition.colId]),
    );
  }
  lignesValides() {
    return this.lignes.filter((ligne) => !this.ligneVide(ligne));
  }
  valeur() {
    // JSON enregistré dans la colonne de la version (sans champs confidentiels ni champs masqués)
    const lignesJson = this.lignesValides().map((ligne) => {
      const ligneJson = { _id: ligne._id };
      for (const sousDefinition of this.sousDefs)
        if (
          !sousDefinition.confidentiel &&
          this.visible(ligne, sousDefinition) &&
          !videSous(ligne.valeurs[sousDefinition.colId])
        )
          ligneJson[sousDefinition.colId] = ligne.valeurs[sousDefinition.colId];
      return ligneJson;
    });
    return lignesJson.length ? JSON.stringify(lignesJson) : "";
  }
  async charger(json, dossier) {
    await this.promesse;
    const valeursConfidentielles = await this.lireConfidentiels(dossier);
    this.lignes = lireTableauJson(json).map((ligneJson) => {
      const { _id, ...valeurs } = ligneJson;
      const id = _id || nouvelIdLigne();
      return {
        _id: id,
        valeurs: { ...valeurs, ...(valeursConfidentielles.get(id) || {}) },
        ...(this.sites && dossier ? { _fixe: true } : {}),
      };
    });
    this.lignes.forEach((ligne) => this.initAuto(ligne));
    this.montrerErreurs = false;
    this.confModifie = false;
    this.dernierN = undefined;
    this.supprimes = [];
    this.dessiner();
  }
  async lireConfidentiels(dossier) {
    const valeursParLigne = new Map();
    const confs = this.sousDefs.filter((sousDefinition) => sousDefinition.confidentiel);
    this.confLisible = true;
    if (!dossier || !confs.length || !this.colDossier || !this.colLigne) return valeursParLigne;
    try {
      const tableGrist = await Donnees.lire(this.table);
      if (confs.some((sousDefinition) => !(sousDefinition.colId in tableGrist))) this.confLisible = false;
      // table historisée : les lignes de la version la plus récente qui en a (sinon les lignes sans version)
      const duDossier = tableGrist.id
        .map((_, i) => i)
        .filter((i) => refId(tableGrist[this.colDossier][i]) === dossier || tableGrist[this.colDossier][i] === dossier);
      const vDe = (i) =>
        this.colVersion && tableGrist[this.colVersion] ? refId(tableGrist[this.colVersion][i]) || 0 : 0;
      const vMax = Math.max(0, ...duDossier.map(vDe));
      tableGrist.id.forEach((id, i) => {
        if (refId(tableGrist[this.colDossier][i]) !== dossier && tableGrist[this.colDossier][i] !== dossier) return;
        if (
          vDe(i) !== vMax ||
          (this.colMouvement && tableGrist[this.colMouvement] && tableGrist[this.colMouvement][i] === "Retrait")
        )
          return;
        const valeursLigne = {};
        for (const sousDefinition of confs) {
          const valeurBrute = tableGrist[sousDefinition.colId] ? tableGrist[sousDefinition.colId][i] : undefined;
          if (valeurBrute === undefined || (Array.isArray(valeurBrute) && valeurBrute[0] === "C")) {
            this.confLisible = false;
            continue;
          }
          valeursLigne[sousDefinition.colId] = this.depuisGrist(sousDefinition, valeurBrute);
        }
        valeursParLigne.set(tableGrist[this.colLigne][i], valeursLigne);
      });
    } catch (_) {
      this.confLisible = false;
    }
    return valeursParLigne;
  }
  depuisGrist(sousDefinition, valeurGrist) {
    const typeColonne = typeBase(sousDefinition.type);
    if (Array.isArray(valeurGrist) && valeurGrist[0] === "L") return valeurGrist.slice(1);
    if (typeColonne === "Ref") return valeurGrist || null;
    return valeurGrist === "" ? null : valeurGrist;
  }
  versGrist(sousDefinition, valeur) {
    const typeColonne = typeBase(sousDefinition.type);
    if (videSous(valeur)) return typeColonne === "Bool" ? false : typeColonne === "Ref" ? 0 : null;
    if (typeColonne === "ChoiceList" || typeColonne === "RefList") return ["L", ...valeur];
    if (typeColonne === "Ref") return +valeur || 0;
    return valeur;
  }
  // ----- contrôles
  verifier() {
    // messages des lignes incomplètes (sans rien marquer)
    const messages = [];
    this.lignes.forEach((ligne, k) => {
      if (this.ligneVide(ligne)) return;
      const problemes = this.sousDefs
        .filter((sousDefinition) => this.visible(ligne, sousDefinition) && this.erreurChamp(ligne, sousDefinition))
        .map((sousDefinition) => sousDefinition.libelle || sousDefinition.colId);
      if (problemes.length) messages.push(`ligne ${k + 1} : ${problemes.join(", ")}`);
    });
    return messages;
  }
  erreurChamp(ligne, sousDefinition) {
    const valeur = ligne.valeurs[sousDefinition.colId];
    // site obligatoire : un nom hors référentiel (colonne du nom libre) le renseigne aussi
    const libre = sousDefinition._siteEtab && this.colLibre(sousDefinition),
      parLibre = libre && !videSous(ligne.valeurs[libre]);
    if (
      sousDefinition.obligatoire &&
      videSous(valeur) &&
      !parLibre &&
      !(sousDefinition.confidentiel && !this.confLisible)
    )
      return "À préciser";
    if (typeof valeur === "number" && horsBornes(sousDefinition, valeur))
      return `Valeur ${horsBornes(sousDefinition, valeur)} attendue`;
    return "";
  }
  marquer() {
    this.montrerErreurs = true;
    this.majLignes();
    const ligneIncomplete = this.el.querySelector(".ligne-rep.incomplete");
    if (ligneIncomplete) {
      ligneIncomplete.scrollIntoView({ block: "center" });
      const champIncomplet = ligneIncomplete.querySelector(
        "[aria-invalid] input, [aria-invalid], input, select, textarea",
      );
      if (champIncomplet) champIncomplet.focus();
    }
  }
}
const controleursTableau = (prefix) =>
  Object.values(tableaux).filter((controleur) => controleur.prefix === prefix && document.body.contains(controleur.el));

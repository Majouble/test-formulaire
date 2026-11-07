/* PRISME — widget de saisie, module 20/34 : Questions « tableau », suite : affichage des lignes, saisie, sites proposés, écoute des événements.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Utilise :
     03 variantes : refId.
     04 date-faits : secondes, valeurLocale.
     05 etat : etatSaisie.
     10 champs : typeBase.
     12 conditions-formules : texteComparable.
     13 coherence : appliquerConditions.
     14 etablissement : nomEtabId.
     16 description : etablissementDuFormulaire, majApercuAuto, majDescriptionAuto, sitesDeLEtablissement.
     19 tableaux : Tableau, nouvelIdLigne, pastillesPossibles, syntheseTableau, texteAutoLigne, videSous,
       zoneSousChamp.
     26 sites-esr : majQualifDeduite, reprendreEtatSites, retourNormale.
   Modifie etatSaisie : modifie, qualifTouchee. */
/* Méthodes de la classe Tableau (module précédent) qui dessinent les lignes et réagissent à la saisie. */
Object.assign(Tableau.prototype, {
  // ----- rendu
  champHtml(definitionChamp, k, ligne) {
    const nom = `${this.id}-${k}-${definitionChamp.colId}`,
      valeur = ligne.valeurs[definitionChamp.colId],
      typeDeBase = typeBase(definitionChamp.type);
    const choixPossibles = (definitionChamp.opts && definitionChamp.opts.choices) || [],
      couleurs = (definitionChamp.opts && definitionChamp.opts.choiceOptions) || {};
    const coul = (choix) => {
      const couleurChoix = couleurs[choix] || {};
      return couleurChoix.fillColor
        ? `--c:${couleurChoix.textColor || "#161616"};--c-bg:${couleurChoix.fillColor}`
        : "--c:#fff;--c-bg:var(--bleu)";
    };
    const titre =
      `<span class="etiq" id="${nom}-etiq">${esc(definitionChamp.libelle || definitionChamp.colId)}${definitionChamp.obligatoire ? ' <span class="req">*</span>' : ""}` +
      `${definitionChamp.confidentiel ? ' <span class="confid" title="Donnée confidentielle : enregistrée uniquement dans la table ' + esc(this.table) + '">confidentiel</span>' : ""}` +
      `${definitionChamp.auto && typeBase(definitionChamp.type) === "Text" ? ' <span class="badge-auto" title="Rempli à partir des autres champs de la ligne ; vous pouvez le modifier">auto</span>' : ""}</span>`;
    let ctl;
    const masque =
      definitionChamp.confidentiel && !this.confLisible
        ? ` placeholder="Valeur masquée par vos droits : laissez vide pour la conserver"`
        : "";
    if (
      (typeDeBase === "Choice" &&
        choixPossibles.length &&
        definitionChamp.forcer !== "liste" &&
        (definitionChamp.forcer === "boutons" || choixPossibles.length <= 5)) ||
      typeDeBase === "Bool"
    ) {
      const options =
        typeDeBase === "Bool"
          ? [
              ["true", "Oui"],
              ["false", "Non"],
            ]
          : choixPossibles.map((choix) => [choix, choix]);
      const actuel = typeDeBase === "Bool" ? (valeur == null ? null : String(!!valeur)) : valeur;
      ctl = `<span class="seg" role="radiogroup" aria-labelledby="${nom}-etiq">${options
        .map(
          ([valeurOption, libelleOption]) =>
            `<label style="${typeDeBase === "Bool" ? "--c:#fff;--c-bg:var(--bleu)" : coul(valeurOption)}"><input type="radio" name="${nom}" value="${esc(valeurOption)}"${valeurOption === actuel ? " checked" : ""}><span>${esc(libelleOption)}</span></label>`,
        )
        .join("")}</span>`;
    } else if (typeDeBase === "Choice" && choixPossibles.length && pastillesPossibles(definitionChamp)) {
      // choix unique au-delà de 5 options : pastilles (un clic sur la pastille choisie la décoche) ; [liste] pour un menu déroulant
      ctl = `<div class="puces unique" role="radiogroup" aria-labelledby="${nom}-etiq">${choixPossibles.map((choix) => `<label class="puce${choix === valeur ? " on" : ""}" style="${coul(choix)}"><input type="radio" name="${nom}" value="${esc(choix)}"${choix === valeur ? " checked" : ""}>${esc(choix)}</label>`).join("")}</div>`;
    } else if (typeDeBase === "Choice" && choixPossibles.length) {
      ctl = `<select aria-labelledby="${nom}-etiq"><option value="">Choisir…</option>${choixPossibles.map((choix) => `<option${choix === valeur ? " selected" : ""}>${esc(choix)}</option>`).join("")}</select>`;
    } else if (typeDeBase === "ChoiceList" && choixPossibles.length && pastillesPossibles(definitionChamp)) {
      const valeursSelectionnees = Array.isArray(valeur) ? valeur : [];
      ctl = `<div class="puces" role="group" aria-labelledby="${nom}-etiq">${choixPossibles.map((choix) => `<label class="puce${valeursSelectionnees.includes(choix) ? " on" : ""}" style="${coul(choix)}"><input type="checkbox" value="${esc(choix)}"${valeursSelectionnees.includes(choix) ? " checked" : ""}>${esc(choix)}</label>`).join("")}</div>`;
    } else if ((typeDeBase === "ChoiceList" && choixPossibles.length) || typeDeBase === "RefList") {
      const valeursSelectionnees = Array.isArray(valeur) ? valeur.map(String) : [];
      const options =
        typeDeBase === "RefList"
          ? (definitionChamp._options || []).map((option) => [String(option.id), option.libelle])
          : choixPossibles.map((choix) => [choix, choix]);
      const resume = options
        .filter(([valeurOption]) => valeursSelectionnees.includes(valeurOption))
        .map(([, libelleOption]) => libelleOption)
        .join(", ");
      ctl =
        `<details class="multi"><summary aria-labelledby="${nom}-etiq"><span class="resume">${esc(resume) || "Choisir…"}</span></summary>` +
        `<div class="multi-liste">${options.map(([valeurOption, libelleOption]) => `<label><input type="checkbox" value="${esc(valeurOption)}"${valeursSelectionnees.includes(valeurOption) ? " checked" : ""}> ${esc(libelleOption)}</label>`).join("")}</div></details>`;
    } else if (typeDeBase === "Numeric" || typeDeBase === "Int") {
      ctl = `<input type="number" class="nb" step="${typeDeBase === "Int" ? 1 : "any"}"${definitionChamp.min != null ? ` min="${definitionChamp.min}"` : ""}${definitionChamp.max != null ? ` max="${definitionChamp.max}"` : ""} value="${valeur ?? ""}" aria-labelledby="${nom}-etiq">`;
    } else if (typeDeBase === "Date" || typeDeBase === "DateTime") {
      const secondesValeur = secondes(valeur);
      const texteDate =
        secondesValeur == null
          ? ""
          : typeDeBase === "Date"
            ? new Date(secondesValeur * 1000).toISOString().slice(0, 10)
            : valeurLocale(new Date(secondesValeur * 1000), true);
      ctl = `<input type="${typeDeBase === "Date" ? "date" : "datetime-local"}" value="${texteDate}" aria-labelledby="${nom}-etiq">`;
    } else if (typeDeBase === "Ref" && definitionChamp._siteEtab) {
      // ancien nom resté en texte dans une colonne référence (référence non résolue) : affiché, à rattacher
      const libre = this.colLibre(definitionChamp),
        id = refId(valeur),
        ancien = !id && typeof valeur === "string" && valeur.trim() ? valeur.trim() : "";
      const libelleAffiche = id
        ? this.libelleSite(definitionChamp, id)
        : ancien || String((libre && ligne.valeurs[libre]) ?? "");
      // site du dossier relié au référentiel : il ne se remplace pas (sauf « Corriger le site ») ; un nom libre ou ancien se corrige
      const fige =
        ligne._fixe && id && !ligne._deverrouille
          ? ` disabled title="Site du dossier : il ne se remplace pas ; passez-le en RAS s'il est revenu à la normale, ou « Corriger le site » en cas d'erreur"`
          : "";
      ctl = `<div class="site-combo"><input type="text" class="site-txt" value="${esc(libelleAffiche)}"${id ? ` data-id="${id}"` : ""} autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-labelledby="${nom}-etiq" placeholder="${libre ? "Nom du site ou mot-clé (un nom absent de la liste est accepté)" : "Nom du site, mot-clé ou commune"}"${fige}>
        <span class="site-etat">${!id && libelleAffiche ? (ancien ? "ancien nom, absent du référentiel : choisissez le site dans la liste" : "hors référentiel") : ""}</span><ul class="suggestions site-sugg" role="listbox" hidden></ul></div>`;
    } else if (typeDeBase === "Ref") {
      let options = definitionChamp._options || [];
      if (definitionChamp._siteEtab) {
        const etablissement = etablissementDuFormulaire();
        if (etablissement) options = sitesDeLEtablissement(definitionChamp, etablissement, options, +valeur);
      }
      const libSite = (site) =>
        definitionChamp._siteComp &&
        definitionChamp._siteComp.get(site.id) &&
        nomEtabId(definitionChamp._siteComp.get(site.id))
          ? `${site.libelle} — ${nomEtabId(definitionChamp._siteComp.get(site.id))}`
          : site.libelle;
      ctl = `<select aria-labelledby="${nom}-etiq"><option value="">${definitionChamp._siteEtab && !options.length ? "Aucun site de cet établissement au référentiel" : "Choisir…"}</option>${options.map((site) => `<option value="${site.id}"${+valeur === site.id ? " selected" : ""}>${esc(libSite(site))}</option>`).join("")}</select>`;
    } else if (definitionChamp.court) {
      ctl = `<input type="text" value="${esc(valeur ?? "")}" aria-labelledby="${nom}-etiq"${masque}>`;
    } else {
      ctl = `<textarea rows="2" aria-labelledby="${nom}-etiq"${masque}>${esc(valeur ?? "")}</textarea>`;
    }
    // tableau des sites : le site d'une ligne du dossier (ou reprise) ne change pas ; seul son état change
    if (
      this.sites &&
      ligne._fixe &&
      !ligne._deverrouille &&
      [this.sites.site, this.sites.libre].includes(definitionChamp.colId) &&
      !videSous(valeur) &&
      !(definitionChamp._siteEtab && typeDeBase === "Ref")
    )
      ctl = ctl.replace(
        /^<(select|input|textarea)/,
        '<$1 disabled title="Site du dossier : il ne se remplace pas ; passez-le en RAS s\'il est revenu à la normale"',
      );
    const regen =
      definitionChamp.auto && typeBase(definitionChamp.type) === "Text"
        ? `<button type="button" class="lien-texte regen" data-action="regenerer" data-sous="${esc(definitionChamp.colId)}"${(ligne._touche || {})[definitionChamp.colId] ? "" : " hidden"}>↻ Revenir au texte automatique</button>`
        : "";
    const aide = (definitionChamp.aide ? `<span class="aide-sous">${esc(definitionChamp.aide)}</span>` : "") + regen;
    return `<div class="sous-champ zone-${zoneSousChamp(definitionChamp)}${definitionChamp._siteEtab ? " zone-site" : ""}${definitionChamp.condition ? " cond-ligne" : ""}" data-sous="${esc(definitionChamp.colId)}">${titre}${ctl}${aide}<span class="msg-ligne" hidden></span></div>`;
  },
  // tableau des sites : un site du dossier (ou repris du dernier état connu) ne se retire pas, il passe en RAS
  actionsLigne(ligne, k) {
    const fixe = this.sites && ligne._fixe;
    const corriger =
      fixe && !ligne._deverrouille && this.sites.site && refId(ligne.valeurs[this.sites.site])
        ? `<button type="button" class="icone" data-action="corriger-site" title="Corriger le site de cette ligne (erreur de saisie)" aria-label="Corriger le site de la ligne ${k + 1}">✎</button>`
        : "";
    // site repris dans un nouveau signalement : peut être laissé de côté (pas d'information nouvelle), son dernier état reste connu
    const retirer =
      fixe && ligne._repris && !etatSaisie.dossierId
        ? `<button type="button" class="icone" data-action="retirer-repris" title="Ne pas faire figurer ce site dans ce signalement : il ne sera plus proposé ensuite (seuls les sites du dernier dossier sont repris)" aria-label="Retirer le site de la ligne ${k + 1} de ce signalement">✕</button>`
        : "";
    // site d'un dossier saisi à tort : supprimé de toutes les versions du dossier à l'enregistrement (2.50)
    const supprimer =
      fixe && etatSaisie.dossierId && !ligne._repris
        ? `<button type="button" class="icone" data-action="supprimer-site" title="Supprimer ce site du dossier (saisi à tort) : il disparaît de toutes les étapes du dossier" aria-label="Supprimer le site de la ligne ${k + 1} du dossier">🗑</button>`
        : "";
    return `<span class="actions-ligne"><button type="button" class="icone" data-action="dupliquer" title="Dupliquer cette ligne" aria-label="Dupliquer la ligne ${k + 1}">⧉</button>${corriger}${
      fixe
        ? `<button type="button" class="icone icone-texte" data-action="ras-site" title="Site revenu à la normale : il reste dans le dossier, en ${esc(this.valeurRas() || "RAS")}" aria-label="Passer le site de la ligne ${k + 1} en ${esc(this.valeurRas() || "RAS")}">${esc(this.valeurRas() || "RAS")}</button>${retirer}${supprimer}`
        : `<button type="button" class="icone" data-action="supprimer" title="Supprimer cette ligne" aria-label="Supprimer la ligne ${k + 1}">✕</button>`
    }</span>`;
  },
  valeurRas() {
    const definitionQualification =
      this.sites && this.sites.qualif && this.sousDefs.find((definition) => definition.colId === this.sites.qualif);
    if (!definitionQualification) return null;
    const choixPossibles = (definitionQualification.opts && definitionQualification.opts.choices) || [],
      ensembleRetourNormal = retourNormale();
    return (
      choixPossibles.find((choix) => ensembleRetourNormal.has(String(choix).trim().toUpperCase())) ||
      [...ensembleRetourNormal][0] ||
      "RAS"
    );
  },
  ligneHtml(ligne, k) {
    const actions = `${this.actionsLigne(ligne, k)}`;
    // Ordre imposé par [ordre N] : les champs se suivent dans cet ordre (les champs courts côte à côte)
    if (this.ordonne)
      return `<div class="ligne-rep ordonnee${ligne._repris ? " reprise" : ""}" data-k="${k}">${ligne._repris ? `<div class="repris" aria-live="polite">${this.texteRepris(ligne)}</div>` : ""}<div class="tete-ligne"><span class="num" aria-label="Ligne ${k + 1}">${k + 1}</span>
      <div class="champs-ordonnes">${this.sousDefs.map((definitionChamp) => this.champHtml(definitionChamp, k, ligne)).join("")}</div>${actions}</div></div>`;
    const parZone = (zone) =>
      this.sousDefs
        .filter((definitionChamp) => zoneSousChamp(definitionChamp) === zone)
        .map((definitionChamp) => this.champHtml(definitionChamp, k, ligne))
        .join("");
    const textes = parZone("texte");
    return `<div class="ligne-rep${ligne._repris ? " reprise" : ""}" data-k="${k}">${ligne._repris ? `<div class="repris" aria-live="polite">${this.texteRepris(ligne)}</div>` : ""}
      <div class="tete-ligne"><span class="num" aria-label="Ligne ${k + 1}">${k + 1}</span>${parZone("tete")}
        ${this.actionsLigne(ligne, k)}</div>
      ${parZone("large")}${textes ? `<div class="textes-ligne">${textes}</div>` : ""}</div>`;
  },
  // site repris du dernier état connu : mention, et confirmation ou modification par l'agent
  texteRepris(ligne) {
    const reprise = ligne._repris,
      quand = reprise.quand
        ? Outils.dates
            .dateHeure(reprise.quand, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
            .replace(" ", " ")
        : "";
    const etat =
      reprise.etat === "confirme"
        ? `<span class="repris-ok">confirmé</span>`
        : reprise.etat === "modifie"
          ? `<span class="repris-ok">modifié</span>`
          : reprise.etat === "normal"
            ? `<span class="repris-ok">revenu à la normale</span>`
            : `<button type="button" class="lien-texte" data-action="confirmer-site">Confirmer cet état</button>`;
    return `Dernier état : <strong>${esc(reprise.qualif || "sans qualification")}</strong>${quand ? ` (${esc(quand)})` : ""} · ${etat}`;
  },
  dessiner() {
    if (this.erreur) {
      this.el.innerHTML = `<p class="bandeau">${esc(this.erreur)}</p>`;
      return;
    }
    if (!this.pret) {
      this.el.innerHTML = `<p class="note">Chargement…</p>`;
      return;
    }
    if (!this.sousDefs.length) {
      this.el.innerHTML = `<p class="bandeau">La table « ${esc(this.table)} » n'a aucune colonne à saisir (colonnes non formules autres que Dossier, Ligne_id et Ordre).</p>`;
      return;
    }
    this.el.innerHTML =
      (this.avertissement && !etatSaisie.modeEtab ? `<p class="bandeau">${esc(this.avertissement)}</p>` : "") +
      (this.noteAuto && this.lignes.some((ligne) => ligne._repris) ? `<p class="note">${esc(this.noteAuto)}</p>` : "") +
      (this.retires && this.retires.length
        ? `<p class="note retires">${this.retires.length} site${this.retires.length > 1 ? "s" : ""} laissé${this.retires.length > 1 ? "s" : ""} de côté pour ce signalement (${this.retires.map((retire) => esc(this.nomLigne(retire.l))).join(", ")})  : ${this.retires.length > 1 ? "ils ne seront plus proposés" : "il ne sera plus proposé"} ensuite. <button type="button" class="lien-texte" data-action="remettre-retires">Remettre</button></p>`
        : "") +
      (this.supprimes && this.supprimes.length
        ? `<p class="note retires supprimes">${this.supprimes.length > 1 ? `${this.supprimes.length} sites seront supprimés` : "1 site sera supprimé"} du dossier à l'enregistrement, dans toutes ses étapes (${this.supprimes.map((supprime) => esc(this.nomLigne(supprime.l))).join(", ")}). <button type="button" class="lien-texte" data-action="annuler-supprimes">Annuler la suppression</button></p>`
        : "") +
      (this.offreReprise &&
      etatSaisie.etabCourant &&
      this.offreReprise.etab === etatSaisie.etabCourant.id &&
      !this.lignes.some((ligne) => ligne._repris)
        ? `<p class="note offre-reprise">${this.offreReprise.n} site${this.offreReprise.n > 1 ? "s" : ""} dans le dernier signalement de cet établissement. <button type="button" class="secondaire petit" data-action="reprendre-sites">Reprendre leur dernier état</button></p>`
        : "") +
      `<div class="lignes-rep">${this.lignes.map((ligne, k) => this.ligneHtml(ligne, k)).join("") || `<p class="vide-tableau">Aucune ligne pour l'instant.</p>`}</div>
      <div class="pied-tableau"><span class="ajout-lignes"><button type="button" class="secondaire petit" data-action="ajouter">+ Ajouter</button>
        <input type="number" class="qte" min="1" max="50" value="1" aria-label="Nombre de lignes à ajouter"><span class="note-qte">ligne(s)</span></span>
        <span class="synthese" aria-live="polite"></span><span class="ecart" hidden></span></div>`;
    this.majLignes();
  },
  majLignes() {
    this.el.querySelectorAll(".ligne-rep").forEach((div) => {
      const ligne = this.lignes[+div.dataset.k];
      let incomplete = false;
      div.querySelectorAll(".sous-champ").forEach((blocChamp) => {
        const definitionChamp = this.sousDefs.find((definition) => definition.colId === blocChamp.dataset.sous);
        blocChamp.hidden =
          !this.visible(ligne, definitionChamp) || (this.combo && definitionChamp.colId === this.sites.libre); // nom libre : saisi dans le champ du site
        const message =
          this.montrerErreurs && !blocChamp.hidden && !this.ligneVide(ligne)
            ? this.erreurChamp(ligne, definitionChamp)
            : "";
        const zoneMessage = blocChamp.querySelector(".msg-ligne");
        zoneMessage.textContent = message;
        zoneMessage.hidden = !message;
        blocChamp.classList.toggle("en-erreur", !!message);
        if (message) incomplete = true;
      });
      div.classList.toggle("incomplete", incomplete);
      div.querySelectorAll(".regen").forEach((boutonRegenerer) => {
        boutonRegenerer.hidden = !(ligne._touche || {})[boutonRegenerer.dataset.sous];
      });
      const blocReprise = div.querySelector(".repris");
      if (blocReprise && ligne._repris) blocReprise.innerHTML = this.texteRepris(ligne);
    });
    const zoneSynthese = this.el.querySelector(".synthese");
    if (zoneSynthese) zoneSynthese.textContent = syntheseTableau(this.sousDefs, this.lignesValides(), false);
    const zoneEcart = this.el.querySelector(".ecart"),
      nombreAttendu = this.nombreAttendu();
    if (zoneEcart) {
      const k = this.lignesValides().length,
        nom = nombreAttendu != null ? this.colonneNombre().def.libelle || this.colonneNombre().def.colId : "";
      zoneEcart.hidden = !nombreAttendu || k === nombreAttendu;
      zoneEcart.textContent =
        k > nombreAttendu
          ? `${k} lignes remplies pour ${nombreAttendu} indiqué(s) dans « ${nom} » : vérifiez le nombre.`
          : `${k} ligne(s) remplie(s) sur ${nombreAttendu}`;
      zoneEcart.classList.toggle("alerte", k > nombreAttendu);
    }
  },
  lireControle(blocChamp, definitionChamp) {
    const typeDeBase = typeBase(definitionChamp.type);
    if (typeDeBase === "Bool") {
      const boutonRadio = blocChamp.querySelector("input:checked");
      return boutonRadio ? boutonRadio.value === "true" : null;
    }
    if (blocChamp.querySelector(".seg, .puces.unique")) {
      const boutonRadio = blocChamp.querySelector("input:checked");
      return boutonRadio ? boutonRadio.value : null;
    }
    if (typeDeBase === "ChoiceList" || typeDeBase === "RefList") {
      const valeursCochees = [...blocChamp.querySelectorAll('input[type="checkbox"]:checked')].map((caseCochee) =>
        typeDeBase === "RefList" ? +caseCochee.value : caseCochee.value,
      );
      return valeursCochees.length ? valeursCochees : null;
    }
    const controle = blocChamp.querySelector("select, input, textarea");
    if (!controle || controle.value === "") return null;
    if (typeDeBase === "Numeric" || typeDeBase === "Int")
      return typeDeBase === "Int" ? parseInt(controle.value, 10) : parseFloat(controle.value);
    if (typeDeBase === "Date") return Date.parse(controle.value + "T00:00:00Z") / 1000;
    if (typeDeBase === "DateTime") return Outils.dates.depuisChamp(controle.value) / 1000;
    if (typeDeBase === "Ref") return +controle.value;
    return typeDeBase === "Any" || typeDeBase === "Text" ? controle.value : controle.value;
  },
  /* Champs [auto] : un texte enregistré différent du texte calculé a été retouché par l'agent et n'est plus remplacé
     (jusqu'au clic sur « Revenir au texte automatique », ou s'il est vidé). */
  initAuto(ligne) {
    ligne._touche = {};
    for (const champAuto of this.autos || []) {
      const valeur = ligne.valeurs[champAuto.colId];
      ligne._touche[champAuto.colId] =
        !videSous(valeur) && String(valeur).trim() !== texteAutoLigne(this.def, ligne.valeurs).trim();
    }
  },
  majAutos(ligne, div, forcer) {
    for (const champAuto of this.autos || []) {
      if (!ligne._touche) ligne._touche = {};
      if (forcer === champAuto.colId) ligne._touche[champAuto.colId] = false;
      if (ligne._touche[champAuto.colId]) continue;
      const texteAuto = texteAutoLigne(this.def, ligne.valeurs);
      ligne.valeurs[champAuto.colId] = texteAuto || null;
      const champSaisie =
        div &&
        div.querySelector(
          `[data-sous="${CSS.escape(champAuto.colId)}"] textarea, [data-sous="${CSS.escape(champAuto.colId)}"] input`,
        );
      if (champSaisie && champSaisie !== document.activeElement) champSaisie.value = texteAuto;
      else if (champSaisie && forcer) champSaisie.value = texteAuto;
    }
  },
  changement(blocChamp) {
    const div = blocChamp.closest(".ligne-rep"),
      ligne = this.lignes[+div.dataset.k];
    const definitionChamp = this.sousDefs.find((definition) => definition.colId === blocChamp.dataset.sous);
    if (blocChamp.querySelector(".site-combo")) this.lireSite(blocChamp, ligne, definitionChamp);
    else ligne.valeurs[definitionChamp.colId] = this.lireControle(blocChamp, definitionChamp);
    if (ligne._repris && ligne._repris.etat !== "modifie") ligne._repris.etat = "modifie";
    if (definitionChamp.auto) {
      if (!ligne._touche) ligne._touche = {};
      ligne._touche[definitionChamp.colId] =
        !videSous(ligne.valeurs[definitionChamp.colId]) &&
        String(ligne.valeurs[definitionChamp.colId]).trim() !== texteAutoLigne(this.def, ligne.valeurs).trim();
    } else this.majAutos(ligne, div);
    if (definitionChamp.confidentiel) this.confModifie = true;
    blocChamp
      .querySelectorAll(".puce")
      .forEach((puce) => puce.classList.toggle("on", puce.querySelector("input").checked));
    const zoneResume = blocChamp.querySelector(".multi .resume");
    if (zoneResume)
      zoneResume.textContent =
        [...blocChamp.querySelectorAll(".multi-liste input:checked")]
          .map((caseCochee) => caseCochee.parentNode.textContent.trim())
          .join(", ") || "Choisir…";
    this.majLignes();
    this.signaler();
  },
  signaler() {
    if (this.surChangement) this.surChangement();
    if (this.prefix === "q") {
      appliquerConditions("q", etatSaisie.defsQuestions);
      majDescriptionAuto();
      majApercuAuto();
      if (this.sites) majQualifDeduite();
    }
  },
  // ----- champ du site : site du référentiel (nom, mots-clés, correspondances validées) ou nom libre
  colLibre(definitionChamp) {
    return this.combo && this.sites && definitionChamp.colId === this.sites.site ? this.sites.libre : null;
  },
  libelleSite(definitionChamp, id) {
    const siteTrouve = (definitionChamp._options || []).find((option) => option.id === id);
    return siteTrouve ? siteTrouve.libelle : "";
  },
  // nom du site d'une ligne (site du référentiel, ancien nom ou nom libre)
  nomLigne(ligne) {
    const colonnesSites = this.sites || {},
      valeurSite = colonnesSites.site ? ligne.valeurs[colonnesSites.site] : null,
      definitionSite =
        colonnesSites.site && this.sousDefs.find((definition) => definition.colId === colonnesSites.site),
      id = refId(valeurSite);
    return (
      (id && definitionSite
        ? this.libelleSite(definitionSite, id)
        : typeof valeurSite === "string"
          ? valeurSite.trim()
          : "") ||
      String((colonnesSites.libre && ligne.valeurs[colonnesSites.libre]) ?? "").trim() ||
      "site sans nom"
    );
  },
  sitesProposables(definitionChamp) {
    const etablissement = etablissementDuFormulaire();
    return definitionChamp._siteEtab && etablissement
      ? sitesDeLEtablissement(definitionChamp, etablissement, definitionChamp._options || [], 0)
      : definitionChamp._options || [];
  },
  // site désigné exactement par un texte : son nom, un de ses mots-clés, ou un libellé validé pour l'établissement
  siteExact(definitionChamp, texteSaisi) {
    const texteNormalise = texteComparable(texteSaisi);
    if (!texteNormalise) return 0;
    const sitesProposes = this.sitesProposables(definitionChamp),
      etablissement = etablissementDuFormulaire();
    const parNom = sitesProposes.find((site) => texteComparable(site.libelle) === texteNormalise);
    if (parNom) return parNom.id;
    const parMot = sitesProposes.find((site) =>
      String((definitionChamp._motsSite && definitionChamp._motsSite.get(site.id)) || "")
        .split(/\s*[|,;]\s*/)
        .some((motCle) => texteComparable(motCle) === texteNormalise),
    );
    if (parMot) return parMot.id;
    const identifiantAlias = this.alias.get(`${etablissement || 0}|${texteNormalise}`);
    return identifiantAlias && sitesProposes.some((site) => site.id === identifiantAlias) ? identifiantAlias : 0;
  },
  suggestionsSite(definitionChamp, texteSaisi) {
    const mots = texteComparable(texteSaisi).split(" ").filter(Boolean),
      resultats = [];
    for (const site of this.sitesProposables(definitionChamp)) {
      const nomN = texteComparable(site.libelle),
        cles = [
          ...String((definitionChamp._motsSite && definitionChamp._motsSite.get(site.id)) || "").split(/\s*[|,;]\s*/),
          ...(this.aliasParSite.get(site.id) || []),
        ].filter((cle) => cle && cle.trim());
      const commune = (definitionChamp._communeSite && definitionChamp._communeSite.get(site.id)) || "";
      const tout = `${nomN} ${cles.map(texteComparable).join(" ")} ${texteComparable(commune)}`;
      if (!mots.every((mot) => tout.includes(mot))) continue;
      const parNom = mots.every((mot) => nomN.includes(mot));
      // mots-clés et autres appellations du site (sans doublon ni le nom lui-même), ceux qui répondent à la saisie d'abord
      const vus = new Set([nomN]),
        autres = [];
      cles
        .map((cle) => cle.trim())
        .forEach((cle) => {
          const cleNormalisee = texteComparable(cle);
          if (cleNormalisee && !vus.has(cleNormalisee)) {
            vus.add(cleNormalisee);
            autres.push({
              x: cle,
              trouve: !parNom && mots.length > 0 && mots.some((mot) => cleNormalisee.includes(mot)),
            });
          }
        });
      autres.sort((a, b) => b.trouve - a.trouve);
      resultats.push({
        o: site,
        parNom,
        commune,
        comp:
          definitionChamp._siteComp && definitionChamp._siteComp.get(site.id)
            ? nomEtabId(definitionChamp._siteComp.get(site.id))
            : "",
        autres,
      });
    }
    return resultats.sort((a, b) => b.parNom - a.parNom).slice(0, 30);
  },
  montrerSites(inp) {
    const blocChamp = inp.closest(".sous-champ"),
      definitionChamp = this.sousDefs.find((definition) => definition.colId === blocChamp.dataset.sous),
      listeSuggestions = blocChamp.querySelector(".site-sugg");
    const texteSaisi = inp.value.trim(),
      resultats = this.suggestionsSite(definitionChamp, texteSaisi);
    const avecLibre = !!this.colLibre(definitionChamp),
      libre =
        avecLibre &&
        texteSaisi &&
        !resultats.some((resultat) => texteComparable(resultat.o.libelle) === texteComparable(texteSaisi)) &&
        !this.siteExact(definitionChamp, texteSaisi);
    // même présentation que la recherche d'établissement : nom, puis commune, composante, mot-clé retrouvé
    const MAX_AUTRES = 8;
    listeSuggestions.innerHTML =
      resultats
        .map(
          (resultat) =>
            `<li role="option" data-id="${resultat.o.id}"><div class="nom">${esc(resultat.o.libelle)}</div>${resultat.commune || resultat.comp ? `<div class="meta">${esc([resultat.commune, resultat.comp].filter(Boolean).join(" · "))}</div>` : ""}${
              resultat.autres.length
                ? `<div class="meta autres-noms" title="${esc(resultat.autres.map((autreNom) => autreNom.x).join(", "))}">Aussi : ${resultat.autres
                    .slice(0, MAX_AUTRES)
                    .map((autreNom) => (autreNom.trouve ? `<strong>${esc(autreNom.x)}</strong>` : esc(autreNom.x)))
                    .join(
                      ", ",
                    )}${resultat.autres.length > MAX_AUTRES ? `, … (+${resultat.autres.length - MAX_AUTRES})` : ""}</div>`
                : ""
            }</li>`,
        )
        .join("") +
      (libre
        ? `<li role="option" data-libre="1"><div class="nom">« ${esc(texteSaisi)} »</div><div class="meta">site hors référentiel</div></li>`
        : "") +
      (!resultats.length && !libre
        ? `<li class="etat" aria-disabled="true">${!etablissementDuFormulaire() ? "Choisissez d'abord l'établissement." : texteSaisi ? "Aucun site de cet établissement ne correspond." : "Aucun site de cet établissement au référentiel."}${avecLibre ? "" : " Complétez le référentiel des sites."}</li>`
        : "");
    listeSuggestions.hidden = !listeSuggestions.children.length;
    inp.setAttribute("aria-expanded", String(!listeSuggestions.hidden));
  },
  choisirSite(suggestion) {
    const blocChamp = suggestion.closest(".sous-champ"),
      inp = blocChamp.querySelector(".site-txt"),
      definitionChamp = this.sousDefs.find((definition) => definition.colId === blocChamp.dataset.sous);
    if (suggestion.dataset.id) {
      inp.value = this.libelleSite(definitionChamp, +suggestion.dataset.id);
      inp.dataset.id = suggestion.dataset.id;
    } else delete inp.dataset.id;
    blocChamp.querySelector(".site-sugg").hidden = true;
    inp.setAttribute("aria-expanded", "false");
    this.changement(blocChamp);
  },
  lireSite(blocChamp, ligne, definitionChamp) {
    const inp = blocChamp.querySelector(".site-txt"),
      texteSaisi = inp.value.trim();
    let id =
      inp.dataset.id && this.libelleSite(definitionChamp, +inp.dataset.id) === texteSaisi
        ? +inp.dataset.id
        : this.siteExact(definitionChamp, texteSaisi);
    const libre = this.colLibre(definitionChamp);
    ligne.valeurs[definitionChamp.colId] = id || null;
    if (libre) ligne.valeurs[libre] = id ? null : texteSaisi || null;
    const zoneEtat = blocChamp.querySelector(".site-etat");
    if (zoneEtat)
      zoneEtat.textContent =
        texteSaisi && !id
          ? libre
            ? "hors référentiel"
            : "absent du référentiel : choisissez un site dans la liste"
          : "";
  },
  // ligne d'une question d'un formulaire précédent (historique), vue avec les colonnes du tableau actuel
  vueHistorique(colonnesHistorique, ligneHistorique) {
    const colonnesSites = this.sites,
      valeursLigne = {};
    for (const [k, valeurColonne] of Object.entries(ligneHistorique))
      if (k !== "_id" && this.sousDefs.some((definition) => definition.colId === k)) valeursLigne[k] = valeurColonne;
    if (colonnesHistorique.libre && colonnesSites.libre)
      valeursLigne[colonnesSites.libre] = ligneHistorique[colonnesHistorique.libre];
    if (colonnesHistorique.site && colonnesSites.site)
      valeursLigne[colonnesSites.site] = ligneHistorique[colonnesHistorique.site];
    if (colonnesHistorique.qualif && colonnesSites.qualif)
      valeursLigne[colonnesSites.qualif] = ligneHistorique[colonnesHistorique.qualif];
    return valeursLigne;
  },
  // clé d'un site : son identifiant au référentiel, sinon le libellé saisi (rattaché par les correspondances validées)
  cleSite(etab, valeursLigne) {
    const colonnesSites = this.sites,
      id = colonnesSites.site
        ? refId(valeursLigne[colonnesSites.site]) ||
          (typeof valeursLigne[colonnesSites.site] === "number" ? valeursLigne[colonnesSites.site] : 0)
        : 0;
    if (id) return `s${id}`;
    // nom libre, sinon ancien nom resté en texte dans la colonne référence du site
    const libelleSaisi =
      (colonnesSites.libre ? String(valeursLigne[colonnesSites.libre] ?? "").trim() : "") ||
      (colonnesSites.site && typeof valeursLigne[colonnesSites.site] === "string"
        ? valeursLigne[colonnesSites.site].trim()
        : "");
    if (!libelleSaisi) return null;
    const identifiantAlias =
      this.alias.get(`${etab || 0}|${texteComparable(libelleSaisi)}`) ||
      this.alias.get(`0|${texteComparable(libelleSaisi)}`);
    return identifiantAlias ? `s${identifiantAlias}` : `t${texteComparable(libelleSaisi)}`;
  },
  ecouter() {
    const conteneur = this.el;
    // un bouton déjà choisi se désélectionne d'un second clic (champ facultatif)
    conteneur.addEventListener("pointerdown", (evenement) => {
      const lab = evenement.target.closest(".seg label, .puces.unique label");
      if (lab) lab.querySelector("input").dataset.etait = String(lab.querySelector("input").checked);
    });
    conteneur.addEventListener("click", (evenement) => this.surClic(evenement));
    // champ du site : suggestions au fil de la frappe, choix à la souris ou au clavier
    conteneur.addEventListener("focusin", (evenement) => {
      if (evenement.target.classList && evenement.target.classList.contains("site-txt"))
        this.montrerSites(evenement.target);
    });
    conteneur.addEventListener("focusout", (evenement) => {
      if (evenement.target.classList && evenement.target.classList.contains("site-txt"))
        setTimeout(() => {
          const listeSuggestions =
            evenement.target.closest(".site-combo") &&
            evenement.target.closest(".site-combo").querySelector(".site-sugg");
          if (listeSuggestions) listeSuggestions.hidden = true;
          evenement.target.setAttribute("aria-expanded", "false");
        }, 150);
    });
    conteneur.addEventListener("mousedown", (evenement) => {
      const suggestion = evenement.target.closest(".site-sugg li[role=option]");
      if (suggestion) {
        evenement.preventDefault();
        this.choisirSite(suggestion);
      }
    });
    conteneur.addEventListener("keydown", (evenement) => this.surToucheSite(evenement));
    const surSaisie = (evenement) => {
      if (evenement.target.classList.contains("qte")) return;
      if (evenement.target.classList.contains("site-txt") && evenement.type === "input") {
        delete evenement.target.dataset.id;
        this.montrerSites(evenement.target);
      }
      const blocChamp = evenement.target.closest(".sous-champ");
      if (blocChamp) this.changement(blocChamp);
    };
    conteneur.addEventListener("input", surSaisie);
    conteneur.addEventListener("change", surSaisie);
    conteneur.addEventListener(
      "toggle",
      (evenement) => {
        // un seul menu déroulant ouvert à la fois
        if (evenement.target.matches && evenement.target.matches(".multi[open]"))
          conteneur.querySelectorAll(".multi[open]").forEach((menu) => {
            if (menu !== evenement.target) menu.open = false;
          });
      },
      true,
    );
  },
  // Clic dans la question : bouton déjà choisi qu'on désélectionne, ou bouton d'action (data-action)
  surClic(evenement) {
    const inp = evenement.target.closest('.seg input[type="radio"], .puces.unique input[type="radio"]');
    if (inp && inp.dataset.etait === "true") {
      inp.checked = false;
      inp.dataset.etait = "false";
      this.changement(inp.closest(".sous-champ"));
      return;
    }
    const bouton = evenement.target.closest("button[data-action]");
    if (!bouton) return;
    const action = bouton.dataset.action;
    if (this.actionSurQuestion(action)) return;
    const k = +bouton.closest(".ligne-rep").dataset.k,
      ligne = this.lignes[k];
    this.actionSurLigne(action, bouton, k, ligne);
  },
  // Actions qui portent sur toute la question ; renvoie true si l'action a été traitée
  actionSurQuestion(action) {
    if (action === "reprendre-sites") {
      // reprise à la demande (reprise automatique désactivée) : les lignes déjà saisies sont gardées après les sites repris
      const deja = this.lignes.filter((ligne) => !this.ligneVide(ligne)),
        etablissementId = this.offreReprise.etab;
      const nombreSitesRepris = reprendreEtatSites(this, etablissementId),
        cles = new Set(this.lignes.map((ligne) => this.cleSite(etablissementId, ligne.valeurs)).filter(Boolean));
      this.lignes.push(
        ...deja.filter((ligne) => {
          const k = this.cleSite(etablissementId, ligne.valeurs);
          return !k || !cles.has(k);
        }),
      );
      this.offreReprise = null;
      this.noteAuto = nombreSitesRepris
        ? `${nombreSitesRepris} site${nombreSitesRepris > 1 ? "s" : ""} du dernier signalement de cet établissement, dans leur dernier état : confirmez ou modifiez ceux qui ne sont pas revenus à la normale, ajoutez les nouveaux.`
        : "";
      this.dessiner();
      this.signaler();
      etatSaisie.qualifTouchee = false;
      majQualifDeduite();
      etatSaisie.modifie = true;
      return true;
    }
    if (action === "ajouter") {
      const nombreLignes = Math.max(1, Math.min(50, parseInt(this.el.querySelector(".qte").value, 10) || 1));
      for (let i = 0; i < nombreLignes; i++) this.lignes.push({ _id: nouvelIdLigne(), valeurs: {} });
      this.dessiner();
      this.signaler();
      const lignes = this.el.querySelectorAll(".ligne-rep");
      const premiere = lignes[lignes.length - nombreLignes];
      if (premiere) {
        const premierChamp = premiere.querySelector("input, select, textarea, summary");
        if (premierChamp) premierChamp.focus();
      }
      return true;
    }
    if (action === "annuler-supprimes") {
      for (const suppression of (this.supprimes || []).sort((a, b) => a.k - b.k))
        this.lignes.splice(Math.min(suppression.k, this.lignes.length), 0, suppression.l);
      this.supprimes = [];
      this.dessiner();
      this.signaler();
      return true;
    }
    if (action === "remettre-retires") {
      // sites laissés de côté : remis à leur place d'origine
      for (const retrait of (this.retires || []).sort((a, b) => a.k - b.k))
        this.lignes.splice(Math.min(retrait.k, this.lignes.length), 0, retrait.l);
      this.retires = [];
      this.dessiner();
      this.signaler();
      return true;
    }
    return false;
  },
  // Actions sur une ligne : b, le bouton ; k, la position de la ligne ; l, la ligne
  actionSurLigne(action, bouton, k, ligne) {
    if (action === "supprimer-site") {
      const nom = this.nomLigne(ligne);
      if (
        !confirm(
          `Supprimer « ${nom} » de ce dossier ?\n\nÀ réserver à un site saisi à tort : à l'enregistrement, ses réponses sont effacées de toutes les étapes du dossier et il ne sera plus proposé. Un site revenu à la normale se passe en RAS.`,
        )
      )
        return;
      const etab = etatSaisie.etabCourant ? etatSaisie.etabCourant.id : 0;
      (this.supprimes = this.supprimes || []).push({
        k,
        l: ligne,
        _id: ligne._id,
        cle: this.cleSite(etab, ligne.valeurs),
      });
      this.lignes.splice(k, 1);
      this.dessiner();
      this.signaler();
      return;
    }
    if (action === "retirer-repris") {
      (this.retires = this.retires || []).push({ k, l: ligne });
      this.lignes.splice(k, 1);
      this.dessiner();
      this.signaler();
      return;
    }
    if (action === "corriger-site") {
      if (
        !confirm(
          "Corriger le site de cette ligne ?\n\nÀ réserver à une erreur de saisie : un site revenu à la normale reste dans le dossier, passez-le en RAS.",
        )
      )
        return;
      ligne._deverrouille = true;
      this.dessiner();
      const blocLigne = this.el.querySelectorAll(".ligne-rep")[k];
      const inp = blocLigne && blocLigne.querySelector(".site-txt");
      if (inp) inp.focus();
      return;
    }
    if (action === "confirmer-site") {
      if (ligne._repris) ligne._repris.etat = "confirme";
      this.majLignes();
      this.signaler();
      return;
    }
    if (action === "regenerer") {
      this.majAutos(ligne, bouton.closest(".ligne-rep"), bouton.dataset.sous);
      this.majLignes();
      this.signaler();
      const champSaisie = bouton.closest(".sous-champ").querySelector("textarea, input");
      if (champSaisie) champSaisie.focus();
      return;
    }
    if (action === "dupliquer") {
      const copie = {};
      for (const definition of this.sousDefs)
        if (!definition.confidentiel && !videSous(ligne.valeurs[definition.colId]))
          copie[definition.colId] = Array.isArray(ligne.valeurs[definition.colId])
            ? [...ligne.valeurs[definition.colId]]
            : ligne.valeurs[definition.colId];
      this.lignes.splice(k + 1, 0, { _id: nouvelIdLigne(), valeurs: copie, _touche: { ...(ligne._touche || {}) } });
    } else if (action === "ras-site" || (action === "supprimer" && this.sites && ligne._fixe)) {
      // un site ne se retire pas d'un dossier : il passe en RAS (retour à la normale)
      const definitionQualification = this.sousDefs.find((definition) => definition.colId === this.sites.qualif),
        ras = this.valeurRas();
      if (definitionQualification && ras)
        ligne.valeurs[definitionQualification.colId] =
          typeBase(definitionQualification.type) === "ChoiceList" ? [ras] : ras;
      if (ligne._repris) ligne._repris.etat = "modifie";
    } else if (action === "supprimer") {
      if (!this.ligneVide(ligne) && !confirm(`Supprimer la ligne ${k + 1} ?`)) return;
      this.lignes.splice(k, 1);
    }
    this.dessiner();
    this.signaler();
  },
  // Champ du site : flèches pour parcourir les suggestions, Entrée pour choisir, Échap pour fermer
  surToucheSite(evenement) {
    if (!evenement.target.classList || !evenement.target.classList.contains("site-txt")) return;
    const listeSuggestions = evenement.target.closest(".site-combo").querySelector(".site-sugg"),
      lis = [...listeSuggestions.querySelectorAll("li[role=option]")];
    const i = lis.findIndex((suggestion) => suggestion.getAttribute("aria-selected") === "true");
    if (evenement.key === "ArrowDown" || evenement.key === "ArrowUp") {
      evenement.preventDefault();
      if (listeSuggestions.hidden) this.montrerSites(evenement.target);
      const j = Math.max(0, Math.min(lis.length - 1, i + (evenement.key === "ArrowDown" ? 1 : -1)));
      lis.forEach((suggestion, k) => suggestion.setAttribute("aria-selected", String(k === j)));
      if (lis[j]) lis[j].scrollIntoView({ block: "nearest" });
    } else if (evenement.key === "Enter" && !listeSuggestions.hidden && i >= 0) {
      evenement.preventDefault();
      this.choisirSite(lis[i]);
    } else if (evenement.key === "Escape") {
      listeSuggestions.hidden = true;
    }
  },
});

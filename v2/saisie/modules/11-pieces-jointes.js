/* PRISME — widget de saisie, module 11/34 : Pièces jointes : photos et documents envoyés au document Grist.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Pièces jointes (colonne Grist de type Pièces jointes) ----------
   Photos (galerie ou appareil photo du téléphone) et documents, envoyés dès qu'ils sont choisis dans les pièces jointes du
   document Grist (API /attachments, jeton du widget) ; la cellule reçoit la liste de leurs numéros à l'enregistrement.
   Photos lourdes réduites avant l'envoi (2 048 px au plus, JPEG) : rapide sur réseau mobile. Une mise à jour garde les
   pièces de la version précédente (retirables pour cette version) ; « Reprendre » un signalement d'un jour précédent ne
   les reprend pas. Sans jeton (mode secours hors ligne…) : ajout indisponible, pièces déjà jointes listées. */
const piecesJointes = (() => {
  const etat = {},
    infos = new Map(); // champ → { ids, envois, msg, err } ; numéro → { nom, taille, image, empreinte }
  let lecture = null,
    metaLue = null;
  const ACCEPTE =
    "image/*,application/pdf,.pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt,.csv,.eml,.msg,.zip";
  const taille = (octets) =>
    octets == null
      ? ""
      : octets < 1024 * 1024
        ? `${Math.max(1, Math.round(octets / 1024))} Ko`
        : `${(octets / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  const etatDuChamp = (id) => etat[id] || (etat[id] = { ids: [], envois: 0, msg: "", err: false });
  // Jeton d'accès : jamais en lecture seule — Grist traiterait un propriétaire comme simple lecteur, que les règles
  // d'accès privent des signalements (« Cannot access attachment »). Il ne figure jamais dans la page : les pièces
  // sont lues par fetch puis affichées depuis la mémoire du navigateur.
  async function jeton() {
    if (!grist.docApi.getAccessToken) throw new Error("pièces jointes indisponibles ici");
    if (lecture && Date.now() - lecture.le < 60000) return lecture;
    const jetonAcces = await grist.docApi.getAccessToken({ readOnly: false });
    lecture = { ...jetonAcces, le: Date.now() };
    return jetonAcces;
  }
  // Établissement ouvert par son lien : Grist ne le reconnaît, pour un téléchargement, que si l'adresse porte les
  // paramètres de son lien (« Etab_=… »), repris de la colonne Lien de sa ligne (lisible par lui seul).
  function parametresLien() {
    if (typeof etatSaisie.modeEtab === "undefined" || !etatSaisie.modeEtab || !etatSaisie.etabs || !etatSaisie.etabs[0])
      return "";
    const lien = String(etatSaisie.etabs[0][colonnesEtab.lien] || "");
    return [...lien.matchAll(/[?&]([A-Za-z][A-Za-z0-9_]*_)=([^&#\s"'<>]+)/g)]
      .filter((parametre) => !/^aclAs/i.test(parametre[1]))
      .map((parametre) => `&${parametre[1]}=${parametre[2]}`)
      .join("");
  }
  // contenu d'une pièce (Blob), gardé en mémoire ; adresse locale (blob:) pour l'afficher ou l'ouvrir
  const contenus = new Map(),
    prets = new Map(); // numéro → Promise<{ url, type, nom }> ; contenus déjà lus
  function contenu(numero) {
    if (!contenus.has(numero))
      contenus.set(
        numero,
        (async () => {
          const jetonAcces = await jeton();
          const reponse = await fetch(
            `${jetonAcces.baseUrl}/attachments/${numero}/download?auth=${encodeURIComponent(jetonAcces.token)}${parametresLien()}`,
          );
          if (!reponse.ok) {
            let detailErreur = "";
            try {
              detailErreur = (await reponse.json()).error || "";
            } catch (_) {
              /* corps illisible */
            }
            throw new Error(
              reponse.status === 403
                ? `accès refusé par Grist${etatSaisie.modeEtab && !parametresLien() ? " (lien de l'établissement illisible : règles d'accès à réappliquer)" : ""}`
                : `${reponse.status}${detailErreur ? ` : ${detailErreur}` : ""}`,
            );
          }
          const blob = await reponse.blob();
          // nom d'origine (en-tête de Grist, s'il est lisible) : utile quand _grist_Attachments est fermée (lien d'établissement)
          let nom = "";
          try {
            const enTeteDisposition = reponse.headers.get("content-disposition") || "";
            const correspondance =
              /filename\*=UTF-8''([^;]+)/i.exec(enTeteDisposition) || /filename="?([^";]+)"?/i.exec(enTeteDisposition);
            nom = correspondance ? decodeURIComponent(correspondance[1]) : "";
          } catch (_) {
            nom = "";
          }
          const pieceLue = { url: URL.createObjectURL(blob), type: blob.type || "", nom };
          const infosPiece = infos.get(numero) || {};
          if (!infosPiece.nom || /^pièce \d+$/.test(infosPiece.nom) || infosPiece.image == null)
            infos.set(numero, {
              ...infosPiece,
              nom:
                infosPiece.nom && !/^pièce \d+$/.test(infosPiece.nom)
                  ? infosPiece.nom
                  : nom || infosPiece.nom || `pièce ${numero}`,
              image: infosPiece.image || /^image\//.test(pieceLue.type),
            });
          prets.set(numero, pieceLue);
          return pieceLue;
        })().catch((erreur) => {
          contenus.delete(numero);
          throw erreur;
        }),
      );
    return contenus.get(numero);
  }
  const affichableType = (typeContenu) => /^(image\/|application\/pdf|text\/plain)/i.test(typeContenu || "");
  async function ouvrir(numero, id) {
    const infosPiece = infos.get(numero) || {},
      nom = infosPiece.nom || `pièce ${numero}`,
      deja = prets.get(numero);
    // contenu déjà lu : ouverture immédiate (le navigateur l'accepte, le geste est encore « frais »)
    if (deja && affichableType(deja.type)) {
      if (window.open(deja.url, "_blank")) return;
    }
    const affichable = deja
      ? affichableType(deja.type)
      : infosPiece.image ||
        /\.(pdf|txt|jpe?g|png|gif|webp|heic)$/i.test(nom) ||
        !infosPiece.nom ||
        /^pièce \d+$/.test(nom);
    let fenetre = null;
    if (affichable && !deja) {
      try {
        fenetre = window.open("", "_blank");
      } catch (_) {
        fenetre = null;
      }
    } // ouverte tout de suite : sinon bloquée après l'attente
    try {
      const pieceLue = await contenu(numero);
      if (fenetre) {
        if (affichableType(pieceLue.type)) {
          fenetre.location.href = pieceLue.url;
          return;
        }
        try {
          fenetre.close();
        } catch (_) {
          /* déjà fermée */
        }
        fenetre = null;
      }
      const lienTelechargement = document.createElement("a");
      lienTelechargement.href = pieceLue.url;
      lienTelechargement.download = (infos.get(numero) || {}).nom || pieceLue.nom || nom;
      lienTelechargement.rel = "noopener";
      document.body.appendChild(lienTelechargement);
      lienTelechargement.click();
      lienTelechargement.remove();
    } catch (erreur) {
      if (fenetre)
        try {
          fenetre.close();
        } catch (_) {
          /* fenêtre déjà fermée */
        }
      const etatChamp = etatDuChamp(id);
      etatChamp.msg = `Ouverture de « ${nom} » impossible : ${erreur.message || erreur}.`;
      etatChamp.err = true;
      dessiner(id);
    }
  }
  // noms et tailles des pièces déjà jointes : table _grist_Attachments (lue une fois)
  async function lireMeta() {
    if (!metaLue)
      metaLue = Donnees.lire("_grist_Attachments")
        .then((tableJointes) => {
          tableJointes.id.forEach((id, i) => {
            if (!infos.has(id))
              infos.set(id, {
                nom: String((tableJointes.fileName || [])[i] || `pièce ${id}`),
                taille: (tableJointes.fileSize || [])[i],
                image:
                  !!(tableJointes.imageHeight || [])[i] ||
                  /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(String((tableJointes.fileName || [])[i] || "")),
              });
          });
        })
        .catch(() => {});
    return metaLue;
  }
  // photo lourde : réduite (2 048 px au plus sur le grand côté, JPEG 85 %), orientation de l'appareil respectée
  async function reduire(fichier) {
    if (
      !/^image\/(jpeg|png|webp|heic|heif)$/i.test(fichier.type) ||
      fichier.size < 1.5e6 ||
      typeof createImageBitmap !== "function"
    )
      return fichier;
    try {
      const bmp = await createImageBitmap(fichier, { imageOrientation: "from-image" }),
        k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const canevas = document.createElement("canvas");
      canevas.width = Math.round(bmp.width * k);
      canevas.height = Math.round(bmp.height * k);
      canevas.getContext("2d").drawImage(bmp, 0, 0, canevas.width, canevas.height);
      const blob = await new Promise((resoudre) => canevas.toBlob(resoudre, "image/jpeg", 0.85));
      return blob && blob.size < fichier.size
        ? new File([blob], String(fichier.name || "photo").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })
        : fichier;
    } catch (_) {
      return fichier;
    }
  }
  function html(id) {
    return `<div class="pj" id="${id}"><ul class="pj-liste" aria-label="Pièces jointes"></ul>
      <label class="pj-ajout"><input type="file" id="${id}-fichiers" multiple accept="${ACCEPTE}"><span aria-hidden="true">📎</span> Ajouter des photos ou des fichiers</label>
      <span class="pj-etat" aria-live="polite"></span></div>`;
  }
  async function dessiner(id) {
    const conteneur = document.getElementById(id);
    if (!conteneur) return;
    const etatChamp = etatDuChamp(id),
      listePieces = conteneur.querySelector(".pj-liste");
    const ouvrable = !!grist.docApi.getAccessToken;
    listePieces.innerHTML =
      etatChamp.ids
        .map((numero) => {
          const infosPiece = infos.get(numero) || { nom: `pièce ${numero}` };
          return `<li><a class="pj-vignette" ${ouvrable ? `href="#" data-pj-ouvrir="${numero}"` : ""} title="Ouvrir ${esc(infosPiece.nom)}">${infosPiece.image && ouvrable ? `<img data-pj-image="${numero}" alt="${esc(infosPiece.nom)}" hidden>🖼️` : "📄"}</a>
        <span class="pj-nom" title="${esc(infosPiece.nom)}">${esc(infosPiece.nom)}</span><span class="pj-taille">${esc(taille(infosPiece.taille))}</span>
        <button type="button" class="pj-retirer" data-pj-retirer="${numero}" aria-label="Retirer ${esc(infosPiece.nom)}" title="Retirer de ce signalement">✕</button></li>`;
        })
        .join("") +
      (etatChamp.envois
        ? `<li class="pj-envoi"><span class="pj-vignette">⏳</span><span class="pj-nom">Envoi de ${etatChamp.envois} fichier${etatChamp.envois > 1 ? "s" : ""}…</span></li>`
        : "");
    const zoneEtat = conteneur.querySelector(".pj-etat");
    zoneEtat.textContent = etatChamp.msg;
    zoneEtat.classList.toggle("err", !!etatChamp.err);
    // pièces dont on ne sait rien (lien d'établissement : _grist_Attachments fermée) : contenu lu pour connaître nom et type
    if (grist.docApi.getAccessToken)
      etatChamp.ids
        .filter((numero) => {
          const infosPiece = infos.get(numero);
          return (
            (!infosPiece || !infosPiece.nom || /^pièce \d+$/.test(infosPiece.nom)) &&
            !prets.has(numero) &&
            !contenus.has(numero)
          );
        })
        .forEach((numero) =>
          contenu(numero)
            .then(() => dessiner(id))
            .catch(() => {
              /* icône gardée */
            }),
        );
    // vignettes : contenu lu par fetch (jeton hors de la page)
    listePieces.querySelectorAll("img[data-pj-image]").forEach((img) => {
      contenu(+img.dataset.pjImage)
        .then((pieceLue) => {
          img.onload = () => {
            img.hidden = false;
            if (img.nextSibling) img.nextSibling.remove();
          };
          img.src = pieceLue.url;
        })
        .catch(() => {
          /* icône gardée */
        });
    });
  }
  function lier(bloc, id, surChangement) {
    etat[id] = { ids: [], envois: 0, msg: "", err: false }; // formulaire redessiné : rien de joint
    const inp = bloc.querySelector('input[type="file"]');
    if (!grist.docApi.getAccessToken) {
      inp.disabled = true;
      inp.closest(".pj-ajout").hidden = true;
      etatDuChamp(id).msg = "Ajout de pièces jointes indisponible ici (mode secours).";
      dessiner(id);
    }
    inp.addEventListener("change", async () => {
      const fichiers = [...inp.files];
      inp.value = "";
      if (!fichiers.length) return;
      const etatChamp = etatDuChamp(id);
      etatChamp.envois += fichiers.length;
      etatChamp.msg = "";
      etatChamp.err = false;
      dessiner(id);
      const echecs = [];
      for (const fichier of fichiers) {
        try {
          const fichierReduit = await reduire(fichier),
            jetonAcces = await jeton(),
            formulaireEnvoi = new FormData();
          formulaireEnvoi.append("upload", fichierReduit, fichierReduit.name || "fichier");
          const reponse = await fetch(
            `${jetonAcces.baseUrl}/attachments?auth=${encodeURIComponent(jetonAcces.token)}`,
            {
              method: "POST",
              body: formulaireEnvoi,
              headers: { "X-Requested-With": "XMLHttpRequest" },
            },
          );
          if (!reponse.ok) {
            let detailErreur = "";
            try {
              detailErreur = (await reponse.json()).error || "";
            } catch (_) {
              /* corps illisible */
            }
            throw new Error(`${reponse.status}${detailErreur ? ` : ${detailErreur}` : ""}`);
          }
          const resultat = await reponse.json(),
            numero = Array.isArray(resultat) ? resultat[0] : resultat;
          if (typeof numero !== "number") throw new Error("réponse inattendue de Grist");
          // empreinte SHA-1 du contenu envoyé (celle que Grist enregistre) : preuve que ce poste a bien envoyé le fichier
          let empreinte = "";
          try {
            empreinte = [...new Uint8Array(await crypto.subtle.digest("SHA-1", await fichierReduit.arrayBuffer()))]
              .map((octet) => octet.toString(16).padStart(2, "0"))
              .join("");
          } catch (_) {
            empreinte = "";
          }
          infos.set(numero, {
            nom: fichierReduit.name || "fichier",
            taille: fichierReduit.size,
            image: /^image\//.test(fichierReduit.type),
            empreinte,
          });
          etatChamp.ids.push(numero);
        } catch (erreur) {
          echecs.push(`${fichier.name} (${erreur.message || erreur})`);
        }
        etatChamp.envois--;
        dessiner(id);
      }
      if (echecs.length) {
        etatChamp.msg = `Envoi impossible : ${echecs.join(" ; ")}.`;
        etatChamp.err = true;
      }
      dessiner(id);
      if (surChangement) surChangement();
      if (typeof appliquerConditions === "function") appliquerConditions("q", etatSaisie.defsQuestions);
    });
    bloc.addEventListener("click", (evenement) => {
      const vignette = evenement.target.closest("[data-pj-ouvrir]");
      if (vignette) {
        evenement.preventDefault();
        ouvrir(+vignette.dataset.pjOuvrir, id);
        return;
      }
      const boutonRetirer = evenement.target.closest("[data-pj-retirer]");
      if (!boutonRetirer) return;
      const etatChamp = etatDuChamp(id),
        numero = +boutonRetirer.dataset.pjRetirer;
      etatChamp.ids = etatChamp.ids.filter((numeroExistant) => numeroExistant !== numero);
      etatChamp.msg = "Pièce retirée de ce signalement.";
      etatChamp.err = false;
      dessiner(id);
      if (surChangement) surChangement();
    });
  }
  function remplir(id, valeurCellule, envoi) {
    const etatChamp = etatDuChamp(id);
    etatChamp.ids = Array.isArray(valeurCellule)
      ? valeurCellule.slice(valeurCellule[0] === "L" ? 1 : 0).filter((numero) => typeof numero === "number")
      : [];
    etatChamp.msg = "";
    etatChamp.err = false;
    // colonne d'envoi (« numéro:empreinte ») : pièces de la version précédente, gardées avec leur empreinte
    if (typeof envoi === "string" && envoi.trim()) {
      const paires = envoi
        .split(/\s+/)
        .map((morceau) => morceau.split(":"))
        .filter(([numero, empreinte]) => /^\d+$/.test(numero) && empreinte);
      paires.forEach(([numero, empreinte]) => {
        const infosPiece = infos.get(+numero) || {};
        infos.set(+numero, { ...infosPiece, nom: infosPiece.nom || `pièce ${numero}`, empreinte: empreinte });
      });
      if (!etatChamp.ids.length) etatChamp.ids = paires.map(([numero]) => +numero);
    }
    lireMeta().then(() => dessiner(id));
    dessiner(id);
  }
  const valeur = (id) => {
    const etatChamp = etat[id];
    return etatChamp && etatChamp.ids.length ? ["L", ...etatChamp.ids] : null;
  };
  // colonne d'envoi : « numéro:empreinte » de chaque pièce (la colonne Pièces jointes en formule ne retient que celles-là)
  const envoi = (id) => {
    const etatChamp = etat[id];
    return etatChamp && etatChamp.ids.length
      ? etatChamp.ids.map((numero) => `${numero}:${(infos.get(numero) || {}).empreinte || ""}`).join(" ")
      : "";
  };
  const enCours = (id) => !!(etat[id] && etat[id].envois);
  // texte (description automatique, historique) : nombre et noms des pièces
  function texte(valeurCellule) {
    const numeros = Array.isArray(valeurCellule) ? valeurCellule.slice(valeurCellule[0] === "L" ? 1 : 0) : [];
    if (!numeros.length) return "—";
    const noms = numeros.map((numero) => (infos.get(numero) || {}).nom).filter(Boolean);
    return `${numeros.length} pièce${numeros.length > 1 ? "s" : ""} jointe${numeros.length > 1 ? "s" : ""}${noms.length ? ` (${noms.join(", ")})` : ""}`;
  }
  return { html, lier, remplir, valeur, envoi, enCours, texte, lireMeta };
})();

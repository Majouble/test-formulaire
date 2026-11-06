/* PRISME — widget de saisie, module 11/34 : Pièces jointes : photos et documents envoyés au document Grist.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Pièces jointes (colonne Grist de type Pièces jointes) ----------
   Photos (galerie ou appareil photo du téléphone) et documents, envoyés dès qu'ils sont choisis dans les pièces jointes du
   document Grist (API /attachments, jeton du widget) ; la cellule reçoit la liste de leurs numéros à l'enregistrement.
   Photos lourdes réduites avant l'envoi (2 048 px au plus, JPEG) : rapide sur réseau mobile. Une mise à jour garde les
   pièces de la version précédente (retirables pour cette version) ; « Reprendre » un signalement d'un jour précédent ne
   les reprend pas. Sans jeton (mode secours hors ligne…) : ajout indisponible, pièces déjà jointes listées. */
const PJ = (() => {
  const etat = {},
    infos = new Map(); // champ → { ids, envois, msg, err } ; numéro → { nom, taille, image, empreinte }
  let lecture = null,
    metaLue = null;
  const ACCEPTE =
    "image/*,application/pdf,.pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt,.csv,.eml,.msg,.zip";
  const taille = (n) =>
    n == null
      ? ""
      : n < 1024 * 1024
        ? `${Math.max(1, Math.round(n / 1024))} Ko`
        : `${(n / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  const st = (id) => etat[id] || (etat[id] = { ids: [], envois: 0, msg: "", err: false });
  // Jeton d'accès : jamais en lecture seule — Grist traiterait un propriétaire comme simple lecteur, que les règles
  // d'accès privent des signalements (« Cannot access attachment »). Il ne figure jamais dans la page : les pièces
  // sont lues par fetch puis affichées depuis la mémoire du navigateur.
  async function jeton() {
    if (!grist.docApi.getAccessToken) throw new Error("pièces jointes indisponibles ici");
    if (lecture && Date.now() - lecture.le < 60000) return lecture;
    const t = await grist.docApi.getAccessToken({ readOnly: false });
    lecture = { ...t, le: Date.now() };
    return t;
  }
  // Établissement ouvert par son lien : Grist ne le reconnaît, pour un téléchargement, que si l'adresse porte les
  // paramètres de son lien (« Etab_=… »), repris de la colonne Lien de sa ligne (lisible par lui seul).
  function parametresLien() {
    if (typeof etatSaisie.modeEtab === "undefined" || !etatSaisie.modeEtab || !etatSaisie.etabs || !etatSaisie.etabs[0])
      return "";
    const l = String(etatSaisie.etabs[0][E.lien] || "");
    return [...l.matchAll(/[?&]([A-Za-z][A-Za-z0-9_]*_)=([^&#\s"'<>]+)/g)]
      .filter((m) => !/^aclAs/i.test(m[1]))
      .map((m) => `&${m[1]}=${m[2]}`)
      .join("");
  }
  // contenu d'une pièce (Blob), gardé en mémoire ; adresse locale (blob:) pour l'afficher ou l'ouvrir
  const contenus = new Map(),
    prets = new Map(); // numéro → Promise<{ url, type, nom }> ; contenus déjà lus
  function contenu(n) {
    if (!contenus.has(n))
      contenus.set(
        n,
        (async () => {
          const t = await jeton();
          const r = await fetch(
            `${t.baseUrl}/attachments/${n}/download?auth=${encodeURIComponent(t.token)}${parametresLien()}`,
          );
          if (!r.ok) {
            let d = "";
            try {
              d = (await r.json()).error || "";
            } catch (_) {
              /* corps illisible */
            }
            throw new Error(
              r.status === 403
                ? `accès refusé par Grist${etatSaisie.modeEtab && !parametresLien() ? " (lien de l'établissement illisible : règles d'accès à réappliquer)" : ""}`
                : `${r.status}${d ? ` : ${d}` : ""}`,
            );
          }
          const b = await r.blob();
          // nom d'origine (en-tête de Grist, s'il est lisible) : utile quand _grist_Attachments est fermée (lien d'établissement)
          let nom = "";
          try {
            const cd = r.headers.get("content-disposition") || "";
            const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
            nom = m ? decodeURIComponent(m[1]) : "";
          } catch (_) {
            nom = "";
          }
          const c = { url: URL.createObjectURL(b), type: b.type || "", nom };
          const x = infos.get(n) || {};
          if (!x.nom || /^pièce \d+$/.test(x.nom) || x.image == null)
            infos.set(n, {
              ...x,
              nom: x.nom && !/^pièce \d+$/.test(x.nom) ? x.nom : nom || x.nom || `pièce ${n}`,
              image: x.image || /^image\//.test(c.type),
            });
          prets.set(n, c);
          return c;
        })().catch((e) => {
          contenus.delete(n);
          throw e;
        }),
      );
    return contenus.get(n);
  }
  const affichableType = (t) => /^(image\/|application\/pdf|text\/plain)/i.test(t || "");
  async function ouvrir(n, id) {
    const x = infos.get(n) || {},
      nom = x.nom || `pièce ${n}`,
      deja = prets.get(n);
    // contenu déjà lu : ouverture immédiate (le navigateur l'accepte, le geste est encore « frais »)
    if (deja && affichableType(deja.type)) {
      if (window.open(deja.url, "_blank")) return;
    }
    const affichable = deja
      ? affichableType(deja.type)
      : x.image || /\.(pdf|txt|jpe?g|png|gif|webp|heic)$/i.test(nom) || !x.nom || /^pièce \d+$/.test(nom);
    let w = null;
    if (affichable && !deja) {
      try {
        w = window.open("", "_blank");
      } catch (_) {
        w = null;
      }
    } // ouverte tout de suite : sinon bloquée après l'attente
    try {
      const c = await contenu(n);
      if (w) {
        if (affichableType(c.type)) {
          w.location.href = c.url;
          return;
        }
        try {
          w.close();
        } catch (_) {
          /* déjà fermée */
        }
        w = null;
      }
      const a = document.createElement("a");
      a.href = c.url;
      a.download = (infos.get(n) || {}).nom || c.nom || nom;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      if (w)
        try {
          w.close();
        } catch (_) {
          /* fenêtre déjà fermée */
        }
      const s = st(id);
      s.msg = `Ouverture de « ${nom} » impossible : ${e.message || e}.`;
      s.err = true;
      dessiner(id);
    }
  }
  // noms et tailles des pièces déjà jointes : table _grist_Attachments (lue une fois)
  async function lireMeta() {
    if (!metaLue)
      metaLue = Donnees.lire("_grist_Attachments")
        .then((t) => {
          t.id.forEach((id, i) => {
            if (!infos.has(id))
              infos.set(id, {
                nom: String((t.fileName || [])[i] || `pièce ${id}`),
                taille: (t.fileSize || [])[i],
                image:
                  !!(t.imageHeight || [])[i] ||
                  /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(String((t.fileName || [])[i] || "")),
              });
          });
        })
        .catch(() => {});
    return metaLue;
  }
  // photo lourde : réduite (2 048 px au plus sur le grand côté, JPEG 85 %), orientation de l'appareil respectée
  async function reduire(f) {
    if (
      !/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) ||
      f.size < 1.5e6 ||
      typeof createImageBitmap !== "function"
    )
      return f;
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: "from-image" }),
        k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
      return b && b.size < f.size
        ? new File([b], String(f.name || "photo").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })
        : f;
    } catch (_) {
      return f;
    }
  }
  function html(id) {
    return `<div class="pj" id="${id}"><ul class="pj-liste" aria-label="Pièces jointes"></ul>
      <label class="pj-ajout"><input type="file" id="${id}-fichiers" multiple accept="${ACCEPTE}"><span aria-hidden="true">📎</span> Ajouter des photos ou des fichiers</label>
      <span class="pj-etat" aria-live="polite"></span></div>`;
  }
  async function dessiner(id) {
    const z = document.getElementById(id);
    if (!z) return;
    const s = st(id),
      ul = z.querySelector(".pj-liste");
    const ouvrable = !!grist.docApi.getAccessToken;
    ul.innerHTML =
      s.ids
        .map((n) => {
          const x = infos.get(n) || { nom: `pièce ${n}` };
          return `<li><a class="pj-vignette" ${ouvrable ? `href="#" data-pj-ouvrir="${n}"` : ""} title="Ouvrir ${esc(x.nom)}">${x.image && ouvrable ? `<img data-pj-image="${n}" alt="${esc(x.nom)}" hidden>🖼️` : "📄"}</a>
        <span class="pj-nom" title="${esc(x.nom)}">${esc(x.nom)}</span><span class="pj-taille">${esc(taille(x.taille))}</span>
        <button type="button" class="pj-retirer" data-pj-retirer="${n}" aria-label="Retirer ${esc(x.nom)}" title="Retirer de ce signalement">✕</button></li>`;
        })
        .join("") +
      (s.envois
        ? `<li class="pj-envoi"><span class="pj-vignette">⏳</span><span class="pj-nom">Envoi de ${s.envois} fichier${s.envois > 1 ? "s" : ""}…</span></li>`
        : "");
    const e = z.querySelector(".pj-etat");
    e.textContent = s.msg;
    e.classList.toggle("err", !!s.err);
    // pièces dont on ne sait rien (lien d'établissement : _grist_Attachments fermée) : contenu lu pour connaître nom et type
    if (grist.docApi.getAccessToken)
      s.ids
        .filter((n) => {
          const x = infos.get(n);
          return (!x || !x.nom || /^pièce \d+$/.test(x.nom)) && !prets.has(n) && !contenus.has(n);
        })
        .forEach((n) =>
          contenu(n)
            .then(() => dessiner(id))
            .catch(() => {
              /* icône gardée */
            }),
        );
    // vignettes : contenu lu par fetch (jeton hors de la page)
    ul.querySelectorAll("img[data-pj-image]").forEach((img) => {
      contenu(+img.dataset.pjImage)
        .then((c) => {
          img.onload = () => {
            img.hidden = false;
            if (img.nextSibling) img.nextSibling.remove();
          };
          img.src = c.url;
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
      st(id).msg = "Ajout de pièces jointes indisponible ici (mode secours).";
      dessiner(id);
    }
    inp.addEventListener("change", async () => {
      const fichiers = [...inp.files];
      inp.value = "";
      if (!fichiers.length) return;
      const s = st(id);
      s.envois += fichiers.length;
      s.msg = "";
      s.err = false;
      dessiner(id);
      const echecs = [];
      for (const f of fichiers) {
        try {
          const f2 = await reduire(f),
            t = await jeton(),
            fd = new FormData();
          fd.append("upload", f2, f2.name || "fichier");
          const r = await fetch(`${t.baseUrl}/attachments?auth=${encodeURIComponent(t.token)}`, {
            method: "POST",
            body: fd,
            headers: { "X-Requested-With": "XMLHttpRequest" },
          });
          if (!r.ok) {
            let d = "";
            try {
              d = (await r.json()).error || "";
            } catch (_) {
              /* corps illisible */
            }
            throw new Error(`${r.status}${d ? ` : ${d}` : ""}`);
          }
          const res = await r.json(),
            n = Array.isArray(res) ? res[0] : res;
          if (typeof n !== "number") throw new Error("réponse inattendue de Grist");
          // empreinte SHA-1 du contenu envoyé (celle que Grist enregistre) : preuve que ce poste a bien envoyé le fichier
          let empreinte = "";
          try {
            empreinte = [...new Uint8Array(await crypto.subtle.digest("SHA-1", await f2.arrayBuffer()))]
              .map((x) => x.toString(16).padStart(2, "0"))
              .join("");
          } catch (_) {
            empreinte = "";
          }
          infos.set(n, {
            nom: f2.name || "fichier",
            taille: f2.size,
            image: /^image\//.test(f2.type),
            empreinte,
          });
          s.ids.push(n);
        } catch (e) {
          echecs.push(`${f.name} (${e.message || e})`);
        }
        s.envois--;
        dessiner(id);
      }
      if (echecs.length) {
        s.msg = `Envoi impossible : ${echecs.join(" ; ")}.`;
        s.err = true;
      }
      dessiner(id);
      if (surChangement) surChangement();
      if (typeof appliquerConditions === "function") appliquerConditions("q", etatSaisie.defsQuestions);
    });
    bloc.addEventListener("click", (ev) => {
      const o = ev.target.closest("[data-pj-ouvrir]");
      if (o) {
        ev.preventDefault();
        ouvrir(+o.dataset.pjOuvrir, id);
        return;
      }
      const b = ev.target.closest("[data-pj-retirer]");
      if (!b) return;
      const s = st(id),
        n = +b.dataset.pjRetirer;
      s.ids = s.ids.filter((x) => x !== n);
      s.msg = "Pièce retirée de ce signalement.";
      s.err = false;
      dessiner(id);
      if (surChangement) surChangement();
    });
  }
  function remplir(id, v, envoi) {
    const s = st(id);
    s.ids = Array.isArray(v) ? v.slice(v[0] === "L" ? 1 : 0).filter((n) => typeof n === "number") : [];
    s.msg = "";
    s.err = false;
    // colonne d'envoi (« numéro:empreinte ») : pièces de la version précédente, gardées avec leur empreinte
    if (typeof envoi === "string" && envoi.trim()) {
      const paires = envoi
        .split(/\s+/)
        .map((x) => x.split(":"))
        .filter(([n, h]) => /^\d+$/.test(n) && h);
      paires.forEach(([n, h]) => {
        const x = infos.get(+n) || {};
        infos.set(+n, { ...x, nom: x.nom || `pièce ${n}`, empreinte: h });
      });
      if (!s.ids.length) s.ids = paires.map(([n]) => +n);
    }
    lireMeta().then(() => dessiner(id));
    dessiner(id);
  }
  const valeur = (id) => {
    const s = etat[id];
    return s && s.ids.length ? ["L", ...s.ids] : null;
  };
  // colonne d'envoi : « numéro:empreinte » de chaque pièce (la colonne Pièces jointes en formule ne retient que celles-là)
  const envoi = (id) => {
    const s = etat[id];
    return s && s.ids.length ? s.ids.map((n) => `${n}:${(infos.get(n) || {}).empreinte || ""}`).join(" ") : "";
  };
  const enCours = (id) => !!(etat[id] && etat[id].envois);
  // texte (description automatique, historique) : nombre et noms des pièces
  function texte(v) {
    const l = Array.isArray(v) ? v.slice(v[0] === "L" ? 1 : 0) : [];
    if (!l.length) return "—";
    const noms = l.map((n) => (infos.get(n) || {}).nom).filter(Boolean);
    return `${l.length} pièce${l.length > 1 ? "s" : ""} jointe${l.length > 1 ? "s" : ""}${noms.length ? ` (${noms.join(", ")})` : ""}`;
  }
  return { html, lier, remplir, valeur, envoi, enCours, texte, lireMeta };
})();

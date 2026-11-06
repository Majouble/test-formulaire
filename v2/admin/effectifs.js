/* =====================================================================
   Administration v2 — onglet « Référentiel », carte « Effectifs » (2.42)
   ---------------------------------------------------------------------
   Effectif de chaque établissement, tiré de l'open data, écrit dans le référentiel (colonnes Effectif et Effectif_rentree) :
   - scolaire (champ EN) : jeux de la DEPP sur data.education.gouv.fr, un par type d'établissement (écoles, collèges,
     lycées généraux et technologiques, voie professionnelle), rapprochés par UAI ; un établissement présent dans
     plusieurs jeux (lycée polyvalent) reçoit la somme ;
   - supérieur (champ ESR) : effectifs d'étudiants inscrits par établissement (SIES, data.enseignementsup-recherche.gouv.fr),
     rapprochés par l'identifiant Paysage du référentiel (colonne Identifiant_Paysage du classeur ESR), à défaut l'UAI.
   Les noms des champs des jeux de données ne sont pas figés : le module lit leur description (API OpenDataSoft v2.1),
   propose la clé, l'effectif total et l'année, et chaque choix se corrige avant l'import ; la dernière année est retenue.
   Rien n'est effacé : un établissement absent des jeux garde sa valeur. Réglages gardés dans la clé « effectifs » de Config.
   Les tables de réponses peuvent recevoir une colonne Effectif ($Etablissement.Effectif) : tableau de bord, cartes, exports.
   ===================================================================== */
(function () {
  "use strict";
  const { esc, $ } = Outils;
  const nf = (n) => Number(n || 0).toLocaleString("fr-FR");
  const COL = { effectif: "Effectif", annee: "Effectif_rentree" };
  const TAILLE_LOT = 400;
  const SOURCES = {
    EN: {
      titre: "Effectifs d'élèves (DEPP, data.education.gouv.fr)",
      unite: "élèves",
      base: "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/",
      jeux: [
        { id: "ecoles", nom: "Écoles", candidats: ["fr-en-ecoles-effectifs-nb_classes"] },
        { id: "colleges", nom: "Collèges", candidats: ["fr-en-college-effectifs-niveau-sexe-lv"] },
        {
          id: "lycees_gt",
          nom: "Lycées généraux et technologiques",
          candidats: ["fr-en-lycee_gt-effectifs-niveau-sexe-lv"],
        },
        {
          id: "lycees_pro",
          nom: "Voie professionnelle (lycées professionnels, BTS)",
          candidats: ["fr-en-lycee_pro-effectifs-niveau-sexe-mef", "fr-en-lycee_pro-effectifs-niveau-sexe-lv"],
        },
      ],
    },
    ESR: {
      titre: "Effectifs d'étudiants inscrits (SIES, data.enseignementsup-recherche.gouv.fr)",
      unite: "étudiants",
      base: "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/",
      jeux: [
        {
          id: "etablissements",
          nom: "Établissements publics sous tutelle du ministère (hors doubles inscriptions CPGE)",
          candidats: [
            "fr-esr-statistiques-sur-les-effectifs-d-etudiants-inscrits-par-etablissement-hcp",
            "fr-esr-statistiques-sur-les-effectifs-d-etudiants-inscrits-par-etablissement",
          ],
        },
      ],
    },
  };
  const NUMERIQUE = /^(int|double|decimal|number)$/i;

  let config, general, meta, racine;
  const etat = {}; // par champ : { espace, cleRef, jeux: [{ ...jeu, dataset, champs, cle, total, annee, aca, annees, erreur }], bilan }

  /* ---------- API open data ---------- */
  async function lireJson(url) {
    let r;
    try {
      r = await fetch(url);
    } catch (_) {
      throw new Error(`${new URL(url).host} est injoignable depuis votre navigateur (réseau, pare-feu ou proxy).`);
    }
    if (!r.ok) {
      let d = "";
      try {
        d = (await r.json()).message || "";
      } catch (_) {}
      throw new Error(`l'API a répondu ${r.status}${d ? ` : ${d}` : ""}`);
    }
    return r.json();
  }
  const guillemets = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const litteral = (champ, v) =>
    NUMERIQUE.test(champ.type || "") && /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : guillemets(v);
  // Champ le plus probable : premier motif qui trouve un champ du bon genre
  const deviner = (champs, motifs, filtre = () => true) => {
    for (const m of motifs) {
      const f = champs.find((c) => filtre(c) && (m.test(c.name) || m.test(Socle.normaliser(c.label))));
      if (f) return f.name;
    }
    return "";
  };
  function devinerChamps(j, sourceId, cleRef) {
    const num = (c) => NUMERIQUE.test(c.type || ""),
      txt = (c) => !num(c);
    j.cle =
      j.cle ||
      (sourceId === "ESR" && cleRef !== "UAI"
        ? deviner(j.champs, [/^etablissement_id_paysage$/, /id_paysage/, /paysage/], txt)
        : deviner(
            j.champs,
            [
              /^(numero_)?uai$/,
              /uai/,
              /^numero_(de_l_)?(ecole|college|lycee|etablissement)/,
              /rne/,
              /identifiant.*etab/,
            ],
            txt,
          ));
    j.total =
      j.total ||
      deviner(
        j.champs,
        [
          /^nombre_total_(d_)?eleves$/,
          /^nombre_(d_)?eleves_total$/,
          /^effectif_total$/,
          /^effectif$/,
          /total.*(eleve|etudiant|inscrit)/,
          /(eleve|etudiant|inscrit).*total/,
          /^nombre_(d_)?(eleves|etudiants|inscrits)$/,
          /^effectif/,
          /total/,
        ],
        num,
      );
    j.annee =
      j.annee ||
      deviner(j.champs, [/^rentree_scolaire$/, /^rentree$/, /^annee_universitaire$/, /rentree/, /^annee/], () => true);
    j.aca = deviner(j.champs, [/^academie$/, /^libelle_academie$/, /academie/], txt);
  }

  /* ---------- Contexte ---------- */
  async function charger() {
    meta = await Socle.lireMeta();
    config = await Socle.lireConfig(meta);
    general = Socle.general(config);
    for (const e of Socle.espaces(general)) {
      if (!meta[e.referentiel] || (etat[e.champ] && etat[e.champ].espace.referentiel === e.referentiel)) {
        if (etat[e.champ]) etat[e.champ].espace = e;
        continue;
      }
      const assoc =
        e.referentiel === general.referentiel
          ? (config && config.valeurs.roles && config.valeurs.roles.referentiel) || {}
          : {};
      const roles = Socle.associerColonnes(
        "referentiel",
        meta[e.referentiel],
        { reponses: e.reponses, referentiel: e.referentiel },
        assoc,
        {},
      );
      const cols = meta[e.referentiel].colonnes,
        uai = roles.UAI && roles.UAI.col;
      const cleRef = e.champ === "ESR" && cols.Identifiant_Paysage ? "Identifiant_Paysage" : uai || "";
      const enr = ((config && config.valeurs.effectifs) || {})[e.champ] || {};
      etat[e.champ] = {
        espace: e,
        cleRef,
        roles,
        jeux: SOURCES[e.champ].jeux.map((j) => ({ ...j, ...((enr.jeux || {})[j.id] || {}), champs: null })),
        bilan: null,
      };
    }
  }

  /* ---------- Étapes ---------- */
  async function chercher(ch) {
    const x = etat[ch],
      src = SOURCES[ch];
    for (const j of x.jeux) {
      j.erreur = "";
      j.champs = null;
      for (const id of [...new Set([j.dataset, ...j.candidats].filter(Boolean))]) {
        try {
          const d = await lireJson(src.base + id);
          j.champs = (d.fields || (d.dataset && d.dataset.fields) || []).map((f) => ({
            name: f.name,
            label: f.label || f.name,
            type: f.type || "",
          }));
          if (j.champs.length) {
            if (j.dataset !== id) {
              j.cle = j.total = j.annee = "";
            }
            j.dataset = id;
            break;
          }
        } catch (e) {
          j.erreur = e.message || String(e);
        }
      }
      if (!j.champs) {
        j.erreur = j.erreur || "jeu de données introuvable";
        continue;
      }
      j.erreur = "";
      devinerChamps(j, ch, x.cleRef);
      await lireAnnees(ch, j);
    }
    x.bilan = null;
  }
  async function lireAnnees(ch, j) {
    j.annees = [];
    if (!j.annee) return;
    try {
      const d = await lireJson(
        `${SOURCES[ch].base}${j.dataset}/records?select=${encodeURIComponent(`${j.annee}, count(*) as n`)}&group_by=${encodeURIComponent(j.annee)}&limit=100`,
      );
      j.annees = (d.results || [])
        .map((r) => String(r[j.annee] ?? ""))
        .filter(Boolean)
        .sort()
        .reverse();
      if (!j.anneeChoisie || !j.annees.includes(j.anneeChoisie)) j.anneeChoisie = j.annees[0] || "";
    } catch (e) {
      j.erreur = `années illisibles : ${e.message || e}`;
    }
  }
  const champ = (j, n) => (j.champs || []).find((c) => c.name === n) || { name: n, type: "" };
  async function comparer(ch) {
    const x = etat[ch],
      src = SOURCES[ch],
      parCle = new Map(),
      lus = [];
    const academies = (general.academies || []).filter(Boolean);
    for (const j of x.jeux.filter((j) => j.champs && !j.ignore)) {
      if (!j.cle || !j.total || !j.annee) {
        lus.push({ j, n: 0, erreur: `${!j.cle ? "clé" : !j.total ? "effectif" : "année"} à choisir` });
        continue;
      }
      const where = [
        j.annee && j.anneeChoisie ? `${j.annee}=${litteral(champ(j, j.annee), j.anneeChoisie)}` : "",
        j.aca && academies.length ? `(${academies.map((a) => `${j.aca}=${guillemets(a)}`).join(" OR ")})` : "",
      ]
        .filter(Boolean)
        .join(" AND ");
      try {
        const lignes = await lireJson(
          `${src.base}${j.dataset}/exports/json?select=${encodeURIComponent([j.cle, j.total].join(","))}${where ? `&where=${encodeURIComponent(where)}` : ""}`,
        );
        let n = 0;
        for (const l of lignes) {
          const k = String(l[j.cle] ?? "")
              .trim()
              .toUpperCase(),
            v = Number(l[j.total]);
          if (!k || !Number.isFinite(v)) continue;
          n++;
          const p = parCle.get(k) || { total: 0, jeux: new Set() };
          p.total += v;
          p.jeux.add(j.nom);
          parCle.set(k, p);
        }
        lus.push({ j, n });
      } catch (e) {
        lus.push({ j, n: 0, erreur: e.message || String(e) });
      }
    }
    // rapprochement avec le référentiel
    const t = await Donnees.lire(x.espace.referentiel),
      cles = t[x.cleRef] || [],
      cols = meta[x.espace.referentiel].colonnes;
    const avant = t[COL.effectif] || [],
      anneeTexte = [
        ...new Set(x.jeux.filter((j) => j.champs && !j.ignore && j.anneeChoisie).map((j) => j.anneeChoisie)),
      ].join(", ");
    const nom = x.roles.Nom && x.roles.Nom.col,
      type = x.roles.Type && x.roles.Type.col;
    const maj = [],
      sans = new Map();
    let trouves = 0;
    t.id.forEach((id, i) => {
      const k = String(cles[i] ?? "")
          .trim()
          .toUpperCase(),
        p = k && parCle.get(k);
      if (!p) {
        const ty = String((type && t[type][i]) || "(sans type)");
        sans.set(ty, (sans.get(ty) || 0) + 1);
        return;
      }
      trouves++;
      const v = Math.round(p.total);
      if (avant[i] !== v || (t[COL.annee] || [])[i] !== anneeTexte)
        maj.push({ id, v, nom: nom ? t[nom][i] : `n° ${id}`, avant: avant[i], plusieurs: p.jeux.size > 1 });
    });
    x.bilan = {
      lus,
      trouves,
      total: t.id.length,
      maj,
      sans: [...sans.entries()].sort((a, b) => b[1] - a[1]),
      anneeTexte,
      inconnues: [...parCle.keys()].filter(
        (k) =>
          !cles.some(
            (c) =>
              String(c ?? "")
                .trim()
                .toUpperCase() === k,
          ),
      ).length,
      colonnes: [COL.effectif, COL.annee].filter((c) => !cols[c]),
      somme: [...parCle.values()].reduce((s, p) => s + p.total, 0),
    };
  }
  async function ecrire(ch) {
    const x = etat[ch],
      b = x.bilan,
      T = x.espace.referentiel;
    const aCreer = [];
    if (!meta[T].colonnes[COL.effectif])
      aCreer.push([
        "AddColumn",
        T,
        COL.effectif,
        { type: "Int", isFormula: false, label: "Effectif", untieColIdFromLabel: true },
      ]);
    if (!meta[T].colonnes[COL.annee])
      aCreer.push([
        "AddColumn",
        T,
        COL.annee,
        { type: "Text", isFormula: false, label: "Effectif (année)", untieColIdFromLabel: true },
      ]);
    if (aCreer.length) await Donnees.ecrire(aCreer);
    for (let k = 0; k < b.maj.length; k += TAILLE_LOT) {
      const lot = b.maj.slice(k, k + TAILLE_LOT);
      await Donnees.ecrire([
        [
          "BulkUpdateRecord",
          T,
          lot.map((m) => m.id),
          { [COL.effectif]: lot.map((m) => m.v), [COL.annee]: lot.map(() => b.anneeTexte) },
        ],
      ]);
      dire(ch, `Écriture… ${nf(Math.min(k + TAILLE_LOT, b.maj.length))} / ${nf(b.maj.length)}`);
    }
    // réglages retenus (jeu de données et champs), repris à la prochaine mise à jour
    const v = (config && config.valeurs.effectifs) || {};
    await Socle.ecrireConfig("effectifs", {
      ...v,
      [ch]: {
        jeux: Object.fromEntries(
          x.jeux.map((j) => [
            j.id,
            {
              dataset: j.dataset || "",
              cle: j.cle || "",
              total: j.total || "",
              annee: j.annee || "",
              ignore: !!j.ignore,
            },
          ]),
        ),
        maj: new Date().toISOString(),
        annee: b.anneeTexte,
      },
    });
  }
  // Colonne Effectif recopiée dans les tables de réponses de ce référentiel (formule)
  const tablesSansColonne = (ch) =>
    Socle.espaces(general)
      .filter(
        (e) =>
          e.referentiel === etat[ch].espace.referentiel &&
          meta[e.reponses] &&
          !meta[e.reponses].colonnes[COL.effectif] &&
          meta[e.referentiel].colonnes[COL.effectif],
      )
      .map((e) => e.reponses);
  async function colonneReponses(ch) {
    const actions = [];
    for (const rep of tablesSansColonne(ch)) {
      const assoc =
        rep === general.reponses ? (config && config.valeurs.roles && config.valeurs.roles.reponses) || {} : {};
      const rr = Socle.associerColonnes(
        "reponses",
        meta[rep],
        { reponses: rep, referentiel: etat[ch].espace.referentiel },
        assoc,
        {},
      );
      const e = rr.Etablissement && rr.Etablissement.col;
      if (!e) continue;
      actions.push([
        "AddColumn",
        rep,
        COL.effectif,
        {
          type: "Int",
          isFormula: true,
          formula: `$${e}.${COL.effectif}`,
          label: "Effectif",
          untieColIdFromLabel: true,
        },
      ]);
    }
    if (actions.length) await Donnees.ecrire(actions);
    return actions.map((a) => a[1]);
  }

  /* ---------- Rendu ---------- */
  const dire = (ch, t, err) => {
    const st = $(`ef-statut-${ch}`);
    if (st) {
      st.textContent = t;
      st.className = `statut${err ? " err" : t ? " ok" : ""}`;
    }
  };
  function dessiner() {
    const champs = Object.keys(etat).filter((ch) =>
      Socle.espaces(general).some((e) => e.champ === ch && meta[e.referentiel]),
    );
    racine.innerHTML = `<h2>Effectifs des établissements</h2>
      <p class="aide">Nombre d'élèves ou d'étudiants de chaque établissement, tiré de l'open data du ministère et écrit dans le référentiel (colonnes ${COL.effectif} et ${COL.annee}).
        Utile pour dire combien d'élèves sont concernés par une fermeture : tableau de bord, point de situation, exports. Mise à jour une fois par an, après la publication des effectifs de rentrée.</p>
      ${champs.length ? champs.map(blocChamp).join("") : `<p class="vide">Aucun référentiel : lancez d'abord l'installation.</p>`}`;
    lier();
  }
  function blocChamp(ch) {
    const x = etat[ch],
      src = SOURCES[ch],
      T = x.espace.referentiel,
      b = x.bilan,
      cols = meta[T].colonnes;
    const dejaAnnee = ((config && config.valeurs.effectifs) || {})[ch] && config.valeurs.effectifs[ch].annee;
    const selChamps = (j, cle, genre) =>
      `<select data-ef="${ch}|${j.id}|${cle}"><option value="">—</option>${(j.champs || [])
        .filter((c) => (genre === "num" ? NUMERIQUE.test(c.type) : true))
        .map(
          (c) =>
            `<option value="${esc(c.name)}"${c.name === j[cle] ? " selected" : ""}>${esc(c.label)}${c.label !== c.name ? ` (${esc(c.name)})` : ""}</option>`,
        )
        .join("")}</select>`;
    const jeux = x.jeux.some((j) => j.champs || j.erreur)
      ? `<table class="ef-table"><thead><tr><th></th><th>Jeu de données</th><th>Clé (${esc(x.cleRef)})</th><th>Effectif total</th><th>Année</th></tr></thead><tbody>
      ${x.jeux
        .map(
          (
            j,
          ) => `<tr><td><label class="ef-case"><input type="checkbox" data-ef-garder="${ch}|${j.id}"${j.ignore ? "" : " checked"}${j.champs ? "" : " disabled"}> <strong>${esc(j.nom)}</strong></label></td>
        <td>${j.champs ? `<code>${esc(j.dataset)}</code>` : `<span class="pastille manque">${esc(j.erreur || "non lu")}</span>`}</td>
        <td>${j.champs ? selChamps(j, "cle") : ""}</td><td>${j.champs ? selChamps(j, "total", "num") : ""}</td>
        <td>${j.champs && j.annees && j.annees.length ? `<select data-ef-annee="${ch}|${j.id}">${j.annees.map((a) => `<option${a === j.anneeChoisie ? " selected" : ""}>${esc(a)}</option>`).join("")}</select>` : j.champs ? selChamps(j, "annee") : ""}</td></tr>`,
        )
        .join("")}</tbody></table>`
      : "";
    const lu = b
      ? b.lus
          .map(
            (l) =>
              `${esc(l.j.nom)} : ${l.erreur ? `<span class="pastille manque">${esc(l.erreur)}</span>` : `${nf(l.n)} ligne(s)`}`,
          )
          .join(" · ")
      : "";
    const bilan = !b
      ? ""
      : `<div class="groupe">Bilan avant écriture</div>
      <p>${lu}.</p>
      <p><strong>${nf(b.trouves)}</strong> établissement(s) du référentiel sur ${nf(b.total)} ont un effectif (${esc(b.anneeTexte || "année ?")}) ; ${b.maj.length ? `<strong>${nf(b.maj.length)}</strong> à écrire.` : "le référentiel est déjà à jour."}
        ${b.inconnues ? `${nf(b.inconnues)} établissement(s) des jeux ne sont pas dans le référentiel (hors périmètre ou non importés).` : ""}</p>
      ${
        b.sans.length
          ? `<p class="aide">Sans effectif : ${b.sans
              .slice(0, 8)
              .map(([t, n]) => `${esc(t)} ${nf(n)}`)
              .join(
                ", ",
              )}${b.sans.length > 8 ? "…" : ""}${ch === "EN" ? " (établissements privés hors contrat, centres de formation, services… ne figurent pas dans ces jeux)" : " (établissements privés et hors tutelle du ministère ne figurent pas dans ce jeu)"}.</p>`
          : ""
      }
      ${
        b.maj.length
          ? `<table class="ef-table"><thead><tr><th>Établissement</th><th class="va-n">Avant</th><th class="va-n">Effectif</th></tr></thead><tbody>
        ${[...b.maj]
          .sort((p, q) => q.v - p.v)
          .slice(0, 8)
          .map(
            (m) =>
              `<tr><td>${esc(m.nom)}${m.plusieurs ? ' <span class="pastille reco">somme de plusieurs jeux</span>' : ""}</td><td class="va-n">${m.avant == null || m.avant === "" ? "—" : nf(m.avant)}</td><td class="va-n">${nf(m.v)}</td></tr>`,
          )
          .join("")}</tbody></table>
        <p class="aide">Les plus gros effectifs, pour contrôle. ${b.colonnes.length ? `Colonnes créées dans ${esc(T)} : ${b.colonnes.join(", ")}.` : ""}</p>`
          : ""
      }
      <div class="boutons"><button class="primaire" data-ef-act="ecrire" data-ch="${ch}"${b.maj.length ? "" : " disabled"}>3. Écrire ${nf(b.maj.length)} effectif(s) dans ${esc(T)}</button></div>`;
    const reps = cols[COL.effectif] ? tablesSansColonne(ch) : [];
    return `<div class="ef-champ"><h3>${esc(x.espace.libelle)} — table ${esc(T)}</h3>
      <p class="aide">${esc(src.titre)}. Rapprochement par <code>${esc(x.cleRef || "?")}</code>${ch === "EN" ? " ; un lycée polyvalent présent dans deux jeux reçoit la somme" : ""}.
        ${cols[COL.effectif] ? `Dernière mise à jour : ${esc(dejaAnnee || "année inconnue")}.` : `Colonne ${COL.effectif} pas encore créée.`}</p>
      ${!x.cleRef ? `<p class="avert">Aucune colonne ${ch === "ESR" ? "Identifiant_Paysage (classeur ESR) ni " : ""}UAI dans ${esc(T)} : impossible de rapprocher les effectifs.</p>` : ""}
      ${jeux}
      <div class="boutons"><button class="${b ? "secondaire" : "primaire"}" data-ef-act="chercher" data-ch="${ch}"${x.cleRef ? "" : " disabled"}>1. Lire les jeux de données</button>
        ${x.jeux.some((j) => j.champs) ? `<button class="${b ? "secondaire" : "primaire"}" data-ef-act="comparer" data-ch="${ch}">2. Télécharger et comparer</button>` : ""}
        <span class="statut" id="ef-statut-${ch}" role="status"></span></div>
      ${bilan}
      ${
        reps.length
          ? `<p class="aide">Pour les compter dans le tableau de bord (élèves concernés par une fermeture…), recopiez l'effectif dans ${reps.map(esc).join(", ")} :
        <button class="secondaire" data-ef-act="reponses" data-ch="${ch}">Ajouter la colonne ${COL.effectif} (formule $Etablissement.${COL.effectif})</button></p>`
          : ""
      }
    </div>`;
  }
  function lier() {
    racine.querySelectorAll("[data-ef-act]").forEach((b) =>
      b.addEventListener("click", async () => {
        const ch = b.dataset.ch,
          act = b.dataset.efAct;
        racine.querySelectorAll("button").forEach((x) => {
          x.disabled = true;
        });
        try {
          if (act === "chercher") {
            dire(ch, "Lecture des jeux de données…");
            await chercher(ch);
          } else if (act === "comparer") {
            dire(ch, "Téléchargement des effectifs…");
            await comparer(ch);
          } else if (act === "ecrire") {
            await ecrire(ch);
            etat[ch].bilan = null;
            await charger();
            dessiner();
            dire(ch, "Effectifs écrits dans le référentiel.");
            return;
          } else if (act === "reponses") {
            const l = await colonneReponses(ch);
            await charger();
            dessiner();
            dire(ch, l.length ? `Colonne ${COL.effectif} ajoutée à ${l.join(", ")}.` : "Rien à ajouter.");
            return;
          }
          dessiner();
          dire(ch, "");
        } catch (e) {
          dessiner();
          dire(ch, `Échec : ${e.message || e}`, true);
        }
      }),
    );
    racine.querySelectorAll("[data-ef]").forEach((s) =>
      s.addEventListener("change", async () => {
        const [ch, id, cle] = s.dataset.ef.split("|"),
          j = etat[ch].jeux.find((x) => x.id === id);
        j[cle] = s.value;
        etat[ch].bilan = null;
        if (cle === "annee") await lireAnnees(ch, j);
        dessiner();
      }),
    );
    racine.querySelectorAll("[data-ef-annee]").forEach((s) =>
      s.addEventListener("change", () => {
        const [ch, id] = s.dataset.efAnnee.split("|");
        etat[ch].jeux.find((x) => x.id === id).anneeChoisie = s.value;
        etat[ch].bilan = null;
        dessiner();
      }),
    );
    racine.querySelectorAll("[data-ef-garder]").forEach((c) =>
      c.addEventListener("change", () => {
        const [ch, id] = c.dataset.efGarder.split("|");
        etat[ch].jeux.find((x) => x.id === id).ignore = !c.checked;
        etat[ch].bilan = null;
        dessiner();
      }),
    );
  }

  async function afficher() {
    racine = $("ref-effectifs");
    if (!racine) return;
    try {
      await charger();
      dessiner();
    } catch (e) {
      racine.innerHTML = `<h2>Effectifs des établissements</h2><p class="avert">Lecture impossible : ${esc(e.message || e)}</p>`;
    }
  }
  window.OngletEffectifs = { afficher };
})();

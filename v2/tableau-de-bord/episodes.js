/* =====================================================================
   Épisodes de qualification — calcul pur, sans affichage (window.EpisodesQualification)
   Utilisé par le tableau de bord (tableau.js) pour ses deux sources calculées :
   « Épisodes de qualification » et « Durées par établissement ».

   Règles (décidées le 20/11/2026) :
   - seuls les jours où l'établissement a un signalement comptent : un jour sans dossier coupe l'épisode ;
   - un jour prend la qualification la plus grave de toutes ses versions (ordre des choix de la colonne
     Qualification dans Grist, du plus grave au moins grave ; une valeur hors liste vient après) ;
   - « RAS » (retour à la normale) ne compte pas : un jour qui n'a que du RAS n'est pas un jour touché ;
   - un épisode = jours consécutifs touchés avec la même qualification ;
   - « en cours » : dernier épisode de l'établissement, sa version la plus récente n'étant pas un RAS.
   Le nombre de jours touchés d'un établissement est donc le « nombre de jours de mobilisation » du socle.

   Définit : EpisodesQualification.calculer, classes, BORNES_DEFAUT, estRAS
   Utilise : rien (les lignes et la lecture des colonnes sont fournies par l'appelant)
   ===================================================================== */
(function () {
  "use strict";
  const RAS = /^\s*ras\s*$/i;
  const estRAS = q => RAS.test(String(q ?? ""));
  const BORNES_DEFAUT = [1, 3, 7, 14];

  // « AAAA-MM-JJ » <-> numéro du jour (jours depuis le 1/1/1970) : deux jours se suivent si leurs numéros se suivent
  const numero = j => Math.round(Date.UTC(+j.slice(0, 4), +j.slice(5, 7) - 1, +j.slice(8, 10)) / 864e5);
  const jourDe = n => new Date(n * 864e5).toISOString().slice(0, 10);

  // Classes de durée : bornes [1, 3, 7, 14] -> « 1 jour », « 2 à 3 jours », « 4 à 7 jours », « 8 à 14 jours », « 15 jours et plus »
  function classes(bornes) {
    const b = [...new Set((bornes || BORNES_DEFAUT).map(Number).filter(n => n >= 1).map(Math.round))].sort((x, y) => x - y);
    const out = []; let bas = 1;
    for (const haut of b) {
      out.push({ max: haut, libelle: bas === haut ? `${haut} jour${haut > 1 ? "s" : ""}` : `${bas} à ${haut} jours` });
      bas = haut + 1;
    }
    out.push({ max: Infinity, libelle: `${bas} jour${bas > 1 ? "s" : ""} et plus` });
    return out;
  }
  const classeDe = (duree, cl) => (cl.find(c => duree <= c.max) || cl[cl.length - 1]).libelle;

  /* lignes : signalements (une ligne par version) ; o : lecture des lignes
       o.etab(r) -> clé de l'établissement (vide : ligne ignorée)
       o.jour(r) -> « AAAA-MM-JJ » (date des faits, à défaut date de saisie ; vide : ligne ignorée)
       o.qualifs(r) -> liste des qualifications de la ligne
       o.ordre(r) -> valeur qui range les versions (la plus grande = la plus récente)
       o.gravite : qualifications du plus grave au moins grave ; o.bornes : bornes des classes de durée
     Renvoie { episodes, etablissements, classes } ; chaque élément garde « ligne », la version la plus récente de
     l'établissement (pour recopier ses colonnes : UAI, académie…). */
  function calculer(lignes, o) {
    const rang = new Map((o.gravite || []).map((q, i) => [q, i]));
    const plusGrave = (a, b) => {
      const ra = rang.has(a) ? rang.get(a) : rang.size, rb = rang.has(b) ? rang.get(b) : rang.size;
      return ra !== rb ? (ra < rb ? a : b) : (String(a).localeCompare(String(b), "fr") <= 0 ? a : b);
    };
    const cl = classes(o.bornes);

    // 1. regroupement par établissement, puis par jour : qualifications (hors RAS) de toutes les versions du jour
    const parEtab = new Map();
    for (const r of lignes) {
      const cle = o.etab(r), jour = o.jour(r);
      if (cle === null || cle === undefined || cle === "" || !jour) continue;
      let e = parEtab.get(cle);
      if (!e) parEtab.set(cle, e = { cle, jours: new Map(), derniere: r, ordre: o.ordre(r) });
      const ord = o.ordre(r);
      if (ord > e.ordre || (ord === e.ordre && (r.id || 0) > (e.derniere.id || 0))) { e.derniere = r; e.ordre = ord; }
      const qs = o.qualifs(r).filter(q => q && !estRAS(q));
      if (!qs.length) continue;
      const n = numero(jour);
      const avant = e.jours.get(n);
      e.jours.set(n, qs.reduce(plusGrave, avant === undefined ? qs[0] : avant));
    }

    // 2. épisodes : jours consécutifs touchés avec la même qualification
    const episodes = [], etablissements = [];
    for (const e of parEtab.values()) {
      const jours = [...e.jours.keys()].sort((a, b) => a - b);
      if (!jours.length) continue;
      const siens = [];
      for (const n of jours) {
        const q = e.jours.get(n), dernier = siens[siens.length - 1];
        if (dernier && dernier.qualification === q && n === dernier.fin + 1) dernier.fin = n;
        else siens.push({ qualification: q, debut: n, fin: n });
      }
      const qDerniere = o.qualifs(e.derniere).filter(q => q);
      const enCours = qDerniere.some(q => !estRAS(q));
      const joursPar = {};
      siens.forEach((ep, k) => {
        const duree = ep.fin - ep.debut + 1;
        joursPar[ep.qualification] = (joursPar[ep.qualification] || 0) + duree;
        episodes.push({ cle: e.cle, qualification: ep.qualification, debut: jourDe(ep.debut), fin: jourDe(ep.fin), duree,
          classe: classeDe(duree, cl), enCours: enCours && k === siens.length - 1, rang: k + 1, ligne: e.derniere });
      });
      etablissements.push({ cle: e.cle, premier: jourDe(jours[0]), dernier: jourDe(jours[jours.length - 1]), jours: jours.length,
        classe: classeDe(jours.length, cl), episodes: siens.length, plusGrave: siens.map(x => x.qualification).reduce(plusGrave),
        dernierEtat: qDerniere.length ? qDerniere.reduce(plusGrave) : null, enCours, joursPar, ligne: e.derniere });
    }
    return { episodes, etablissements, classes: cl.map(c => c.libelle) };
  }

  const api = { calculer, classes, BORNES_DEFAUT, estRAS };
  if (typeof window !== "undefined") window.EpisodesQualification = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();

/* =====================================================================
   PRISME — accès aux données du document Grist
   ---------------------------------------------------------------------
   Toutes les lectures et écritures du document passent par ici : un seul endroit pour les comprendre, les
   mesurer et les mettre en cache. Chargé par chaque page après commun/outils.js. window.Donnees :

   Lire et écrire
     lire(table)             table entière, en colonnes : { id: [1, 2…], Colonne: [valeur1, valeur2…] }
                             (fetchTable de l'API des widgets Grist) ; erreur si la table n'existe pas.
     lireSiPresente(table)   même chose, ou null si la table n'existe pas ou n'est pas lisible
                             (document d'une version antérieure, règles d'accès, lien d'établissement).
     ecrire(actions)         applique des actions Grist (applyUserActions : AddRecord, UpdateRecord,
                             BulkAddRecord, AddColumn…) en une seule fois ; rend leur résultat.
     positions(table)        Map : identifiant de ligne → position dans les colonnes d'une table lue.

   Cache (activé par l'administration, dont les onglets relisent souvent les mêmes tables)
     activerCache()          lectures gardées 15 s (1 min pour une table de plus de 5 000 lignes). Toute écriture
                             vide le cache, sauf les grosses tables qu'elle ne touche pas. Chaque lecture rend une
                             copie : un module qui modifie ce qu'il lit ne gâte pas le cache.
     viderCache()            tout relire (corrections faites ailleurs, dans un autre widget ou dans Grist).
     oublierStructure()      relire la structure (_grist_* : pages, tables, colonnes), qui change aussi depuis Grist.

   Suivi
     surEcriture(fn)         fn(tables, actions) après chaque écriture (tables : noms des tables visées ;
                             vide après viderCache) : pour oublier un calcul qui dépendait de ces tables.
     compteurs()             lectures et écritures depuis le chargement : nombre, durée totale et maximale par
                             table (diagnostic de performance ; dans la console : Donnees.compteurs()).
     noterLecture(nom, debut) compter une lecture faite autrement (requête SQL de la saisie) ; debut = performance.now().

   L'objet grist est lu à chaque appel, pas au chargement : le kit de secours remplace grist par sa propre
   version (Grist simulé), et les tests par un faux Grist en mémoire.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- Mesures ---------- */
  const lectures = new Map(); // table → { nombre, ms, max }
  const ecritures = { nombre: 0, actions: 0, ms: 0 };

  function noterLecture(nom, debut) {
    const duree = performance.now() - debut,
      m = lectures.get(nom) || { nombre: 0, ms: 0, max: 0 };
    m.nombre++;
    m.ms += duree;
    m.max = Math.max(m.max, duree);
    lectures.set(nom, m);
  }

  function compteurs() {
    const liste = [...lectures].map(([table, m]) => ({
      table,
      nombre: m.nombre,
      ms: Math.round(m.ms),
      max: Math.round(m.max),
    }));
    liste.sort((a, b) => b.ms - a.ms);
    return { lectures: liste, ecritures: { ...ecritures, ms: Math.round(ecritures.ms) } };
  }

  /* ---------- Cache ---------- */
  const DUREE = 15000,
    DUREE_GROSSE_TABLE = 60000,
    GROSSE_TABLE = 5000; // lignes
  let cache = null; // null : cache inactif ; sinon Map table → { le, grosse, promesse }

  const copie = (t) => {
    const r = {};
    for (const [k, v] of Object.entries(t || {})) r[k] = Array.isArray(v) ? v.slice() : v;
    return r;
  };

  function lireDepuisCache(table, lireVraiment) {
    const e = cache.get(table),
      maintenant = Date.now();
    if (e && maintenant - e.le < (e.grosse ? DUREE_GROSSE_TABLE : DUREE)) return e.promesse.then(copie);
    const entree = { le: maintenant, grosse: false, promesse: lireVraiment() };
    cache.set(table, entree);
    entree.promesse.then(
      (t) => {
        entree.grosse = !!(t && t.id && t.id.length > GROSSE_TABLE);
      },
      () => {
        if (cache.get(table) === entree) cache.delete(table); // lecture en échec : ne pas la garder
      },
    );
    return entree.promesse.then(copie);
  }

  function invalider(tables) {
    if (!cache) return;
    for (const [table, e] of [...cache])
      if (!e.grosse || tables.has(table) || table.startsWith("_grist")) cache.delete(table);
  }

  const activerCache = () => {
    if (!cache) cache = new Map();
    return true;
  };
  const viderCache = () => {
    if (cache) cache.clear();
    prevenir(new Set(), []);
  };
  const oublierStructure = () => {
    if (cache) for (const table of [...cache.keys()]) if (table.startsWith("_grist")) cache.delete(table);
  };

  /* ---------- Écouteurs d'écriture ---------- */
  const ecouteurs = [];
  const surEcriture = (fn) => ecouteurs.push(fn);
  function prevenir(tables, actions) {
    for (const fn of ecouteurs) {
      try {
        fn(tables, actions);
      } catch (e) {
        console.error("Donnees.surEcriture : écouteur en erreur", e);
      }
    }
  }

  /* ---------- Lecture et écriture ---------- */
  function lire(table) {
    const debut = performance.now(),
      lireVraiment = () => grist.docApi.fetchTable(table);
    const promesse = cache ? lireDepuisCache(table, lireVraiment) : lireVraiment();
    return promesse.finally(() => noterLecture(table, debut));
  }

  async function lireSiPresente(table) {
    try {
      return await lire(table);
    } catch (_) {
      return null; // table absente ou illisible
    }
  }

  async function ecrire(actions) {
    const debut = performance.now();
    try {
      return await grist.docApi.applyUserActions(actions);
    } finally {
      ecritures.nombre++;
      ecritures.actions += actions.length;
      ecritures.ms += performance.now() - debut;
      const tables = new Set();
      for (const a of actions) if (Array.isArray(a) && typeof a[1] === "string") tables.add(a[1]);
      invalider(tables);
      prevenir(tables, actions);
    }
  }

  const positions = (table) => new Map(table.id.map((id, i) => [id, i]));

  window.Donnees = {
    lire,
    lireSiPresente,
    ecrire,
    positions,
    activerCache,
    viderCache,
    oublierStructure,
    surEcriture,
    compteurs,
    noterLecture,
  };
})();

/* =====================================================================
   PRISME — petits outils communs à tous les widgets
   ---------------------------------------------------------------------
   Chargé en premier par chaque page (avant socle.js). window.Outils :
     esc(texte)      texte → HTML sûr : & < > " ' remplacés par leurs entités ; null et undefined → "".
                     À utiliser pour TOUT texte venu du document ou d'une saisie inséré par innerHTML,
                     y compris dans une valeur d'attribut entre guillemets.
     $(id)           élément de la page par son identifiant (document.getElementById).
     stockage        préférences d'affichage propres à ce navigateur (localStorage). Le stockage peut être
                     indisponible (navigation privée, politique du poste) : les fonctions ne lèvent jamais
                     d'erreur, une lecture impossible rend la valeur par défaut, une écriture impossible
                     est sans effet.
       .lire(cle, defaut)        texte enregistré, ou defaut
       .ecrire(cle, texte)
       .lireJSON(cle, defaut)    valeur enregistrée par ecrireJSON, ou defaut (absente ou illisible)
       .ecrireJSON(cle, valeur)
     dates           dates et heures, TOUJOURS à l'heure de Paris, quel que soit le fuseau du poste (un agent de
                     La Réunion ou de Guyane voit les mêmes heures qu'un agent parisien). Une valeur peut être un
                     nombre de secondes (format de Grist), de millisecondes, un objet Date ou un texte ISO.
       .date(v, options)       texte de la date (toLocaleDateString), options d'affichage au choix
       .heure(v, options)      texte de l'heure (toLocaleTimeString)
       .dateHeure(v, options)  texte de la date et de l'heure (toLocaleString)
       .parties(v)             { annee, mois (1-12), jour, heures, minutes, secondes, jourSemaine (0 = dimanche) }
       .jour(v)                jour calendaire « AAAA-MM-JJ »
       .aujourdhui()           jour calendaire d'aujourd'hui « AAAA-MM-JJ »
       .instant(jour, h, min)  millisecondes du moment où il est h:min, ce jour-là (« AAAA-MM-JJ »)
       .valeurChamp(v, avecHeure)  valeur d'un champ <input type="date"> ou "datetime-local"
       .depuisChamp(texte)     millisecondes d'une valeur de champ « AAAA-MM-JJ » ou « AAAA-MM-JJTHH:MM »
                     Les colonnes Date de Grist (jour sans heure, rangé à minuit UTC) ne passent pas par ces
                     fonctions : elles s'affichent en UTC, ce qui donne le bon jour partout.
   ===================================================================== */
(function () {
  "use strict";

  const ENTITES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITES[c]);

  const $ = (id) => document.getElementById(id);

  const stockage = {
    lire(cle, defaut = null) {
      try {
        const v = localStorage.getItem(cle);
        return v === null ? defaut : v;
      } catch (_) {
        return defaut; // stockage indisponible
      }
    },
    ecrire(cle, texte) {
      try {
        localStorage.setItem(cle, texte);
      } catch (_) {
        // stockage indisponible ou plein : la préférence ne sera simplement pas retenue
      }
    },
    lireJSON(cle, defaut = null) {
      try {
        const v = JSON.parse(localStorage.getItem(cle));
        return v ?? defaut;
      } catch (_) {
        return defaut; // stockage indisponible ou contenu illisible
      }
    },
    ecrireJSON(cle, valeur) {
      stockage.ecrire(cle, JSON.stringify(valeur));
    },
  };

  /* ---------- Dates à l'heure de Paris ---------- */
  const FUSEAU = "Europe/Paris";
  function enDate(v) {
    if (v == null || v === "") return null;
    const d = v instanceof Date ? v : typeof v === "number" ? new Date(Math.abs(v) < 1e11 ? v * 1000 : v) : new Date(v);
    return isNaN(d) ? null : d;
  }
  const texte = (methode) => (v, options) => {
    const d = enDate(v);
    return d ? d[methode]("fr-FR", { ...options, timeZone: FUSEAU }) : "";
  };
  const deux = (n) => String(n).padStart(2, "0");
  const decoupeur = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  function parties(v) {
    const d = enDate(v);
    if (!d) return null;
    const p = Object.fromEntries(decoupeur.formatToParts(d).map((x) => [x.type, Number(x.value)]));
    const r = { annee: p.year, mois: p.month, jour: p.day, heures: p.hour % 24, minutes: p.minute, secondes: p.second };
    r.jourSemaine = new Date(Date.UTC(r.annee, r.mois - 1, r.jour)).getUTCDay();
    return r;
  }
  const jour = (v) => {
    const p = parties(v);
    return p ? `${p.annee}-${deux(p.mois)}-${deux(p.jour)}` : "";
  };
  // écart entre l'heure de Paris et UTC au moment donné (ms) : 1 h en hiver, 2 h en été
  function decalage(ms) {
    const p = parties(ms);
    return Date.UTC(p.annee, p.mois - 1, p.jour, p.heures, p.minutes, p.secondes) - Math.floor(ms / 1000) * 1000;
  }
  function instant(jourIso, h = 0, min = 0) {
    const [a, m, j] = String(jourIso).split("-").map(Number);
    const commeUTC = Date.UTC(a, m - 1, j, h, min);
    const t = commeUTC - decalage(commeUTC);
    return commeUTC - decalage(t); // second calcul : juste aussi autour des changements d'heure
  }
  function valeurChamp(v, avecHeure) {
    const p = parties(v);
    if (!p) return "";
    const j = `${p.annee}-${deux(p.mois)}-${deux(p.jour)}`;
    return avecHeure ? `${j}T${deux(p.heures)}:${deux(p.minutes)}` : j;
  }
  function depuisChamp(texteChamp) {
    const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(texteChamp || ""));
    return m ? instant(m[1], Number(m[2] || 0), Number(m[3] || 0)) : null;
  }
  const dates = {
    FUSEAU,
    enDate,
    date: texte("toLocaleDateString"),
    heure: texte("toLocaleTimeString"),
    dateHeure: texte("toLocaleString"),
    parties,
    jour,
    aujourdhui: () => jour(Date.now()),
    instant,
    valeurChamp,
    depuisChamp,
  };

  window.Outils = { esc, $, stockage, dates };
})();

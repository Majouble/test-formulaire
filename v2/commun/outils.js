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

  window.Outils = { esc, $, stockage };
})();

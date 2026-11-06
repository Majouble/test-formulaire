// Préchargé par fuseaux.js (node -r ./fuseau-navigateur.js runNN.js) : le navigateur lancé par le scénario prend le
// fuseau FUSEAU_NAVIGATEUR (ex. Indian/Reunion) ; le scénario lui-même (Node) garde le sien, pour que les données
// d'essai soient les mêmes quel que soit le fuseau simulé.
"use strict";
const pw = require("playwright");
const fuseau = process.env.FUSEAU_NAVIGATEUR;
if (fuseau) {
  const lancer = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = (options = {}) =>
    lancer({ ...options, env: { ...process.env, ...(options.env || {}), TZ: fuseau } });
}

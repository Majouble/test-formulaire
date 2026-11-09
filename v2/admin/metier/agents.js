/* =====================================================================
   PRISME — règles métier : colonnes de la table Agents et liens d'invités
   ---------------------------------------------------------------------
   Colonnes de la table Agents (fiche, lien d'invité, champs d'accès, viseurs) et formules du lien personnel d'un agent
   invité. La clé d'accès et la formule de la colonne Auteur sont dans commun/socle.js (INVITE, formuleAuteur).
   Chargé par la page d'administration seulement, après commun/socle.js et commun/metier/.

   Définit (sur window.Socle) : DUREES_INVITE, ANCIENNE_FORMULE_LIEN_INVITE, formuleLienInvite, colonnesAgents.
   Utilise (window.Socle) : CHAMPS, choix, general, INVITE, json, STYLE_LIEN, reglagesPlanning, COLONNES_VISEURS.
   ===================================================================== */
(function () {
  "use strict";

  const { CHAMPS, choix, general, INVITE, json, STYLE_LIEN, reglagesPlanning, COLONNES_VISEURS } = window.Socle;

  // Champs_acces (formule) : champs EN / ESR sur lesquels l'agent est mobilisé au planning, 7 jours avant ou après
  // aujourd'hui ; lu par les règles d'accès (onglet Accès). Grist réévalue NOW() environ toutes les heures.
  const formuleChampsAcces = (
    reglagesGeneraux,
  ) => `# Champs (EN, ESR) sur lesquels l'agent est mobilisé au planning, 7 jours avant ou après aujourd'hui.
# Lu par les règles d'accès (onglet Accès de l'administration). Recalculé environ toutes les heures.
from datetime import timedelta
if not $Actif:
  return []
maintenant = NOW()
champs = set()
for a in ${reglagesGeneraux.affectations}.lookupRecords(Agent=$id):
  c = a.Creneau
  if c and c.Debut and c.Fin and c.Fin >= maintenant - timedelta(days=7) and c.Debut <= maintenant + timedelta(days=7):
    champs.update(a.Champ or ${json(CHAMPS.map((champ) => champ.id))})
return sorted(champs)`;
  // Durées de validité d'un lien d'invité (clé « acces_invites » de Config, réglée dans l'onglet Équipe › Agents)
  const DUREES_INVITE = [
    ["24h", "24 heures", 24],
    ["72h", "3 jours", 72],
    ["7j", "7 jours", 168],
    ["30j", "30 jours", 720],
    ["illimite", "sans limite", 0],
  ];
  const ANCIENNE_FORMULE_LIEN_INVITE = `SELF_HYPERLINK(page=$${INVITE.page} or None, LinkKey_${INVITE.attribut}=$${INVITE.cle}) if $${INVITE.cle} else ""`;
  const formuleLienInvite = () =>
    `(SELF_HYPERLINK(page=$${INVITE.page} or None, LinkKey_${INVITE.attribut}=$${INVITE.cle})${STYLE_LIEN}) if $${INVITE.cle} else ""`;
  function colonnesAgents(config) {
    const reglagesGeneraux = general(config);
    return [
      { id: "Nom", type: "Text" },
      { id: "Email", type: "Text" },
      { id: "Telephone", type: "Text" },
      { id: "Actif", type: "Bool" },
      // équipe (texte libre : « Équipe A », « Nuit »…) et fonction habituelle (proposée sur le planning, qui reste maître créneau par créneau)
      { id: "Equipe", type: "Text" },
      {
        id: "Fonction",
        type: "Choice",
        widgetOptions: choix(reglagesPlanning(config).fonctions.map((fonction) => fonction.nom)),
      },
      { id: "Modifie_le", type: "DateTime:Europe/Paris" },
      { id: INVITE.cle, type: "Text" },
      { id: INVITE.page, type: "Int" },
      { id: INVITE.expire, type: "DateTime:Europe/Paris" },
      {
        id: "Champs_acces",
        type: "ChoiceList",
        isFormula: true,
        formula: formuleChampsAcces(reglagesGeneraux),
        widgetOptions: choix(CHAMPS.map((champ) => champ.id)),
      },
      { id: INVITE.lien, type: "Text", isFormula: true, formula: formuleLienInvite() },
      // lien encore valable (recalculé par Grist à chaque modification et au moins toutes les heures) : lu par les règles d'accès
      {
        id: INVITE.valide,
        type: "Bool",
        isFormula: true,
        formula: `bool($${INVITE.cle}) and (not $${INVITE.expire} or $${INVITE.expire} > NOW())`,
      },
      // viseurs (onglet Validation) : échelon et périmètre de visa ; périmètre vide = tous les départements ou académies
      ...COLONNES_VISEURS,
    ];
  }

  Object.assign(window.Socle, {
    DUREES_INVITE,
    ANCIENNE_FORMULE_LIEN_INVITE,
    formuleLienInvite,
    colonnesAgents,
  });
})();

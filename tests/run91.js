// « Corriger les saisies » : colonne « Nom du site » de type référence aux sites, qui garde les anciens noms (références non résolues)
process.argv[2] = 'ref';
require('./run90');

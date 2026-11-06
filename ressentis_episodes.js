// Causes des épisodes lents de la partie 05, renseignées après coup à partir du terrain.
// Clé : identifiant de l'épisode (sortie@km de début), affiché au survol du tableau.
// causes : la première est la cause principale (seule comptée dans le bilan), les suivantes sont secondaires.
// Catégories : terrain_instable · hors_sentier · meteo · itineraire · evaluation · arret
// certitude : 'sure' ou 'probable'.
window.RESSENTIS_EPISODES = {
  'stuvla@140.6':           { causes: ['terrain_instable'], detail: 'Éboulement, terrain instable : progression très prudente.', certitude: 'sure' },
  'bunes_munkebu@84.7':     { causes: ['hors_sentier'], detail: 'Pierrier, boue et végétation sans sentier : la portion la plus lente de la traversée.', certitude: 'sure' },
  'last_trail@151.5':       { causes: ['meteo', 'terrain_instable'], detail: 'Vent et pluie ; dernière descente prise avec prudence.', certitude: 'sure' },
  'napp_nusfjord_1@5.8':    { causes: ['itineraire'], detail: 'Sentier peu visible : plusieurs retours en arrière.', certitude: 'sure' },
  'munkebu_reine@98.1':     { causes: ['hors_sentier', 'evaluation'], detail: 'Bord de fjord sans chemin, en pierrier ; arrêts pour juger si un passage est faisable.', certitude: 'sure' },
  'munkebu_sorvagen@118.5': { causes: ['meteo'], detail: 'Vent extrême et pluie battante.', certitude: 'sure' },
  'nusfjord_nesland@18.8':  { causes: ['arret'], detail: 'Probablement une pause pour réajuster le sac, au premier départ après la première nuit.', certitude: 'probable' },
  'horseid_beach@67':       { causes: ['evaluation', 'arret'], detail: 'Repérage d’un emplacement de bivouac en haut du col, et une rencontre.', certitude: 'sure' },
  'sorvagen_a@123.5':       { causes: ['arret'], detail: 'Ravitaillement.', certitude: 'sure' },
};

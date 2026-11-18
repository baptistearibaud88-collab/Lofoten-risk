// Causes des épisodes lents de la partie 02, renseignées après coup à partir du terrain.
// Clé : identifiant de l'épisode (sortie@km de début), affiché au survol du tableau.
// causes : la première est la cause principale (seule comptée dans le bilan), les suivantes sont secondaires.
// partage (facultatif) : { meteo: 'stress' } donne à la météo la part du temps perdu mesurée par le test de
// résistance de la simulation (+X % sur le temps prévu de l'épisode) ; le reste va à la cause principale.
// Catégories : sentier (peu visible, hors sentier) · terrain_instable · meteo · evaluation · arret
// Les épisodes de moins de 10 min ne sont pas détaillés : ils comptent comme pauses probables.
// certitude : 'sure' ou 'probable'.
window.RESSENTIS_EPISODES = {
  'stuvla@140.6':           { causes: ['sentier', 'meteo'], partage: { meteo: 'stress' }, detail: 'Barre rocheuse introuvable : névé, pierrier, rocher glissant, vide proche. Sous la pluie, progression très prudente.', certitude: 'sure' },
  'bunes_munkebu@84.7':     { causes: ['sentier'], detail: 'Le bord du fjord : boue, sentier invisible, pierriers en dévers, glissements de terrain. Le plus de pauses et l’allure la plus faible de la traversée.', certitude: 'sure' },
  'last_trail@151.5':       { causes: ['meteo', 'terrain_instable'], detail: 'Pluie et vent : la pluie rend le chemin glissant et gonfle les torrents. Dernière descente prise avec prudence.', certitude: 'sure' },
  'napp_nusfjord_1@5.8':    { causes: ['sentier'], detail: 'Sentier presque invisible au-dessus de la falaise : je me trompe de chemin, plusieurs retours en arrière, sous la chaleur et avec un sac lourd pour la première fois.', certitude: 'sure' },
  'munkebu_reine@98.1':     { causes: ['sentier', 'evaluation'], detail: 'Bord de fjord sans chemin, en pierrier ; arrêts pour juger si un passage est faisable.', certitude: 'sure' },
  'munkebu_sorvagen@118.5': { causes: ['meteo'], detail: 'Vent extrême : il fouette la pluie au visage, ralentit chaque pas et oblige à s’arrêter souvent.', certitude: 'sure' },
  'nusfjord_nesland@18.8':  { causes: ['arret'], detail: 'Premier départ après la première nuit : du temps pour régler le sac et apprendre à le porter, bâtons en main.', certitude: 'sure' },
  'horseid_beach@67':       { causes: ['evaluation', 'arret'], detail: 'Impossible de camper au lac : au col, je cherche un abri du vent pour la nuit, sans en trouver. Puis, dans le pierrier vers Horseid, vingt minutes d’échange avec Remco, un randonneur néerlandais.', certitude: 'sure' },
};

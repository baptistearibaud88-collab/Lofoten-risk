# Lofoten Traverse — Planning, Luck and Risk

Traversée des îles Lofoten (Norvège), du 13 au 23 juin 2026 : 159 km, 9 889 m de dénivelé positif, 7 campements, 9 sommets.

> Dans quelle mesure la réussite d'une expédition vient-elle du plan et des décisions, plutôt que de circonstances favorables ?

## La carte

La page d'accueil (`index.html`) est une carte 3D des Lofoten : trace bleu foncé marchée avec le sac, trace rouge en trail sans sac, bivouacs en bleu foncé, sommets en triangles noirs. Trois rubriques : bivouacs, sommets (chaque sortie trail se rejoue) et étapes avec le sac de bivouac en bivouac ; un bouton rejoue toute la traversée. Compteurs en direct, profil d’altitude et de fréquence cardiaque, caméra drone, orbite ou fixe, campements et sommets. Un clic sur un campement fait voler la caméra jusqu'à lui et affiche la nuit : sommeil, fréquence cardiaque au repos, HRV, Body Battery, météo corrigée de l'altitude, poids estimé du sac le lendemain.

## En cours

- Collecte des données (GPS Garmin, météo ERA5, nourriture, équipement, sommeil, dépenses) : presque terminée
- Récit jour par jour et données de planification (livre-guide)
- Analyses : biais du plan, simulation Monte Carlo, indice de dangerosité
- Chapitres jour par jour de la carte-récit

## Données du rapport de risque

`risque_data.js` (analyse principale) et `data.js` (trace et récit) sont générés hors de ce dépôt. Dix fichiers en sont dérivés ici, à régénérer dans cet ordre après chaque mise à jour :

```
node outils/segmentation_terrain.js   # cotation par section (partie 02) → risque_sections.js
node outils/distribution.js           # distribution des écarts, sans artefact GPS (partie 03) → risque_dist.js
node outils/episodes_allure.js        # épisodes d'allure et massifs (parties 05–06) → risque_episodes.js
node outils/plan_reel.js              # plan (donnees/plan.gpx) contre réel (partie 13) → risque_plan.js
node outils/bougies_sorties.js        # bougies par sortie (partie 01) → risque_bougies.js
node outils/meteo_series.js           # persistance de la pluie, 1 200 fenêtres (partie 09) → risque_meteo.js
node outils/indice_danger.js          # indice de danger sans artefact GPS (partie 10) → risque_indice.js
node outils/sensibilites.js           # régression et matrice sans artefact GPS (partie 07) → risque_sens.js
node outils/monte_carlo.js            # prévision du J2, contrôle a posteriori, test de résistance (partie 11) → risque_mc.js
node outils/carte_resume.js           # encart « Analyse de risque » de la carte → risque_carte.js
```

`donnees/era5_climatology_1996_2025_daily.json` : pluie quotidienne ERA5 1996–2025 au point centre (copie de `data/raw/weather/`), lue par `outils/meteo_series.js`.

`ressentis_episodes.js` se remplit à la main : cause de chaque épisode lent de 10 min ou plus.

## Sources des fonds de carte

Relief : Mapzen / AWS Terrain Tiles · Imagerie : Esri World Imagery · Topo : OpenTopoMap (© OpenStreetMap, CC-BY-SA) · Carte : MapLibre GL JS

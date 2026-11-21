# Branche `version-courte-acte-2` : raccourcir le rapport et le mettre en forme finale (suite)

Lis ce fichier en premier si tu reprends ce travail dans une nouvelle conversation.

## Règles
- **On travaille uniquement sur la branche `version-courte-acte-2`** (créée le 18/11 à partir de `version-courte`, que Baptiste fusionne lui-même dans `main` : introduction et acte 1 terminés, v0.4). `main` est le site en ligne : on n'y touche pas ; fusion seulement quand Baptiste le demande.
- Le site ne se publie que depuis `main` : les changements de cette branche ne sont pas en ligne. Pour les montrer à Baptiste :
  - captures d'écran : `python3 outils/apercu/captures.py s1 s6` (une ou plusieurs parties, `--mobile` pour le téléphone) ou `python3 outils/apercu/captures.py tout`, puis envoyer les images de `apercu/` dans la conversation ;
  - aperçu en ligne de la branche (Baptiste peut l'ouvrir lui-même sur son téléphone) : `https://raw.githack.com/baptistearibaud88-collab/Lofoten-risk/version-courte-acte-2/risque.html` (mis à jour quelques minutes après chaque envoi).
- Compter les mots de chaque encadré : `python3 outils/apercu/textes.py`.
- Après chaque modification validée : commit sur `version-courte-acte-2`, puis `git push origin version-courte-acte-2`. Monter les numéros de version `?v=` dans `risque.html` à chaque changement de `risque.js` ou `risque.css`.
- Fusion dans `main` seulement quand Baptiste le demande.

## Objectif (Baptiste, 14–18/11)
- Rapport lisible : garder les données cruciales et le fil de l'histoire. Cible : environ 6 000 mots (acte 1 ≈ 1 500, acte 2 ≈ 2 000, acte 3 ≈ 2 500), contre ≈ 9 600 au départ de la branche.
- Règle des encadrés : introduction ≤ 45 mots ; « Comment lire » ≤ 35 mots et c'est le texte le plus long des encadrés ; plus d'encadré « Méthode » (dans un bouton « ? » sur le titre du graphique) ; « À retenir » ≤ 55 mots = 2 ou 3 chiffres en gras + 2 phrases d'histoire. Exemple fait : partie 04 (épisodes lents).
- Tableaux de détail dans des boutons (déjà fait : cotation des 25 sorties, épisodes lents).
- Encadrés d'une même ligne à la même hauteur.
- Textes en français simple, pour des non-financiers ; les notions de finance derrière les boutons « ? », rédigés comme en cours (d'où ça vient, construction, exemple chiffré).

## Ce qui est décidé
- Trois actes : 1 Mesurer (01–03), 2 Expliquer (04–06), 3 Piloter (07–10). L'acte 2 est validé tel quel.
- Pistes pour l'acte 1 (Baptiste réfléchit encore) : fusionner distribution + extrêmes, et épisodes lents + massifs.
- Indice de danger (08) : Baptiste réfléchit.
- Acte 3 : à alléger (« on a mis beaucoup de choses ») ; la partie chance ou décision et la conclusion ne sont pas finies.
- Conclusion : finir sur la blague de Baptiste : « avec les allers-retours au campement pour faire le stock d'eau pour le réchaud et l'hydratation, j'ai passé la barre des 10 000 m de D+ 😜 » (mesuré : 9 892 m).

## Avancement (18/11)
- Le rapport compte maintenant **10 parties** : 02 « Écarts et temps perdu » réunit les anciennes 02, 03 (extrêmes, en bandeau dépliable) et 04 (épisodes lents). Les parties suivantes sont renumérotées (05 → 03 … 12 → 10).
- 01 validée telle quelle (remise comme sur main). 02 et 03 faites et validées ; introduction épurée (problématique + périmètre + sommaire). Acte 1 terminé.
- Étalon de la partie 02 : on garde Tobler recalé sur l'allure moyenne avec et sans le sac (convention annoncée, testée dans le bouton « ? »). Ne pas rouvrir sans Baptiste.
- Partie 03 : risque spécifique (terrain, ± 67 min) et systématique (pluie, +13 % à terrain égal, +50 min), calculés dans `outils/episodes_allure.js` (`sys`). La Støvla (bouton des épisodes) utilise ce même +13 %.
- 21/11 : 05 météo, contenu inchangé, en-têtes des graphiques alignés et largeurs des encadrés calculées pour qu'ils finissent à la même hauteur. **06 : l'indice de danger est supprimé** (but pas clair, terrain et pente corrélés, alertes = simple design). Après un essai de bilan en minutes par facteur (retiré : une journée de base sans sac sur du plat n'a pas de sens), la 06 devient **« Les grecs du trek »** : six cartes (question « de combien » en version trek, texte, petit graphique, « ? » avec la dérivée partielle et sa phrase finance), bouton `grecs` sous l'introduction. Revue détaillée du 21/11 : Δ terrain +15 %/niveau (moyenne), descente +22 % ; **Γ = le saut du terrain** (+9 % n.s. / **+25 %** modéré → exigeant, t ≥ 3,1 en retirant chaque sortie / +8 % n.s.) ; ν : montée raide régulière (0,22 contre 0,34, p < 0,001), sans sac plus d'alternance (0,36 contre 0,30, p = 0,006) ; le terrain dur n'augmente pas la volatilité (p = 0,17, retiré) ; Θ fourchette asymétrique (−2 h 50 / +3 h 48 au J9), arrivée +3 h 21 (centile 93), sans enchaînement elle s'arrêterait à +2 h 13 ; ρ sac +41 %, jamais porté en expert ; **second ordre = sac × pluie**, seul des 55 croisements à tenir : +67 % au sec, +21 % sous la pluie (2 sorties avec le sac sous la pluie). Abandonnés : sac × cote (extrapolé en expert, disparaît sans les deux sorties faciles du J7), vanna, charm, sac × montée raide (confondu avec les jours). Calcul : `node outils/conclusion_acte2.js` → `risque_acte2.js`. `risque_indice.js` reste chargé (rangs utilisés ailleurs).
- Prochaines : validation de la 06 par Baptiste, revue de la 04, fusion de `version-courte-acte-2` dans `main`, puis acte 3.

Le détail de chaque partie et tous les chiffres sont dans les documents de projet `claude/version_courte.md` (avancement de cette branche, nouvelle numérotation) et `claude/analyse_risque.md` (référence, ancienne numérotation à 12 parties).

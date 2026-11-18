# Branche `version-courte` : raccourcir le rapport et le mettre en forme finale

Lis ce fichier en premier si tu reprends ce travail dans une nouvelle conversation.

## Règles
- **On travaille uniquement sur la branche `version-courte`.** `main` est le site en ligne : on n'y touche pas avant la fusion finale.
- Le site ne se publie que depuis `main` : les changements de cette branche ne sont pas en ligne. Pour les montrer à Baptiste :
  - captures d'écran : `python3 outils/apercu/captures.py s1 s6` (une ou plusieurs parties, `--mobile` pour le téléphone) ou `python3 outils/apercu/captures.py tout`, puis envoyer les images de `apercu/` dans la conversation ;
  - aperçu en ligne de la branche (Baptiste peut l'ouvrir lui-même sur son téléphone) : `https://raw.githack.com/baptistearibaud88-collab/Lofoten-risk/version-courte/risque.html` (mis à jour quelques minutes après chaque envoi).
- Compter les mots de chaque encadré : `python3 outils/apercu/textes.py`.
- Après chaque modification validée : commit sur `version-courte`, puis `git push origin version-courte`. Monter les numéros de version `?v=` dans `risque.html` à chaque changement de `risque.js` ou `risque.css`.
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
- 01 validée telle quelle (remise comme sur main). 02 faite et validée.
- Étalon de la partie 02 : on garde Tobler recalé sur l'allure moyenne avec et sans le sac (convention annoncée, testée dans le bouton « ? »). Ne pas rouvrir sans Baptiste.
- Prochaines : 03 massifs, puis acte 3.

Le détail de chaque partie et tous les chiffres sont dans les documents de projet `claude/version_courte.md` (avancement de cette branche, nouvelle numérotation) et `claude/analyse_risque.md` (référence, ancienne numérotation à 12 parties).

// Encart « Analyse de risque » de la carte (index.html, sous les alertes).
// Entrées : risque_data.js, risque_dist.js, risque_episodes.js, risque_sens.js, risque_indice.js.
// Sortie  : risque_carte.js, chargé après risque_resume.js et qui en corrige les valeurs :
//   node outils/carte_resume.js   (à relancer après outils/sensibilites.js)
//
// risque_resume.js (analyse_risque.py) affichait « ×2,4 écarts extrêmes vs loi normale » et une
// courbe d'irrégularité avec le pic de l'artefact GPS de Kvalvika. Ici : la courbe vient de
// l'irrégularité glissante de la partie 05 (sans artefact), et le premier chiffre devient
// l'enchaînement de la partie 06 (incertitude ×2,1 si l'on tient compte des massifs).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_data.js', 'risque_dist.js', 'risque_episodes.js', 'risque_sens.js', 'risque_indice.js'].forEach(f => require(path.join(root, f)));
const R = window.RISK, D = window.RISK_DIST, A = window.RISK_EPISODES.topo.agg, SX = window.RISK_SENS, IX = window.RISK_INDICE;
const spark = [];
R.series.forEach((s, i) => { if (i % 3 === 0 && D.roll_sd[i] != null) spark.push([Math.round(s.km * 10) / 10, D.roll_sd[i]]); });
const sac = SX.sens.find(s => s.name === 'sac sur le dos').pct;
const alertIds = R.rows.filter(r => r.alert.length && r.alert.some(a => !/camper/i.test(a))).map(r => r.id);
const physRanks = IX.rows.filter(o => alertIds.includes(o.id)).map(o => o.rank);
const out = { spark, long_sd: D.roll_mean_sd, chain: Math.round(A.massif / A.seg * 10) / 10, sac: Math.round(sac), phys_top: physRanks.filter(k => k <= Math.ceil(R.rows.length / 3)).length, phys_n: physRanks.length };
fs.writeFileSync(path.join(root, 'risque_carte.js'), `// généré par outils/carte_resume.js — ne pas modifier à la main\nObject.assign(window.RISK_CARD || (window.RISK_CARD = {}), ${JSON.stringify(out)});\n`);
console.log({ ...out, spark: `${spark.length} points, max ${Math.max(...spark.map(p => p[1]))}` });

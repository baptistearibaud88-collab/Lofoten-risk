// Encart « Analyse de risque » de la carte (index.html) : bulle d'accueil et carte sous les alertes.
// Entrées : risque_data.js, risque_dist.js, risque_sens.js, risque_mc.js.
// Sortie  : risque_carte.js   (node outils/carte_resume.js, à relancer après outils/sensibilites.js
//           et outils/monte_carlo.js)
// Courbe : l'irrégularité glissante de l'allure (sans l'artefact GPS de Kvalvika) ; triangles : les
// alertes de terrain de la carte ; chiffres : sac, descente raide, niveau de terrain (partie 04).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_data.js', 'risque_dist.js', 'risque_sens.js', 'risque_mc.js'].forEach(f => require(path.join(root, 'data', f)));
const R = window.RISK, D = window.RISK_DIST, SX = window.RISK_SENS;
const spark = [];
R.series.forEach((s, i) => { if (i % 3 === 0 && D.roll_sd[i] != null) spark.push([Math.round(s.km * 10) / 10, D.roll_sd[i]]); });
const sac = SX.sens.find(s => s.name === 'sac sur le dos').pct;
const pctOf = n => Math.round(SX.sens.find(x => x.name === n).pct);
const out = { terrain: pctOf('terrain (+1 niveau)'), raide: pctOf('descente raide (> 15 %)'), sac: Math.round(sac), spark, long_sd: D.roll_mean_sd, alerts: R.alerts.map(a => [a.km, a.titre]) };
// bulle d'accueil : la simulation de la partie 07 en miniature (prévision au soir du J2, modèle par blocs)
// 39 points le long de la suite du parcours, 28 trajectoires simulées, bande 5–95 % et écart réel (heures).
const MC = window.RISK_MC, B = MC.blocs.seg, nP = 39, pick = a => Array.from({ length: nP }, (_, i) => Math.round(a[Math.round(i * (a.length - 1) / (nP - 1))] * 100) / 100);
out.mc_mini = { paths: Array.from({ length: 28 }, (_, k) => pick(B.paths[Math.floor(k * B.paths.length / 28)])), p5: pick(B.bands['5']), p95: pick(B.bands['95']), real: pick(MC.real_dev) };
fs.writeFileSync(path.join(root, 'data', 'risque_carte.js'), `// généré par outils/carte_resume.js — ne pas modifier à la main\nwindow.RISK_CARD = ${JSON.stringify(out)};\n`);
console.log({ ...out, mc_mini: `réel final ${out.mc_mini.real[nP - 1]} h`, spark: `${spark.length} points, max ${Math.max(...spark.map(p => p[1]))}` });

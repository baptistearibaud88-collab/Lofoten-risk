// Bougies par sortie (partie 01).
// Entrées : data.js (trace GPS, altitude de chaque point) et risque_data.js (D+, sac, durée).
// Sortie  : risque_bougies.js — à relancer après chaque régénération des données :
//   node outils/bougies_sorties.js
//
// Une bougie par sortie, dans l'ordre de la trace : altitude de départ, point haut,
// point bas et altitude d'arrivée, lus sur tous les points GPS de la sortie.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'risque_data.js')); require(path.join(root, 'data.js'));
const R = window.RISK, TR = window.TREK.trace.features;

const bougies = TR.map(f => {
  const p = f.properties, r = R.rows.find(x => x.id === p.id);
  if (!r) throw new Error(`sortie absente de risque_data.js : ${p.id}`);
  const al = f.geometry.coordinates.map(c => c[2]);
  return { id: p.id, name: r.name, day: r.day, date: p.date, sac: r.sac, o: al[0], h: Math.max(...al), l: Math.min(...al), c: al[al.length - 1], dplus: r.dplus, km: r.km, mov_h: r.mov_h, start: r.start };
});
const manque = R.rows.filter(r => !bougies.find(b => b.id === r.id));
if (manque.length) throw new Error(`sorties sans trace : ${manque.map(r => r.id).join(', ')}`);
fs.writeFileSync(path.join(root, 'risque_bougies.js'), `// généré par outils/bougies_sorties.js — ne pas modifier à la main\nwindow.RISK_BOUGIES = ${JSON.stringify(bougies)};\n`);
bougies.forEach(b => console.log(`J${b.day}`, b.id.padEnd(22), `O ${b.o}  H ${b.h}  B ${b.l}  C ${b.c}  D+ ${b.dplus}`));

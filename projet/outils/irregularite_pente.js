// Irrégularité de l'allure et pente des passages raides de chaque sortie, recalculées sans les artefacts GPS :
// entrée de outils/sensibilites.js (matrice de corrélation de la partie 04).
// Entrée : risque_data.js (sorties et tronçons de 250 m).
// Sortie : risque_irregularite.js — à relancer après chaque régénération de risque_data.js :
//   node outils/irregularite_pente.js
//
// analyse_risque.py calcule ces deux facteurs sur tous les tronçons : l'irrégularité (écart-type de e,
// ramené vers l'écart-type de l'ensemble avec un poids de 8 tronçons) et la pente des passages raides
// (90e centile de |pente|, ramené de la même façon), y compris l'artefact GPS de Kvalvika (pente de −79 %
// sur 250 m, même règle que outils/distribution.js : |pente| > 60 %). Ici, ils sont recalculés sans les artefacts.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'data', 'risque_data.js'));
const R = window.RISK, S = R.series, rows = R.rows;
const GPS_SLOPE = 60, K = 8;

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sdS = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const q = (a, p) => { const b = [...a].sort((x, y) => x - y), h = (b.length - 1) * p, lo = Math.floor(h); return b[lo] + (b[Math.min(lo + 1, b.length - 1)] - b[lo]) * (h - lo); };
const r3 = v => Math.round(v * 1000) / 1000;

function build(keepSeg) {
  const segs = S.filter(keepSeg);
  const poolSd = sdS(segs.map(s => s.e)), poolP = q(segs.map(s => Math.abs(s.slope)), .9);
  return rows.map(r => {
    const ss = segs.filter(s => s.act === r.id), n = ss.length;
    const sd = (n * sdS(ss.map(s => s.e)) + K * poolSd) / (n + K);
    const pm = (n * q(ss.map(s => Math.abs(s.slope)), .9) + K * poolP) / (n + K);
    return { id: r.id, n_seg: n, e_sd: r3(sd), pente_max: Math.round(pm * 10) / 10 };
  });
}

// contrôle : avec tous les tronçons, on doit retrouver les valeurs de risque_data.js
const chk = build(() => true);
const dSd = Math.max(...chk.map((o, i) => Math.abs(o.e_sd - rows[i].e_sd)));
const dPm = Math.max(...chk.map((o, i) => Math.abs(o.pente_max - rows[i].pente_max)));
console.log(`contrôle sur tous les tronçons : écart max ${dSd.toFixed(3)} sur l'irrégularité, ${dPm.toFixed(1)} point sur la pente`);
if (dSd > .002 || dPm > .2) throw new Error('la reconstruction ne retrouve pas analyse_risque.py');

const out = { rows: build(s => Math.abs(s.slope) <= GPS_SLOPE) };
out.artefacts = S.map((s, i) => i).filter(i => Math.abs(S[i].slope) > GPS_SLOPE).map(i => ({ i, act: S[i].act, slope: S[i].slope }));
fs.writeFileSync(path.join(root, 'data', 'risque_irregularite.js'), `// généré par outils/irregularite_pente.js — ne pas modifier à la main\nwindow.RISK_IRREG = ${JSON.stringify(out)};\n`);
out.rows.forEach(o => console.log(o.id.padEnd(22), String(o.n_seg).padStart(3), o.e_sd.toFixed(3), String(o.pente_max).padStart(5)));

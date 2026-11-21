// Conclusion de l'acte 2 (partie 06) : ce que chaque facteur a coûté, jour par jour, et les « grecs ».
// Entrées : risque_data.js (tronçons, sorties, météo), risque_sens.js (effets de la partie 04),
//           risque_episodes.js (effet de la pluie, partie 03), risque_mc.js (fourchette de la simulation, partie 07).
// Sortie  : risque_acte2.js — à relancer après outils/sensibilites.js et outils/monte_carlo.js :
//   node outils/conclusion_acte2.js
//
// Attribution du temps réel de chaque tronçon (604, sans l'artefact GPS) aux facteurs mesurés dans l'histoire :
// sac, terrain, descente raide et VFC avec les effets de la partie 04 (e^β − 1 publiés), pluie avec l'effet de la
// partie 03 (+13 % à terrain égal, jours de 1 mm ou plus : J7–J9, comme pour la Støvla) :
//   temps réel = temps de base × exp(Σ βk·Δxk)
// Δxk = écart à une journée de base : sans sac, terrain facile (cote 1), pas de descente raide (< −15 %),
// jour sec, VFC de 45 ms (nuit ordinaire). Les minutes au-dessus de la base sont
// partagées entre facteurs au prorata de βk·Δxk (attribution logarithmique, comme en finance).
// La pente (|pente|) reste dans la base : elle corrige l'étalon de Tobler, ce n'est pas un facteur de risque.
// Rafales : écartées. Dans la régression de la partie 04 elles portent la pluie (vent et pluie arrivent ensemble) ;
// avec la pluie dans la régression, leur effet tombe à +0,9 % et n'est plus distinguable du hasard. Les garder
// donnait de la « météo » au J1 (vent sec), qui n'a rien coûté sur le terrain.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_data.js', 'risque_sens.js', 'risque_episodes.js', 'risque_mc.js'].forEach(f => require(path.join(root, f)));
const R = window.RISK, SX = window.RISK_SENS, MC = window.RISK_MC, mm = R.dist.mode_mu, GPS_SLOPE = 60;
const rowOf = Object.fromEntries(R.rows.map(r => [r.id, r]));
const eff = Object.fromEntries(SX.sens.map(s => [s.name, s.pct]));
const B = {
  sac: Math.log(1 + eff['sac sur le dos'] / 100),
  terrain: Math.log(1 + eff['terrain (+1 niveau)'] / 100),
  desc: Math.log(1 + eff['descente raide (> 15 %)'] / 100),
  meteo: Math.log(1 + window.RISK_EPISODES.sys.rain_pct),
  fatigue: Math.log(1 + eff['fatigue (VFC −10 ms)'] / 100),
};
const BASE = { grade: 1, hrv: 45, wet_mm: 1 }, K = Object.keys(B);
const wetDay = Object.fromEntries(R.weather.days.map(d => [d.day, +(d.rain >= BASE.wet_mm)]));
const tob = sl => 6 * Math.exp(-3.5 * Math.abs(sl / 100 + .05));
const S = R.series, dk = S.map((s, i) => s.km - (i ? S[i - 1].km : 0));
const days = {};
S.forEach((s, i) => {
  if (Math.abs(s.slope) > GPS_SLOPE) return;
  const r = rowOf[s.act];
  const dx = { sac: s.sac, terrain: r.grade - BASE.grade, desc: +(s.slope < -15), meteo: wetDay[s.day], fatigue: (BASE.hrv - r.hrv) / 10 };
  const L = K.map(k => B[k] * dx[k]), sum = L.reduce((a, v) => a + v, 0);
  const real = dk[i] / tob(s.slope) * Math.exp(s.e + (s.sac ? mm.avec : mm.sans)) * 60, base = real * Math.exp(-sum);
  const d = days[s.day] || (days[s.day] = { day: s.day, n: 0, real: 0, base: 0, ...Object.fromEntries(K.map(k => [k, 0])) });
  d.n++; d.real += real; d.base += base;
  K.forEach((k, j) => { if (sum) d[k] += (real - base) * L[j] / sum; });
});
const wx = Object.fromEntries(R.weather.days.map(d => [d.day, d]));
const r0 = v => Math.round(v);
const out = Object.values(days).sort((a, b) => a.day - b.day).map(d => ({ ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k === 'day' || k === 'n' ? v : r0(v)])), rain: wx[d.day].rain }));
const tot = Object.fromEntries(['real', 'base', ...K].map(k => [k, r0(Object.values(days).reduce((a, d) => a + d[k], 0))]));

// Vega : la pluie élargit-elle la dispersion des écarts (écart-type de e), ou décale-t-elle tout ?
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const ok = S.filter(s => Math.abs(s.slope) <= GPS_SLOPE), WET = Math.min(...R.weather.days.filter(d => wetDay[d.day]).map(d => d.day));
const disp = { sec: Math.round(sd(ok.filter(s => s.day < WET).map(s => s.e)) * 1000) / 1000, pluie: Math.round(sd(ok.filter(s => s.day >= WET).map(s => s.e)) * 1000) / 1000, wet_from: WET };

// Thêta : demi-largeur de la fourchette à 90 % de la simulation (blocs), vue du soir du J2, à la fin de chaque jour
const bands = MC.blocs.seg.bands, last = {};
MC.seg_day.forEach((d, i) => { last[d] = i; });
const horizon = Object.entries(last).map(([d, i]) => ({ day: +d, half_min: r0((bands['95'][i] - bands['5'][i]) / 2 * 60) }));

const res = { base: BASE, effects: Object.fromEntries(K.map(k => [k, Math.round((Math.exp(B[k]) - 1) * 1000) / 10])), days: out, total: tot, disp, horizon, origin: MC.origin };
fs.writeFileSync(path.join(root, 'risque_acte2.js'), `// généré par outils/conclusion_acte2.js — ne pas modifier à la main\nwindow.RISK_ACTE2 = ${JSON.stringify(res)};\n`);
console.log('total (min)', tot);
out.forEach(d => console.log(`J${d.day} réel ${d.real} base ${d.base} · sac ${d.sac} terrain ${d.terrain} descente ${d.desc} météo ${d.meteo} fatigue ${d.fatigue} · pluie ${d.rain} mm`));
console.log('dispersion des écarts : sec', disp.sec, '· pluie', disp.pluie);
console.log('fourchette ± (min) :', horizon.map(h => `J${h.day} ${h.half_min}`).join(' · '));

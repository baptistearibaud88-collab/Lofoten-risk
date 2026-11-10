// Persistance de la pluie et rang de 2026 (partie 09, bloc « La pluie arrive en séries »).
// Entrées : donnees/era5_climatology_1996_2025_daily.json (ERA5 via Open-Meteo, point centre,
// pluie quotidienne 1996–2025) et risque_data.js (pluie 2026 au même point, cf.clim.real_rain_d).
// Sortie  : risque_meteo.js — à relancer si l'un des deux change :
//   node outils/meteo_series.js
//
// Fenêtres de 9 jours (durée de la traversée), départs du 1er juin au 10 juillet :
// 30 étés × 40 dates = 1 200 fenêtres, les mêmes que la partie 14.
// Jour de pluie : au moins 1 mm. Épisode : suite de jours de pluie (juin–juillet).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'risque_data.js'));
const E = JSON.parse(fs.readFileSync(path.join(root, 'donnees', 'era5_climatology_1996_2025_daily.json'), 'utf8')).daily;
const TH = 1, LEN = 9, N_START = 40, START = [6, 1];
const r26 = window.RISK.cf.clim.real_rain_d;
const P = E.precipitation_sum.map(v => v || 0), idx = new Map(E.time.map((t, i) => [t, i]));
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const years = [...new Set(E.time.map(t => +t.slice(0, 4)))];

const wet = a => a.map(v => v >= TH);
const maxRun = w => { let m = 0, c = 0; w.forEach(v => { c = v ? c + 1 : 0; m = Math.max(m, c); }); return m; };
const max3 = a => Math.max(...a.slice(0, -2).map((v, i) => v + a[i + 1] + a[i + 2]));
const sum = a => a.reduce((s, v) => s + v, 0);
const r1 = v => Math.round(v * 10) / 10;

// 1 200 fenêtres
const W = [];
years.forEach(y => { for (let k = 0; k < N_START; k++) { const i = idx.get(iso(y, START[0], START[1] + k)); W.push(P.slice(i, i + LEN)); } });
const dry = W.map(a => maxRun(wet(a).map(v => !v))), m3 = W.map(max3), tot = W.map(sum);

// persistance et épisodes sur juin–juillet de chaque été
let ww = 0, nw = 0, wd = 0, nd = 0; const eps = [];
years.forEach(y => {
  const i0 = idx.get(iso(y, 6, 1)), a = P.slice(i0, i0 + 61), w = wet(a);
  w.slice(1).forEach((v, i) => { if (w[i]) { nw++; ww += v; } else { nd++; wd += v; } });
  let s = 0, n = 0; [...a, 0].forEach(v => { if (v >= TH) { s += v; n++; } else if (n) { eps.push(s); s = 0; n = 0; } });
});
const pct = (arr, v) => r1((arr.filter(x => x < v).length + .5 * arr.filter(x => x === v).length) / arr.length * 100);
const hist = (arr, edges) => edges.slice(0, -1).map((e, i) => arr.filter(v => v >= e && (i === edges.length - 2 ? v <= edges[i + 1] : v < edges[i + 1])).length);
const rng = (a, b, s) => { const o = []; for (let v = a; v <= b + 1e-9; v += s) o.push(r1(v)); return o; };

const d26 = maxRun(wet(r26).map(v => !v)), m26 = max3(r26), t26 = sum(r26), ep26 = sum(r26.slice(6));
const out = {
  n: W.length, years: years.length, th: TH, starts: `${START[1]}/0${START[0]} → ${START[1] + N_START - 1 - 30}/07`,
  p_wet: nw / (nw + nd), p_ww: ww / nw, p_wd: wd / nd, n_ww: nw, n_wd: nd,
  dry: { v: d26, pct: pct(dry, d26), ge: dry.filter(x => x >= d26).length, edges: rng(-.5, 9.5, 1), hist: hist(dry, rng(-.5, 9.5, 1)) },
  max3: { v: r1(m26), pct: pct(m3, m26), edges: rng(0, 60, 3), hist: hist(m3, rng(0, 60, 3)) },
  tot: { v: r1(t26), pct: pct(tot, t26), edges: rng(0, 80, 4), hist: hist(tot, rng(0, 80, 4)) },
  ep: { v: r1(ep26), pct: pct(eps, ep26), n: eps.length, mean: r1(sum(eps) / eps.length) },
};
fs.writeFileSync(path.join(root, 'risque_meteo.js'), `// généré par outils/meteo_series.js — ne pas modifier à la main\nwindow.RISK_METEO = ${JSON.stringify(out)};\n`);
console.log(JSON.stringify({ ...out, dry: { ...out.dry, hist: undefined, edges: undefined }, max3: { ...out.max3, hist: undefined, edges: undefined }, tot: { ...out.tot, hist: undefined, edges: undefined } }, null, 1));

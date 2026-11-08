// Segmentation du terrain à l'intérieur de chaque sortie.
// Entrées : risque_data.js (tronçons de 250 m) et data.js (trace GPS).
// Sortie  : risque_sections.js — à relancer après chaque régénération des données :
//   node outils/segmentation_terrain.js
//
// Chaque sortie garde sa cote (celle du passage clé, celle du sommet), sauf deux cas :
//  1. Plat roulant : pente lissée (moyenne glissante sur 5 tronçons, ~1,25 km) < 5 %
//     sur au moins 1,5 km ET allure normale (écart d'effort moyen ≤ 0,10, donc pas de
//     terrain caché : blocs, boue) → Facile. Les morceaux du plat nettement lents
//     (écart moyen sur 3 tronçons > 0,20, le seuil d'un épisode lent) en sont retirés.
//  2. Même sentier : un passage d'au moins 1 km qui suit à moins de 35 m un sentier
//     déjà parcouru lors d'une autre sortie, où il est coté plus bas → prend cette cote
//     (même sentier, même cote, quel que soit le sommet fait ce jour-là). Un passage
//     ne descend à Facile par ce biais que s'il est lui-même plat.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'risque_data.js')); require(path.join(root, 'data.js'));
const R = window.RISK, S = R.series, TR = window.TREK.trace.features;

const FLAT_SLOPE = 5, FLAT_MIN = 6, FLAT_E = 0.10, SLOW_E = 0.20, NEAR_M = 35, RET_MIN = 4;
const grade0 = Object.fromEntries(R.rows.map(r => [r.id, r.grade]));
const hav = (a, b) => { const la = (b[1] - a[1]) * Math.PI / 180, lo = (b[0] - a[0]) * Math.PI / 180 * Math.cos(a[1] * Math.PI / 180); return 6371000 * Math.hypot(la, lo); };
const acts = [...new Set(S.map(s => s.act))];
const idxOf = id => S.map((_, i) => i).filter(i => S[i].act === id);

// trace GPS de chaque sortie, chaque point rattaché à son tronçon
const geo = {};
acts.forEach(id => {
  const f = TR.find(t => t.properties.id === id), c = f.geometry.coordinates, cum = [0];
  for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + hav(c[i - 1], c[i]));
  const idx = idxOf(id), L = cum[cum.length - 1];
  geo[id] = c.map((p, j) => ({ p, seg: idx[Math.min(idx.length - 1, Math.floor(cum[j] / L * idx.length))] }));
});

// runs of consecutive indices where test(n) is true and length >= min
const runs = (n, test, min) => { const out = []; let a = -1; for (let k = 0; k <= n; k++) { if (k < n && test(k)) { if (a < 0) a = k; } else if (a >= 0) { if (k - a >= min) out.push([a, k - 1]); a = -1; } } return out; };

const g = S.map(s => grade0[s.act]), why = S.map(() => null);
// pente lissée : moyenne glissante de |pente| sur 5 tronçons, sans déborder sur la sortie voisine
const sm = S.map(() => 0);
acts.forEach(id => { const idx = idxOf(id); idx.forEach((i, n) => { const w = idx.slice(Math.max(0, n - 2), n + 3); sm[i] = w.reduce((a, j) => a + Math.abs(S[j].slope), 0) / w.length; }); });
// 1. plat roulant
acts.forEach(id => {
  if (grade0[id] === 1) return;
  const idx = idxOf(id);
  // pace over 3 pieces: a flat stretch walked clearly slower than usual hides difficult ground
  // (boulders, no path), so it is cut out of the flat run before testing what is left
  const em = idx.map((_, n) => { const w = idx.slice(Math.max(0, n - 1), n + 2); return w.reduce((s, j) => s + S[j].e, 0) / w.length; });
  runs(idx.length, n => sm[idx[n]] < FLAT_SLOPE && em[n] <= SLOW_E, FLAT_MIN).forEach(([a, b]) => {
    const seg = idx.slice(a, b + 1), e = seg.reduce((s, i) => s + S[i].e, 0) / seg.length;
    if (e <= FLAT_E) seg.forEach(i => { g[i] = 1; why[i] = { k: 'plat' }; });
  });
});
// 2. même sentier qu'une autre sortie, cotée plus bas à cet endroit
const g1 = g.slice();
acts.forEach(id => {
  const idx = idxOf(id), best = idx.map(() => null);
  geo[id].forEach(({ p, seg }) => {
    const n = idx.indexOf(seg);
    acts.forEach(o => {
      if (o === id) return;
      for (const q of geo[o]) if (g1[q.seg] < g1[seg] && (g1[q.seg] > 1 || sm[seg] < FLAT_SLOPE) && hav(p, q.p) < NEAR_M && (!best[n] || g1[q.seg] > best[n].g)) best[n] = { g: g1[q.seg], o };
    });
  });
  runs(idx.length, n => !!best[n], RET_MIN).forEach(([a, b]) => {
    const gg = Math.max(...best.slice(a, b + 1).map(x => x.g)), o = best[a].o;
    for (let n = a; n <= b; n++) { g[idx[n]] = gg; why[idx[n]] = { k: 'sentier', o }; }
  });
});

// sections = runs of equal grade inside an outing
const sections = [];
S.forEach((s, i) => {
  const last = sections[sections.length - 1], w = why[i];
  if (last && last.act === s.act && last.g === g[i] && (last.why && last.why.k) === (w && w.k)) last.i1 = i;
  else sections.push({ act: s.act, i0: i, i1: i, g: g[i], why: w });
});
const out = `// généré par outils/segmentation_terrain.js — ne pas modifier à la main\nwindow.RISK_SECTIONS = ${JSON.stringify({ seg_grade: g, sections })};\n`;
fs.writeFileSync(path.join(root, 'risque_sections.js'), out);
const km = i => S[i].km, prevKm = i => i ? S[i - 1].km : 0;
sections.forEach(x => console.log(x.act.padEnd(22), String(x.g), `${prevKm(x.i0).toFixed(1)}→${km(x.i1).toFixed(1)} km`, x.why ? x.why.k + (x.why.o ? ' ' + x.why.o : '') : ''));

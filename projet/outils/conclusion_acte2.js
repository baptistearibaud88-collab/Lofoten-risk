// Conclusion de l'acte 2 (partie 06) : les grecs du trek.
// Entrées : risque_data.js (tronçons, sorties), risque_episodes.js (effet de la pluie, partie 03),
//           risque_mc.js (fourchette de la simulation, partie 07).
// Sortie  : risque_acte2.js — à relancer après outils/episodes_allure.js et outils/monte_carlo.js :
//   node outils/conclusion_acte2.js
//
// Même régression que la partie 04 (outils/sensibilites.js), sur les 604 tronçons sans l'artefact GPS :
//   ln(temps réel / Tobler) = a + b1·|pente|/10 + b2·sac + b3·cote + b4·rafales/10 + b5·(−VFC/10) + b6·[pente < −15 %]
// Gamma : la cote remplacée par trois marches (≥ modéré, ≥ exigeant, ≥ expert) : le coût d'un cran selon le cran.
//   Contrôle : chaque sortie retirée à tour de rôle (t minimal de la marche modéré → exigeant).
//   Abandonné le 21/11 : sac × cote (le sac n'a jamais été porté en expert ; l'effet disparaît sans les deux
//   sorties faciles sans sac du J7, t = −0,2).
// Second ordre : un terme croisé à la fois (pluie = jour ≥ 1 mm) ; 55 croisements passés au crible le 21/11,
//   seul sac × pluie tient (régression de la partie 04 + pluie + sac × pluie ; chaque sortie retirée à tour de rôle).
//   Les +41 % du sac (partie 04) sont une moyenne de ce coût au sec et sous la pluie. Vanna (pluie × cote) et charm (cote × jour) restent affichés comme non tenus.
// Vega : écart-type des résidus de la régression (ce que les facteurs n'expliquent pas), par groupe ;
//   p = test par permutation (4 000 tirages, graine fixe) de l'égalité des écarts-types.
// Thêta : fourchette à 90 % de la simulation (blocs et loi normale), vue du soir du J2, et trajectoire réelle.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_data.js', 'risque_episodes.js', 'risque_mc.js'].forEach(f => require(path.join(root, 'data', f)));
const R = window.RISK, MC = window.RISK_MC, mm = R.dist.mode_mu, GPS_SLOPE = 60;
const rowOf = Object.fromEntries(R.rows.map(r => [r.id, r]));
const wetDay = Object.fromEntries(R.weather.days.map(d => [d.day, +(d.rain >= 1)]));
const S = R.series.filter(s => Math.abs(s.slope) <= GPS_SLOPE);

// --- moindres carrés ---
const T = A => A[0].map((_, j) => A.map(r => r[j]));
const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const inv = A => { const n = A.length, M = A.map((r, i) => [...r, ...A.map((_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } }
  return M.map(r => r.slice(n)); };
const base = s => { const r = rowOf[s.act]; return [1, Math.abs(s.slope) / 10, s.sac, r.grade, r.gust / 10, -r.hrv / 10, +(s.slope < -15)]; };
function ols(extra) {
  const X = S.map(s => extra ? [...base(s), extra(s)] : base(s)), y = S.map(s => [s.e + (s.sac ? mm.avec : mm.sans)]);
  const XtXi = inv(mul(T(X), X)), b = mul(XtXi, mul(T(X), y)).map(v => v[0]);
  const res = y.map((v, i) => v[0] - X[i].reduce((a, x, k) => a + x * b[k], 0));
  const s2 = res.reduce((a, v) => a + v * v, 0) / (X.length - b.length), se = XtXi.map((r, i) => Math.sqrt(s2 * r[i]));
  return { b, se, res };
}
const pc = v => Math.round((Math.exp(v) - 1) * 1000) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const I = { sac: 2, cote: 3, desc: 6, x: 7 };
const m0 = ols();
const term = m => ({ pct: pc(m.b[I.x]), t: r2(m.b[I.x] / m.se[I.x]) });

// Δ : le terrain, sous-jacent
const delta = { cote: pc(m0.b[I.cote]), desc: pc(m0.b[I.desc]), pluie: Math.round(window.RISK_EPISODES.sys.rain_pct * 1000) / 10 };
// ρ : le sac, coût de portage
const rho = { sac: pc(m0.b[I.sac]), lo: pc(m0.b[I.sac] - 1.96 * m0.se[I.sac]), hi: pc(m0.b[I.sac] + 1.96 * m0.se[I.sac]), jour: term(ols(s => s.sac * (s.day - 1))) };
// Γ : le coût d'un cran de terrain selon le cran (marches)
function olsX(Sx, f) {
  const X = Sx.map(f), y = Sx.map(s => [s.e + (s.sac ? mm.avec : mm.sans)]);
  const XtXi = inv(mul(T(X), X)), b = mul(XtXi, mul(T(X), y)).map(v => v[0]);
  const res = y.map((v, i) => v[0] - X[i].reduce((a, x, k) => a + x * b[k], 0));
  const s2 = res.reduce((a, v) => a + v * v, 0) / (X.length - b.length);
  return { b, t: b.map((v, i) => v / Math.sqrt(s2 * XtXi[i][i])) };
}
const steps = s => { const r = rowOf[s.act], g = r.grade; return [1, Math.abs(s.slope) / 10, s.sac, r.gust / 10, -r.hrv / 10, +(s.slope < -15), +(g >= 2), +(g >= 3), +(g >= 4)]; };
const ms = olsX(S, steps);
const looT = R.rows.map(r => olsX(S.filter(s => s.act !== r.id), steps).t[7]);
const gamma = { steps: [6, 7, 8].map(k => ({ pct: pc(ms.b[k]), t: r2(ms.t[k]) })), labels: ['facile → modéré', 'modéré → exigeant', 'exigeant → expert'], loo_tmin: r2(Math.min(...looT)) };
// second ordre
const vanna = term(ols(s => wetDay[s.day] * (rowOf[s.act].grade - 1)));
const charm = term(ols(s => (rowOf[s.act].grade - 1) * (s.day - 1)));
const spF = s => [...base(s), s.sac * wetDay[s.day], wetDay[s.day]], sp = olsX(S, spF);
const spLoo = R.rows.map(r => olsX(S.filter(s => s.act !== r.id), spF).t[I.x]);
const sacWet = { pct: pc(sp.b[I.x]), t: r2(sp.t[I.x]), t_loo: [r2(Math.min(...spLoo)), r2(Math.max(...spLoo))],
  sac_dry: pc(sp.b[I.sac]), sac_wet: pc(sp.b[I.sac] + sp.b[I.x]), n_out: R.rows.filter(r => r.sac && wetDay[r.day]).length, scanned: 55 };
// ν : volatilité de l'allure (résidus)
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const grp = key => { const g = {}; S.forEach((s, i) => { const k = key(s); (g[k] = g[k] || []).push(m0.res[i]); }); return g; };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const perm = (a, b, n = 4000) => { const ctr = v => { const m = v.reduce((x, y) => x + y, 0) / v.length; return v.map(x => x - m); }; const pool = [...ctr(a), ...ctr(b)], d0 = Math.abs(sd(b) - sd(a)); let c = 0;
  for (let k = 0; k < n; k++) { const A = a.map(() => pool[Math.floor(rnd() * pool.length)]), B = b.map(() => pool[Math.floor(rnd() * pool.length)]); if (Math.abs(sd(B) - sd(A)) >= d0) c++; } return Math.round(c / n * 1000) / 1000; };
const pair = (key, a, b) => { const g = grp(key); return { a: r3(sd(g[a])), b: r3(sd(g[b])), na: g[a].length, nb: g[b].length, p: perm(g[a], g[b]) }; };
const vega = { all: r3(sd(m0.res)), mont: pair(s => s.slope > 15 ? 'm' : 'r', 'r', 'm'), sac: pair(s => s.sac, 0, 1), pluie: pair(s => wetDay[s.day], 0, 1), terrain: pair(s => rowOf[s.act].grade, 1, 4) };
// Θ : la fourchette de la simulation grandit avec l'horizon
const B5 = MC.blocs.seg.bands, N5 = MC.normal.seg.bands, last = {};
MC.seg_day.forEach((d, i) => { last[d] = i; });
const mn = v => Math.round(v * 60);
const theta = { origin: MC.origin,
  path: MC.seg_day.map((d, i) => ({ d, b5: mn(B5['5'][i]), b95: mn(B5['95'][i]), n5: mn(N5['5'][i]), n95: mn(N5['95'][i]), real: mn(MC.real_dev[i]) })),
  horizon: Object.entries(last).map(([d, i]) => ({ day: +d, lo: mn(B5['50'][i] - B5['5'][i]), hi: mn(B5['95'][i] - B5['50'][i]), n_hi: mn(N5['95'][i] - N5['50'][i]) })),
  real_end: mn(MC.real_dev[MC.real_dev.length - 1]), pct_blocs: MC.blocs.seg.real_pct, pct_normal: MC.normal.seg.real_pct };

const res = { n: S.length, delta, gamma, vega, theta, rho, vanna, charm, sacWet };
fs.writeFileSync(path.join(root, 'data', 'risque_acte2.js'), `// généré par outils/conclusion_acte2.js — ne pas modifier à la main\nwindow.RISK_ACTE2 = ${JSON.stringify(res)};\n`);
const { theta: _t, ...brief } = res; console.log(JSON.stringify(brief), JSON.stringify(theta.horizon), theta.real_end, theta.pct_blocs, theta.pct_normal);

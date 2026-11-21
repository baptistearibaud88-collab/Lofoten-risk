// Conclusion de l'acte 2 (partie 06) : les grecs du trek.
// Entrées : risque_data.js (tronçons, sorties), risque_episodes.js (effet de la pluie, partie 03),
//           risque_mc.js (fourchette de la simulation, partie 07).
// Sortie  : risque_acte2.js — à relancer après outils/episodes_allure.js et outils/monte_carlo.js :
//   node outils/conclusion_acte2.js
//
// Même régression que la partie 04 (outils/sensibilites.js), sur les 604 tronçons sans l'artefact GPS :
//   ln(temps réel / Tobler) = a + b1·|pente|/10 + b2·sac + b3·cote + b4·rafales/10 + b5·(−VFC/10) + b6·[pente < −15 %]
// puis un terme ajouté à la fois pour les grecs de second ordre :
//   gamma croisé  sac × (cote − 1)        : le coût du sac change-t-il avec le terrain ?
//   vanna         pluie × (cote − 1)      : la pluie pèse-t-elle plus sur terrain dur ? (pluie = jour ≥ 1 mm)
//   charm         (cote − 1) × (jour − 1) : le coût du terrain change-t-il au fil des jours ?
// Vega : écart-type des résidus de la régression (ce que les facteurs n'expliquent pas), par groupe.
// Thêta : demi-largeur de la fourchette à 90 % de la simulation (blocs), vue du soir du J2.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_data.js', 'risque_episodes.js', 'risque_mc.js'].forEach(f => require(path.join(root, f)));
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
const delta = { cote: pc(m0.b[I.cote]), desc: pc(m0.b[I.desc]), pluie: Math.round(window.RISK_EPISODES.sys.rain_pct * 1000) / 10,
  by_grade: [1, 2, 3, 4].map(g => pc(m0.b[I.cote] * (g - 1))) };
// ρ : le sac, coût de portage
const rho = { sac: pc(m0.b[I.sac]), lo: pc(m0.b[I.sac] - 1.96 * m0.se[I.sac]), hi: pc(m0.b[I.sac] + 1.96 * m0.se[I.sac]) };
// Γ : le coût du sac selon la cote
const mg = ols(s => s.sac * (rowOf[s.act].grade - 1));
const gamma = { ...term(mg), sac_by_grade: [1, 2, 3, 4].map(g => pc(mg.b[I.sac] + mg.b[I.x] * (g - 1))) };
// second ordre
const vanna = term(ols(s => wetDay[s.day] * (rowOf[s.act].grade - 1)));
const charm = term(ols(s => (rowOf[s.act].grade - 1) * (s.day - 1)));
// ν : volatilité de l'allure (résidus)
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const grp = key => { const g = {}; S.forEach((s, i) => { const k = key(s); (g[k] = g[k] || []).push(m0.res[i]); }); return g; };
const pair = (key, a, b) => { const g = grp(key); return [r3(sd(g[a])), r3(sd(g[b])), g[a].length, g[b].length]; };
const vega = { all: r3(sd(m0.res)), pluie: pair(s => wetDay[s.day], 0, 1), sac: pair(s => s.sac, 0, 1), terrain: pair(s => rowOf[s.act].grade, 1, 4) };
// Θ : la fourchette de la simulation grandit avec l'horizon
const bands = MC.blocs.seg.bands, last = {};
MC.seg_day.forEach((d, i) => { last[d] = i; });
const theta = { origin: MC.origin, horizon: Object.entries(last).map(([d, i]) => ({ day: +d, half_min: Math.round((bands['95'][i] - bands['5'][i]) / 2 * 60) })) };

const res = { n: S.length, delta, gamma, vega, theta, rho, vanna, charm };
fs.writeFileSync(path.join(root, 'risque_acte2.js'), `// généré par outils/conclusion_acte2.js — ne pas modifier à la main\nwindow.RISK_ACTE2 = ${JSON.stringify(res)};\n`);
console.log(JSON.stringify(res));

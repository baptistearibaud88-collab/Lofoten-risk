// Fréquence cardiaque selon le terrain (encadré « Ce que dit le cœur » de la partie 04, carte Vega de la partie 06).
// Entrées : risque_data.js (tronçons de 250 m : FC moyenne, pente, sac, écart d'allure e, jour), risque_sections.js (cote de chaque tronçon).
// Sortie  : risque_fc.js — à relancer si l'une des entrées change :
//   node outils/frequence_cardiaque.js
//
// Même idée que la régression de la partie 04, mais sur les battements : sur les 604 tronçons (sans l'artefact GPS de Kvalvika),
//   FC = pente en montée + pente en descente + sac + écart d'allure e + jour + une marche par niveau de cote.
// Les erreurs types sont calculées par sortie : les tronçons d'une même sortie se ressemblent, on ne les compte pas comme indépendants.
// 1. Les marches de cote : de combien le cœur monte en passant d'un niveau au suivant, à pente, sac et allure égaux.
// 2. Sac × allure (second ordre) : le lien entre l'allure et le cœur change-t-il avec le sac ?
// Chaque résultat est refait en retirant chaque sortie à tour de rôle.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
['risque_data.js', 'risque_sections.js'].forEach(f => require(path.join(root, 'data', f)));
const R = window.RISK, SE = window.RISK_SECTIONS, GPS_SLOPE = 60;

// --- petite algèbre linéaire ---
const T = A => A[0].map((_, j) => A.map(r => r[j]));
const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const inv = A => { const n = A.length, M = A.map((r, i) => [...r, ...A.map((_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } }
  return M.map(r => r.slice(n)); };

// moindres carrés, erreurs types groupées par sortie
function ols(rows, xf) {
  const X = rows.map(xf), y = rows.map(d => d.hr), n = X.length, k = X[0].length;
  const XtXi = inv(mul(T(X), X)), b = mul(XtXi, mul(T(X), y.map(v => [v]))).map(v => v[0]);
  const res = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * b[j], 0));
  const G = {}; rows.forEach((d, i) => (G[d.act] = G[d.act] || []).push(i));
  const ng = Object.keys(G).length, Mz = Array.from({ length: k }, () => Array(k).fill(0));
  Object.values(G).forEach(ix => { const u = Array(k).fill(0); ix.forEach(i => X[i].forEach((x, j) => { u[j] += x * res[i]; }));
    for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) Mz[a][c] += u[a] * u[c]; });
  const V = mul(mul(XtXi, Mz), XtXi), adj = ng / (ng - 1) * (n - 1) / (n - k);
  const se = V.map((r, i) => Math.sqrt(r[i] * adj));
  const ym = y.reduce((s, v) => s + v, 0) / n, sse = res.reduce((s, v) => s + v * v, 0), sst = y.reduce((s, v) => s + (v - ym) ** 2, 0);
  return { b, se, n, r2: 1 - sse / sst };
}

const D = R.series.map((s, i) => ({ ...s, g: SE.seg_grade[i] })).filter(s => Math.abs(s.slope) <= GPS_SLOPE && s.hr);
const up = d => Math.max(d.slope, 0), dn = d => Math.max(-d.slope, 0);
const base = d => [1, up(d), dn(d), d.sac ? 1 : 0, d.e, d.day];
const steps = d => [+(d.g >= 2), +(d.g >= 3), +(d.g >= 4)];
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const est = (m, j) => ({ b: r1(m.b[j]), lo: r1(m.b[j] - 1.96 * m.se[j]), hi: r1(m.b[j] + 1.96 * m.se[j]), t: r1(m.b[j] / m.se[j]) });

// 1. marches de cote
const fitSteps = rows => ols(rows, d => [...base(d), ...steps(d)]);
const M1 = fitSteps(D);
// 2. sac × allure (variables centrées)
const mS = D.reduce((s, d) => s + (d.sac ? 1 : 0), 0) / D.length, mE = D.reduce((s, d) => s + d.e, 0) / D.length;
const fitInter = rows => ols(rows, d => [...base(d), ((d.sac ? 1 : 0) - mS) * (d.e - mE)]);
const M2 = fitInter(D);
// le lien allure → cœur, sans le sac puis avec
const byPack = v => ols(D.filter(d => !!d.sac === v), d => [1, up(d), dn(d), d.e, d.day]);
const Mt = byPack(false), Ms = byPack(true);

// solidité : chaque sortie retirée à tour de rôle
const acts = [...new Set(D.map(d => d.act))];
const loo = acts.map(a => { const rows = D.filter(d => d.act !== a), s = fitSteps(rows), i = fitInter(rows);
  return { mex: s.b[7], inter_t: i.b[6] / i.se[6] }; });
const range = f => [r1(Math.min(...loo.map(f))), r1(Math.max(...loo.map(f)))];

const out = {
  n: M1.n, sorties: acts.length, r2: r2(M1.r2),
  steps: { fm: est(M1, 6), mex: est(M1, 7), exexp: est(M1, 8) },
  loo_mex: range(o => o.mex),
  inter: { ...est(M2, 6), loo_t: range(o => o.inter_t) },
  e_trail: est(Mt, 3), e_sac: est(Ms, 3),
  day: est(M1, 5),
};
fs.writeFileSync(path.join(root, 'data', 'risque_fc.js'), `// généré par outils/frequence_cardiaque.js — ne pas modifier à la main\nwindow.RISK_FC = ${JSON.stringify(out)};\n`);
console.log(`${out.n} tronçons, ${out.sorties} sorties, R² ${out.r2}`);
console.log('marches de cote (bpm) :', JSON.stringify(out.steps), '· modéré → exigeant sans chaque sortie :', out.loo_mex);
console.log('sac × allure :', JSON.stringify(out.inter), '· allure → cœur sans sac', JSON.stringify(out.e_trail), 'avec sac', JSON.stringify(out.e_sac));
console.log('jour (non retenu) :', JSON.stringify(out.day));

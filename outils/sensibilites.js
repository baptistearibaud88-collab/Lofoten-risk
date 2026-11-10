// Sensibilités (partie 07) : régression et matrice de corrélation, recalculées sans les artefacts GPS.
// Entrées : risque_data.js, risque_indice.js (irrégularité et pente des sorties, déjà sans artefact).
// Sortie  : risque_sens.js — à relancer après outils/indice_danger.js :
//   node outils/sensibilites.js
//
// analyse_risque.py estime la régression sur les 605 tronçons, artefact GPS de Kvalvika compris
// (pente de −79 % sur 250 m), alors que la partie 03 en garde 604. On reproduit d'abord exactement
// ses résultats (contrôle), puis on refait le calcul sans l'artefact :
//   ln(temps réel / Tobler) = a + b1·|pente|/10 + b2·sac + b3·cote + b4·rafales/10 + b5·(−VFC/10) + b6·[pente < −15 %]
// moindres carrés ordinaires, intervalle de confiance à 95 % = β ± 1,96·se ; effet en % = e^β − 1.
// La matrice de Spearman (par sortie) est recalculée avec la lenteur moyenne, l'irrégularité et la
// pente des passages raides sans l'artefact.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'risque_data.js')); require(path.join(root, 'risque_indice.js'));
const R = window.RISK, IX = window.RISK_INDICE, S = R.series, mm = R.dist.mode_mu, GPS_SLOPE = 60;
const rowOf = Object.fromEntries(R.rows.map(r => [r.id, r]));

// --- petite algèbre linéaire ---
const T = A => A[0].map((_, j) => A.map(r => r[j]));
const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const inv = A => { const n = A.length, M = A.map((r, i) => [...r, ...A.map((_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } }
  return M.map(r => r.slice(n)); };

const NAMES = ['pente (+10 %)', 'sac sur le dos', 'terrain (+1 niveau)', 'rafales (+10 km/h)', 'fatigue (VFC −10 ms)', 'descente raide (> 15 %)'];
function ols(segs) {
  const X = segs.map(s => { const r = rowOf[s.act]; return [1, Math.abs(s.slope) / 10, s.sac, r.grade, r.gust / 10, -r.hrv / 10, +(s.slope < -15)]; });
  const y = segs.map(s => [s.e + (s.sac ? mm.avec : mm.sans)]);
  const XtXi = inv(mul(T(X), X)), b = mul(XtXi, mul(T(X), y)).map(v => v[0]);
  const res = y.map((v, i) => v[0] - X[i].reduce((s, x, k) => s + x * b[k], 0)), n = X.length, k = b.length;
  const ym = y.reduce((s, v) => s + v[0], 0) / n, sse = res.reduce((s, v) => s + v * v, 0), sst = y.reduce((s, v) => s + (v[0] - ym) ** 2, 0);
  const s2 = sse / (n - k), se = XtXi.map((r, i) => Math.sqrt(s2 * r[i]));
  const pc = v => Math.round((Math.exp(v) - 1) * 1000) / 10;
  return { n, r2: 1 - sse / sst, sens: NAMES.map((nm, i) => ({ name: nm, pct: pc(b[i + 1]), lo: pc(b[i + 1] - 1.96 * se[i + 1]), hi: pc(b[i + 1] + 1.96 * se[i + 1]) })) };
}

// --- Spearman (rangs moyens pour les ex aequo) ---
const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = Array(a.length);
  for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
const pear = (a, b) => { const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); };
const KEYS = ['grade', 'pente_max', 'dplus', 'sac', 'gust', 'rain', 'hrv', 'sleep_h', 'e_mean', 'e_sd', 'hr'];
const corr = rows => KEYS.map(a => KEYS.map(b => Math.round(pear(rank(rows.map(r => +r[a])), rank(rows.map(r => +r[b]))) * 100) / 100));

// --- contrôle : on retrouve analyse_risque.py avec tous les tronçons ---
const chk = ols(S), dmax = Math.max(...chk.sens.map((s, i) => Math.abs(s.pct - R.sens[i].pct)));
const cmax = Math.max(...corr(R.rows).flatMap((r, i) => r.map((v, j) => Math.abs(v - R.corr.m[i][j]))));
console.log(`contrôle 605 tronçons : écart max ${dmax.toFixed(2)} pt sur les effets, R² ${chk.r2.toFixed(4)} (publié ${R.r2.toFixed(4)}), matrice ${cmax.toFixed(2)}`);
if (dmax > .15 || cmax > .011) throw new Error('la reconstruction ne retrouve pas analyse_risque.py');

// --- sans l'artefact ---
const keep = s => Math.abs(s.slope) <= GPS_SLOPE, res = ols(S.filter(keep));
const fixed = R.rows.map(r => { const ix = IX.rows.find(o => o.id === r.id), es = S.filter(s => s.act === r.id && keep(s)).map(s => s.e);
  return { ...r, e_sd: ix.e_sd, pente_max: ix.pente_max, e_mean: Math.round(es.reduce((a, v) => a + v, 0) / es.length * 1000) / 1000 }; });
// autocorrélation d'ordre 1 des écarts e, sans l'artefact (bandeau du haut)
const ek = S.filter(keep).map(x => x.e), em = ek.reduce((a, v) => a + v, 0) / ek.length;
const acf1 = ek.slice(1).reduce((a, v, i) => a + (v - em) * (ek[i] - em), 0) / ek.reduce((a, v) => a + (v - em) ** 2, 0);
const out = { acf1: Math.round(acf1 * 1000) / 1000, n: res.n, r2: res.r2, sens: res.sens, corr: { vars: R.corr.vars, m: corr(fixed) }, e_mean: Object.fromEntries(fixed.map(r => [r.id, r.e_mean])) };
fs.writeFileSync(path.join(root, 'risque_sens.js'), `// généré par outils/sensibilites.js — ne pas modifier à la main\nwindow.RISK_SENS = ${JSON.stringify(out)};\n`);
console.log(`sans artefact (${res.n} tronçons) : R² ${res.r2.toFixed(3)} · ρ₁ ${acf1.toFixed(3)} (publié ${R.acf_r[0].toFixed(3)})`);
res.sens.forEach((s, i) => console.log(`  ${s.name.padEnd(26)} ${String(s.pct).padStart(6)} %  [${s.lo} ; ${s.hi}]   (publié ${R.sens[i].pct})`));
const d = out.corr.m.flatMap((r, i) => r.map((v, j) => [Math.abs(v - R.corr.m[i][j]), KEYS[i], KEYS[j], R.corr.m[i][j], v])).filter(x => x[0] > .05 && x[1] < x[2]);
console.log('matrice, cases qui bougent de plus de 0,05 :', d.map(x => `${x[1]}×${x[2]} ${x[3]}→${x[4]}`).join(' · ') || 'aucune');

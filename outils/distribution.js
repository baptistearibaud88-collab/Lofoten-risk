// Distribution des écarts d'allure (partie 03), sans les artefacts GPS.
// Entrée : risque_data.js (tronçons de 250 m, écart e = ln(temps réel / temps de Tobler),
// centré sur l'allure moyenne avec et sans sac).
// Sortie : risque_dist.js — à relancer après chaque régénération de risque_data.js :
//   node outils/distribution.js
//
// Un tronçon dont la pente GPS dépasse 60 % est un artefact d'altitude (saut de plusieurs
// centaines de mètres en 250 m) : son temps attendu, donc son écart, n'a pas de sens.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'risque_data.js'));
const R = window.RISK, S = R.series;
const GPS_SLOPE = 60;
const r3 = v => Math.round(v * 1000) / 1000;

const keep = S.map((s, i) => i).filter(i => Math.abs(S[i].slope) <= GPS_SLOPE);
const art = S.map((s, i) => i).filter(i => Math.abs(S[i].slope) > GPS_SLOPE);
const e = keep.map(i => S[i].e), n = e.length;
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const mu = mean(e), sd = Math.sqrt(mean(e.map(v => (v - mu) ** 2)));
const skew = mean(e.map(v => ((v - mu) / sd) ** 3)), kurt = mean(e.map(v => ((v - mu) / sd) ** 4)) - 3;
const jb = n / 6 * (skew ** 2 + kurt ** 2 / 4), jb_p = Math.exp(-jb / 2);   // chi² à 2 degrés de liberté
// normal tails
const erf = x => { const t = 1 / (1 + .3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const Phi = x => .5 * (1 + erf(x / Math.SQRT2));
const norm2 = 2 * (1 - Phi(2)), norm3 = 2 * (1 - Phi(3));
const z = keep.map(i => (S[i].e - mu) / sd);
const b2 = z.filter(v => Math.abs(v) > 2).length, b3 = z.filter(v => Math.abs(v) > 3).length;
// Poisson: chance of seeing at least b3 beyond 3σ if the law were normal
const lam = n * norm3; let pPois = 0, term = Math.exp(-lam); for (let k = 0; k < b3; k++) { pPois += term; term *= lam / (k + 1); } pPois = 1 - pPois;
const extremes = keep.filter((i, k) => Math.abs(z[k]) > 3).map(i => ({ i, act: S[i].act, day: S[i].day, km: S[i].km, slope: S[i].slope, sac: S[i].sac, z: r3((S[i].e - mu) / sd) }));
// Student t by maximum likelihood (grid on degrees of freedom and scale)
const lgamma = x => { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (x < .5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x); x -= 1; let a = c[0]; const t = x + g + .5; for (let i = 1; i < 9; i++) a += c[i] / (x + i); return .5 * Math.log(2 * Math.PI) + (x + .5) * Math.log(t) - t + Math.log(a); };
const tlog = (v, df, s) => lgamma((df + 1) / 2) - lgamma(df / 2) - .5 * Math.log(df * Math.PI) - Math.log(s) - (df + 1) / 2 * Math.log(1 + ((v - mu) / s) ** 2 / df);
let best = { ll: -1e9 };
for (let df = 2; df <= 200; df *= 1.05) for (let s = sd * .6; s <= sd * 1.05; s += sd * .005) { const ll = e.reduce((a, v) => a + tlog(v, df, s), 0); if (ll > best.ll) best = { ll, df, s }; }
const llN = e.reduce((a, v) => a - .5 * Math.log(2 * Math.PI) - Math.log(sd) - .5 * ((v - mu) / sd) ** 2, 0);
// histogram, curves (scaled to counts) and quantile-quantile points
const W = .1, lo = Math.floor(Math.min(...e) / W) * W, hi = Math.ceil(Math.max(...e) / W) * W;
const edges = []; for (let x = lo; x <= hi + 1e-9; x += W) edges.push(r3(x));
const hist = edges.slice(0, -1).map((a, k) => e.filter(v => v >= a && v < edges[k + 1] + (k === edges.length - 2 ? 1e-9 : 0)).length);
const xs = []; for (let x = lo; x <= hi + 1e-9; x += (hi - lo) / 160) xs.push(r3(x));
const pdf = xs.map(x => r3(n * W * Math.exp(-.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI))));
const pdf_t = xs.map(x => r3(n * W * Math.exp(tlog(x, best.df, best.s))));
const qinv = p => { // Acklam
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-.007784894002430293, -.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [.007784695709041462, .3224671290700398, 2.445134137142996, 3.754408661907416];
  if (p < .02425) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - .02425) return -qinv(1 - p);
  const q = p - .5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); };
const zs = [...z].sort((a, b) => a - b), qq = zs.map((v, k) => [r3(qinv((k + .5) / n)), r3(v)]);
// with and without the bag
const sdOf = sac => { const v = keep.filter(i => S[i].sac === sac).map(i => S[i].e), m = mean(v); return Math.sqrt(mean(v.map(x => (x - m) ** 2))); };
const out = {
  n, n_all: S.length, mu: r3(mu), sd: r3(sd), skew: r3(skew), kurt: r3(kurt), jb: r3(jb), jb_p: r3(jb_p),
  beyond2: r3(b2 / n), beyond3: b3 / n, n2: b2, n3: b3, norm2, norm3, exp3: r3(lam), p_pois3: r3(pPois),
  t_df: r3(best.df), t_scale: r3(best.s), ll_gain: r3(best.ll - llN),
  edges, hist, xs, pdf, pdf_t, qq, extremes,
  artefacts: art.map(i => ({ act: S[i].act, day: S[i].day, km: S[i].km, slope: S[i].slope, e: r3(S[i].e) })),
  sd_avec: r3(sdOf(1)), sd_sans: r3(sdOf(0)),
};
fs.writeFileSync(path.join(root, 'risque_dist.js'), `// généré par outils/distribution.js — ne pas modifier à la main\nwindow.RISK_DIST = ${JSON.stringify(out)};\n`);
console.log(`n ${n} (${art.length} artefact) · σ ${r3(sd)} · asym ${r3(skew)} · kurt ${r3(kurt)} · JB ${r3(jb)} p ${r3(jb_p)} · >2σ ${b2} (${r3(n * norm2)} att.) · >3σ ${b3} (${r3(lam)} att., p ${r3(pPois)}) · Student ddl ${r3(best.df)} gain ${r3(best.ll - llN)} · σ sac ${out.sd_avec} / ${out.sd_sans}`);
console.log(extremes);

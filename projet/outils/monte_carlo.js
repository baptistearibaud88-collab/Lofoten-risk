// Simulation de risque (partie 07) : une vraie prévision, hors échantillon, avec le climat.
// Entrées : risque_data.js (tronçons, sorties, météo des 9 jours), risque_sections.js (cote du terrain par tronçon),
//           risque_episodes.js (effet de la pluie de la partie 03, pour la sensibilité),
//           donnees/era5_climatology_1996_2025_daily.json (les 1 200 mondes météo des parties 05 et 09).
// Sortie  : risque_mc.js — à relancer après outils/segmentation_terrain.js, puis relancer
//   node outils/conclusion_acte2.js (carte Thêta de la partie 06) et node outils/marge_option.js :
//   node outils/monte_carlo.js
//
// 1. Modèle à facteurs, sur les tronçons de 250 m :
//      ln(temps réel / temps de Tobler) = a + b1·sac + b2·cote + b3·[pente < −15 %] + b4·|pente|/10 + u
//    estimé par moindres carrés sur les seuls jours déjà marchés. L'artefact GPS de Kvalvika
//    (|pente| > 60 %) est exclu du calage ; sa pente est remplacée par celle de ses voisins.
// 2. Prévision au soir du J2 : modèle calé sur J1–J2 (beau temps), puis J3–J9 simulés 5 000 fois sur le parcours
//    réellement suivi (l'itinéraire est une décision, le temps est le risque). Aléa u : résidus réels tirés par
//    blocs de 8 tronçons consécutifs (2 km), modèle réestimé à chaque simulation (incertitude des coefficients).
//    Trois versions, mêmes facteurs :
//      - blocs (« beau temps seulement ») : le modèle ne connaît que J1–J2, sans pluie ;
//      - clim (« avec le climat ») : chaque simulation tire sa météo dans les 1 200 mondes ERA5 (30 étés × 40 dates
//        de départ, les mêmes que les parties 05 et 09), parmi ceux dont le J2 est sec comme en 2026 (on connaît
//        la météo du jour, la suite dépend de la persistance). Un jour de pluie (≥ 1 mm) coûte un pourcentage de
//        temps tiré à chaque simulation dans l'intervalle mesuré (voir 4) : on savait qu'il pleuvrait sans doute,
//        pas quand ni avec quelle intensité. La probabilité est connue avant le départ ; le coût est mesuré après.
//      - normal : résidus indépendants N(0, s²), gardé pour la carte Thêta de la partie 06 (pas affiché en 07).
// 3. Contrôle a posteriori (backtest) : chaque soir, le modèle est recalé sur les jours passés (coût de la pluie
//    retiré des jours mouillés) et prévoit le lendemain, avec la météo du lendemain tirée selon celle du jour.
// 4. Coût de la pluie : variable « jour de pluie » ajoutée à la régression de toute la traversée, erreur type
//    robuste par sortie. Test de résistance : le pire des mondes (le plus de jours de pluie du J3 au J9).
// 5. Pour outils/marge_option.js : chaque soir, la distribution du temps de marche restant, hors jour de marge
//    (la Støvla), sachant la météo du jour.
// Graine fixe : le fichier produit est reproductible. Les modèles blocs et normal sont inchangés depuis le 11/11.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_data.js', 'risque_sections.js', 'risque_episodes.js'].forEach(f => require(path.join(root, 'data', f)));
const R = window.RISK, S = R.series, N = S.length, G = window.RISK_SECTIONS.seg_grade, mm = R.dist.mode_mu;
const NS = 5000, L = 8, ORIGIN = 2, GPS_SLOPE = 60, TH = 1, MARGIN_ACT = 'stuvla';
const rowOf = Object.fromEntries(R.rows.map(r => [r.id, r]));
if (!rowOf[MARGIN_ACT]) throw new Error('sortie du jour de marge introuvable');

// ---------- météo : jours de pluie réels et 1 200 mondes ERA5 ----------
const realWet = [null, ...R.weather.days.map(d => d.rain >= TH)];                    // index = jour
const WET_FROM = realWet.findIndex(Boolean);
if (WET_FROM !== 7 || !realWet.slice(7).every(Boolean)) throw new Error('épisode de pluie inattendu');
const E = JSON.parse(fs.readFileSync(path.join(root, 'donnees', 'era5_climatology_1996_2025_daily.json'), 'utf8')).daily;
const Pm = E.precipitation_sum.map(v => v || 0), tIdx = new Map(E.time.map((t, i) => [t, i]));
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const WORLDS = [];
[...new Set(E.time.map(t => +t.slice(0, 4)))].forEach(y => { for (let k = 0; k < 40; k++) {
  const i = tIdx.get(iso(y, 6, 1 + k)), a = Pm.slice(i, i + 9);
  WORLDS.push({ start: iso(y, 6, 1 + k), mm: a, wet: a.map(v => v >= TH) }); } });
// mondes dont le jour d a la même météo que 2026 (sec ou pluie) : ce que l'on sait le soir du jour d
const poolAt = d => WORLDS.filter(w => w.wet[d - 1] === realWet[d]);

// ---------- données par tronçon ----------
const art = S.map(s => Math.abs(s.slope) > GPS_SLOPE);
const slc = S.map((s, i) => { if (!art[i]) return s.slope; const nb = [i - 1, i + 1].filter(j => j >= 0 && j < N && S[j].act === s.act); return nb.reduce((a, j) => a + S[j].slope, 0) / nb.length; });
const tob = sl => 6 * Math.exp(-3.5 * Math.abs(sl / 100 + .05));
const dk = S.map((s, i) => s.km - (i ? S[i - 1].km : 0));
const T0 = S.map((s, i) => dk[i] / tob(slc[i]));                                             // heures, Tobler
const TR = S.map((s, i) => dk[i] / tob(s.slope) * Math.exp(s.e + (s.sac ? mm.avec : mm.sans)));   // heures, réel
const Y = S.map((s, i) => Math.log(TR[i] / T0[i]));
const NAMES = ['constante', 'sac sur le dos', 'terrain (+1 niveau)', 'descente raide (> 15 %)', 'pente (+10 %)'];
const xrow = i => [1, S[i].sac, G[i], +(slc[i] < -15), Math.abs(slc[i]) / 10];
const K_ = NAMES.length;
const wetX = S.map(s => +realWet[s.day]);

// ---------- hasard reproductible ----------
function rng(seed) { let a = seed >>> 0; const u = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null; const g = () => { if (spare !== null) { const v = spare; spare = null; return v; } let x, y, r; do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r >= 1 || r === 0); const f = Math.sqrt(-2 * Math.log(r) / r); spare = y * f; return x * f; };
  return { u, g }; }

// ---------- algèbre ----------
const inv = A => { const n = A.length, M = A.map((r, i) => [...r, ...A.map((_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; if (Math.abs(d) < 1e-10) throw new Error('matrice singulière : un facteur n’est pas identifiable sur cette fenêtre');
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } }
  return M.map(r => r.slice(n)); };
// yAdj : ce que l'on retire de y avant le calage (le coût de la pluie, dans le contrôle a posteriori)
function fit(idx, extra, yAdj) {
  const X = idx.map(i => extra ? [...xrow(i), extra[i]] : xrow(i)), y = idx.map(i => Y[i] - (yAdj ? yAdj[i] : 0)), n = X.length, k = X[0].length;
  const XtX = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0)));
  const XtXi = inv(XtX), P = X.map(r => XtXi.map(row => row.reduce((s, v, j) => s + v * r[j], 0)));   // n × k : ligne i de (X'X)^-1 X'
  const b = Array.from({ length: k }, (_, a) => P.reduce((s, p, i) => s + p[a] * y[i], 0));
  const res = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * b[j], 0));
  const s = Math.sqrt(res.reduce((a, v) => a + v * v, 0) / (n - k));
  return { X, P, b, res, s, n, k, XtXi };
}

// ---------- coût de la pluie (régression de toute la traversée, erreur type robuste par sortie) ----------
const okAll = S.map((_, i) => i).filter(i => !art[i]), FW = fit(okAll, wetX), kw = FW.k - 1;
const meat = Array.from({ length: FW.k }, () => Array(FW.k).fill(0));
[...new Set(okAll.map(i => S[i].act))].forEach(id => { const g = Array(FW.k).fill(0); okAll.forEach((i, r) => { if (S[i].act === id) for (let a = 0; a < FW.k; a++) g[a] += FW.X[r][a] * FW.res[r]; }); for (let a = 0; a < FW.k; a++) for (let b = 0; b < FW.k; b++) meat[a][b] += g[a] * g[b]; });
const Vw = FW.XtXi.map((row, a) => FW.XtXi.map((_, b) => { let v = 0; for (let c = 0; c < FW.k; c++) for (let e = 0; e < FW.k; e++) v += FW.XtXi[a][c] * meat[c][e] * FW.XtXi[e][b]; return v; }));
const RAIN = { mu: FW.b[kw], se: Math.sqrt(Vw[kw][kw]) };
const rainAdj = S.map((s, i) => wetX[i] * RAIN.mu);

// ---------- simulation : ns × nf heures ----------
// opt.worlds : mondes météo possibles (un tiré par simulation) ; opt.cost : coût d'un jour de pluie (log, moyenne et erreur type)
function simulate(cal, fut, kind, seed, opt = {}) {
  const F = fit(cal, null, opt.yAdj), { P, b, res, s, n } = F, nf = fut.length, Ln = opt.L || L, r = rng(seed);
  const Xf = fut.map(xrow), out = new Float64Array(NS * nf), u0 = new Float64Array(n), bs = new Float64Array(K_);
  const wsel = opt.worlds ? new Int32Array(NS) : null, csel = opt.worlds ? new Float64Array(NS) : null, fd = fut.map(i => S[i].day - 1);
  const blocks = (dst, len) => { for (let p = 0; p < len;) { const st = Math.floor(r.u() * (n - Ln + 1)); for (let q = 0; q < Ln && p < len; q++, p++) dst[p] = res[st + q]; } };
  const uf = new Float64Array(nf);
  for (let k = 0; k < NS; k++) {
    if (kind === 'normal') { for (let i = 0; i < n; i++) u0[i] = r.g() * s; for (let j = 0; j < nf; j++) uf[j] = r.g() * s; }
    else { blocks(u0, n); blocks(uf, nf); }
    for (let a = 0; a < K_; a++) { let v = b[a]; for (let i = 0; i < n; i++) v += P[i][a] * u0[i]; bs[a] = v; }   // modèle réestimé sur y* = Xb + u*
    let wet = null, c = 0;
    if (opt.worlds) { const w = Math.floor(r.u() * opt.worlds.length); wsel[k] = w; wet = opt.worlds[w].wet; c = opt.cost.mu + opt.cost.se * r.g(); csel[k] = c; }
    for (let j = 0; j < nf; j++) { let lp = uf[j]; for (let a = 0; a < K_; a++) lp += Xf[j][a] * bs[a]; if (wet && wet[fd[j]]) lp += c; out[k * nf + j] = T0[fut[j]] * Math.exp(lp); }
  }
  return { T: out, nf, fit: F, wsel, csel };
}
const sorted = a => Float64Array.from(a).sort();
const q = (s, p) => { const h = (s.length - 1) * p / 100, lo = Math.floor(h); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo); };
const sumOver = (sim, mask) => { const o = new Float64Array(NS); for (let k = 0; k < NS; k++) { let v = 0; for (let j = 0; j < sim.nf; j++) if (mask[j]) v += sim.T[k * sim.nf + j]; o[k] = v; } return o; };
const share = (a, v) => { let c = 0; for (const x of a) if (x < v) c++; return c / a.length * 100; };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const idxWhere = f => S.map((_, i) => i).filter(f);

// ---------- 1. prévision au soir du J2 ----------
const cal0 = idxWhere(i => S[i].day <= ORIGIN && !art[i]), fut0 = idxWhere(i => S[i].day > ORIGIN);
const km0 = S[fut0[0] - 1].km, realTot = fut0.reduce((a, i) => a + TR[i], 0);
// points du graphique : un tronçon sur 4, plus la fin de chaque journée
const pts = fut0.map((i, j) => j).filter(j => j % 4 === 3 || j === fut0.length - 1 || S[fut0[j]].day !== S[fut0[j + 1]].day);
const segKm = [r2(km0), ...pts.map(j => r2(S[fut0[j]].km))], segDay = [ORIGIN + 1, ...pts.map(j => S[fut0[j]].day)];
const DAYS = [...new Set(fut0.map(i => S[i].day))];
function cumAt(sim) { const C = new Float64Array(NS * pts.length); for (let k = 0; k < NS; k++) { let c = 0, p = 0; for (let j = 0; j < sim.nf; j++) { c += sim.T[k * sim.nf + j]; if (j === pts[p]) C[k * pts.length + p++] = c; } } return C; }
const realCum = (() => { const o = []; let c = 0, p = 0; fut0.forEach((i, j) => { c += TR[i]; if (j === pts[p]) { o.push(c); p++; } }); return o; })();
const POOL0 = poolAt(ORIGIN);
const sims = { blocs: simulate(cal0, fut0, 'blocs', 20260614), normal: simulate(cal0, fut0, 'normal', 20260615),
  clim: simulate(cal0, fut0, 'blocs', 20260616, { worlds: POOL0, cost: RAIN }) };
const cums = { blocs: cumAt(sims.blocs), normal: cumAt(sims.normal), clim: cumAt(sims.clim) };
const col = (C, p) => { const o = new Float64Array(NS); for (let k = 0; k < NS; k++) o[k] = C[k * pts.length + p]; return o; };
const center = pts.map((_, p) => q(sorted(col(cums.blocs, p)), 50));   // prévision centrale : médiane du modèle « beau temps »
const PCT = [1, 5, 25, 50, 75, 95, 99], EDGES = []; for (let v = -8; v <= 14 + 1e-9; v += .25) EDGES.push(r2(v));   // jusqu’à +14 h : la queue de la pluie
function pack(kind) {
  const sim = sims[kind], C = cums[kind], nP = pts.length, bands = Object.fromEntries(PCT.map(p => [p, [0]]));
  for (let p = 0; p < nP; p++) { const s = sorted(col(C, p)); PCT.forEach(pc => bands[pc].push(r3(q(s, pc) - center[p]))); }
  const tot = col(C, nP - 1), dev = Float64Array.from(tot, v => v - center[nP - 1]), sd = sorted(dev);
  const mean = tot.reduce((a, v) => a + v, 0) / NS, sdv = Math.sqrt(tot.reduce((a, v) => a + (v - mean) ** 2, 0) / (NS - 1));
  const p95 = q(sd, 95), tail = Array.from(dev).filter(v => v >= p95);
  const hist = EDGES.slice(0, -1).map((e, i) => { let c = 0; for (const v of dev) if (v >= e && v < EDGES[i + 1]) c++; return c; });
  const paths = []; for (let k = 0; k < 160; k++) { const kk = Math.floor(k * NS / 160); paths.push([0, ...pts.map((_, p) => r2(C[kk * nP + p] - center[p]))]); }
  const day = DAYS.map(d => { const m = fut0.map(i => S[i].day === d), mc = fut0.map(i => S[i].day <= d), a = sumOver(sim, m), s = sorted(a), real = fut0.reduce((x, i) => x + (S[i].day === d ? TR[i] : 0), 0), realC = fut0.reduce((x, i) => x + (S[i].day <= d ? TR[i] : 0), 0);
    const p95d = q(s, 95); return { day: d, real: r2(real), p5: r2(q(s, 5)), p50: r2(q(s, 50)), p95: r2(p95d), es95: r2(Array.from(a).filter(v => v >= p95d).reduce((x, v) => x + v, 0) / Array.from(a).filter(v => v >= p95d).length), pct: r1(share(a, real)), cum_pct: r1(share(sumOver(sim, mc), realC)) }; });
  return { seg: { bands, paths, term: PCT.map(p => r3(q(sd, p))), term_sd: r3(sdv), es95: r2(tail.reduce((a, v) => a + v, 0) / tail.length), hist, edges: EDGES, real_pct: r1(share(tot, realTot)), median: r2(q(sorted(tot), 50)), mean: r2(mean) }, day };
}
const F0 = sims.blocs.fit;
const out = {
  ns: NS, block: L, origin: ORIGIN, cal_n: cal0.length, fut_n: fut0.length, km0: r2(km0), sigma: r3(F0.s),
  coef: NAMES.map((nm, a) => ({ name: nm, b: r3(F0.b[a]), pct: a ? r1((Math.exp(F0.b[a]) - 1) * 100) : null })),
  seg_km: segKm, seg_day: segDay, days: DAYS, real_tot: r2(realTot), central: r2(center[center.length - 1]),
  real_dev: [0, ...realCum.map((v, p) => r3(v - center[p]))],
  blocs: pack('blocs'), normal: pack('normal'), clim: pack('clim'),
};
// ce que le climat promettait au soir du J2 : jours de pluie du J3 au J9
{ const nW = Array.from(sims.clim.wsel, w => POOL0[w].wet.slice(ORIGIN).filter(Boolean).length);
  const realN = realWet.slice(ORIGIN + 1).filter(Boolean).length, dist = [0, 1, 2, 3, 4, 5, 6, 7].map(k => r1(nW.filter(v => v === k).length / NS * 100));
  out.climate = { worlds: WORLDS.length, pool: POOL0.length, real_wet: realN, wet_mean: r2(nW.reduce((a, b) => a + b, 0) / NS), wet_dist: dist,
    p_none: r1(nW.filter(v => v === 0).length / NS * 100), p_ge_real: r1(nW.filter(v => v >= realN).length / NS * 100),
    rain_pct: r1((Math.exp(RAIN.mu) - 1) * 100), rain_lo: r1((Math.exp(RAIN.mu - 1.96 * RAIN.se) - 1) * 100), rain_hi: r1((Math.exp(RAIN.mu + 1.96 * RAIN.se) - 1) * 100),
    rain_03: r1(window.RISK_EPISODES.sys.rain_pct * 100), cost_mean: r2(out.clim.seg.median - out.blocs.seg.median) }; }

// ---------- 2. contrôle a posteriori, chaque soir pour le lendemain ----------
const bt = { days: [], outings: [] };
DAYS.forEach(d => {
  const cal = idxWhere(i => S[i].day < d && !art[i]), fut = idxWhere(i => S[i].day === d), acts = [...new Set(fut.map(i => S[i].act))];
  const res = {}; ['normal', 'blocs'].forEach((kind, z) => { res[kind] = simulate(cal, fut, kind, 777000 + d * 10 + z); });
  res.clim = simulate(cal, fut, 'blocs', 777000 + d * 10 + 2, { yAdj: rainAdj, worlds: poolAt(d - 1), cost: RAIN });
  const st = (kind, mask, real) => { const a = sumOver(res[kind], mask), s = sorted(a); return { p5: r2(q(s, 5)), p50: r2(q(s, 50)), p95: r2(q(s, 95)), pct: r1(share(a, real)) }; };
  const realD = fut.reduce((a, i) => a + TR[i], 0), all = fut.map(() => true);
  const pw = poolAt(d - 1), p_wet = r1(pw.filter(w => w.wet[d - 1]).length / pw.length * 100);
  bt.days.push({ day: d, n_cal: cal.length, real: r2(realD), wet: realWet[d], p_wet, normal: st('normal', all, realD), blocs: st('blocs', all, realD), clim: st('clim', all, realD) });
  acts.forEach(id => { const m = fut.map(i => S[i].act === id), real = fut.reduce((a, i) => a + (S[i].act === id ? TR[i] : 0), 0);
    bt.outings.push({ id, name: rowOf[id].name, day: d, wet: realWet[d], real: r2(real), normal: st('normal', m, real), blocs: st('blocs', m, real), clim: st('clim', m, real) }); });
});
const inside = o => o.pct >= 5 && o.pct <= 95;
const count = (kind, f) => { const a = bt.outings.filter(f); return { n: a.length, in90: a.filter(o => inside(o[kind])).length, above95: a.filter(o => o[kind].pct > 95).length, below5: a.filter(o => o[kind].pct < 5).length }; };
// probabilité binomiale d'au moins x dépassements sur n au taux p (test de Kupiec, version exacte)
const binTail = (n, x, p) => { let s = 0, c = 1; for (let k = 0; k <= n; k++) { if (k >= x) s += c * p ** k * (1 - p) ** (n - k); c = c * (n - k) / (k + 1); } return s; };
bt.summary = Object.fromEntries(['normal', 'blocs', 'clim'].map(kind => { const all = count(kind, () => true), dry = count(kind, o => !o.wet), wet = count(kind, o => o.wet);
  return [kind, { all, dry, wet, p_out_all: r3(binTail(all.n, all.n - all.in90, .1)), p_out_dry: r3(binTail(dry.n, dry.n - dry.in90, .1)), p_above_wet: r3(binTail(wet.n, wet.above95, .05)), p_above_all: r3(binTail(all.n, all.above95, .05)) }]; }));
out.backtest = bt;

// ---------- 3. coût de la pluie et test de résistance : le pire des mondes ----------
const nWet = w => w.wet.slice(ORIGIN).filter(Boolean).length, mmSum = w => w.mm.slice(ORIGIN).reduce((a, b) => a + b, 0);
const worst = [...POOL0].sort((a, b) => nWet(b) - nWet(a) || mmSum(b) - mmSum(a))[0];
const scen = (label, sim) => { const tot = sumOver(sim, fut0.map(() => true)), s = sorted(tot);
  return { label, median: r2(q(s, 50)), p95: r2(q(s, 95)), delta: r2(q(s, 50) - out.blocs.seg.median), real_pct: r1(share(tot, realTot)) }; };
out.stress = { pct: r1((Math.exp(RAIN.mu) - 1) * 100), lo: r1((Math.exp(RAIN.mu - 1.96 * RAIN.se) - 1) * 100), hi: r1((Math.exp(RAIN.mu + 1.96 * RAIN.se) - 1) * 100), wet_from: WET_FROM,
  wet_share: r3(fut0.reduce((a, i) => a + (S[i].day >= WET_FROM ? TR[i] : 0), 0) / realTot),
  worst: { start: worst.start, wet: nWet(worst), mm: r1(mmSum(worst)), days: worst.wet.map(Number) },
  scen: [scen('sec', sims.blocs), scen('clim', sims.clim), scen('pire', simulate(cal0, fut0, 'blocs', 31003, { worlds: [worst], cost: RAIN }))] };

// ---------- 4. sensibilités ----------
const keptMask = fut0.map(i => S[i].act !== MARGIN_ACT);   // tout sauf le jour de marge (la Støvla), pour outils/marge_option.js
const quick = (kind, seed, opt) => { const sim = simulate(cal0, fut0, kind, seed, opt), tot = sumOver(sim, fut0.map(() => true)), m = tot.reduce((a, v) => a + v, 0) / NS, s = sorted(tot);
  const o = { real_pct: r1(share(tot, realTot)), sd: r2(Math.sqrt(tot.reduce((a, v) => a + (v - m) ** 2, 0) / (NS - 1))), median: r2(q(s, 50)), p95: r2(q(s, 95)) };
  if (opt && opt.worlds) { const kq = sorted(sumOver(sim, keptMask)); o.kept_q = Array.from({ length: 101 }, (_, i) => r3(q(kq, i))); }
  return o; };
const c03 = Math.log(1 + window.RISK_EPISODES.sys.rain_pct);
out.sens = { L4: quick('blocs', 41, { L: 4 }), L16: quick('blocs', 42, { L: 16 }), seeds: [1, 2, 3].map(z => quick('blocs', 9000 + z).real_pct), seeds_normal: [1, 2, 3].map(z => quick('normal', 9100 + z).real_pct) };
out.sens_clim = {
  cost03: quick('blocs', 43, { worlds: POOL0, cost: { mu: c03, se: 0 } }),          // coût de la partie 03 (+13 %), fixe
  cost_fixed: quick('blocs', 44, { worlds: POOL0, cost: { mu: RAIN.mu, se: 0 } }),  // coût mesuré, sans incertitude
  all_worlds: quick('blocs', 45, { worlds: WORLDS, cost: RAIN }),                    // sans tenir compte du J2 sec
  L4: quick('blocs', 46, { worlds: POOL0, cost: RAIN, L: 4 }), L16: quick('blocs', 47, { worlds: POOL0, cost: RAIN, L: 16 }),
  seeds: [1, 2, 3].map(z => quick('blocs', 9200 + z, { worlds: POOL0, cost: RAIN })),
};

// ---------- 5. pour la marge : chaque soir, le temps restant hors jour de marge, sachant la météo du jour ----------
const QS = Array.from({ length: 101 }, (_, i) => i);
const kept = keptMask;
const marge = { act: MARGIN_ACT, day: rowOf[MARGIN_ACT].day, real_h: r3(fut0.reduce((a, i) => a + (S[i].act === MARGIN_ACT ? TR[i] : 0), 0)), evenings: [] };
[2, 3, 4, 5, 6, 7, 8].forEach(t => {
  const mask = fut0.map((i, j) => kept[j] && S[i].day > t), past = fut0.reduce((a, i, j) => a + (kept[j] && S[i].day <= t ? TR[i] : 0), 0);
  const e = { day: t, wet: realWet[t], past: r3(past) };
  ['clim', 'blocs'].forEach(kind => {
    const sim = sims[kind], rem = sumOver(sim, mask);
    const ok = kind === 'clim' ? Array.from(sim.wsel, w => POOL0[w].wet[t - 1] === realWet[t]) : null;   // mondes où le jour t ressemble au réel
    const v = sorted(ok ? Array.from(rem).filter((_, k) => ok[k]) : rem);
    e[kind] = { n: v.length, q: QS.map(p => r3(q(v, p))) };
  });
  marge.evenings.push(e);
});
marge.k_blocs = r3(q(sorted(sumOver(sims.blocs, kept)), 50));   // prévision du J2, beau temps, hors jour de marge
marge.real_kept = r3(fut0.reduce((a, i, j) => a + (kept[j] ? TR[i] : 0), 0));
out.marge = marge;

fs.writeFileSync(path.join(root, 'data', 'risque_mc.js'), `// généré par outils/monte_carlo.js — ne pas modifier à la main\nwindow.RISK_MC = ${JSON.stringify(out)};\n`);
const hm = h => `${h < 0 ? '−' : ''}${Math.floor(Math.abs(h))} h ${String(Math.round((Math.abs(h) % 1) * 60)).padStart(2, '0')}`;
console.log(`calage J1–J${ORIGIN} : ${cal0.length} tronçons, s = ${out.sigma} ·`, out.coef.map(c => `${c.name} ${c.b}`).join(' · '));
console.log(`prévision J${ORIGIN + 1}–J9 : centrale ${hm(out.central)}, réel ${hm(realTot)} (${hm(realTot - out.central)} d'écart)`);
['normal', 'blocs', 'clim'].forEach(k => console.log(`  ${k.padEnd(7)} médiane ${hm(out[k].seg.median)} · écart-type ${hm(out[k].seg.term_sd)} · P5/P95 ${out[k].seg.term[1]} / ${out[k].seg.term[5]} h · 5 % pires ${out[k].seg.es95} h · réel au centile ${out[k].seg.real_pct}`));
console.log('climat :', JSON.stringify(out.climate));
console.log('par jour (climat) :', out.clim.day.map(d => `J${d.day} ${d.real} [${d.p5}–${d.p95}] c${d.pct} cumul c${d.cum_pct}`).join(' | '));
console.log('contrôle, veille pour le lendemain :'); bt.days.forEach(d => console.log(`  J${d.day} réel ${d.real}${d.wet ? ' pluie' : ''} (P pluie ${d.p_wet} %) · blocs [${d.blocs.p5}–${d.blocs.p95}] c${d.blocs.pct} · climat [${d.clim.p5}–${d.clim.p95}] c${d.clim.pct}`));
console.log('sorties :', JSON.stringify(bt.summary));
console.log('test de résistance :', JSON.stringify(out.stress));
console.log('sensibilités :', JSON.stringify(out.sens), JSON.stringify(Object.fromEntries(Object.entries(out.sens_clim).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => x.real_pct) : v.real_pct]))));
console.log('marge :', JSON.stringify({ k: marge.k_blocs, real_kept: marge.real_kept, real_h: marge.real_h, n: marge.evenings.map(e => e.clim.n) }));

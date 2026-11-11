// Simulation de risque (partie 11) : une vraie prévision, hors échantillon.
// Entrées : risque_data.js (tronçons, sorties), risque_sections.js (cote du terrain par tronçon).
// Sortie  : risque_mc.js — à relancer après outils/segmentation_terrain.js :
//   node outils/monte_carlo.js
//
// L'ancienne simulation (analyse_risque.py) était calée sur toute la traversée : le réel finissait
// à zéro par construction, et chaque journée était jugée avec ses propres données. Ici :
//
// 1. Modèle à facteurs, sur les tronçons de 250 m :
//      ln(temps réel / temps de Tobler) = a + b1·sac + b2·cote + b3·[pente < −15 %] + b4·|pente|/10 + u
//    estimé par moindres carrés sur les seuls jours déjà marchés. L'artefact GPS de Kvalvika
//    (|pente| > 60 %) est exclu du calage ; sa pente est remplacée par celle de ses voisins.
// 2. Prévision au soir du J2 : modèle calé sur J1–J2, puis J3–J9 simulés 5 000 fois sur le parcours
//    réellement suivi (l'itinéraire est une décision, le temps est le risque). Deux façons de tirer
//    l'aléa u, chacune avec l'incertitude d'estimation des coefficients (rééchantillonnage des
//    résidus, modèle réestimé à chaque simulation) :
//      - loi normale : résidus indépendants N(0, s²) ;
//      - blocs : résidus réels tirés par blocs de 8 tronçons consécutifs (2 km), avec remise.
// 3. Contrôle a posteriori (backtest) : chaque soir, le modèle est recalé sur les jours passés et
//    prévoit le lendemain ; on compte les journées et les sorties qui sortent de l'intervalle à 90 %.
// 4. Test de résistance : choc « mauvais temps » mesuré sur J7–J9 (régression complète, erreur
//    type robuste par sortie), appliqué à la prévision du J2.
// Graine fixe : le fichier produit est reproductible.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'risque_data.js')); require(path.join(root, 'risque_sections.js'));
const R = window.RISK, S = R.series, N = S.length, G = window.RISK_SECTIONS.seg_grade, mm = R.dist.mode_mu;
const NS = 5000, L = 8, ORIGIN = 2, GPS_SLOPE = 60, WET_FROM = 7;
const rowOf = Object.fromEntries(R.rows.map(r => [r.id, r]));

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
function fit(idx, extra) {
  const X = idx.map(i => extra ? [...xrow(i), extra[i]] : xrow(i)), y = idx.map(i => Y[i]), n = X.length, k = X[0].length;
  const XtX = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0)));
  const XtXi = inv(XtX), P = X.map(r => XtXi.map(row => row.reduce((s, v, j) => s + v * r[j], 0)));   // n × k : ligne i de (X'X)^-1 X'
  const b = Array.from({ length: k }, (_, a) => P.reduce((s, p, i) => s + p[a] * y[i], 0));
  const res = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * b[j], 0));
  const s = Math.sqrt(res.reduce((a, v) => a + v * v, 0) / (n - k));
  return { X, P, b, res, s, n, k, XtXi };
}

// ---------- simulation : ns × nf heures ----------
function simulate(cal, fut, kind, seed, opt = {}) {
  const F = fit(cal), { P, b, res, s, n } = F, nf = fut.length, Ln = opt.L || L, r = rng(seed);
  const Xf = fut.map(xrow), out = new Float64Array(NS * nf), u0 = new Float64Array(n), bs = new Float64Array(K_);
  const blocks = (dst, len) => { for (let p = 0; p < len;) { const st = Math.floor(r.u() * (n - Ln + 1)); for (let q = 0; q < Ln && p < len; q++, p++) dst[p] = res[st + q]; } };
  const uf = new Float64Array(nf);
  for (let k = 0; k < NS; k++) {
    if (kind === 'normal') { for (let i = 0; i < n; i++) u0[i] = r.g() * s; for (let j = 0; j < nf; j++) uf[j] = r.g() * s; }
    else { blocks(u0, n); blocks(uf, nf); }
    for (let a = 0; a < K_; a++) { let v = b[a]; for (let i = 0; i < n; i++) v += P[i][a] * u0[i]; bs[a] = v; }   // modèle réestimé sur y* = Xb + u*
    const sh = opt.shock ? opt.shock.mu + opt.shock.se * r.g() : 0;
    for (let j = 0; j < nf; j++) { let lp = uf[j]; for (let a = 0; a < K_; a++) lp += Xf[j][a] * bs[a]; if (sh && opt.shock.on(fut[j])) lp += sh; out[k * nf + j] = T0[fut[j]] * Math.exp(lp); }
  }
  return { T: out, nf, fit: F };
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
const sims = { blocs: simulate(cal0, fut0, 'blocs', 20260614), normal: simulate(cal0, fut0, 'normal', 20260615) };
const cums = { blocs: cumAt(sims.blocs), normal: cumAt(sims.normal) };
const col = (C, p) => { const o = new Float64Array(NS); for (let k = 0; k < NS; k++) o[k] = C[k * pts.length + p]; return o; };
const center = pts.map((_, p) => q(sorted(col(cums.blocs, p)), 50));   // prévision centrale : médiane du modèle par blocs
const PCT = [1, 5, 25, 50, 75, 95, 99], EDGES = []; for (let v = -8; v <= 10 + 1e-9; v += .25) EDGES.push(r2(v));
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
  return { seg: { bands, paths, term: PCT.map(p => r3(q(sd, p))), term_sd: r3(sdv), es95: r2(tail.reduce((a, v) => a + v, 0) / tail.length), hist, edges: EDGES, real_pct: r1(share(tot, realTot)), median: r2(q(sorted(tot), 50)) }, day };
}
const F0 = sims.blocs.fit;
const out = {
  ns: NS, block: L, origin: ORIGIN, cal_n: cal0.length, fut_n: fut0.length, km0: r2(km0), sigma: r3(F0.s),
  coef: NAMES.map((nm, a) => ({ name: nm, b: r3(F0.b[a]), pct: a ? r1((Math.exp(F0.b[a]) - 1) * 100) : null })),
  seg_km: segKm, seg_day: segDay, days: DAYS, real_tot: r2(realTot), central: r2(center[center.length - 1]),
  real_dev: [0, ...realCum.map((v, p) => r3(v - center[p]))],
  blocs: pack('blocs'), normal: pack('normal'),
};

// ---------- 2. contrôle a posteriori, chaque soir pour le lendemain ----------
const bt = { days: [], outings: [] };
DAYS.forEach(d => {
  const cal = idxWhere(i => S[i].day < d && !art[i]), fut = idxWhere(i => S[i].day === d), acts = [...new Set(fut.map(i => S[i].act))];
  const res = {}; ['normal', 'blocs'].forEach((kind, z) => { res[kind] = simulate(cal, fut, kind, 777000 + d * 10 + z); });
  const st = (kind, mask, real) => { const a = sumOver(res[kind], mask), s = sorted(a); return { p5: r2(q(s, 5)), p50: r2(q(s, 50)), p95: r2(q(s, 95)), pct: r1(share(a, real)) }; };
  const realD = fut.reduce((a, i) => a + TR[i], 0), all = fut.map(() => true);
  bt.days.push({ day: d, n_cal: cal.length, real: r2(realD), normal: st('normal', all, realD), blocs: st('blocs', all, realD) });
  acts.forEach(id => { const m = fut.map(i => S[i].act === id), real = fut.reduce((a, i) => a + (S[i].act === id ? TR[i] : 0), 0);
    bt.outings.push({ id, name: rowOf[id].name, day: d, wet: d >= WET_FROM, real: r2(real), normal: st('normal', m, real), blocs: st('blocs', m, real) }); });
});
const inside = o => o.pct >= 5 && o.pct <= 95;
const count = (kind, f) => { const a = bt.outings.filter(f); return { n: a.length, in90: a.filter(o => inside(o[kind])).length, above95: a.filter(o => o[kind].pct > 95).length, below5: a.filter(o => o[kind].pct < 5).length }; };
// probabilité binomiale d'au moins x dépassements sur n au taux p (test de Kupiec, version exacte)
const binTail = (n, x, p) => { let s = 0, c = 1; for (let k = 0; k <= n; k++) { if (k >= x) s += c * p ** k * (1 - p) ** (n - k); c = c * (n - k) / (k + 1); } return s; };
bt.summary = Object.fromEntries(['normal', 'blocs'].map(kind => { const all = count(kind, () => true), dry = count(kind, o => !o.wet), wet = count(kind, o => o.wet);
  return [kind, { all, dry, wet, p_out_all: r3(binTail(all.n, all.n - all.in90, .1)), p_out_dry: r3(binTail(dry.n, dry.n - dry.in90, .1)), p_above_wet: r3(binTail(wet.n, wet.above95, .05)) }]; }));
out.backtest = bt;

// ---------- 3. test de résistance : choc de mauvais temps ----------
const okAll = idxWhere(i => !art[i]), wetX = S.map(s => +(s.day >= WET_FROM)), FW = fit(okAll, wetX), kw = FW.k - 1;
const meat = Array.from({ length: FW.k }, () => Array(FW.k).fill(0));   // erreur type robuste, groupée par sortie
[...new Set(okAll.map(i => S[i].act))].forEach(id => { const g = Array(FW.k).fill(0); okAll.forEach((i, r) => { if (S[i].act === id) for (let a = 0; a < FW.k; a++) g[a] += FW.X[r][a] * FW.res[r]; }); for (let a = 0; a < FW.k; a++) for (let b = 0; b < FW.k; b++) meat[a][b] += g[a] * g[b]; });
const Vw = FW.XtXi.map((row, a) => FW.XtXi.map((_, b) => { let v = 0; for (let c = 0; c < FW.k; c++) for (let e = 0; e < FW.k; e++) v += FW.XtXi[a][c] * meat[c][e] * FW.XtXi[e][b]; return v; }));
const shock = { mu: FW.b[kw], se: Math.sqrt(Vw[kw][kw]) }, pc = v => r1((Math.exp(v) - 1) * 100);
const scen = (label, on, seed) => { const sim = on ? simulate(cal0, fut0, 'blocs', seed, { shock: { ...shock, on } }) : sims.blocs, tot = sumOver(sim, fut0.map(() => true)), s = sorted(tot);
  return { label, median: r2(q(s, 50)), p95: r2(q(s, 95)), delta: r2(q(s, 50) - out.blocs.seg.median), real_pct: r1(share(tot, realTot)) }; };
out.stress = { pct: pc(shock.mu), lo: pc(shock.mu - 1.96 * shock.se), hi: pc(shock.mu + 1.96 * shock.se), wet_from: WET_FROM,
  wet_share: r3(fut0.reduce((a, i) => a + (S[i].day >= WET_FROM ? TR[i] : 0), 0) / realTot),
  scen: [scen('sec', null), scen('pluie_fin', i => S[i].day >= WET_FROM, 31001), scen('pluie_tout', () => true, 31002)] };

// ---------- 4. sensibilités : longueur des blocs et hasard de la simulation ----------
const quick = (kind, seed, opt) => { const sim = simulate(cal0, fut0, kind, seed, opt), tot = sumOver(sim, fut0.map(() => true)), m = tot.reduce((a, v) => a + v, 0) / NS; return { real_pct: r1(share(tot, realTot)), sd: r2(Math.sqrt(tot.reduce((a, v) => a + (v - m) ** 2, 0) / (NS - 1))) }; };
out.sens = { L4: quick('blocs', 41, { L: 4 }), L16: quick('blocs', 42, { L: 16 }), seeds: [1, 2, 3].map(z => quick('blocs', 9000 + z).real_pct), seeds_normal: [1, 2, 3].map(z => quick('normal', 9100 + z).real_pct) };

fs.writeFileSync(path.join(root, 'risque_mc.js'), `// généré par outils/monte_carlo.js — ne pas modifier à la main\nwindow.RISK_MC = ${JSON.stringify(out)};\n`);
const hm = h => `${h < 0 ? '−' : ''}${Math.floor(Math.abs(h))} h ${String(Math.round((Math.abs(h) % 1) * 60)).padStart(2, '0')}`;
console.log(`calage J1–J${ORIGIN} : ${cal0.length} tronçons, s = ${out.sigma} ·`, out.coef.map(c => `${c.name} ${c.b}`).join(' · '));
console.log(`prévision J${ORIGIN + 1}–J9 : centrale ${hm(out.central)}, réel ${hm(realTot)} (${hm(realTot - out.central)} d'écart)`);
['normal', 'blocs'].forEach(k => console.log(`  ${k.padEnd(7)} écart-type ${hm(out[k].seg.term_sd)} · P5/P95 ${out[k].seg.term[1]} / ${out[k].seg.term[5]} h · 5 % pires ${out[k].seg.es95} h · réel au centile ${out[k].seg.real_pct}`));
console.log('par jour (blocs) :', out.blocs.day.map(d => `J${d.day} ${d.real} [${d.p5}–${d.p95}] c${d.pct} cumul c${d.cum_pct}`).join(' | '));
console.log('contrôle, veille pour le lendemain :'); bt.days.forEach(d => console.log(`  J${d.day} réel ${d.real} · normale [${d.normal.p5}–${d.normal.p95}] c${d.normal.pct} · blocs [${d.blocs.p5}–${d.blocs.p95}] c${d.blocs.pct}`));
console.log('sorties :', JSON.stringify(bt.summary));
console.log('choc mauvais temps :', JSON.stringify(out.stress));
console.log('sensibilités :', JSON.stringify(out.sens));

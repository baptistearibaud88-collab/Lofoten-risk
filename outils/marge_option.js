// Le jour de marge évalué comme une option (fin de la partie 07).
// Entrées : risque_mc.js (simulation avec le climat : chaque soir, le temps de marche restant hors jour de marge,
//           sachant la météo du jour), risque_plan.js (jour de marge du plan, vitesse en trail, conversion de mesure).
// Sortie  : risque_marge.js — à relancer après outils/monte_carlo.js et outils/plan_reel.js :
//   node outils/marge_option.js
//
// Le plan gardait un jour « de marge (météo ou forme) » : la Støvla, ou le temps de rattraper un retard.
// - La marge M : la Støvla convertie en heures à mon allure en trail (même conversion que outils/plan_reel.js).
// - L'actif X : le temps de marche des J3–J9 HORS jour de marge (la Støvla en est retirée : sinon elle serait
//   comptée deux fois, dans la prévision et dans la marge).
// - Le seuil K : la prévision du soir du J2 à mon allure de beau temps (médiane du modèle « beau temps »), c'est-à-dire
//   le calendrier du plan. Tout dépassement, de forme ou de météo, se prend sur le jour de marge, jusqu'à M.
//   Paiement = min(max(X − K, 0), M) : un « call spread ».
// - Prix : par Monte Carlo (Boyle 1977), sur la distribution simulée avec le climat ; chaque soir t, X = temps déjà
//   marché + temps restant simulé, parmi les mondes où le jour t a la météo réelle (sec ou pluie).
//   Formule de Black 1976 en comparaison (prix à terme F = espérance, s = écart-type / F) : elle suppose une loi
//   lognormale sans régimes ; l'écart entre les deux est le « smile ».
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_mc.js', 'risque_plan.js'].forEach(f => require(path.join(root, 'data', f)));
const MC = window.RISK_MC, P = window.RISK_PLAN, MG = MC.marge;
if (!MG) throw new Error('risque_mc.js sans bloc « marge » : relancer outils/monte_carlo.js');

// --- loi normale et Black 1976 ---
const erf = x => { const t = 1 / (1 + .3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const N = x => .5 * (1 + erf(x / Math.SQRT2));
const call = (F, K, s) => { if (s <= 1e-9) return Math.max(F - K, 0); const d1 = (Math.log(F / K) + s * s / 2) / s; return F * N(d1) - K * N(d1 - s); };
const spread = (F, K, M, s) => call(F, K, s) - call(F, K + M, s);

const ratio = P.modes.ratio, vT = P.modes.speed.trail, mg = P.plan.margin;
const M = (mg.km * ratio + mg.dplus / 100) / vT, K = MG.k_blocs;
// distribution à partir des centiles 0…100 : 100 valeurs au milieu de chaque tranche
const draws = qs => Array.from({ length: 100 }, (_, i) => (qs[i] + qs[i + 1]) / 2);
const payoff = (x, k = K, m = M) => Math.min(Math.max(x - k, 0), m);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length, sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
const value = (X, k = K, m = M) => mean(X.map(x => payoff(x, k, m)));
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, mn = h => Math.round(h * 60);

const curve = MG.evenings.map(e => {
  const o = { day: e.day, wet: e.wet };
  ['clim', 'blocs'].forEach(kind => {
    const X = draws(e[kind].q).map(r => e.past + r), F = mean(X), S = sd(X);
    o[kind] = { value: mn(value(X)), p_use: r1(X.filter(x => x > K).length), p_out: r1(X.filter(x => x > K + M).length), rem_min: mn(S), black: mn(spread(F, K, M, S / F)), n: e[kind].n };
  });
  o.dev = mn(e.past + e.blocs.q[50] - K);   // retard sur le calendrier : déjà marché + suite prévue (beau temps) − seuil
  return o;
});
// soir du J9 : tout est marché
const used = payoff(MG.real_kept);
curve.push({ day: 9, wet: true, dev: mn(MG.real_kept - K), clim: { value: mn(used), p_use: +(MG.real_kept > K) * 100, p_out: +(MG.real_kept > K + M) * 100, rem_min: 0, black: mn(used) }, blocs: { value: mn(used), p_use: +(MG.real_kept > K) * 100, p_out: +(MG.real_kept > K + M) * 100, rem_min: 0, black: mn(used) } });

// grecs au soir du J2, sur la distribution simulée avec le climat
const X0 = draws(MG.evenings[0].clim.q).map(r => MG.evenings[0].past + r), m0 = mean(X0), s0 = sd(X0);
const greeks = {
  delta: r2((value(X0.map(x => x + .5)) - value(X0.map(x => x - .5)))),            // heures de marge par heure de prévision
  vega_10: r1((value(X0.map(x => m0 + (x - m0) * 1.1)) - value(X0)) * 60),         // minutes pour +10 % d'incertitude
};
// volatilité implicite, sur des options simples (call : paiement max(X − Kx, 0)) : leur prix monte toujours avec
// l'incertitude, donc l'écart-type implicite est unique. Sur la marge elle-même (plafonnée), il ne l'est pas toujours.
const callMC = Kx => mean(X0.map(x => Math.max(x - Kx, 0)));
const impliedCall = (target, Kx) => { let lo = 1e-4, hi = .5; for (let i = 0; i < 60; i++) { const v = (lo + hi) / 2; if (call(m0, Kx, v) < target) lo = v; else hi = v; } return (lo + hi) / 2; };
const smile = [-1, 0, 1, 2, 3, 4, 5].map(x => ({ x, sd_h: r2(impliedCall(callMC(K + x), K + x) * m0), p: r1(X0.filter(v => v > K + x).length) }));

// solidité de la valeur au J2 : autres choix de simulation (coût de la pluie, blocs, mondes, tirages), autre taille de la marge, autre seuil
const SC = MC.sens_clim, variants = { cost03: SC.cost03, cost_fixed: SC.cost_fixed, all_worlds: SC.all_worlds, L4: SC.L4, L16: SC.L16, ...Object.fromEntries(SC.seeds.map((v, i) => [`seed${i + 1}`, v])) };
const vs = Object.entries(variants).map(([k, v]) => { const X = draws(v.kept_q); return { k, value: mn(value(X)), p_use: r1(X.filter(x => x > K).length) }; });
const sens = { value_min: Math.min(...vs.map(v => v.value)), value_max: Math.max(...vs.map(v => v.value)), use_min: Math.min(...vs.map(v => v.p_use)), use_max: Math.max(...vs.map(v => v.p_use)), variants: vs,
  by_M: [M, 4, 6, 8].map(m => ({ M_min: mn(m), value: mn(value(X0, K, m)), p_out: r1(X0.filter(x => x > K + m).length) })),
  k_clim: (() => { const s_ = [...X0].sort((a, b) => a - b), kc = (s_[49] + s_[50]) / 2; return { above_min: mn(kc - K), value: mn(value(X0, kc)), p_use: r1(X0.filter(x => x > kc).length) }; })() };
const c2 = curve[0], c5 = curve.find(c => c.day === 5), c7 = curve.find(c => c.day === 7);
const res = {
  K: r2(K), M: r2(M), M_min: mn(M), margin: mg, real_kept: r2(MG.real_kept), used_min: mn(used), stvla_real_min: mn(MG.real_h),
  real_end_min: Math.round(MC.real_dev[MC.real_dev.length - 1] * 60),
  sd: { clim: r2(s0), blocs: r2(sd(draws(MG.evenings[0].blocs.q))), f_minus_k: r2(m0 - K) },
  value_j2: { sim: c2.clim.value, black: c2.clim.black, beau_temps: c2.blocs.value },
  curve, greeks, smile, sens,
  theta: { j2: c2.clim.value, j5: c5.clim.value, j7: c7.clim.value, per_day: r1((c5.clim.value - c2.clim.value) / 3) },
};
fs.writeFileSync(path.join(root, 'data', 'risque_marge.js'), `// généré par outils/marge_option.js — ne pas modifier à la main\nwindow.RISK_MARGE = ${JSON.stringify(res)};\n`);
console.log(`marge M = ${M.toFixed(2)} h (${res.M_min} min) · seuil K = ${K} h (calendrier, beau temps, hors Støvla) · réel hors Støvla ${MG.real_kept} h → marge utilisée ${res.used_min} min (${Math.round(used / M * 100)} %)`);
console.log('valeur au J2 (min) :', JSON.stringify(res.value_j2), '· écarts-types (h) :', JSON.stringify(res.sd));
curve.forEach(c => console.log(`J${c.day}${c.wet ? ' pluie' : '      '} retard ${c.dev} min · climat ${c.clim.value} min (entamée ${c.clim.p_use} %, épuisée ${c.clim.p_out} %, Black ${c.clim.black}, n ${c.clim.n}) · beau temps ${c.blocs.value} min (${c.blocs.p_use} %, ${c.blocs.p_out} %)`));
console.log('solidité', JSON.stringify({ ...sens, variants: sens.variants.map(v => `${v.k} ${v.value}`) }));
console.log('grecs J2', JSON.stringify(greeks), '· thêta', JSON.stringify(res.theta), '· smile', JSON.stringify(smile));

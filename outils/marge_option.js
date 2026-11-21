// Le jour de marge évalué comme une option (fin de la partie 07, premier jet du 21/11).
// Entrées : risque_mc.js (prévision du J2, fourchettes, trajectoire réelle, distribution finale),
//           risque_plan.js (jour de marge du plan, vitesse en trail).
// Sortie  : risque_marge.js — à relancer après outils/monte_carlo.js et outils/plan_reel.js :
//   node outils/marge_option.js
//
// L'actif : X, le temps de marche total des J3–J9 (heures). Prévision du soir du J2 : F0 (centrale de la simulation).
// La marge : le jour 9 du plan (Støvla), converti en heures à mon allure réelle en trail :
//   M = (km × ratio de mesure + D+ / 100) / vitesse en trail (même conversion que outils/plan_reel.js).
// L'assurance : la marge absorbe le dépassement de la prévision, jusqu'à M heures :
//   paiement = min(max(X − K, 0), M), avec K = F0  →  un « call spread » : call(K) − call(K + M).
// Prix (formule de Black 1976, sur un prix à terme, taux nul) :
//   call(F, K) = F·N(d1) − K·N(d2),  d1 = [ln(F/K) + s²/2] / s,  d2 = d1 − s,  s = σ√τ (volatilité totale restante)
// Chaque soir t : F_t = F0 + écart réel cumulé à la fin du jour t (le reste suit la prévision) ;
//   s_t = écart-type restant / F_t, avec écart-type restant² = écart-type final² − écart-type déjà écoulé²
//   (écarts-types tirés des fourchettes à 90 % de la simulation : (p95 − p5) / 3,29).
// Volatilité implicite : la volatilité qu'il faut mettre dans Black pour retrouver la valeur calculée sur la
//   distribution finale de la simulation par blocs, pour plusieurs seuils K + x (le « smile »).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_mc.js', 'risque_plan.js'].forEach(f => require(path.join(root, f)));
const MC = window.RISK_MC, P = window.RISK_PLAN;

// --- loi normale ---
const erf = x => { const t = 1 / (1 + .3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const N = x => .5 * (1 + erf(x / Math.SQRT2)), phi = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
const call = (F, K, s) => { if (s <= 1e-9) return Math.max(F - K, 0); const d1 = (Math.log(F / K) + s * s / 2) / s; return F * N(d1) - K * N(d1 - s); };
const spread = (F, K, M, s) => call(F, K, s) - call(F, K + M, s);
const d2 = (F, K, s) => (Math.log(F / K) - s * s / 2) / s;

const F0 = MC.central, K = F0;
const ratio = P.modes.ratio, vT = P.modes.speed.trail, mg = P.plan.margin;
const M = (mg.km * ratio + mg.dplus / 100) / vT;
const last = {}; MC.seg_day.forEach((d, i) => { last[d] = i; });
const sdAt = (m, i) => (MC[m].seg.bands['95'][i] - MC[m].seg.bands['5'][i]) / 3.29;
const sdEnd = m => MC[m].seg.term_sd;

const evenings = [MC.origin, ...Object.keys(last).map(Number)];
const curve = evenings.map(t => {
  const i = t === MC.origin ? null : last[t];
  const dev = i == null ? 0 : MC.real_dev[i];
  const F = F0 + dev, o = { day: t, dev: Math.round(dev * 60) };
  ['blocs', 'normal'].forEach(m => {
    const done = i == null ? 0 : sdAt(m, i), rem = Math.sqrt(Math.max(sdEnd(m) ** 2 - done ** 2, 0)), s = rem / F;
    o[m] = { value: Math.round(spread(F, K, M, s) * 60), p_use: s > 0 ? Math.round(N(d2(F, K, s)) * 1000) / 10 : +(F > K) * 100, p_out: s > 0 ? Math.round(N(d2(F, K + M, s)) * 1000) / 10 : +(F > K + M) * 100, rem_min: Math.round(rem * 60) };
  });
  return o;
});

// grecs de la marge au soir du J2 (modèle par blocs)
const s0 = sdEnd('blocs') / F0;
const greeks = {
  delta: Math.round((call(F0 + .5, K, s0) - call(F0 + .5, K + M, s0) - (call(F0 - .5, K, s0) - call(F0 - .5, K + M, s0))) * 100) / 100, // heures de marge par heure de prévision
  vega_10: Math.round((spread(F0, K, M, s0 * 1.1) - spread(F0, K, M, s0)) * 60 * 10) / 10,                                                // minutes pour +10 % de volatilité
};

// valeur sur la distribution de la simulation (blocs), et volatilité implicite par seuil
const H = MC.blocs.seg.hist, E = MC.blocs.seg.edges, tot = H.reduce((a, b) => a + b, 0);
const mid = H.map((_, i) => (E[i] + E[i + 1]) / 2);
const empSpread = (x, m) => H.reduce((a, h, i) => a + h / tot * Math.min(Math.max(mid[i] - x, 0), m), 0); // en heures, D = X − F0
// recherche sur une grille fine (la valeur d'un call spread n'est pas toujours croissante avec la volatilité)
const implied = (target, Kx, Mx) => { let best = null, err = Infinity; for (let k = 1; k <= 3000; k++) { const v = k * 1e-4, e = Math.abs(spread(F0, Kx, Mx, v) - target); if (e < err) { err = e; best = v; } } return best; };
const smile = [0, 1, 2, 3, 4].map(x => { const t = empSpread(x, 1); const s = implied(t, F0 + x, 1); return { x, sd_h: Math.round(s * F0 * 100) / 100 }; });
const empMarge = empSpread(0, M), implMarge = implied(empMarge, K, M);

const res = {
  F0, K, M: Math.round(M * 100) / 100, M_min: Math.round(M * 60), margin: mg, real_end_min: Math.round(MC.real_dev[MC.real_dev.length - 1] * 60),
  sd: { blocs: sdEnd('blocs'), normal: sdEnd('normal'), implied: Math.round(implMarge * F0 * 100) / 100 },
  value_j2: { bs_blocs: curve[0].blocs.value, bs_normal: curve[0].normal.value, sim_blocs: Math.round(empMarge * 60) },
  curve, greeks, smile, pct_real: MC.blocs.seg.real_pct,
};
fs.writeFileSync(path.join(root, 'risque_marge.js'), `// généré par outils/marge_option.js — ne pas modifier à la main\nwindow.RISK_MARGE = ${JSON.stringify(res)};\n`);
console.log(`marge M = ${M.toFixed(2)} h (${res.M_min} min) · F0 = ${F0} h · réel +${res.real_end_min} min`);
console.log('valeur au J2 (min) :', JSON.stringify(res.value_j2), '· écarts-types (h) :', JSON.stringify(res.sd));
curve.forEach(c => console.log(`J${c.day} écart ${c.dev} min · blocs ${c.blocs.value} min (entamée ${c.blocs.p_use} %, épuisée ${c.blocs.p_out} %, reste ±${c.blocs.rem_min}) · normale ${c.normal.value} min (${c.normal.p_use} %, ${c.normal.p_out} %)`));
console.log('grecs J2', JSON.stringify(greeks), '· smile', JSON.stringify(smile));

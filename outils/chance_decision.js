// Chance ou décision (partie 09) : séparer la volatilité (la pluie, subie) de la seule vraie option (le jour de marge).
// Entrées : risque_data.js (pluie 2026 au point centre, grille des décisions, sorties), risque_plan.js (jours d'étape du
//           plan), donnees/era5_climatology_1996_2025_daily.json (les mêmes 1 200 étés que les parties 05 et 07 :
//           30 étés × 40 dates de départ, du 1er juin au 10 juillet ; jour de pluie ≥ 1 mm).
// Sortie  : risque_cd.js — à relancer après outils/plan_reel.js :
//   node outils/chance_decision.js
//
// On ne modélise pas mes réactions à une pluie arrivée plus tôt (sécher le matériel au village, changer d'itinéraire…) :
// on mesure seulement ce que le climat proposait, sans hypothèse sur ce que j'aurais fait.
// 1. La volatilité : le jour de la première pluie, et la quantité, sur les 1 200 étés.
// 2. L'option : le jour de marge couvre un jour de pluie tombant sur une étape du plan (jour avec le sac). On compte,
//    été par été, les jours d'étape mouillés : 0 (la marge ne sert pas), 1 (elle suffit), 2 ou plus (elle ne suffit pas).
// 3. Thêta : chaque soir, la chance que la marge serve encore (au moins un jour d'étape mouillé d'ici la fin), parmi les
//    étés dont la journée a eu la même météo que 2026.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_data.js', 'risque_plan.js'].forEach(f => require(path.join(root, 'data', f)));
const R = window.RISK, PL = window.RISK_PLAN, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const TH = 1, rain = R.cf.clim.real_rain_d, real = rain.map(v => v >= TH);
if (real.filter(Boolean).length !== 3 || !real.slice(6).every(Boolean)) throw new Error('épisode réel inattendu');
const E = JSON.parse(fs.readFileSync(path.join(root, 'donnees', 'era5_climatology_1996_2025_daily.json'), 'utf8')).daily;
const Pm = E.precipitation_sum.map(v => v || 0), tIdx = new Map(E.time.map((t, i) => [t, i]));
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const W = []; [...new Set(E.time.map(t => +t.slice(0, 4)))].forEach(y => { for (let k = 0; k < 40; k++) { const i = tIdx.get(iso(y, 6, 1 + k)); W.push(Pm.slice(i, i + 9).map(v => v >= TH)); } });
const pct = (a, f) => r1(a.filter(f).length / a.length * 100);
// ---- 1. la volatilité : quand arrive la première pluie, combien de jours
const first = w => { const i = w.indexOf(true); return i < 0 ? 0 : i + 1; }, nWet = w => w.filter(Boolean).length;
const vol = { worlds: W.length, first: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(d => ({ day: d, p: pct(W, w => first(w) === d) })), real_first: first(real),
  p_dry_1_6: pct(W, w => !w.slice(0, 6).some(Boolean)), p_none: pct(W, w => !w.some(Boolean)), p_day1: pct(W, w => w[0]), real_wet: nWet(real), p_ge_wet: pct(W, w => nWet(w) >= nWet(real)) };
// ---- 2. l'option : jours d'étape du plan mouillés
const SD = PL.plan.moves.map(m => m.day), nS = w => SD.filter(d => w[d - 1]).length;
if (SD.join() !== '1,2,3,4,5,7,8') throw new Error('jours d’étape du plan inattendus');
const opt = { stage_days: SD, dist: [0, 1, 2, 3, 4].map(k => ({ k, p: pct(W, w => (k === 4 ? nS(w) >= 4 : nS(w) === k)) })),
  p_use: pct(W, w => nS(w) >= 1), p_enough: pct(W, w => nS(w) <= 1), p_short: pct(W, w => nS(w) >= 2), real_plan: nS(real) };
// ---- 3. thêta : la chance que la marge serve encore, soir après soir
const theta = [0, 1, 2, 3, 4, 5, 6].map(t => { const pool = t ? W.filter(w => w[t - 1] === real[t - 1]) : W, rem = SD.filter(d => d > t);
  return { day: t, n: pool.length, p_use: pct(pool, w => rem.some(d => w[d - 1])), p_short: pct(pool, w => rem.filter(d => w[d - 1]).length >= 2) }; });
// ---- 5. le risque déplacé : les sorties sans le sac sous la pluie (J7–J9), et l'avance des J2–J3 nuit par nuit
const tw = R.rows.filter(r => r.day >= 7 && !r.sac), trail_wet = { n: tw.length, km: r1(tw.reduce((a, r) => a + r.km, 0)), hard_km: r1(tw.filter(r => r.grade >= 3).reduce((a, r) => a + r.km, 0)), names: tw.filter(r => r.grade >= 3).map(r => r.name) };
const ahead = PL.plan.camps.map((c, i) => ({ night: c.night, plan: c.name, real: PL.real.camps[i].name, km: r1(PL.real.camps[i].plan_km - c.km) }));
const fr = R.rows.filter(r => r.day >= 7 && !r.sac);
const free_real = { n: fr.length, km: r1(fr.reduce((a, r) => a + r.km, 0)), dplus: Math.round(fr.reduce((a, r) => a + r.dplus, 0)), h: r2(fr.reduce((a, r) => a + r.mov_h, 0)) };
// ---- 2. décisions
const items = R.cf.dec.items.filter(d => !/grotte/i.test(d.txt)).map(d => ({ ...d }));
if (items.length !== R.cf.dec.items.length - 1) throw new Error('décision à retirer introuvable');
const n = items.length;
const X = items.map(d => d.q), Y = items.map(d => d.out), mx = mean(X), my = mean(Y);
const sxy = X.reduce((s, x, i) => s + (x - mx) * (Y[i] - my), 0), sxx = X.reduce((s, x) => s + (x - mx) ** 2, 0), syy = Y.reduce((s, y) => s + (y - my) ** 2, 0);
const slope = sxy / sxx, icpt = my - slope * mx, r2v = sxy * sxy / (sxx * syy);
const rank = a => a.map(v => { const lo = a.filter(x => x < v).length, eq = a.filter(x => x === v).length; return lo + (eq + 1) / 2; });
const rx = rank(X), ry = rank(Y), mrx = mean(rx), mry = mean(ry);
const rho = rx.reduce((s, x, i) => s + (x - mrx) * (ry[i] - mry), 0) / Math.sqrt(rx.reduce((s, x) => s + (x - mrx) ** 2, 0) * ry.reduce((s, y) => s + (y - mry) ** 2, 0));
items.forEach(d => { d.luck = r2(d.out - (icpt + slope * d.q)); d.quad = d.q >= 0 ? (d.out >= 0 ? 'merite' : 'malchance') : (d.out >= 0 ? 'chance' : 'consequence'); });
const quad = {}; ['merite', 'chance', 'consequence', 'malchance'].forEach(k => quad[k] = items.filter(d => d.quad === k).length);

const out = { th: TH, rain: rain.map(r1), real_wet: real.map(Number), vol, opt, theta, trail_wet, ahead, free_real, dec: { items, n, quad } };
fs.writeFileSync(path.join(root, 'data', 'risque_cd.js'), `// généré par outils/chance_decision.js — ne pas modifier à la main\nwindow.RISK_CD = ${JSON.stringify(out)};\n`);
console.log('volatilité', JSON.stringify(vol)); console.log('option', JSON.stringify(opt)); console.log('thêta', JSON.stringify(theta));
console.log('trail sous la pluie', JSON.stringify(trail_wet)); console.log('avance', ahead.map(a => `${a.night.slice(5)} ${a.km}`).join(' · '));
console.log(`décisions ${n} (ρ ${r2(rho)}, R² ${r2(r2v)} : non affichés, notes données après coup)`, JSON.stringify(quad));
items.forEach(d => console.log(d.day, d.quad, d.luck, d.txt));

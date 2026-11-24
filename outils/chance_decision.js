// Chance ou décision (partie 09) : juger chaque façon de piloter sur les 1 200 étés réels, pas seulement sur 2026.
// Entrées : risque_data.js (pluie 2026 au point centre, grille des décisions, sorties), risque_plan.js (étapes du plan,
//           km portés à la mesure de la montre), donnees/era5_climatology_1996_2025_daily.json (les mêmes 1 200 étés
//           que les parties 05 et 07 : 30 étés × 40 dates de départ, du 1er juin au 10 juillet ; jour de pluie ≥ 1 mm).
// Sortie  : risque_cd.js — à relancer après outils/plan_reel.js :
//   node outils/chance_decision.js
//
// 1. Le calendrier, jour par jour (J1 à J9, bateau le J9) : les 7 étapes du plan avec le sac (changement de campement),
//    à leur jour prévu ; le J6 (Munkebu) et le J9 (jour de marge) sont sans étape. La descente au port (J9), commune
//    à toutes les façons de piloter, est laissée de côté. Trois façons de piloter, chacune avec une option de plus :
//      N  marcher quoi qu'il arrive : chaque étape à son jour, pluie ou pas ;
//      A  + l'option d'attendre : un jour de pluie, on attend si l'on peut encore finir à temps, sinon on marche ;
//      B  + l'option de renoncer : si la pluie tombe le jour où la boucle du tour du lac doit commencer, on y renonce
//         et l'on file au camp fixe de Sørvågen (Munkebu → Sørvågen, la vraie étape du J7) ; c'est ce que j'ai fait.
//    Mesure du risque : les km portés sous la pluie (étapes avec le sac un jour de pluie).
// 2. La décision se juge sur la moyenne des 1 200 étés (avant de partir) ; la chance, sur la place de 2026.
// 3. Thêta : chaque soir, la valeur de chaque option (km évités en moyenne d'ici la fin), parmi les étés dont le jour
//    a la même météo que 2026 ; elle fond à chaque jour sec, comme la marge de la partie 07.
// 4. L'épisode réel (3 jours de pluie) déplacé à chaque date d'arrivée (idée de Baptiste).
// 5. Ce que le modèle ne compte pas : les sommets en trail sous la pluie (le risque déplacé), l'heure de la pluie.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_data.js', 'risque_plan.js'].forEach(f => require(path.join(root, f)));
const R = window.RISK, PL = window.RISK_PLAN, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const TH = 1, rain = R.cf.clim.real_rain_d, real = rain.map(v => v >= TH);
if (real.filter(Boolean).length !== 3 || !real.slice(6).every(Boolean)) throw new Error('épisode réel inattendu');
const E = JSON.parse(fs.readFileSync(path.join(root, 'donnees', 'era5_climatology_1996_2025_daily.json'), 'utf8')).daily;
const Pm = E.precipitation_sum.map(v => v || 0), tIdx = new Map(E.time.map((t, i) => [t, i]));
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const W = []; [...new Set(E.time.map(t => +t.slice(0, 4)))].forEach(y => { for (let k = 0; k < 40; k++) { const i = tIdx.get(iso(y, 6, 1 + k)); W.push(Pm.slice(i, i + 9).map(v => v >= TH)); } });
const MV = PL.plan.moves, SHORT = R.rows.find(r => r.id === 'munkebu_sorvagen').km;
if (MV.length !== 7 || MV.filter(m => m.loop).length !== 2) throw new Error('étapes du plan inattendues');

// ---- 1. un été joué jour par jour, selon la façon de piloter (from : soir de départ ; les étapes prévues jusque-là sont faites)
// cellules : E étape au sec · W étape sous la pluie avec le sac · A attente sous la pluie · L jour libre au sec · F jour libre sous la pluie
function play(wet, S, from = 0) {
  let list = MV.map(m => ({ ...m })), done = MV.filter(m => m.day <= from).length, dropped = false;
  const o = { wetKm: 0, wetMoves: 0, waited: 0, freeDry: 0, freeWet: 0, loop: true, cells: '' };
  for (let d = from + 1; d <= 9; d++) {
    const w = wet[d - 1], left = list.length - done, due = done < list.filter(m => m.day <= d).length;
    if (S === 'B' && !dropped && w && left > 0 && due && list[done].loop) {
      dropped = true; o.loop = false; list = [...list.slice(0, done), { day: d, name: 'Munkebu → Sørvågen', km: SHORT, loop: false }];
      o.wetKm += SHORT; o.wetMoves++; done++; o.cells += 'W'; continue; }
    if (left > 0 && due) {
      if (!w) { done++; o.cells += 'E'; continue; }
      if (S !== 'N' && left <= 9 - d) { o.waited++; o.cells += 'A'; continue; }
      o.wetKm += list[done].km; o.wetMoves++; done++; o.cells += 'W'; continue; }
    if (w) { o.freeWet++; o.cells += 'F'; } else { o.freeDry++; o.cells += 'L'; }
  }
  return o;
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length, pct = (a, f) => r1(a.filter(f).length / a.length * 100);
const STRAT = ['N', 'A', 'B'];
const strat = Object.fromEntries(STRAT.map(S => { const r = W.map(w => play(w, S)), y = play(real, S);
  return [S, { km: r1(mean(r.map(x => x.wetKm))), zero: pct(r, x => x.wetKm === 0), waited: r2(mean(r.map(x => x.waited))), free_dry: r2(mean(r.map(x => x.freeDry))), loop: pct(r, x => x.loop),
    p90: r1([...r.map(x => x.wetKm)].sort((a, b) => a - b)[Math.floor(.9 * r.length)]), y2026: { km: r1(y.wetKm), moves: y.wetMoves, waited: y.waited, free_dry: y.freeDry, free_wet: y.freeWet, loop: y.loop, cells: y.cells } }]; }));
// ---- 2. la chance : où tombe 2026
const nWet = w => w.filter(Boolean).length, rB = W.map(w => play(w, 'B').wetKm), b26 = play(real, 'B').wetKm;
const luck = { worlds: W.length, real_wet: nWet(real), p_ge_wet: pct(W, w => nWet(w) >= nWet(real)), p_dry_j1_5: pct(W, w => !w.slice(0, 5).some(Boolean)),
  b_worse: pct(rB, v => v > b26 + 1e-9), b_equal: pct(rB, v => Math.abs(v - b26) < 1e-9), b_better: pct(rB, v => v < b26 - 1e-9) };
luck.b_rank = r1(luck.b_better + luck.b_equal / 2);   // centile de 2026 : part des étés qui font mieux, plus la moitié des ex æquo
// ---- 3. thêta : la valeur des options, soir après soir, sachant la météo du jour
const theta = [0, 1, 2, 3, 4, 5, 6].map(t => { const pool = t ? W.filter(w => w[t - 1] === real[t - 1]) : W;
  return { day: t, n: pool.length, attendre: r2(mean(pool.map(w => play(w, 'N', t).wetKm - play(w, 'A', t).wetKm))), renoncer: r2(mean(pool.map(w => play(w, 'A', t).wetKm - play(w, 'B', t).wetKm))) }; });
// ---- 4. l'épisode réel déplacé
const slide = [1, 2, 3, 4, 5, 6, 7].map(start => { const w = Array.from({ length: 9 }, (_, i) => i + 1 >= start && i + 1 < start + 3);
  const a = play(w, 'A'), b = play(w, 'B'); return { start, real: start === 7, A: { cells: a.cells, km: r1(a.wetKm), waited: a.waited }, B: { cells: b.cells, km: r1(b.wetKm), waited: b.waited } }; });
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

const out = { th: TH, rain: rain.map(r1), real_wet: real.map(Number), moves: MV, short_km: SHORT, strat, luck, theta, slide, trail_wet, ahead, free_real, dec: { items, n, quad } };
fs.writeFileSync(path.join(root, 'risque_cd.js'), `// généré par outils/chance_decision.js — ne pas modifier à la main\nwindow.RISK_CD = ${JSON.stringify(out)};\n`);
STRAT.forEach(S => console.log(S, JSON.stringify(strat[S])));
console.log('chance', JSON.stringify(luck)); console.log('thêta', JSON.stringify(theta));
slide.forEach(x => console.log(`pluie dès J${x.start}`, 'A', x.A.cells, x.A.km, '| B', x.B.cells, x.B.km));
console.log('trail sous la pluie', JSON.stringify(trail_wet)); console.log('avance', ahead.map(a => `${a.night.slice(5)} ${a.km}`).join(' · '));
console.log(`décisions ${n} (ρ ${r2(rho)}, R² ${r2(r2v)} : non affichés, notes données après coup)`, JSON.stringify(quad));
items.forEach(d => console.log(d.day, d.quad, d.luck, d.txt));

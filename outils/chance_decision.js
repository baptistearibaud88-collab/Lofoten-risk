// Chance ou décision (partie 13).
// Entrées : risque_data.js (pluie ERA5 des 9 jours, 1 200 mondes météo, grille des décisions).
// Sortie  : risque_cd.js — à relancer si risque_data.js change :
//   node outils/chance_decision.js
//
// 1. « Et si la pluie était arrivée plus tôt ? » L'épisode réel (3 jours de pluie, J7–J9) est déplacé
//    à chaque date d'arrivée possible (J1 … J7). On rejoue la traversée avec la règle de la partie :
//    un jour de pluie, on attend si l'on peut encore arriver à temps, sinon on marche sous la pluie.
//    Deux réserves : la marge du plan (8 étapes, 1 jour libre) et le réel (6 étapes, 3 jours libres).
//    Modèle simplifié : les étapes d'abord, les jours libres ensuite.
// 2. Grille des décisions : la décision « s'arrêter dans la grotte » (J9) est retirée (sans enjeu).
//    Droite résultat = a + b × qualité recalculée ; part de chance = résultat − attendu.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'risque_data.js'));
const R = window.RISK, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

// ---- 1. l'épisode de pluie déplacé
const TH = 1, rain = R.cf.clim.real_rain_d, wetReal = rain.map(v => v >= TH);
const ep = rain.filter(v => v >= TH);                               // les jours de pluie de l'épisode réel
if (ep.length !== 3 || !wetReal.slice(6).every(Boolean)) throw new Error('épisode réel inattendu');
// E étape au sec · A attente sous la pluie · W étape sous la pluie avec le sac · L jour libre au sec · F jour libre sous la pluie (camp fixe)
function play(wet, n) {
  const cells = []; let left = n;
  for (let d = 0; d < 9; d++) {
    const after = 8 - d;
    if (!left) cells.push(wet[d] ? 'F' : 'L');
    else if (!wet[d]) { cells.push('E'); left--; }
    else if (after >= left) cells.push('A');
    else { cells.push('W'); left--; }
  }
  const c = k => cells.filter(x => x === k).length;
  return { cells: cells.join(''), waited: c('A'), wet: c('W'), free: c('L') + c('F'), free_dry: c('L') };
}
const SC = [{ key: 'plan', n: 8, slack: 1 }, { key: 'reel', n: 6, slack: 3 }];
const slide = SC.map(s => ({ ...s, rows: d3range(1, 7).map(start => ({ start, real: start === 7, ...play(d3range(1, 9).map(d => d >= start && d < start + ep.length), s.n) })) }));
function d3range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }
// contrôle : la règle redonne les résultats 2026 du calcul principal (1 200 mondes)
R.cf.margin.scen.forEach(m => {
  const p = play(wetReal, m.n_moves);
  if (p.waited !== m.r2026.waited || p.wet !== m.r2026.wet_moves) throw new Error(`règle différente du calcul principal (${m.key})`);
});
// ce que valent les jours libres réels : les sorties sans le sac des J7–J9
const fr = R.rows.filter(r => r.day >= 7 && !r.sac);
const free_real = { n: fr.length, km: r1(fr.reduce((a, r) => a + r.km, 0)), dplus: Math.round(fr.reduce((a, r) => a + r.dplus, 0)), h: r2(fr.reduce((a, r) => a + r.mov_h, 0)) };

// ---- 2. décisions
const items = R.cf.dec.items.filter(d => !/grotte/i.test(d.txt)).map(d => ({ ...d }));
if (items.length !== R.cf.dec.items.length - 1) throw new Error('décision à retirer introuvable');
const n = items.length, mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const X = items.map(d => d.q), Y = items.map(d => d.out), mx = mean(X), my = mean(Y);
const sxy = X.reduce((s, x, i) => s + (x - mx) * (Y[i] - my), 0), sxx = X.reduce((s, x) => s + (x - mx) ** 2, 0), syy = Y.reduce((s, y) => s + (y - my) ** 2, 0);
const slope = sxy / sxx, icpt = my - slope * mx, r2v = sxy * sxy / (sxx * syy);
const rank = a => a.map(v => { const lo = a.filter(x => x < v).length, eq = a.filter(x => x === v).length; return lo + (eq + 1) / 2; });
const rx = rank(X), ry = rank(Y), mrx = mean(rx), mry = mean(ry);
const rho = rx.reduce((s, x, i) => s + (x - mrx) * (ry[i] - mry), 0) / Math.sqrt(rx.reduce((s, x) => s + (x - mrx) ** 2, 0) * ry.reduce((s, y) => s + (y - mry) ** 2, 0));
items.forEach(d => { d.luck = r2(d.out - (icpt + slope * d.q)); d.quad = d.q >= 0 ? (d.out >= 0 ? 'merite' : 'malchance') : (d.out >= 0 ? 'chance' : 'consequence'); });
const quad = {}; ['merite', 'chance', 'consequence', 'malchance'].forEach(k => quad[k] = items.filter(d => d.quad === k).length);

const out = { th: TH, rain: rain.map(r1), episode: ep.map(r1), slide, free_real, dec: { items, n, rho: r2(rho), slope: r2(slope), icpt: r2(icpt), r2: r2(r2v), quad } };
fs.writeFileSync(path.join(root, 'risque_cd.js'), `// généré par outils/chance_decision.js — ne pas modifier à la main\nwindow.RISK_CD = ${JSON.stringify(out)};\n`);
slide.forEach(s => s.rows.forEach(r => console.log(s.key, `pluie dès J${r.start}`, r.cells, `attente ${r.waited} · mouillées ${r.wet} · libres ${r.free}`)));
console.log('jours libres réels', JSON.stringify(free_real));
console.log(`décisions ${n} · rho ${r2(rho)} · R² ${r2(r2v)} · droite ${r2(icpt)} + ${r2(slope)} q`, JSON.stringify(quad));
items.forEach(d => console.log(d.day, d.quad, d.luck, d.txt));

// Indice de danger (partie 10) : recalculé sans les artefacts GPS, puis réduit aux quatre facteurs
// connus avant de partir, à poids égaux (voir plus bas).
// Entrée : risque_data.js (sorties, tronçons de 250 m, contributions terrain / météo / fatigue).
// Sortie : risque_indice.js — à relancer après chaque régénération de risque_data.js :
//   node outils/indice_danger.js
//
// analyse_risque.py calcule l'irrégularité (écart-type de e, ramené vers l'écart-type de
// l'ensemble avec un poids de 8 tronçons) et la pente des passages raides (90e centile de
// |pente|, ramené de la même façon) sur tous les tronçons, y compris l'artefact GPS de
// Kvalvika (pente de −79 % sur 250 m, même règle que outils/distribution.js : |pente| > 60 %).
// Ici, ces deux facteurs sont recalculés sans les artefacts ; terrain, météo et fatigue
// sont repris tels quels. Même pondération, même centrage-réduction (écart-type de population).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'risque_data.js'));
const R = window.RISK, S = R.series, rows = R.rows, W = R.idx.weights;
const GPS_SLOPE = 60, K = 8;

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sdS = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const sdP = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
const q = (a, p) => { const b = [...a].sort((x, y) => x - y), h = (b.length - 1) * p, lo = Math.floor(h); return b[lo] + (b[Math.min(lo + 1, b.length - 1)] - b[lo]) * (h - lo); };
const z = a => { const m = mean(a), s = sdP(a); return a.map(v => (v - m) / s); };
const r3 = v => Math.round(v * 1000) / 1000;

function build(keepSeg) {
  const segs = S.filter(keepSeg);
  const poolSd = sdS(segs.map(s => s.e)), poolP = q(segs.map(s => Math.abs(s.slope)), .9);
  const per = rows.map(r => {
    const ss = segs.filter(s => s.act === r.id), n = ss.length;
    const sd = (n * sdS(ss.map(s => s.e)) + K * poolSd) / (n + K);
    const pm = (n * q(ss.map(s => Math.abs(s.slope)), .9) + K * poolP) / (n + K);
    return { id: r.id, n, sd, pm };
  });
  const zi = z(per.map(p => p.sd)), zp = z(per.map(p => p.pm));
  const out = rows.map((r, i) => {
    const c = { ...r.contrib, irreg: W.irreg * zi[i], pente: W.pente * zp[i] };
    return { id: r.id, n_seg: per[i].n, e_sd: r3(per[i].sd), pente_max: Math.round(per[i].pm * 10) / 10, contrib: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, r3(v)])), score: r3(Object.values(c).reduce((s, v) => s + v, 0)) };
  });
  [...out].sort((a, b) => b.score - a.score).forEach((o, k) => { o.rank = k + 1; });
  // Mann-Whitney exact, unilatéral : les sorties avec alerte ont-elles un score plus haut ?
  const al = rows.map(r => r.alert.length > 0), xs = out.filter((o, i) => al[i]).map(o => o.score), ys = out.filter((o, i) => !al[i]).map(o => o.score);
  const U = xs.reduce((s, x) => s + ys.reduce((t, y) => t + (x > y) + .5 * (x === y), 0), 0);
  const all = out.map(o => o.score), m = xs.length; let ge = 0, tot = 0;
  const comb = (start, pick) => { if (pick.length === m) { tot++; const sx = pick.map(i => all[i]), sy = all.filter((_, i) => !pick.includes(i)); const u = sx.reduce((s, x) => s + sy.reduce((t, y) => t + (x > y) + .5 * (x === y), 0), 0); if (u >= U - 1e-9) ge++; return; } for (let i = start; i < all.length; i++) comb(i + 1, [...pick, i]); };
  comb(0, []);
  return { rows: out, idx: { weights: W, n: rows.length, alert_ranks: out.filter((o, i) => al[i]).map(o => o.rank).sort((a, b) => a - b), mw_u: U, mw_p: ge / tot } };
}

// contrôle : avec tous les tronçons, on doit retrouver risque_data.js
const chk = build(() => true), dmax = Math.max(...chk.rows.map((o, i) => Math.abs(o.score - rows[i].score)));
console.log(`contrôle sur tous les tronçons : écart max de score ${dmax.toFixed(3)}, rangs des alertes ${chk.idx.alert_ranks} (publié : ${R.idx.alert_ranks}), p = ${chk.idx.mw_p.toFixed(4)} (publié : ${R.idx.mw_p.toFixed(4)})`);
if (dmax > .01) throw new Error('la reconstruction ne retrouve pas analyse_risque.py');

const res = build(s => Math.abs(s.slope) <= GPS_SLOPE);
res.artefacts = S.map((s, i) => i).filter(i => Math.abs(S[i].slope) > GPS_SLOPE).map(i => ({ i, act: S[i].act, slope: S[i].slope }));
// ---- indice publié (12/11) : seulement ce que l'on sait avant de partir, à poids égaux
// L'irrégularité de l'allure est retirée : elle se mesure pendant la sortie et un incident la fait
// monter (se perdre, être bloqué), c'est une conséquence et non un signal. Restent quatre facteurs :
// cote du terrain, pente des passages raides, météo du jour, fatigue de la nuit précédente.
// Poids égaux (25 % chacun) : aucun poids n'est choisi. Contrôle de robustesse : 20 000 jeux de poids
// tirés au hasard (uniformes sur le simplexe, graine fixe) ; où tombent les alertes de terrain ?
const EA = ['terrain', 'pente', 'meteo', 'fatigue'], full = res.rows, Wold = W;
const Z = full.map(o => Object.fromEntries(EA.map(k => [k, o.contrib[k] / Wold[k]])));
const rankOf = sc => { const rk = []; sc.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).forEach(([, i], k) => { rk[i] = k + 1; }); return rk; };
const scoreW = w => full.map((o, i) => EA.reduce((t, k) => t + w[k] * Z[i][k], 0));
const terrainAlert = rows.map(r => r.alert.length > 0 && r.alert.some(a => !/camper/i.test(a)));
const third = rows.length / 3, physRanks = rk => rk.filter((_, i) => terrainAlert[i]).sort((a, b) => a - b);
const eq = Object.fromEntries(EA.map(k => [k, 1 / EA.length])), scEq = scoreW(eq), rkEq = rankOf(scEq);
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const NR = 20000; let all = 0, most = 0, sumRank = 0;
for (let n = 0; n < NR; n++) {
  const e = EA.map(() => -Math.log(rnd())), t = e.reduce((a, b) => a + b), w = Object.fromEntries(EA.map((k, j) => [k, e[j] / t]));
  const pr = physRanks(rankOf(scoreW(w))), c = pr.filter(x => x <= third).length;
  if (c === pr.length) all++; if (c >= pr.length - 1) most++; sumRank += mean(pr);
}
const loo = Object.fromEntries(EA.map(k => { const w = Object.fromEntries(EA.map(j => [j, j === k ? 0 : 1 / (EA.length - 1)])); return [k, physRanks(rankOf(scoreW(w)))]; }));
const old5 = { weights: Wold, terrain_ranks: physRanks(full.map(o => o.rank)), mw_p: res.idx.mw_p };
res.rows = full.map((o, i) => ({ id: o.id, n_seg: o.n_seg, e_sd: o.e_sd, pente_max: o.pente_max, contrib: Object.fromEntries(EA.map(k => [k, r3(eq[k] * Z[i][k])])), score: r3(scEq[i]), rank: rkEq[i] }));
res.idx = { weights: eq, factors: EA, n: rows.length, alert_ranks: rkEq.filter((_, i) => rows[i].alert.length > 0).sort((a, b) => a - b), terrain_ranks: physRanks(rkEq),
  rand: { n: NR, all: r3(all / NR), most: r3(most / NR), mean_rank: Math.round(sumRank / NR * 10) / 10, chance_rank: (rows.length + 1) / 2 }, loo, old5 };
console.log(`indice à 4 facteurs, poids égaux : alertes de terrain aux rangs ${res.idx.terrain_ranks} (5 facteurs pondérés : ${old5.terrain_ranks})`);
console.log(`poids au hasard (${NR}) : toutes dans le tiers ${(all / NR * 100).toFixed(0)} %, toutes sauf une au plus ${(most / NR * 100).toFixed(0)} %, rang moyen ${res.idx.rand.mean_rank} (hasard ${res.idx.rand.chance_rank})`, JSON.stringify(loo));
fs.writeFileSync(path.join(root, 'risque_indice.js'), `// généré par outils/indice_danger.js — ne pas modifier à la main\nwindow.RISK_INDICE = ${JSON.stringify(res)};\n`);
console.log(`5 facteurs sans artefact : alertes de terrain aux rangs ${old5.terrain_ranks}, p = ${old5.mw_p.toFixed(4)}`);
[...res.rows].sort((a, b) => a.rank - b.rank).forEach(o => { const old = rows.find(r => r.id === o.id); console.log(String(o.rank).padStart(2), `(${String(old.rank).padStart(2)})`, o.id.padEnd(22), o.score.toFixed(2), JSON.stringify(o.contrib), old.alert.join(' / ')); });

// Indice de danger (partie 10), recalculé sans les artefacts GPS.
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
fs.writeFileSync(path.join(root, 'risque_indice.js'), `// généré par outils/indice_danger.js — ne pas modifier à la main\nwindow.RISK_INDICE = ${JSON.stringify(res)};\n`);
console.log(`sans artefact : rangs des alertes ${res.idx.alert_ranks}, p = ${res.idx.mw_p.toFixed(4)}`);
[...res.rows].sort((a, b) => a.rank - b.rank).forEach(o => { const old = rows.find(r => r.id === o.id); console.log(String(o.rank).padStart(2), `(${String(old.rank).padStart(2)})`, o.id.padEnd(22), o.score.toFixed(2), 'irreg', o.contrib.irreg, 'pente', o.contrib.pente, 'p90', o.pente_max, `(${old.pente_max})`); });

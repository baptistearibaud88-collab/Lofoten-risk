// Épisodes d'allure (partie 05) et topographie en massifs indépendants (partie 06).
// Entrées : risque_data.js, data.js (temps réel point par point), risque_sections.js.
// Sortie  : risque_episodes.js — à relancer après segmentation_terrain.js :
//   node outils/episodes_allure.js
//
// e = ln(temps réel / temps prévu par le modèle) sur chaque tronçon de 250 m.
// Temps prévu = temps réel × exp(−e) ; minutes perdues = réel − prévu.
// Épisode : au moins 3 tronçons (750 m) d'affilée, dans la même sortie, où la
// moyenne de e sur 3 tronçons dépasse ±0,20 (environ 22 % plus lent ou 18 % plus rapide).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
['risque_data.js', 'data.js', 'risque_sections.js'].forEach(f => require(path.join(root, f)));
const R = window.RISK, S = R.series, A = window.TREK.acts, SEC = window.RISK_SECTIONS;
const N = S.length, e = S.map(s => s.e), acts = [...new Set(S.map(s => s.act))];
const EP_THR = 0.20, EP_MIN = 3, MAXLAG = 20, GPS_SLOPE = 50;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

// real moving time of each 250 m piece (seconds)
const t = S.map(() => 0);
acts.forEach(id => {
  const a = A.find(x => x.id === id), idx = S.map((_, i) => i).filter(i => S[i].act === id);
  const L = a.pts.reduce((s, p) => s + p[3], 0); let c = 0;
  a.pts.forEach(p => { c += p[3]; t[idx[Math.min(idx.length - 1, Math.floor(c / L * idx.length))]] += p[4]; });
});
const lost = e.map((v, i) => t[i] * (1 - Math.exp(-v)) / 60);   // minutes

// episodes
const same = (i, j) => S[i].act === S[j].act;
const sm = e.map((_, i) => { const w = [i - 1, i, i + 1].filter(j => j >= 0 && j < N && same(i, j)); return w.reduce((s, j) => s + e[j], 0) / w.length; });
const eps = []; let cur = null;
S.forEach((s, i) => {
  const sign = sm[i] > EP_THR ? 1 : sm[i] < -EP_THR ? -1 : 0;
  if (cur && sign && cur.sign === sign && same(i - 1, i)) cur.i1 = i;
  else { if (cur && cur.sign) eps.push(cur); cur = { sign, i0: i, i1: i }; }
});
if (cur && cur.sign) eps.push(cur);
const episodes = eps.filter(x => x.i1 - x.i0 + 1 >= EP_MIN).map(x => {
  const ii = d3range(x.i0, x.i1), tr = ii.reduce((s, i) => s + t[i], 0) / 60, mn = ii.reduce((s, i) => s + lost[i], 0);
  const alt = ii.map(i => S[i].alt), k0 = x.i0 ? S[x.i0 - 1].km : 0;
  return {
    id: `${S[x.i0].act}@${r1(k0)}`, act: S[x.i0].act, day: S[x.i0].day, sac: S[x.i0].sac, sign: x.sign, i0: x.i0, i1: x.i1,
    km0: r2(k0), km1: r2(S[x.i1].km), len: r2(S[x.i1].km - k0), real_min: r1(tr), lost_min: r1(mn), pct: Math.round((tr / (tr - mn) - 1) * 100),
    grade: Math.max(...ii.map(i => SEC.seg_grade[i])), slope: r1(ii.reduce((s, i) => s + S[i].slope, 0) / ii.length),
    climb: Math.round(Math.max(0, alt[alt.length - 1] - (x.i0 && same(x.i0 - 1, x.i0) ? S[x.i0 - 1].alt : alt[0]))),
    alt_min: Math.min(...alt), alt_max: Math.max(...alt),
    gps: ii.some(i => Math.abs(S[i].slope) > GPS_SLOPE),
    alert: R.alerts.filter(a => a.seg >= x.i0 && a.seg <= x.i1).map(a => a.titre),
  };
});
function d3range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }

// Lofoten topography: massifs between two returns to sea level
// massif = run of consecutive pieces at or above SEA m (nights included) that tops out at >= TOP m
const SEA = 60, TOP = 150;
const corr = p => { const n = p.length, ma = p.reduce((s, x) => s + x[0], 0) / n, mb = p.reduce((s, x) => s + x[1], 0) / n; let c = 0, a = 0, b = 0; p.forEach(([x, y]) => { c += (x - ma) * (y - mb); a += (x - ma) ** 2; b += (y - mb) ** 2; }); return c / Math.sqrt(a * b); };
const rcrit = n => 1.96 / Math.sqrt(n - 2 + 1.96 * 1.96);   // two-sided 5 % threshold for r
const km = i => S[i].km - (i ? S[i - 1].km : 0), mean = ii => ii.reduce((s, i) => s + e[i], 0) / ii.length;
const units = []; let u = null;
S.forEach((s, i) => { const hi = s.alt >= SEA; if (u && u.hi === hi) u.i1 = i; else { u = { hi, i0: i, i1: i }; units.push(u); } });
const massifs = units.filter(x => x.hi && Math.max(...d3range(x.i0, x.i1).map(i => S[i].alt)) >= TOP).map(x => {
  const ii = d3range(x.i0, x.i1), top = ii.reduce((b, i) => S[i].alt > S[b].alt ? i : b, ii[0]);
  const up = ii.filter(i => i <= top), down = ii.filter(i => i > top);
  const gu = ii.filter(i => S[i].slope > 2), gd = ii.filter(i => S[i].slope < -2);
  return { i0: x.i0, i1: x.i1, act: S[x.i0].act, day: S[x.i0].day, top: S[top].alt,
    grad_up: r1(gu.reduce((s, i) => s + S[i].slope, 0) / gu.length), grad_down: r1(-gd.reduce((s, i) => s + S[i].slope, 0) / gd.length), len: r2(ii.reduce((s, i) => s + km(i), 0)), e: r3(mean(ii)), e_up: r3(mean(up)), e_down: down.length ? r3(mean(down)) : null };
});
const pairsNext = f => { const p = []; for (let k = 0; k + 1 < massifs.length; k++) p.push([f(massifs[k]), f(massifs[k + 1])]); return p; };
const test = p => ({ r: r3(corr(p)), n: p.length, crit: r3(rcrit(p.length)), pairs: p });
// steepness: climb vs descent of the same massif, and climb of a massif vs climb of the next one
const gSame = massifs.map(m => [m.grad_up, m.grad_down]), gNext = pairsNext(m => m.grad_up);
// pace (e): climb vs descent of the same massif, and massif vs next massif
const pSame = massifs.filter(m => m.e_down != null).map(m => [m.e_up, m.e_down]), pNext = pairsNext(m => m.e);
// slope mix: share of distance and of climb by slope class
const SB = [0, 5, 10, 15, 20, 25, 30, 1000], dist = SB.slice(0, -1).map(() => 0), gain = SB.slice(0, -1).map(() => 0);
S.forEach((s, i) => {
  const a = Math.abs(s.slope), b = SB.findIndex((v, k) => a >= v && a < SB[k + 1]);
  dist[b] += km(i);
  if (i && S[i - 1].act === s.act && s.alt > S[i - 1].alt) gain[b] += s.alt - S[i - 1].alt;
});
const dT = dist.reduce((a, b) => a + b, 0), gT = gain.reduce((a, b) => a + b, 0);
// intensity by slope class: climbing rate (m/h on climbing pieces), heart rate, pace, share of time
const intens = SB.slice(0, -1).map((v, k) => {
  const ii = S.map((_, i) => i).filter(i => { const a = Math.abs(S[i].slope); return a >= v && a < SB[k + 1]; });
  const up = ii.filter(i => S[i].slope > 0 && i && S[i - 1].act === S[i].act), hrI = ii.filter(i => S[i].hr);
  const tUp = up.reduce((s, i) => s + t[i], 0), tAll = ii.reduce((s, i) => s + t[i], 0);
  return { vr: Math.round(up.reduce((s, i) => s + S[i].alt - S[i - 1].alt, 0) / (tUp / 3600)), hr: Math.round(hrI.reduce((s, i) => s + S[i].hr * t[i], 0) / hrI.reduce((s, i) => s + t[i], 0)), time: tAll };
});
const tAllS = intens.reduce((s, c) => s + c.time, 0); intens.forEach(c => { c.time = r3(c.time / tAllS); });
// risk aggregation: sd of total lost time under three dependence structures
// (realised loss of each piece / massif used as the size of its exposure)
const inM = new Set(); const Lm = massifs.map(m => { let x = 0; for (let i = m.i0; i <= m.i1; i++) { x += lost[i]; inM.add(i); } return x; });
const sq = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0));
const dayL = {}; massifs.forEach((m, k) => { dayL[m.day] = (dayL[m.day] || 0) + Lm[k]; });
const agg = { seg: r1(sq([...inM].map(i => lost[i]))), massif: r1(sq(Lm)), day: r1(sq(Object.values(dayL))), block: r1(Lm.reduce((s, v) => s + Math.abs(v), 0)) };
// engagement and exit of each massif (minutes): from the first piece at 15 % or more to the top, and from the top back to the sea
massifs.forEach((m, k) => {
  const ii = d3range(m.i0, m.i1), top = ii.reduce((b, i) => S[i].alt > S[b].alt ? i : b, ii[0]), fs = ii.find(i => S[i].slope >= 15) ?? m.i0;
  m.t_tot = r1(ii.reduce((s, i) => s + t[i], 0) / 60); m.t_engage = r1(ii.filter(i => i >= fs && i <= top).reduce((s, i) => s + t[i], 0) / 60);
  m.t_exit = r1(ii.filter(i => i > top).reduce((s, i) => s + t[i], 0) / 60); m.lost = r1(Lm[k]);
});
const topo = {
  sea: SEA, top: TOP, massifs,
  slope: SB.slice(0, -1).map((v, k) => ({ lo: v, hi: SB[k + 1] < 1000 ? SB[k + 1] : null, dist: r3(dist[k] / dT), gain: r3(gain[k] / gT) })),
  intens, agg,
  grad_same: test(gSame), grad_next: test(gNext), pace_same: test(pSame), pace_next: test(pNext),
};

const out = {
  seg_t: t.map(Math.round), seg_lost: lost.map(r2), thr: EP_THR, episodes,
  topo,
};
fs.writeFileSync(path.join(root, 'risque_episodes.js'), `// généré par outils/episodes_allure.js — ne pas modifier à la main\nwindow.RISK_EPISODES = ${JSON.stringify(out)};\n`);
console.log(`${episodes.length} épisodes · ${massifs.length} massifs · raideur même massif r=${r2(topo.grad_same.r)} · suivant r=${r2(topo.grad_next.r)} · allure même massif r=${r2(topo.pace_same.r)} · suivant r=${r2(topo.pace_next.r)} (seuil ${r2(topo.pace_next.crit)})`);
console.log(topo.slope.map(b => `${b.lo}%: dist ${Math.round(b.dist * 100)} D+ ${Math.round(b.gain * 100)}`).join(' | '));
episodes.sort((a, b) => b.lost_min - a.lost_min).forEach(x => console.log(x.id.padEnd(28), x.sign > 0 ? 'lent ' : 'rapide', `${x.len} km`, `${x.lost_min} min`, `${x.pct} %`, x.gps ? 'GPS?' : '', x.alert.join(',')));

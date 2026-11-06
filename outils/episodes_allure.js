// Épisodes d'allure (partie 05) et persistance des écarts (partie 06).
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

// persistence: raw vs within terrain section
const secId = S.map(() => 0); SEC.sections.forEach((x, k) => { for (let i = x.i0; i <= x.i1; i++) secId[i] = k; });
const secMean = SEC.sections.map(x => { let s = 0; for (let i = x.i0; i <= x.i1; i++) s += e[i]; return s / (x.i1 - x.i0 + 1); });
const ed = e.map((v, i) => v - secMean[secId[i]]);
const corr = p => { const n = p.length, ma = p.reduce((s, x) => s + x[0], 0) / n, mb = p.reduce((s, x) => s + x[1], 0) / n; let c = 0, a = 0, b = 0; p.forEach(([x, y]) => { c += (x - ma) * (y - mb); a += (x - ma) ** 2; b += (y - mb) ** 2; }); return c / Math.sqrt(a * b); };
const acf = (v, ok) => d3range(1, MAXLAG).map(L => { const p = []; for (let i = 0; i + L < N; i++) if (ok(i, i + L)) p.push([v[i], v[i + L]]); return { lag: L, r: r3(corr(p)), n: p.length, conf: r3(1.96 / Math.sqrt(p.length)) }; });
const acf_day = acf(e, (i, j) => S[i].day === S[j].day);
const acf_sec = acf(ed, (i, j) => secId[i] === secId[j]);
const memory = (acf_sec.find(a => Math.abs(a.r) <= a.conf) || { lag: MAXLAG }).lag - 1;   // lags still significant
const varBetween = 1 - ed.reduce((s, v) => s + v * v, 0) / e.reduce((s, v) => s + v * v, 0);

// carry-over: the km right after a slow episode, same day
const after = episodes.filter(x => x.sign > 0).map(x => {
  const w = [1, 2, 3, 4].map(k => x.i1 + k).filter(i => i < N && S[i].day === x.day);
  return w.length ? { id: x.id, e: r3(w.reduce((s, i) => s + e[i], 0) / w.length), ep: r3(d3range(x.i0, x.i1).reduce((s, i) => s + e[i], 0) / (x.i1 - x.i0 + 1)) } : null;
}).filter(Boolean);
const am = after.reduce((s, a) => s + a.e, 0) / after.length, asd = Math.sqrt(after.reduce((s, a) => s + (a.e - am) ** 2, 0) / (after.length - 1));
const secPairs = []; for (let k = 0; k + 1 < SEC.sections.length; k++) if (S[SEC.sections[k].i1].day === S[SEC.sections[k + 1].i0].day) secPairs.push([secMean[k], secMean[k + 1]]);

const out = {
  seg_t: t.map(Math.round), seg_lost: lost.map(r2), thr: EP_THR, episodes,
  persist: {
    acf_day, acf_sec, memory_lags: memory, var_between: r3(varBetween),
    after: { list: after, mean: r3(am), se: r3(asd / Math.sqrt(after.length)), n: after.length },
    sections: { r: r3(corr(secPairs)), n: secPairs.length, conf: r3(1.96 / Math.sqrt(secPairs.length)), pairs: secPairs.map(p => p.map(r3)) },
  },
};
fs.writeFileSync(path.join(root, 'risque_episodes.js'), `// généré par outils/episodes_allure.js — ne pas modifier à la main\nwindow.RISK_EPISODES = ${JSON.stringify(out)};\n`);
console.log(`${episodes.length} épisodes · mémoire ${memory} tronçons · part entre sections ${r2(varBetween)} · après épisode ${r2(am)} ± ${r2(asd / Math.sqrt(after.length))} · sections r=${r2(corr(secPairs))} n=${secPairs.length}`);
episodes.sort((a, b) => b.lost_min - a.lost_min).forEach(x => console.log(x.id.padEnd(28), x.sign > 0 ? 'lent ' : 'rapide', `${x.len} km`, `${x.lost_min} min`, `${x.pct} %`, x.gps ? 'GPS?' : '', x.alert.join(',')));

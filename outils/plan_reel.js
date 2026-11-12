// Plan contre réel (partie 12).
// Entrées : donnees/plan.gpx (itinéraire prévu, tracé sur Strava), data.js (trace réelle), risque_data.js.
// Sortie  : risque_plan.js — à relancer si l'une des entrées change :
//   node outils/plan_reel.js
//
// Le plan, c'est 8 jours d'itinéraire et 1 jour de marge (J9 : Støvla ou kayak, puis le port).
// La marge n'est pas tracée dans le GPX : elle a servi au Støvla, compté avec sa distance réelle.
// Le plan est découpé en journées à partir des campements prévus (positions en km sur le tracé).
// Les sommets prévus sont des allers-retours sur le tracé ; leur base sert de point de campement.
// La traversée en bateau Kirkefjord → Vindstad est retirée de la distance à pied.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'data.js')); require(path.join(root, 'risque_data.js'));
const T = window.TREK, R = window.RISK;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const hav = (a, b) => { const la = (b[0] - a[0]) * Math.PI / 180, lo = (b[1] - a[1]) * Math.PI / 180 * Math.cos(a[0] * Math.PI / 180); return 6371000 * Math.hypot(la, lo); };

// ---- plan track
const gpx = fs.readFileSync(path.join(root, 'donnees', 'plan.gpx'), 'utf8');
const P = [...gpx.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">\s*<ele>([^<]+)<\/ele>/g)].map(m => [+m[1], +m[2], +m[3]]);
const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + hav(P[i - 1], P[i]));
const KM = cum.map(c => c / 1000), idx = km => { let b = 0; KM.forEach((k, i) => { if (Math.abs(k - km) < Math.abs(KM[b] - km)) b = i; }); return b; };
const BOAT = [74.3, 78.35];
const inBoat = k => k > BOAT[0] && k <= BOAT[1];
const lenOf = ranges => ranges.reduce((s, [a, b]) => s + d3sum(idx(a) + 1, idx(b), i => inBoat(KM[i]) ? 0 : KM[i] - KM[i - 1]), 0);
const dmOf = ranges => ranges.reduce((s, [a, b]) => s + d3sum(idx(a) + 1, idx(b), i => inBoat(KM[i]) ? 0 : Math.max(0, P[i - 1][2] - P[i][2])), 0);
const dpOf = ranges => ranges.reduce((s, [a, b]) => s + d3sum(idx(a) + 1, idx(b), i => inBoat(KM[i]) ? 0 : Math.max(0, P[i][2] - P[i - 1][2])), 0);
function d3sum(a, b, f) { let s = 0; for (let i = a; i <= b; i++) s += f(i); return s; }

// ---- planned camps (km on the plan track) and days
const CAMPS = [
  { night: '2026-06-13', name: 'Napp', km: 0 },
  { night: '2026-06-14', name: 'Nusfjord', km: 22.36 },
  { night: '2026-06-15', name: 'Fredvang, pied du Volandstinden', km: 39.98 },
  { night: '2026-06-16', name: 'Lac au pied du Kitinden', km: 61.81 },
  { night: '2026-06-17', name: 'Bunes beach', km: 85.98 },
  { night: '2026-06-18', name: 'Munkebu', km: 98.7 },
  { night: '2026-06-19', name: 'Munkebu', km: 98.7 },
  { night: '2026-06-20', name: 'Tour du lac, à l’ouest d’Å', km: 114.5, est: true },
  { night: '2026-06-21', name: 'Hauteurs de Sørvågen', km: 124.0 },
];
const DAYS = [
  { day: 1, ranges: [[0, 22.36]], summits: ['Tønnåsheia'] },
  { day: 2, ranges: [[22.36, 39.98]], summits: ['Volandstinden'] },
  { day: 3, ranges: [[39.98, 61.81]], summits: ['Ryten', 'Kitinden'] },
  { day: 4, ranges: [[61.81, 85.98]], summits: ['Helvetestinden'], boat: true },
  { day: 5, ranges: [[85.98, 90.78], [95.77, 100.25]], summits: ['Munken'] },
  { day: 6, ranges: [[90.78, 95.77]], access: [95.77, 98.7], summits: ['Hermannsdalstinden'], note: 'aller-retour depuis Munkebu' },
  { day: 7, ranges: [[100.25, 114.5]], summits: ['Andstabben'], est: true },
  { day: 8, ranges: [[114.5, 124.0]], summits: [], est: true },
  { day: 9, ranges: [[124.0, KM[KM.length - 1]]], summits: ['Støvla'], margin: true, note: 'jour de marge : Støvla depuis Sørvågen, puis le port' },
];
const stuvla = R.rows.find(r => r.id === 'stuvla'), MARGIN = { km: stuvla.km, dplus: stuvla.dplus };
DAYS.forEach(d => {
  d.km = lenOf(d.ranges); d.dplus = dpOf(d.ranges);
  if (d.access) { const a = [d.access]; d.km += 2 * lenOf(a); d.dplus += dpOf(a) + dmOf(a); }   // Munkebu → spur and back
  d.route_km = r1(d.km); d.route_dplus = Math.round(d.dplus);
  if (d.margin) { d.km += MARGIN.km; d.dplus += MARGIN.dplus; }
  d.km = r1(d.km); d.dplus = Math.round(d.dplus);
});
const plan8 = r1(DAYS.reduce((s, d) => s + d.route_km, 0)), planWalk = r1(plan8 + MARGIN.km);
const planDp = DAYS.reduce((s, d) => s + d.dplus, 0);
const j6access = r1(DAYS[5].route_km - lenOf(DAYS[5].ranges));   // Munkebu → foot of the spur, both ways

// ---- real data
const real = {}; R.rows.forEach(r => { const d = real[r.day] = real[r.day] || { km: 0, dplus: 0 }; d.km += r.km; d.dplus += r.dplus; });
const rsum = {}; T.summits.forEach(s => { const d = +s.heure.slice(8, 10) - 13; (rsum[d] = rsum[d] || []).push(s.sommet); });
const camps = T.camps.map(c => ({ night: c.night, name: c.camp, lat: c.lat, lon: c.lon, alt: c.alt }));

// grids for nearest searches
const grid = pts => { const G = new Map(); pts.forEach((p, i) => { const k = Math.floor(p[0] / .001) + ',' + Math.floor(p[1] / .0025); if (!G.has(k)) G.set(k, []); G.get(k).push(i); }); return G; };
const nearIn = (G, pts, p) => { const a = Math.floor(p[0] / .001), b = Math.floor(p[1] / .0025); let best = [1e9, -1]; for (let x = a - 1; x <= a + 1; x++) for (let y = b - 1; y <= b + 1; y++) (G.get(x + ',' + y) || []).forEach(i => { const d = hav(p, pts[i]); if (d < best[0]) best = [d, i]; }); return best; };
const GP = grid(P);
// progress: plan km reached by each real camp (latest plan point close to the camp)
// the route passes some places twice (summit spurs, Sørvågen): keep the first passage after the previous
// camp, and inside it the latest point (end of the spur)
let prevKm = 0;
camps.forEach(c => {
  let dmin = 1e9; P.forEach((p, i) => { if (KM[i] >= prevKm) dmin = Math.min(dmin, hav([c.lat, c.lon], p)); });
  const cand = P.map((p, i) => i).filter(i => KM[i] >= prevKm && hav([c.lat, c.lon], P[i]) <= Math.max(dmin + 60, dmin * 1.3));
  const first = cand.filter(i => KM[i] <= KM[cand[0]] + 6);
  const best = first[first.length - 1];
  c.plan_km = r1(KM[best]); c.off_route = Math.round(dmin); prevKm = KM[best];
});
CAMPS.forEach(c => { const p = P[idx(c.km)]; c.lat = p[0]; c.lon = p[1]; c.alt = Math.round(p[2]); });

// ---- real trace against the plan: shared, off-plan runs, and plan not walked
const TH = 60, off = []; let tot = 0, on = 0, cur = null;
const MARGIN_ACT = 'stuvla';
T.acts.filter(a => a.id !== MARGIN_ACT).forEach(a => a.pts.forEach(q => {
  const p = [q[1], q[0]], [d] = nearIn(GP, P, p), m = q[3] * 1000; tot += m;
  if (d < TH) { on += m; if (cur) { off.push(cur); cur = null; } }
  else { if (!cur || cur.act !== a.id) { if (cur) off.push(cur); cur = { act: a.id, day: a.day, m: 0, up: 0, z: q[2], t0: q[7] }; } cur.up += Math.max(0, q[2] - cur.z); cur.z = q[2]; cur.m += m; cur.t1 = q[7]; }
}));
if (cur) off.push(cur);
const RP = []; T.acts.forEach(a => a.pts.forEach(q => RP.push([q[1], q[0]])));
const GR = grid(RP);
const notDone = []; let u = null;
P.forEach((p, i) => { if (!i || inBoat(KM[i])) return; const c = nearIn(GR, RP, p)[0] < TH, st = KM[i] - KM[i - 1];
  if (!c) { if (!u) u = { k0: KM[i], km: 0, top: p[2] }; u.km += st; u.k1 = KM[i]; u.top = Math.max(u.top, p[2]); } else if (u) { notDone.push(u); u = null; } });
if (u) notDone.push(u);
const ABANDON = [['Tønnåsheia', 16.6, 22.4], ['Kitinden', 56.8, 61.9], ['Helvetestinden', 79, 86], ['Hermannsdalstinden', 90.7, 95.8], ['Tour du lac', 111.9, 120.3]];
const abandoned = ABANDON.map(([n, a, b]) => ({ name: n, km: r1(notDone.filter(x => x.k0 >= a && x.k1 <= b).reduce((s, x) => s + x.km, 0)), top: Math.round(Math.max(0, ...notDone.filter(x => x.k0 >= a && x.k1 <= b).map(x => x.top))) }));
abandoned.find(a => a.name === 'Hermannsdalstinden').km = r1(abandoned.find(a => a.name === 'Hermannsdalstinden').km + j6access);   // the J6 approach from Munkebu and back, never walked
const abKm = abandoned.reduce((s, a) => s + a.km, 0), ndKm = notDone.reduce((s, x) => s + x.km, 0) + j6access;

// off-plan real km by cause
const CAUSE = {
  added: ['moltinden', 'munkebu_reine', 'reinebringen_helvete', 'last_trail'],
  bivouac: ['vindstad_bunes', 'bunes_munkebu', 'horseid_beach', 'fredvang'],
  variant: ['sorvagen_a', 'retour_bateau', 'andstabben', 'munkebu_sorvagen', 'horseid_kirkefjord', 'napp_nusfjord_2', 'retour_campement'],
};
const BIG = 400;   // shorter excursions are GPS noise or parallel paths
const offBy = k => off.filter(o => o.m >= BIG && CAUSE[k].includes(o.act)).reduce((s, o) => s + o.m, 0) / 1000;
const added = offBy('added'), biv = offBy('bivouac'), variant = offBy('variant'), offTot = (tot - on) / 1000, noise = offTot - added - biv - variant;
const shared = on / 1000, doneKm = plan8 - ndKm, gps = shared - doneKm;
const realTot = tot / 1000 + MARGIN.km;
// le pont est exprimé à la mesure de la montre : le tracé lissé de Strava est converti (× rapport mesuré
// sur le parcours commun), ce qui donne le « plan à mesure égale » du graphique par mode
const kR = shared / doneKm, planEq = plan8 * kR + MARGIN.km;
const bridge = [
  { k: 'plan', g: 'plan', l: 'Tracé Strava · 8 jours', v: plan8 },
  { k: 'margin', g: 'cal', l: 'Jour de marge : Støvla', v: r1(MARGIN.km) },
  { k: 'conv', g: 'mes', l: 'Conversion à la mesure de la montre', v: r1(plan8 * (kR - 1)) },
  { k: 'plan_eq', g: 'plan', l: 'Plan · à mesure égale', v: r1(planEq), total: true },
  { k: 'ab', g: 'dec', l: 'Sommets et boucle abandonnés', v: -r1(abKm * kR) },
  { k: 'nd', g: 'dec', l: 'Autres raccourcis du plan', v: -r1((ndKm - abKm) * kR) },
  { k: 'add', g: 'dec', l: 'Sorties substituées', v: r1(added) },
  { k: 'var', g: 'dec', l: 'Variantes d’itinéraire', v: r1(variant) },
  { k: 'biv', g: 'ter', l: 'Recherche de bivouac', v: r1(biv) },
  { k: 'noise', g: 'mes', l: 'Écarts courts (< 400 m)', v: r1(noise) },
  { k: 'real', g: 'plan', l: 'Réel · 9 jours', v: r1(realTot), total: true },
];
bridge[0].total = true;
{ const calc = planEq - abKm * kR - (ndKm - abKm) * kR + added + variant + biv + noise; if (Math.abs(calc - realTot) > .3) throw new Error(`le pont ne boucle pas : ${calc} contre ${realTot}`); }
// bivouac search episodes (≥ 400 m off-plan, in the bivouac list)
const bivEp = off.filter(o => o.m >= BIG && CAUSE.bivouac.includes(o.act)).map(o => ({ act: o.act, day: o.day, km: r2(o.m / 1000), up: Math.round(o.up), t0: o.t0, t1: o.t1 }));

// ---- sac ou trail : le plan et le réel, à mesure égale
// Dans le plan, les sommets sont des allers-retours sans le sac (sac laissé à la base) : ce sont les
// portions du tracé parcourues deux fois, repérées sur le GPX, sauf le Ryten (confirmé par Baptiste : entre le camp du Volandstinden et celui du Kitinden, il se monte avec le sac). Le J6 (Hermannsdalstinden depuis
// Munkebu) et le jour de marge (Støvla) sont entièrement en trail. Tout le reste se fait avec le sac,
// tour du lac compris. Le tracé lissé de Strava étant plus court que la mesure de la montre
// (rapport mesuré sur le parcours commun), les distances du plan sont converties à la mesure de la montre.
const SPURS = [['Tønnåsheia', 16.7, 22.4], ['Volandstinden', 35.1, 40.0], ['Kitinden', 56.8, 61.8], ['Helvetestinden', 80.8, 84.2], ['Munken', 99.1, 100.2], ['Andstabben', 108.4, 111.8], ['Sommet du tour du lac', 114.4, 117.0]];
const ratio = shared / doneKm, j6 = DAYS[5];
const spurKm = SPURS.reduce((a, [, k0, k1]) => a + lenOf([[k0, k1]]), 0), spurDp = SPURS.reduce((a, [, k0, k1]) => a + dpOf([[k0, k1]]), 0);
const pTrail = { gpx: spurKm + j6.route_km, dplus: spurDp + j6.route_dplus + MARGIN.dplus }; pTrail.km = pTrail.gpx * ratio + MARGIN.km;
const pSac = { gpx: plan8 - pTrail.gpx, dplus: planDp - pTrail.dplus }; pSac.km = pSac.gpx * ratio;
const rMode = k => { const a = R.rows.filter(r => !!r.sac === (k === 'sac')); return { km: a.reduce((x, r) => x + r.km, 0), dplus: a.reduce((x, r) => x + r.dplus, 0), h: a.reduce((x, r) => x + r.mov_h, 0) }; };
const rSac = rMode('sac'), rTrail = rMode('trail'), eff = o => o.km + o.dplus / 100;
const speed = { sac: eff(rSac) / rSac.h, trail: eff(rTrail) / rTrail.h };            // km-effort par heure, mesurés
pSac.h = eff(pSac) / speed.sac; pTrail.h = eff(pTrail) / speed.trail;
const hRaw = (pSac.gpx + pSac.dplus / 100) / speed.sac + (pTrail.gpx + MARGIN.km + pTrail.dplus / 100) / speed.trail;   // sans conversion de mesure
// coût de portage : part du temps avec le sac due au sac lui-même (effet de la régression, partie 07)
require(path.join(root, 'risque_sens.js'));
const sacPct = window.RISK_SENS.sens.find(x => x.name === 'sac sur le dos').pct / 100, carry = h => h * (1 - 1 / (1 + sacPct));
const rnd = o => ({ km: r1(o.km), dplus: Math.round(o.dplus), h: r2(o.h), ...(o.gpx != null ? { gpx: r1(o.gpx) } : {}) });
const campSame = CAMPS.slice(1).filter((c, i) => hav([c.lat, c.lon], [camps[i + 1].lat, camps[i + 1].lon]) < 300).length;
const modes = { ratio: r2(ratio), speed: { sac: r2(speed.sac), trail: r2(speed.trail) }, plan: { sac: rnd(pSac), trail: rnd(pTrail) }, real: { sac: rnd(rSac), trail: rnd(rTrail) }, plan_h_raw: r2(hRaw), sac_pct: r1(sacPct * 100), carry: { plan: r2(carry(pSac.h)), real: r2(carry(rSac.h)) },
  spurs: SPURS.map(([n, k0, k1]) => ({ name: n, km: r1(lenOf([[k0, k1]])) })), camps_same: campSame, camps_n: CAMPS.length - 1, track_done: r1(doneKm), biv: { n: bivEp.length, km: r1(bivEp.reduce((a, o) => a + o.km, 0)), up: Math.round(bivEp.reduce((a, o) => a + o.up, 0)) } };

// downsampled tracks for the map (every ~150 m)
const thin = (pts, step) => { const o = [pts[0]]; let acc = 0; for (let i = 1; i < pts.length; i++) { acc += hav(pts[i - 1], pts[i]); if (acc >= step) { o.push(pts[i]); acc = 0; } } o.push(pts[pts.length - 1]); return o; };
const planLine = []; let seg = [];
P.forEach((p, i) => { if (inBoat(KM[i])) { if (seg.length) planLine.push(seg); seg = []; return; } seg.push(p); });
planLine.push(seg);
const r5 = v => Math.round(v * 1e5) / 1e5;
const out = {
  plan: { km_total: r1(KM[KM.length - 1]), km8: plan8, km_walk: planWalk, dplus: planDp, margin: MARGIN, j6access, boat: BOAT,
    camps: CAMPS.map(c => ({ ...c, lat: r5(c.lat), lon: r5(c.lon) })), days: DAYS,
    line: planLine.map(s => thin(s, 150).map(p => [r5(p[1]), r5(p[0])])) },
  real: { camps: camps.map(c => ({ ...c })), days: Object.entries(real).map(([d, v]) => ({ day: +d, km: r1(v.km), dplus: Math.round(v.dplus), summits: rsum[d] || [] })),
    line: T.acts.map(a => thin(a.pts.map(q => [q[1], q[0]]), 150).map(p => [r5(p[1]), r5(p[0])])) },
  match: { th: TH, shared: r1(shared), done: r1(doneKm), gps_ratio: r2(shared / doneKm), abandoned, bridge, biv: bivEp },  modes,
};
fs.writeFileSync(path.join(root, 'risque_plan.js'), `// généré par outils/plan_reel.js — ne pas modifier à la main\nwindow.RISK_PLAN = ${JSON.stringify(out)};\n`);
console.log(`plan ${out.plan.km_total} km tracés · itinéraire 8 j ${plan8} km · avec marge ${planWalk} km, ${planDp} m D+ · accès J6 ${j6access} km`);
console.log(` · commun ${r1(shared)} km réel pour ${r1(doneKm)} km de plan (×${r2(shared / doneKm)})`);
DAYS.forEach(d => console.log(`J${d.day} plan ${d.km} km ${d.dplus} m · réel ${r1(real[d.day].km)} km ${Math.round(real[d.day].dplus)} m`));
console.log(bridge.map(b => `${b.l} ${b.v}`).join(' | '));
console.log(JSON.stringify(modes));
camps.forEach(c => console.log(c.night, c.name, 'plan km', c.plan_km, 'hors tracé', c.off_route));

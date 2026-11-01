/* Traversée des Lofoten — carte 3D : trace, bivouacs, sommets, étapes et traversée complète animées.
   Les données viennent de data.js (window.TREK), généré par src/export_site.py. */
(function () {
  'use strict';

  const T = window.TREK;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => window.matchMedia('(max-width: 820px)').matches;
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const COL = { pack: '#1d3f8f', camp: '#1d3f8f', trail: '#e0472f', casing: '#f4f7fa', boat: '#8fd3ff', finish: '#111418' };
  const nf = (v, d = 0) => v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

  /* A summit's outing = the trail activities of that day that lead to it.
     Reinebringen and Helvete: the whole day from Munkebu, not only from Reine. */
  const SUMMIT_OUTINGS = { reinebringen_helvete: ['munkebu_reine', 'reinebringen_helvete'] };

  /* Boat crossings that the watch did not record: a smooth curve over the sea between
     the end of one activity and the start of the next, through a few points on the water
     (here: down Kjerkfjorden, then west along the shore to Vindstad). */
  const BOATS = { 'horseid_kirkefjord>vindstad_bunes': { label: 'Bateau Kirkefjord → Vindstad',
    via: [[13.0202, 67.9871], [13.0264, 67.9784], [13.0316, 67.9702], [13.0353, 67.9630], [13.0349, 67.9583], [13.0272, 67.9559], [13.0152, 67.9566]] } };

  /* villages named on the satellite map (the topo map has its own labels) */
  const VILLAGES = [
    { name: 'Napp', lat: 68.1283, lon: 13.4382, beside: true }, { name: 'Nusfjord', lat: 68.0347, lon: 13.3495, beside: true },
    { name: 'Nesland', lat: 68.0032, lon: 13.2852 }, { name: 'Ramberg', lat: 68.0899, lon: 13.2299 },
    { name: 'Fredvang', lat: 68.0841, lon: 13.1667 }, { name: 'Reine', lat: 67.9328, lon: 13.0885 },
    { name: 'Sørvågen', lat: 67.8935, lon: 13.0240, beside: true }, { name: 'Å', lat: 67.8797, lon: 12.9825 },
    { name: 'Moskenes', lat: 67.8996, lon: 13.0445, beside: true },
  ];
  /* arrival of the whole traverse: last point of the last activity */
  const LAST_ACT = T.acts[T.acts.length - 1];
  const FINISH = { lon: LAST_ACT.pts[LAST_ACT.pts.length - 1][0], lat: LAST_ACT.pts[LAST_ACT.pts.length - 1][1] };

  /* camera direction when flying to a camp, where the default angle hides the tent */
  const CAMP_BEARING = { 'Bunes beach': -125 };


  /* Camera per kind of replay. zoom/pitch: how far and how high the drone flies.
     W: half-length (km) of the chord used for the heading, S: extra smoothing (km).
     A long chord ignores switchbacks and a few hundred metres of wrong turn. */
  const VIEW = {
    etape: { zoom: 13.3, pitch: 56, W: 0.6, S: 0.5, secPerKm: 3.2 },
    summit: { zoom: 12.8, pitch: 54, W: 0.45, S: 0.4, secPerKm: 4 },
    trek: { zoom: 11.8, pitch: 50, W: 2.5, S: 2, secPerKm: 0.6 },
  };

  /* ---------- small DOM helpers ---------- */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs) { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); return n; }
  function svText(attrs, text) { const t = sv('text', attrs); t.textContent = text; return t; }
  const day = iso => { const d = new Date(iso + 'T12:00:00'); return { d: d.getDate(), m: MONTHS[d.getMonth()] }; };
  const nightLabel = (night, wake) => { const a = day(night), b = day(wake); return `nuit du ${a.d} au ${b.d} ${b.m}`; };
  const hm = min => min == null ? '—' : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
  const hms = s => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  const pace = minPerKm => { if (!isFinite(minPerKm)) return '—'; let m = Math.floor(minPerKm), s = Math.round((minPerKm - m) * 60); if (s === 60) { m++; s = 0; } return `${m}′${String(s).padStart(2, '0')}″`; };
  const peakIcon = () => { const s = sv('svg', { viewBox: '0 0 20 18', 'aria-hidden': 'true' }); s.append(sv('polygon', { points: '10,1.8 18.4,16.4 1.6,16.4', fill: '#111418', stroke: COL.trail, 'stroke-width': '2.2', 'stroke-linejoin': 'round' })); return s; };

  /* ---------- data ---------- */
  const camps = [];
  for (const n of T.camps) {
    let c = camps.find(x => x.id === n.camp_id);
    if (!c) { c = { id: n.camp_id, name: n.camp, lat: n.lat, lon: n.lon, alt: n.alt, nights: [] }; camps.push(c); }
    c.nights.push(n);
  }
  const ACTS = Object.fromEntries(T.acts.map(a => [a.id, a]));

  /* A sequence = activities glued in order, with cumulative counters. Gaps between
     activities (boat, unrecorded links) are skipped: the line breaks there. */
  /* smooth curve through the points (centripetal Catmull-Rom: no loops, no sharp peaks) */
  function boatPath(A, B, via, perSeg = 14) {
    const k = Math.cos(A[1] * Math.PI / 180) * 111320, m = 110540;
    const P = [A, ...via, B].map(q => [(q[0] - A[0]) * k, (q[1] - A[1]) * m]);
    const ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]], ...P, [2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1]]];
    const out = [];
    const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-6;
    for (let i = 1; i < ext.length - 2; i++) {
      const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
      const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
      for (let j = 0; j < perSeg; j++) {
        const t = t1 + (t2 - t1) * j / perSeg;
        const L = (a, b, ta, tb) => [a[0] * (tb - t) / (tb - ta) + b[0] * (t - ta) / (tb - ta), a[1] * (tb - t) / (tb - ta) + b[1] * (t - ta) / (tb - ta)];
        const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
        const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
        const C = L(B1, B2, t1, t2);
        out.push([A[0] + C[0] / k, A[1] + C[1] / m]);
      }
    }
    out.push([B[0], B[1]]);
    out[0] = [A[0], A[1]];
    return out;
  }
  const arcKm = arc => arc.reduce((d, q, i) => i ? d + Math.hypot((q[0] - arc[i - 1][0]) * Math.cos(q[1] * Math.PI / 180) * 111.32, (q[1] - arc[i - 1][1]) * 110.54) : 0, 0);

  /* p.km = animation axis (walking + boat), p.wk = walking distance only. sac: 1 pack, 0 trail, 2 boat. */
  function buildSeq(ids) {
    const pts = [];
    let km = 0, wk = 0, mov = 0, kcal = 0, dplus = 0, prevAlt = null, seg = 0;
    ids.forEach((id, j0) => {
      const a = ACTS[id];
      const boat = j0 && BOATS[`${ids[j0 - 1]}>${id}`];
      if (boat) {
        const prev = pts[pts.length - 1], first = a.pts[0];
        const arc = boatPath([prev.lon, prev.lat], [first[0], first[1]], boat.via);
        seg++;
        arc.forEach((q, i) => {
          if (i) km += Math.hypot((q[0] - arc[i - 1][0]) * Math.cos(q[1] * Math.PI / 180) * 111.32, (q[1] - arc[i - 1][1]) * 110.54);
          pts.push({ lon: q[0], lat: q[1], alt: 0, km, wk, mov, hr: null, kcal, dplus, heure: 'bateau', sac: 2, seg, act: boat.label, day: a.day, id: 'boat' });
        });
        seg++;
      } else if (j0) seg++;
      a.pts.forEach((p, j) => {
        km += j ? p[3] : 0; wk += j ? p[3] : 0; mov += j ? p[4] : 0; kcal += j ? p[6] : 0;
        if (j && prevAlt != null && p[2] > prevAlt) dplus += p[2] - prevAlt;
        prevAlt = p[2];
        pts.push({ lon: p[0], lat: p[1], alt: p[2], km, wk, mov, hr: p[5], kcal, dplus, heure: p[7],
          sac: a.sac === 'avec' ? 1 : 0, seg, act: a.name, day: a.day, id: a.id });
      });
      prevAlt = null;
    });
    return pts;
  }
  /* static boat arcs for the overview trace */
  /* alerts: a point on an étape or a summit outing, given by its km (data/raw/alertes.csv) */
  const routePoints = list => (list || []).map(a => {
    let ids, where, open, replay;
    if (a.rubrique === 'bivouac') {   // a point at a camp (reference = camp number)
      const c = camps.find(x => String(x.id) === String(a.reference)), n = c.nights[0];
      return { ...a, lon: c.lon, lat: c.lat, alt: c.alt, heure: a.heure ? String(a.heure).split(';')[0] : null, heures: a.heure || null,   // a camp photo has no trace: its times come from photos.csv
        day: n.next_day - 1, where: `au bivouac ${c.name}`,
        label: `Bivouac ${camps.indexOf(c) + 1} · ${c.name} · ${nightLabel(n.night, n.wake)}`, open: () => openCamp(c), replay: 'Voir le bivouac' };
    }
    if (a.rubrique === 'activite') {   // an outing that is in no rubric (reference = activity id)
      const act = ACTS[a.reference];
      ids = [a.reference]; where = `de ${act.name}`; open = null; replay = null;
    } else if (a.rubrique === 'etape') {
      const e = T.etapes.find(x => String(x.day) === String(a.reference));
      ids = e.acts; where = `de l’étape J${e.day} · ${e.from} → ${e.to}`; open = () => openEtape(e); replay = 'Rejouer l’étape';
    } else {
      const sm = T.summits.find(x => x.sommet === a.reference);
      ids = SUMMIT_OUTINGS[sm.activite] || [sm.activite]; where = `de la sortie ${sm.sommet}`; open = () => openSummit(sm); replay = 'Rejouer la sortie';
    }
    const seq = buildSeq(ids);
    if (a.km == null && a.rubrique === 'sommet') {   // no km given: the summit itself
      const sm = T.summits.find(x => x.sommet === a.reference);
      let best = 0, bd = Infinity;
      seq.forEach((q, j) => { const d = (q.lat - sm.lat) ** 2 + ((q.lon - sm.lon) * 0.37) ** 2; if (d < bd) { bd = d; best = j; } });
      a = { ...a, km: Math.round(seq[best].wk * 10) / 10, atTop: true };
    }
    const i = seq.findIndex(p => p.sac !== 2 && p.wk >= a.km), p = seq[i < 0 ? seq.length - 1 : i];
    return { ...a, lon: p.lon, lat: p.lat, act: p.id, alt: p.alt, heure: p.heure, day: p.day, where, open, replay,
      label: a.atTop ? `J${p.day} · au sommet du ${a.reference}` : `J${p.day} · km ${nf(a.km, a.km % 1 ? 1 : 0)} ${where}` };
  });
  const ALERTS = routePoints(T.alerts), PHOTOS = routePoints(T.photos), INFOS = routePoints(T.infos);
  const COL_PHOTO = '#2bb3ac';
  const kmTxt = a => `km ${nf(a.km, a.km % 1 ? 1 : 0)}`;

  const BOAT_FEATURES = Object.entries(BOATS).map(([key, b]) => {
    const [x, y] = key.split('>'), A = ACTS[x].pts[ACTS[x].pts.length - 1], B = ACTS[y].pts[0];
    const arc = boatPath([A[0], A[1]], [B[0], B[1]], b.via);
    return { type: 'Feature', properties: { id: `boat:${key}`, sac: 'bateau', name: b.label, km: arcKm(arc) }, geometry: { type: 'MultiLineString', coordinates: dashes(arc, 120, 85) } };
  });
  /* cut a line into dashes (metres) so each dash can carry its own dark outline */
  function dashes(line, dash, gap) {
    const out = [];
    let cur = [line[0]], left = dash, on = true;
    for (let i = 1; i < line.length; i++) {
      let a = line[i - 1];
      const b = line[i];
      let seg = Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180) * 111320, (b[1] - a[1]) * 110540);
      while (seg > left) {
        const f = left / seg, q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        if (on) { cur.push(q); out.push(cur); } else cur = [q];
        on = !on; seg -= left; left = on ? dash : gap; a = q;
      }
      left -= seg;
      if (on) cur.push(b);
    }
    if (on && cur.length > 1) out.push(cur);
    return out;
  }
  function idxAt(pts, km) {          // last point at or before km
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].km <= km) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function headAt(pts, km, i = idxAt(pts, km)) {
    const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    if (b === a || b.seg !== a.seg || b.km <= a.km) return { lon: a.lon, lat: a.lat, sac: a.sac };
    const f = Math.min(1, Math.max(0, (km - a.km) / (b.km - a.km)));
    return { lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f, sac: a.sac };
  }
  const metres = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180) * 111320, (a.lat - b.lat) * 110540);

  /* Checkpoints of a sequence: summits reached (middle of an outing) and camps
     (leaving in the morning, arriving in the evening). Each fires once as the replay passes it. */
  function checkpoints(pts) {
    const out = [];
    const ids = new Set(pts.map(p => p.id));
    T.summits.forEach(s => {
      if (!ids.has(s.activite)) return;
      let best = -1, bd = Infinity;
      pts.forEach((p, i) => { if (p.id !== s.activite) return; const d = metres(p, s); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) out.push({ km: pts[best].km, type: 'summit', s });
    });
    // camps: leaving in the morning (first activity of the day, or first one with the pack)
    // and arriving in the evening (last activity with the pack, else the last one if it ends near the camp)
    const span = new Map();
    pts.forEach((p, i) => { if (p.sac === 2) return; const r = span.get(p.id); if (!r) span.set(p.id, { f: i, l: i }); else r.l = i; });
    const campOfNight = nextDay => camps.find(c => c.nights.some(n => n.next_day === nextDay));
    const near = (q, c) => metres({ lon: q[0], lat: q[1] }, c) < 1000;
    const seen = new Set();
    const add = (i, c) => { const key = `${c.id}@${i}`; if (!seen.has(key)) { seen.add(key); out.push({ km: pts[i].km, type: 'camp', c }); } };
    for (let d = 1; d <= T.stats.days; d++) {
      const acts = T.acts.filter(a => a.day === d), avec = acts.filter(a => a.sac === 'avec');
      if (!acts.length) continue;
      const dep = campOfNight(d), arr = campOfNight(d + 1);
      if (dep) [acts[0], avec[0]].forEach(a => {
        const r = a && span.get(a.id);
        if (r && (a.sac === 'avec' || near(a.pts[0], dep))) add(r.f, dep);
      });
      const last = avec.length ? avec[avec.length - 1] : acts[acts.length - 1], r = span.get(last.id);
      if (arr && r && (last.sac === 'avec' || near(last.pts[last.pts.length - 1], arr))) add(r.l, arr);
    }
    ALERTS.forEach(a => {
      let best = -1, bd = Infinity;
      pts.forEach((p, i) => { if (p.id !== a.act) return; const d = metres(p, a); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) out.push({ km: pts[best].km, type: 'alert', a });
    });
    // photos and infos on the route: a small card when passed, if their button is on
    [['photo', PHOTOS], ['info', INFOS]].forEach(([type, list]) => list.forEach(a => {
      if (!a.act) return;
      let best = -1, bd = Infinity;
      pts.forEach((p, i) => { if (p.id !== a.act) return; const d = metres(p, a); if (d < bd) { bd = d; best = i; } });
      if (best >= 0 && bd < 150) out.push({ km: pts[best].km, type, a });
    }));
    const lastIdx = pts.map(p => p.id).lastIndexOf(LAST_ACT.id);
    if (lastIdx >= 0 && lastIdx === pts.length - 1) out.push({ km: pts[lastIdx].km, type: 'finish' });
    return out.sort((a, b) => a.km - b.km);
  }
  function movAt(pts, km) {
    const i = idxAt(pts, km), a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    if (b === a || b.km <= a.km) return a.mov;
    return a.mov + (b.mov - a.mov) * Math.min(1, Math.max(0, (km - a.km) / (b.km - a.km)));
  }
  const bearingTo = (a, b) => {
    const toR = Math.PI / 180, y = Math.sin((b.lon - a.lon) * toR) * Math.cos(b.lat * toR);
    const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lon - a.lon) * toR);
    return Math.atan2(y, x) / toR;
  };
  const angleDiff = (from, to) => ((to - from + 540) % 360) - 180;

  /* Smoothed direction of travel along a sequence, for the drone camera.
     At each point: bearing of the chord from (km − W) to (km + W), then a moving
     average of those unit vectors over ±S km. Out-and-back detours shorter than
     the chord cancel out, so the camera keeps looking along the real route. */
  function headingTrack(pts, W, S) {
    const n = pts.length, kmMax = pts[n - 1].km;
    const vx = new Float64Array(n), vy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = headAt(pts, Math.max(0, pts[i].km - W)), b = headAt(pts, Math.min(kmMax, pts[i].km + W));
      if (a.lon === b.lon && a.lat === b.lat) continue;
      const r = bearingTo(a, b) * Math.PI / 180;
      vx[i] = Math.sin(r); vy[i] = Math.cos(r);
    }
    const cx = new Float64Array(n + 1), cy = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { cx[i + 1] = cx[i] + vx[i]; cy[i + 1] = cy[i] + vy[i]; }
    const out = new Float64Array(n);
    let lo = 0, hi = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      while (pts[lo].km < pts[i].km - S) lo++;
      while (hi + 1 < n && pts[hi + 1].km <= pts[i].km + S) hi++;
      const sx = cx[hi + 1] - cx[lo], sy = cy[hi + 1] - cy[lo];
      out[i] = prev = (sx || sy) ? Math.atan2(sx, sy) * 180 / Math.PI : prev;
    }
    return km => out[idxAt(pts, km)];
  }

  /* ---------- stats ---------- */
  const S = T.stats;
  /* first row: distance, D+, days, summits; second row: moving time, with the pack, trail running */
  const statItems = () => [
    ['Distance', nf(S.strava_distance || S.km), 'km'], ['Dénivelé +', nf(S.dplus_watch || S.dplus), 'm'], ['Jours', S.days], ['Sommets', S.summits],
    ['Temps total', hm(S.pack_min + S.trail_min)], ['Avec le sac', hm(S.pack_min)], ['Trail running', hm(S.trail_min)],
  ];
  document.getElementById('stats').append(...statItems().map(([k, v, u]) => el('div', null, el('dt', null, k), el('dd', null, v, u ? el('small', null, ` ${u}`) : null))));

  /* ---------- shared state ---------- */
  const panel = document.getElementById('panel-inner');
  const panelBox = document.getElementById('panel');
  const titleBox = document.getElementById('title');
  let activeCamp = -1;
  let map = null, popup = null, rubric = 'camps', inDetail = false;
  let anim = null, lastLineDraw = 0, boatMarker = null;
  let fireCheckpoint = () => {};
  let alertsOn = false, photosOn = false, infosOn = false, replayMode = false;   // off when the site opens; their tab turns them on
  /* each layer (alerts, photos, infos) has its own button; a replay opens with photos and infos off */
  /* an info at the same spot as a photo sits on top of the photo pin, without its own pointer,
     but only while photos are shown; otherwise it stands on the ground like any other info */
  let infoBase = 'sat';
  function infoLayout() {
    if (!map || !map.getLayer || !map.getLayer('infos')) return;
    const stacked = photosOn ? ['get', 'stack'] : false;
    map.setLayoutProperty('infos', 'icon-image', ['case', stacked, `info-stack-${infoBase}`, `info-${infoBase}`]);
    map.setLayoutProperty('infos', 'icon-offset', ['case', stacked, ['literal', [0, -27]], ['literal', [0, -2]]]);
  }
  function updateLayers() {
    if (!map || !map.getLayer || !map.getLayer('alerts')) return;
    infoLayout();
    const vis = on => on ? 'visible' : 'none';
    map.setLayoutProperty('alerts', 'visibility', vis(alertsOn));
    map.setLayoutProperty('photos', 'visibility', vis(photosOn));
    map.setLayoutProperty('infos', 'visibility', vis(infosOn));
  }
  const tracks = new WeakMap();
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);   // frame-rate independent smoothing

  /* ---------- folding the two bubbles ---------- */
  function setFold(cls, btn, folded, label) {
    document.body.classList.toggle(cls, folded);
    btn.setAttribute('aria-expanded', String(!folded));
    btn.setAttribute('aria-label', `${folded ? 'Agrandir' : 'Réduire'} ${label}`);
    layoutChanged();
  }
  const btnTitleFold = document.getElementById('btn-title-fold');
  const btnPanelFold = document.getElementById('btn-panel-fold');
  btnTitleFold.addEventListener('click', () => { setFold('title-folded', btnTitleFold, !document.body.classList.contains('title-folded'), 'le titre'); placeDepart(); });
  btnPanelFold.addEventListener('click', () => setFold('panel-folded', btnPanelFold, !document.body.classList.contains('panel-folded'), 'le panneau'));
  const unfoldPanel = () => { if (document.body.classList.contains('panel-folded')) setFold('panel-folded', btnPanelFold, false, 'le panneau'); };

  // "Inventaire" centred under the last figure of the title stats (Trail running)
  function placeDepart() {
    const btn = document.getElementById('btn-depart'), dd = document.querySelector('#stats div:last-child dd');
    if (!btn || !dd || !btn.offsetParent) return;
    const r = document.createRange(); r.selectNodeContents(dd);   // the figure itself, not its whole column
    const row = btn.parentElement.getBoundingClientRect(), d = r.getBoundingClientRect();
    const x = d.left + d.width / 2 - row.left - btn.offsetWidth / 2;
    btn.style.left = `${Math.max(0, Math.min(row.width - btn.offsetWidth, x))}px`;
  }
  // the sources button sits on the legend line, just after the legend
  function placeSources() {
    const b = document.getElementById('btn-sources'), lg = document.querySelector('.legend');
    if (!b || !lg) return;
    const r = lg.getBoundingClientRect();
    if (!r.width) { b.style.left = ''; b.style.bottom = ''; return; }
    b.style.left = `${Math.round(r.right + 10)}px`;
    b.style.bottom = `${Math.round(innerHeight - r.bottom + (r.height - b.offsetHeight) / 2)}px`;
  }
  function layoutChanged() {
    placeDepart(); placeSources();
    const root = document.documentElement.style;
    const pr = panelBox.getBoundingClientRect();
    root.setProperty('--panel-h', `${Math.round(pr.height)}px`);
    const lg = document.querySelector('.legend');
    if (lg) root.setProperty('--legend-h', `${Math.round(lg.getBoundingClientRect().height)}px`);
    root.setProperty('--ctrl-right', isPhone() ? '0px' : `${Math.round(window.innerWidth - pr.left)}px`);
  }
  if (window.ResizeObserver) new ResizeObserver(layoutChanged).observe(panelBox);
  window.addEventListener('resize', layoutChanged);
  // the open replay re-fits its charts when the screen size changes (rotation, Safari bars)
  let curFit = null, fitTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => curFit && curFit(), 200); });

  /* ---------- title bubble: intro, or the activity and its profile ---------- */
  const titleDefault = document.getElementById('title-default');
  const titleAct = document.getElementById('title-activity');
  function setTitleActivity(eyebrow, name, profileNodes) {
    document.getElementById('act-eyebrow').textContent = eyebrow;
    document.getElementById('act-title').textContent = name;
    document.getElementById('act-profile').replaceChildren(...profileNodes);
    titleDefault.hidden = true; titleAct.hidden = false;
    // a replay opens with photos and infos off (less clutter); their buttons bring them back, like the alerts
    photosOn = infosOn = false;
    ['btn-photos', 'btn-infos'].forEach(id => document.getElementById(id).setAttribute('aria-pressed', 'false'));
    replayMode = true; updateLayers();
  }
  function setTitleDefault() {
    titleDefault.hidden = false; titleAct.hidden = true; document.getElementById('act-profile').replaceChildren();
    replayMode = false; updateLayers(); placeDepart();
  }

  /* ---------- panel head: the three rubrics, always visible ---------- */
  const RUBRICS = [['camps', 'Bivouacs'], ['summits', 'Sommets'], ['etapes', 'Étapes'], ['alerts', 'Alertes'], ['photos', 'Photos'], ['infos', 'Infos']];
  const tabBox = document.getElementById('rubric-tabs');
  const tabBtns = RUBRICS.map(([id, label]) => {
    const b = el('button', { type: 'button', role: 'tab', 'data-r': id }, label);
    b.addEventListener('click', () => { unfoldPanel(); showLayerOf(id); showHome(id); overview(); });
    tabBox.append(b);
    return b;
  });
  /* opening the Alertes, Photos or Infos tab shows those points on the map */
  function showLayerOf(r) {
    const k = { alerts: ['btn-alerts', v => { alertsOn = v; }], photos: ['btn-photos', v => { photosOn = v; }], infos: ['btn-infos', v => { infosOn = v; }] }[r];
    if (!k) return;
    k[1](true);
    document.getElementById(k[0]).setAttribute('aria-pressed', 'true');
    updateLayers();
  }
  function setTabs(active, detail) {
    rubric = active || rubric; inDetail = !!detail;
    tabBtns.forEach(b => {
      const on = b.dataset.r === active;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('in-detail', on && !!detail);
      b.title = on && detail ? 'Revenir à la liste' : '';
    });
  }

  /* ---------- panel: home lists ---------- */
  const resetPanel = () => { panel.classList.remove('recap'); setFov(null); curFit = null; document.querySelector('.law-card')?.remove(); };
  function showHome(which) {
    resetPanel();
    stopAnim(true);
    setActive(null);
    highlight(null);
    if (popup) { popup.remove(); popup = null; }
    setTitleDefault();
    if (which) rubric = which;
    setTabs(rubric, false);
    const body = el('div');
    if (rubric === 'camps') {
      body.append(
        el('h2', null, 'Sept bivouacs, neuf nuits'),
        el('p', { class: 'note note-1' }, 'Choisis un bivouac pour lire les statistiques de la nuit.'),
        recapRow('rem', 'Récap des nuits', `${T.camps.length} nuits`, openNightsRecap),
        el('ul', { class: 'camp-list' }, camps.map((c, i) => el('li', null,
          el('button', { type: 'button', class: 'camp-row', onclick: () => openCamp(c) },
            el('span', { class: `camp-num${i === 0 ? ' camp-start' : ''}` }, String(i + 1)),
            el('span', { class: 'camp-name' }, c.name),
            el('span', { class: 'camp-dates' }, c.nights.map(n => day(n.night).d).join(' + ') + ' ' + day(c.nights[0].night).m))))),
        el('h3', { class: 'rec-title' }, 'Records des nuits'),
        nightRecords(),
        el('button', { type: 'button', class: 'law-link', onclick: openLaw }, 'Bivouaquer en Norvège : le droit d’accès ›'));
    } else if (rubric === 'summits') {
      body.append(
        el('h2', null, 'Neuf sommets'),
        el('p', { class: 'note note-1' }, 'Choisis un sommet pour rejouer la sortie du jour.'),
        recapRow('peak', 'Récap des sommets', `${T.summits.length} sommets`, openSummitsRecap),
        el('ul', { class: 'camp-list' }, T.summits.map(s => el('li', null,
          el('button', { type: 'button', class: 'camp-row', onclick: () => openSummit(s) },
            el('span', { class: 'camp-num num-peak' }, peakIcon()),
            el('span', { class: 'camp-name' }, s.sommet),
            el('span', { class: 'camp-dates' }, `${nf(s.alt_gps_m)} m`))))),
        el('h3', { class: 'rec-title' }, 'Records des sommets'),
        summitRecords());
    } else if (rubric === 'photos' || rubric === 'infos') {
      const isPh = rubric === 'photos', list = isPh ? PHOTOS : INFOS;
      body.append(
        el('h2', null, isPh ? 'Photos' : 'Infos'),
        el('p', { class: 'note' }, isPh ? 'Les photos placées là où elles ont été prises. Choisis-en une pour voler jusqu’à l’endroit.' : 'Anecdotes et petites histoires, au bon endroit du parcours.'),
        ...(isPh ? [recapRow('photo', 'Toutes les photos', `${PHOTOS.reduce((n, a) => n + photoFiles(a).length, 0)} photos`, openPhotoWall)] : []),
        el('ul', { class: 'camp-list' }, list.map(a => el('li', null,
          el('button', { type: 'button', class: 'camp-row stage-row', onclick: () => openRoutePoint(rubric, a) },
            el('span', { class: `camp-num num-peak${isPh && a.favori === 'oui' ? ' fav' : ''}` }, isPh ? photoIcon() : infoIcon()),
            el('span', { class: 'stage-main' },
              el('span', { class: 'camp-name' }, a.titre),
              el('span', { class: 'stage-meta' }, a.label)))))));
    } else if (rubric === 'alerts') {
      body.append(
        el('h2', null, 'Alertes'),
        el('p', { class: 'note' }, 'Les moments où ça a coincé sur le parcours. Le récit viendra compléter chaque alerte.'),
        el('ul', { class: 'camp-list' }, ALERTS.map(a => el('li', null,
          el('button', { type: 'button', class: 'camp-row stage-row', onclick: () => openAlert(a) },
            el('span', { class: 'camp-num num-peak' }, warnIcon()),
            el('span', { class: 'stage-main' },
              el('span', { class: 'camp-name' }, a.titre),
              el('span', { class: 'stage-meta' }, `J${a.day} · km ${nf(a.km, a.km % 1 ? 1 : 0)} ${a.where}`)))))));
    } else {
      body.append(
        el('h2', null, 'Sept étapes avec le sac'),
        el('p', { class: 'note' }, 'De bivouac en bivouac, avec le gros sac. Les J6 et J8 se passent sans sac : ils sont dans les sommets.'),
        el('ul', { class: 'camp-list' }, T.etapes.map(e => {
          const seq = buildSeq(e.acts), last = seq[seq.length - 1];
          return el('li', null,
            el('button', { type: 'button', class: 'camp-row stage-row', onclick: () => openEtape(e) },
              el('span', { class: 'camp-num num-day' }, `J${e.day}`),
              el('span', { class: 'stage-main' },
                el('span', { class: 'camp-name' }, `${e.from} → ${e.to}`),
                el('span', { class: 'stage-meta' }, `${nf(last.wk, 1)} km · ${nf(last.dplus)} m D+ · ${hms(last.mov)}${seq.some(p => p.sac === 2) ? ' · bateau' : ''}`))));
        })));
    }
    panel.replaceChildren(body);   // no grey footnote under the lists
    panel.scrollTop = 0;
  }

  function warnIcon() {
    const s = sv('svg', { viewBox: '0 0 22 20', 'aria-hidden': 'true' });
    s.append(sv('path', { d: 'M11 1.8 20.6 18.2H1.4Z', fill: '#f4d35e', stroke: '#111418', 'stroke-width': '1.8', 'stroke-linejoin': 'round' }),
      sv('rect', { x: 10, y: 7, width: 2, height: 6, rx: 1, fill: '#111418' }), sv('circle', { cx: 11, cy: 15.3, r: 1.15, fill: '#111418' }));
    return s;
  }

  function openAlert(a) {
    showLayerOf('alerts');
    resetPanel(); stopAnim(true); setActive(null); highlight(null); setTitleDefault(); setTabs('alerts', true); unfoldPanel();
    if (popup) { popup.remove(); popup = null; }
    if (map) {
      map.flyTo({ center: [a.lon, a.lat], zoom: 13.6, pitch: 60, bearing: -15, duration: reduceMotion ? 0 : 2600, essential: true, padding: centerPad() });
      clearTimeout(openAlert.t); openAlert.t = setTimeout(() => fireCheckpoint({ type: 'alert', a }), reduceMotion ? 0 : 2700);
    }
    panel.replaceChildren(
      backButton('Toutes les alertes', 'alerts'),
      el('p', { class: 'eyebrow-sm warn-ink' }, `Alerte · J${a.day} · km ${nf(a.km, a.km % 1 ? 1 : 0)} ${a.where}`),
      el('h2', null, a.titre),
      el('p', { class: 'meta' }, `${nf(a.alt)} m${a.heure ? ` · vers ${a.heure}` : ''} · ${a.lat.toFixed(4)} N, ${a.lon.toFixed(4)} E`),
      a.recit ? el('p', { class: 'info-text' }, a.recit) : el('p', { class: 'empty' }, 'Récit à venir.'),
      el('div', { class: 'player' }, el('button', { type: 'button', class: 'play', onclick: a.open }, `▶ ${a.replay}`)));
    panel.scrollTop = 0;
  }

  function badgeIcon(draw) { const s = sv('svg', { viewBox: '0 0 22 22', 'aria-hidden': 'true' }); draw(s); return s; }
  // colours come from the stylesheet: dark versions on the satellite map, light ones on the topo map
  const photoIcon = () => badgeIcon(s => s.append(sv('circle', { cx: 11, cy: 11, r: 10, class: 'ph-bg' }),
    sv('rect', { x: 5.2, y: 7.6, width: 11.6, height: 8.2, rx: 1.8, class: 'ph-cam' }), sv('rect', { x: 8.6, y: 6, width: 4.8, height: 2.4, rx: .8, class: 'ph-cam' }),
    sv('circle', { cx: 11, cy: 11.7, r: 2.4, class: 'ph-lens' })));
  const infoIcon = () => badgeIcon(s => s.append(sv('circle', { cx: 11, cy: 11, r: 10, class: 'in-bg' }),
    sv('circle', { cx: 11, cy: 6.6, r: 1.5, class: 'in-i' }), sv('rect', { x: 9.7, y: 9.2, width: 2.6, height: 7.4, rx: 1.2, class: 'in-i' })));

  /* where a photo looks: rings of a wedge (direction ± half the field), more transparent further away */
  /* field of view of the open photo: a flat turquoise wedge drawn over the map (not draped on the
     relief), from the photographer towards what the photo shows, fading with distance */
  let fovPhoto = null, fovSvg = null;
  function setFov(a) {
    fovPhoto = a && a.direction_deg != null ? a : null;
    if (!fovSvg) {
      fovSvg = sv('svg', { class: 'fov-layer', 'aria-hidden': 'true' });
      const defs = sv('defs'), g = sv('linearGradient', { id: 'fov-grad', gradientUnits: 'userSpaceOnUse' });
      g.append(sv('stop', { offset: '0', 'stop-color': COL_PHOTO, 'stop-opacity': '.62' }), sv('stop', { offset: '1', 'stop-color': COL_PHOTO, 'stop-opacity': '.14' }));
      defs.append(g); fovSvg.append(defs, sv('path', { class: 'fov-fill', fill: 'url(#fov-grad)' }), sv('path', { class: 'fov-edge' }));
      document.body.append(fovSvg);
    }
    drawFov();
  }
  function drawFov() {
    if (!fovSvg) return;
    if (!fovPhoto || !map) { fovSvg.style.display = 'none'; return; }
    const a = fovPhoto, k = Math.cos(a.lat * Math.PI / 180) * 111320, m = 110540, half = (a.champ_deg || 60) / 2, R = a.portee_m || 800;
    const at = d => { const t = (a.direction_deg + d) * Math.PI / 180; return map.project([a.lon + R * Math.sin(t) / k, a.lat + R * Math.cos(t) / m]); };
    const o = map.project([a.lon, a.lat]), far = Array.from({ length: 9 }, (_, i) => at(-half + i * half / 4)), mid = at(0);
    const xy = p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    fovSvg.querySelector('.fov-fill').setAttribute('d', `M${xy(o)}L${far.map(xy).join('L')}Z`);
    fovSvg.querySelector('.fov-edge').setAttribute('d', `M${xy(far[0])}L${xy(o)}L${xy(far[far.length - 1])}`);
    const g = fovSvg.querySelector('#fov-grad');
    g.setAttribute('x1', o.x); g.setAttribute('y1', o.y); g.setAttribute('x2', mid.x); g.setAttribute('y2', mid.y);
    fovSvg.style.display = '';
  }

  /* photos of a point: stacked in the panel, a tap opens them full screen */
  const PHOTO_V = '2400';   // bump when the published photos are regenerated, so Safari reloads them
  const photoFiles = a => (a.fichier || '').split(';').map(x => x.trim()).filter(Boolean).map(f => `${f}?v=${PHOTO_V}`);
  // time of each photo: one per file for the camp photos (photos.csv), else the passage on the trace
  const photoTimes = a => { const f = photoFiles(a), t = a.heures ? String(a.heures).split(';') : [];
    return f.map((_, i) => (t[i] || t[0] || a.heure || '').trim() || null); };
  function photoGallery(a) {
    const files = photoFiles(a), times = photoTimes(a);
    if (!files.length) return el('div', { class: 'photo-frame' }, photoIcon(), el('span', null, 'Photo à ajouter'));
    const items = files.map((f, i) => ({ src: f, title: a.titre, sub: [`J${a.day}`, times[i]].filter(Boolean).join(' · ') }));
    return el('div', { class: 'gallery' }, files.map((f, i) =>
      el('button', { type: 'button', class: 'gallery-item', 'aria-label': `Agrandir la photo ${i + 1}`, onclick: () => lightbox(items, i) },
        el('img', { src: f, alt: `${a.titre}, photo ${i + 1}`, loading: 'lazy', decoding: 'async' }),
        times[i] ? el('span', { class: 'ph-time' }, times[i]) : null)));
  }
  /* full-screen viewer. items: file paths, or { src, title, sub, point } to show a caption
     and a way back to the map. Arrows, keyboard and swipe go from one photo to the next. */
  function lightbox(items, i) {
    items = items.map(x => typeof x === 'string' ? { src: x } : x);
    let k = i;
    const img = el('img', { alt: '' });
    const count = el('span', { class: 'lb-count' });
    const capT = el('strong'), capS = el('span');
    const onMap = el('button', { type: 'button', class: 'lb-map' }, 'Voir sur la carte');
    const cap = el('div', { class: 'lb-cap' }, el('div', null, capT, capS), onMap);
    // size the photo ourselves: as big as the screen allows, whatever its shape (Safari otherwise
    // keeps some landscape photos small inside the centred grid)
    const fit = () => {
      if (!img.naturalWidth) return;
      const W = innerWidth - 140, H = innerHeight - 170, sc = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      img.style.width = `${Math.round(img.naturalWidth * sc)}px`; img.style.height = `${Math.round(img.naturalHeight * sc)}px`;
    };
    img.addEventListener('load', fit);
    const show = () => {
      const it = items[k];
      img.style.width = img.style.height = '';
      img.src = it.src; img.alt = it.title || 'Photo';
      if (img.complete) fit();
      count.textContent = `${k + 1} / ${items.length}`;
      capT.textContent = it.title || ''; capS.textContent = it.sub || '';
      cap.hidden = !it.title; onMap.hidden = !it.point;
      [k - 1, k + 1].forEach(j => { const n = items[(j + items.length) % items.length]; if (n) new Image().src = n.src; });
    };
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey, true); removeEventListener('resize', fit); };
    addEventListener('resize', fit);
    const go = d => { k = (k + d + items.length) % items.length; show(); };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    onMap.onclick = e => { e.stopPropagation(); const it = items[k]; close(); document.querySelector('.photo-wall')?.remove(); openRoutePoint('photos', it.point); };
    const many = items.length > 1;
    const box = el('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Photo en grand' },
      img, count, cap,
      el('button', { type: 'button', class: 'lb-close', 'aria-label': 'Fermer', onclick: close }, '×'),
      many ? el('button', { type: 'button', class: 'lb-prev', 'aria-label': 'Photo précédente', onclick: e => { e.stopPropagation(); go(-1); } }, '‹') : null,
      many ? el('button', { type: 'button', class: 'lb-next', 'aria-label': 'Photo suivante', onclick: e => { e.stopPropagation(); go(1); } }, '›') : null);
    box.addEventListener('click', e => { if (e.target === box) close(); });
    let x0 = null;
    box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); x0 = null; });
    document.addEventListener('keydown', onKey, true);
    document.body.append(box);
    show();
  }

  /* start sheet: who left, with what on the back and what to eat; full screen like the mosaic */
  function openDepart() {
    const D = T.depart; if (!D) return;
    const g = v => v == null ? '—' : v >= 1000 ? `${nf(v / 1000, 2)} kg` : `${nf(v)} g`;
    const tile = (label, value, unit, note) => el('div', { class: 'dp-tile' }, el('span', { class: 'dp-l' }, label),
      el('b', null, value, unit ? el('small', null, ` ${unit}`) : null), note ? el('span', { class: 'dp-n' }, note) : null);
    const kcal = D.nourriture.reduce((a, x) => a + (x.kcal || 0), 0), foodKg = D.nourriture.reduce((a, x) => a + (x.poids_g || 0), 0) / 1000;
    const group = (rows, key) => { const m = new Map(); rows.forEach(r => { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }); return [...m]; };
    const gearList = el('div', { class: 'dp-list' }, group(D.equipement, 'categorie').map(([cat, rows]) => {
      const sum = rows.filter(r => r.pris && !r.porte).reduce((a, r) => a + (r.poids_g || 0), 0);
      return el('section', null, el('h4', null, cat, el('span', null, g(sum))),
        el('ul', null, rows.map(r => el('li', { class: r.pris ? null : 'dp-off' },
          el('span', { class: 'dp-o' }, r.objet, r.marque ? el('small', null, ` · ${r.marque}`) : null,
            !r.pris ? el('small', { class: 'dp-tag' }, ' non emporté') : r.porte ? el('small', { class: 'dp-tag' }, ' porté') : null),
          el('span', { class: 'dp-q' }, !r.quantite || String(r.quantite) === '1' || String(r.quantite) === '0' ? '' : /^\d+$/.test(r.quantite) ? `×${r.quantite}` : r.quantite),
          el('span', { class: 'dp-w' }, g(r.poids_g))))));
    }));
    const foodList = el('div', { class: 'dp-list', hidden: '' }, group(D.nourriture, 'categorie').map(([cat, rows]) => {
      const k = rows.reduce((a, r) => a + (r.kcal || 0), 0);
      return el('section', null, el('h4', null, cat, el('span', null, `${nf(k)} kcal`)),
        el('ul', null, rows.map(r => el('li', null,
          el('span', { class: 'dp-o' }, r.produit, r.marque ? el('small', null, ` · ${r.marque}`) : null),
          el('span', { class: 'dp-q' }, r.quantite == null ? '?' : r.unite === 'ml' && r.quantite >= 1000 ? `${nf(r.quantite / 1000, r.quantite % 1000 ? 1 : 0)} L` : r.unite === 'g' || r.unite === 'ml' ? `${nf(r.quantite)} ${r.unite}` : `×${nf(r.quantite)}`),
          el('span', { class: 'dp-w' }, r.kcal == null ? '—' : `${nf(r.kcal)} kcal`)))));
    }));
    const tabG = el('button', { type: 'button', class: 'dp-tab', 'aria-pressed': 'true' }, 'Équipement');
    const tabF = el('button', { type: 'button', class: 'dp-tab', 'aria-pressed': 'false' }, `Nourriture · ${nf(kcal)} kcal`);
    const pick = food => { tabG.setAttribute('aria-pressed', String(!food)); tabF.setAttribute('aria-pressed', String(food)); gearList.hidden = food; foodList.hidden = !food; };
    tabG.onclick = () => pick(false); tabF.onclick = () => pick(true);
    const close = () => { sheet.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.lightbox')) close(); };
    const P = D.profil;
    // left: the photo of all the gear, then my profile below it; right: the two lists, full height
    const sheet = el('div', { class: 'depart', role: 'dialog', 'aria-label': 'Inventaire' },
      el('div', { class: 'dp-card' },
        el('div', { class: 'dp-body' },
          el('div', { class: 'dp-left' },
          el('header', { class: 'dp-head' },
            el('div', null, el('h2', null, 'Inventaire de départ'))),
          el('figure', { class: 'dp-photo' },
            el('button', { type: 'button', 'aria-label': 'Agrandir la photo de l’équipement', onclick: () => lightbox([{ src: D.photo, title: 'Tout l’équipement, la veille du départ' }], 0) },
              el('img', { src: D.photo, alt: 'Tout l’équipement étalé au sol avant le départ' })),
            el('figcaption', null, 'Tout l’équipement étalé la veille du départ · touche pour agrandir')),
          el('h2', { class: 'dp-sub' }, 'Le sac en chiffres'),
          el('div', { class: 'dp-tiles' },
            tile('Sac au départ', `≈ ${nf(D.sac_kg, 1)}`, 'kg', 'sans eau'),
            tile('Part de mon poids', nf(100 * D.sac_kg / P.poids_kg), '%', `${nf(D.sac_kg, 1)} kg pour ${nf(P.poids_kg, 1)} kg`),
            tile('Nourriture', nf(foodKg, 1), 'kg', `${nf(kcal)} kcal`),
            tile('Par jour', nf(kcal / 9), 'kcal', 'sur 9 jours')),
          el('h2', { class: 'dp-sub' }, 'Mon profil'),
          el('div', { class: 'dp-tiles' },
            tile('Âge', P.age, 'ans'), tile('Taille', P.taille_cm, 'cm'), tile('Poids', nf(P.poids_kg, 1), 'kg', 'au départ'),
            tile('VO2max', P.vo2max, 'ml/kg/min', 'estimation Garmin')),
          el('p', { class: 'dp-thanks' },
            el('b', null, 'Merci à mon oncle, Cyrille Livet. '),
            'Sans tout ce qu’il m’a appris, son aide matérielle et le goût de la montagne transmis au travers d’aventures, ce projet n’aurait jamais vu le jour.')),
          el('div', { class: 'dp-lists' },
            el('div', { class: 'dp-tabs' }, tabG, tabF, el('button', { type: 'button', class: 'pw-close dp-close', 'aria-label': 'Fermer', onclick: close }, '×')),
            gearList, foodList))));
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(sheet);
  }

  /* every photo of the trek as one full-screen mosaic, no text: 7 columns, as many rows as needed
     to hold them all (28 photos = 7 x 4), stretched to fill the screen. A tap opens the viewer on
     that photo; its arrows then run through all of them in order. */
  function openPhotoWall() {
    const items = [];
    PHOTOS.forEach(a => { const t = photoTimes(a); photoFiles(a).forEach((f, i) => items.push({ src: f, mini: f.replace('photos/', 'photos/mini/'), title: a.titre, sub: [a.label, t[i]].filter(Boolean).join(' · '), point: a })); });
    const cols = innerWidth < 700 ? 4 : 7;
    const close = () => { wall.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.lightbox')) close(); };
    const grid = el('div', { class: 'pw-grid', style: `grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${Math.ceil(items.length / cols)}, 1fr)` },
      items.map((it, i) => el('button', { type: 'button', class: 'pw-tile', 'aria-label': `${it.title}, ouvrir en grand`, onclick: () => lightbox(items, i) },
        el('img', { src: it.mini, alt: it.title, decoding: 'async', onerror: function () { this.onerror = null; this.src = it.src; } }))));
    const wall = el('div', { class: 'photo-wall', role: 'dialog', 'aria-label': 'Toutes les photos' }, grid,
      el('button', { type: 'button', class: 'pw-close', 'aria-label': 'Fermer', onclick: close }, '×'));
    document.addEventListener('keydown', onKey);
    document.body.append(wall);
  }

  function openRoutePoint(kind, a) {
    showLayerOf(kind);
    resetPanel(); stopAnim(true); setActive(null); highlight(null); setTitleDefault(); setTabs(kind, true); unfoldPanel();
    if (popup) { popup.remove(); popup = null; }
    const isPh = kind === 'photos';
    if (map) {
      if (isPh && a.direction_deg != null) {
        // frame the whole view from behind the photographer: the triangle, its tip and a stretch of
        // ground behind it (the ridge you stand on), looking the same way as the photo
        setFov(a);
        const k = Math.cos(a.lat * Math.PI / 180) * 111320, t = a.direction_deg * Math.PI / 180, R = a.portee_m || 800;
        const at = (d, ang = 0) => { const u = (a.direction_deg + ang) * Math.PI / 180; return [a.lon + d * Math.sin(u) / k, a.lat + d * Math.cos(u) / 110540]; };
        const steep = a.inclinaison_camera_deg != null;   // a photo on a slope facing down asks for a view from above
        const back = a.recul_camera || 1, up = a.hauteur_camera || 1;   // per photo, in photos.csv
        const half = (a.champ_deg || 60) / 2;
        const box = new maplibregl.LngLatBounds();
        [at(-0.45 * R * back), at(-0.2 * R * back, -90), at(-0.2 * R * back, 90), at(R, -half), at(R, 0), at(R, half)].forEach(q => box.extend(q));
        const pitch = steep ? a.inclinaison_camera_deg : Math.max(25, Math.min(66, 58 - 10 * (up - 1)));
        let cam = null;
        try { cam = map.cameraForBounds(box, { bearing: a.direction_deg, padding: { top: 70, bottom: 30, left: 50, right: 50 } }); } catch (e) { cam = null; }
        if (cam && isFinite(cam.zoom)) {
          map.flyTo({ center: cam.center, zoom: Math.min(15, cam.zoom + 0.35), pitch, bearing: a.direction_deg,
            duration: reduceMotion ? 0 : 2600, essential: true, padding: centerPad() });
        } else {
          map.flyTo({ center: at(R * 0.3), zoom: 13 - Math.max(0, Math.log2(R / 1000)) * 0.8, pitch, bearing: a.direction_deg,
            duration: reduceMotion ? 0 : 2600, essential: true, padding: centerPad() });
        }
      } else map.flyTo({ center: [a.lon, a.lat], zoom: 13.6, pitch: 60, bearing: -15, duration: reduceMotion ? 0 : 2600, essential: true, padding: centerPad() });
    }
    panel.replaceChildren(...[
      backButton(isPh ? 'Toutes les photos' : 'Toutes les infos', kind),
      el('p', { class: 'eyebrow-sm' }, `${isPh ? 'Photo' : 'Info'} · ${a.label}`),
      el('h2', null, a.titre),
      el('p', { class: 'meta' }, `${nf(Math.max(0, a.alt))} m${a.heure ? ` · vers ${a.heure}` : ''} · ${a.lat.toFixed(4)} N, ${a.lon.toFixed(4)} E`),
      isPh ? null : el('p', { class: 'info-text' }, a.texte || 'Texte à venir.'),   // an info: its story first, then its photo if any
      isPh || photoFiles(a).length ? photoGallery(a) : null,
      isPh && a.legende ? el('p', { class: 'note' }, a.legende) : null,
      a.open ? el('div', { class: 'player' }, el('button', { type: 'button', class: 'play', onclick: a.open }, `▶ ${a.replay}`)) : null].filter(Boolean));
    panel.scrollTop = 0;
  }

  /* records of the summits, under the list (same tiles as the nights); each one opens its summit */
  function summitRecords() {
    const rows = T.summits.map(s => ({ s, ...summitStats(s) }));
    const altOf = r => r.s.hauteur_officielle_m || r.s.alt_gps_m;
    const withT = rows.filter(r => r.s.temp_c != null);
    const high = rows.reduce((a, b) => altOf(b) > altOf(a) ? b : a);
    const best = rows.reduce((a, b) => b.gap < a.gap ? b : a), hard = rows.reduce((a, b) => b.gap > a.gap ? b : a);
    const down = rows.filter(r => r.downKm > 0.2).reduce((a, b) => b.downS / b.downKm < a.downS / a.downKm ? b : a);
    const cold = withT.reduce((a, b) => b.s.temp_c < a.s.temp_c ? b : a), warm = withT.reduce((a, b) => b.s.temp_c > a.s.temp_c ? b : a);
    const recTile = (k, label, r, value, extra) => el('button', { type: 'button', class: 'rec-tile', onclick: () => openSummit(r.s) },
      el('span', { class: 'rec-l' }, el('i', { class: `rec-dot ${k}` }), label), el('b', { class: 'rec-v' }, value), el('span', { class: 'rec-s' }, r.s.sommet),
      extra ? el('span', { class: 'rec-s rec-d rec-wrap' }, extra) : null);
    return el('div', { class: 'rec-grid' },
      recTile('k-top', 'le plus haut', high, `${nf(altOf(high))} m`),
      recTile('k-fast', 'montée rapide', best, `${pace(best.gap)} /km`),
      recTile('k-hard', 'montée lente', hard, `${pace(hard.gap)} /km`),
      recTile('k-down', 'descente rapide', down, `${pace(down.downS / 60 / down.downKm)} /km`),
      recTile('k-cold', 'le plus froid', cold, `${nf(cold.s.temp_c, 0)} °C`),
      recTile('k-warm', 'le plus chaud', warm, `${nf(warm.s.temp_c, 0)} °C`,
        (T.ressentis || {})[warm.s.sommet] ? `ressenti ${T.ressentis[warm.s.sommet].pied} °C au pied` : null));
  }

  /* records of the nights, each one flies to its bivouac */
  function nightRecords() {
    const N = T.camps.map(n => ({ n, c: camps.find(c => c.id === n.camp_id) }));
    const pick = (val, best) => N.filter(x => val(x.n) != null).reduce((a, b) => best(val(b.n), val(a.n)) ? b : a);
    const hi = (a, b) => a > b, lo = (a, b) => a < b;
    // a record he lived differently (wind or rain at the exact spot) replaces the ERA5 one
    const DECL = T.records_declares || {};
    const lived = key => { const d = DECL[key]; if (!d) return null; const x = N.find(x => x.n.night === d.night); return x ? { ...x, lived: d } : null; };
    const livedVal = (x, dec) => `${nf(x.lived.valeur, dec)} ${x.lived.unite}`;
    const rows = [
      ['k-top', 'le plus haut', camps.reduce((a, b) => b.alt > a.alt ? b : a), c => `${nf(c.alt)} m`],
      ['k-best', 'la meilleure', pick(n => n.sleep && n.sleep.sleep_score, hi), x => `${nf(x.n.sleep.sleep_score)} / 100`],
      ['k-cold', 'la plus froide', lived('plus_froide') || pick(n => n.weather && n.weather.temp_min_camp, lo), x => `${nf(x.n.weather.temp_min_camp, 1)} °C`],
      ['k-wind', 'la plus venteuse', lived('plus_venteuse') || pick(n => n.weather && n.weather.gust_max, hi), x => x.lived && x.lived.valeur != null ? livedVal(x, 0) : `${nf(x.n.weather.gust_max)} km/h`],
      ['k-rain', 'la plus arrosée', lived('plus_arrosee') || pick(n => n.weather && n.weather.rain_mm, hi), x => x.lived && x.lived.valeur != null ? livedVal(x, 1) : `${nf(x.n.weather.rain_mm, 1)} mm`],
      ['k-short', 'la plus courte', pick(n => n.sleep && n.sleep.sommeil_min, lo), x => hm(x.n.sleep.sommeil_min)],
    ];
    // small tiles, three per line: what, the figure, where and when
    return el('div', { class: 'rec-grid' }, rows.map(([k, label, r, fmt]) => {
      const c = r.c || r;
      return el('button', { type: 'button', class: 'rec-tile', onclick: () => openCamp(c) },
        el('span', { class: 'rec-l' }, el('i', { class: `rec-dot ${k}` }), label),
        el('b', { class: 'rec-v' }, fmt(r)),
        el('span', { class: 'rec-s' }, c.name),
        el('span', { class: 'rec-s rec-d' }, r.n ? `nuit du ${day(r.n.night).d} ${day(r.n.night).m}` : `${nf(c.nights.length)} nuit${c.nights.length > 1 ? 's' : ''}`));
    }));
  }

  /* where every number comes from: a window opened by the round button next to the legend */
  function openSources() {
    const old = document.querySelector('.sources'); if (old) { old.remove(); return; }
    const S = T.stats;
    const sec = (title, ...lines) => el('section', null, el('h4', null, title), el('ul', null, lines.map(l => el('li', null, l))));
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const box = el('div', { class: 'sources', role: 'dialog', 'aria-label': 'Sources des données' },
      el('div', { class: 'src-card' },
        el('header', null, el('h2', null, 'Sources des données'),
          el('button', { type: 'button', class: 'pw-close dp-close', 'aria-label': 'Fermer', onclick: close }, '×')),
        el('div', { class: 'src-body' },
          sec('Trace et effort',
            `Montre GPS Garmin Forerunner 255 Music : positions, altitude, fréquence cardiaque et calories, 24 activités enregistrées (fichiers .FIT bruts).`,
            `Distance totale : ${nf(S.strava_distance)} km, dont ${nf(S.km)} km mesurés sur la trace GPS de la montre. Dénivelé : ${nf(S.dplus_watch)} m selon la montre (altimètre barométrique).`,
            'Passages non enregistrés (ferry Kirkefjord → Vindstad, liaisons) : sautés dans les chiffres ; le ferry est dessiné en arc sur la carte.',
            'Allure ajustée à la pente : coût énergétique de la course en pente, Minetti et al. (2002).'),
          sec('Nuits et corps',
            'Sommeil, phases, FC au repos, HRV, Body Battery, calories du jour : Garmin Connect, nuit par nuit.',
            'Batterie de la montre : relevée par la montre toutes les 5 minutes.',
            'Profil (âge, taille, poids au départ, VO2max) : déclaré ; VO2max estimée par Garmin.'),
          sec('Météo',
            'Réanalyse ERA5 (Copernicus / ECMWF), via Open-Meteo : heure par heure, sur 3 zones du parcours (nord, centre, sud), maille d’environ 30 km.',
            'Température ramenée à l’altitude du point (−6,5 °C par 1 000 m) ; ressenti = refroidissement par le vent.',
            'Records des nuits : ERA5, sauf trois nuits vécues autrement sur place (vent à Horseid, pluie à Sørvågen, froid aux hauteurs de Kvalvika), déclarées.'),
          sec('Sac, équipement et nourriture',
            'Équipement : pesées quand elles existent, sinon fiches produits ou valeurs typiques (pesées en cours).',
            'Nourriture : quantités emportées ; calories des fiches produits ou valeurs typiques.',
            `Poids du sac au départ : estimation de ${nf(T.depart ? T.depart.sac_kg : 0, 1)} kg sans eau, puis consommation jour après jour.`),
          sec('Récit et photos',
            'Alertes, infos, photos et leur direction de vue : placées et racontées par moi, à partir de la trace.',
            'Photos : iPhone et GoPro ; heure de prise de vue lue sur la trace GPS, ou relevée sur la photo pour les bivouacs.'),
          sec('Carte',
            'Satellite : Esri World Imagery (Maxar, Earthstar Geographics). Carte topo : OpenTopoMap, © contributeurs OpenStreetMap (CC-BY-SA).',
            'Relief 3D : Mapzen / AWS Terrain Tiles. Moteur : MapLibre GL ; site hébergé sur GitHub Pages.'))));
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(box);
  }

  /* Norway's right of access, in a small card over the map (bottom right, next to the panel) */
  function openLaw() {
    const old = document.querySelector('.law-card'); if (old) { old.remove(); return; }
    const close = () => card.remove();
    const card = el('aside', { class: 'law-card bubble', role: 'dialog', 'aria-label': 'Le droit d’accès en Norvège' },
      el('button', { type: 'button', class: 'fold law-close', 'aria-label': 'Fermer', onclick: close }, '×'),
      el('p', { class: 'eyebrow-sm' }, 'Allemannsretten'),
      el('h3', null, 'Bivouaquer en Norvège'),
      el('p', null, 'Le droit d’accès, inscrit dans la loi depuis 1957, permet de marcher et de planter sa tente presque partout hors des terres cultivées, gratuitement.'),
      el('ul', null,
        el('li', null, 'tente à au moins ', el('b', null, '150 m'), ' d’une maison ou d’un chalet habité ;'),
        el('li', null, el('b', null, '2 nuits'), ' au même endroit au plus sans l’accord du propriétaire (plus en montagne, loin de tout) ;'),
        el('li', null, 'pas de feu en forêt ou près d’une forêt du ', el('b', null, '15 avril au 15 septembre'), ' : réchaud seulement ;'),
        el('li', null, 'on repart sans laisser de trace, déchets compris.')));
    document.body.append(card);
  }

  function recapRow(kind, label, meta, open) {
    return el('ul', { class: 'camp-list recap-list' }, el('li', null,
      el('button', { type: 'button', class: 'camp-row', onclick: open },
        el('span', { class: `camp-num num-dot dot-${kind}` }),
        el('span', { class: 'camp-name' }, label),
        el('span', { class: 'camp-dates' }, meta))));
  }

  function backButton(label, to) {
    return el('button', { type: 'button', class: 'back', onclick: () => { showHome(to); overview(); } }, `‹ ${label}`);
  }

  /* ---------- panel: one camp ---------- */
  function nightBlock(n) {
    const s = n.sleep, w = n.weather;
    const kids = [el('h3', null, 'La nuit')];
    if (s && s.sommeil_min) {
      kids.push(el('dl', { class: 'kv' },
        el('div', null, el('dt', null, 'Coucher → réveil'), el('dd', null, `${s.coucher} → ${s.reveil}`)),
        el('div', null, el('dt', null, 'Sommeil'), el('dd', null, hm(s.sommeil_min))),
        el('div', null, el('dt', null, 'FC au repos'), el('dd', null, nf(s.fc_repos), el('small', null, ' bpm'))),
        el('div', null, el('dt', null, 'HRV moyenne'), el('dd', null, nf(s.hrv_moy_ms), el('small', null, ' ms'))),
        el('div', null, el('dt', null, 'Body Battery'), el('dd', null, `+${nf(s.body_battery_recharge)}`)),
        el('div', null, el('dt', null, 'Score Garmin'), el('dd', null, nf(s.sleep_score), el('small', null, ' / 100')))));
      if (s.profond_pct != null) {
        kids.push(el('div', { class: 'phases' },
          el('div', { class: 'phase-bar', role: 'img', 'aria-label': `Profond ${nf(s.profond_pct)} %, léger ${nf(s.leger_pct)} %, paradoxal ${nf(s.paradoxal_pct)} %` },
            el('span', { class: 'ph-deep', style: `width:${s.profond_pct}%` }),
            el('span', { class: 'ph-light', style: `width:${s.leger_pct}%` }),
            el('span', { class: 'ph-rem', style: `width:${s.paradoxal_pct}%` })),
          el('div', { class: 'phase-key' },
            el('span', null, el('i', { class: 'ph-deep' }), `profond ${nf(s.profond_pct)} %`),
            el('span', null, el('i', { class: 'ph-light' }), `léger ${nf(s.leger_pct)} %`),
            el('span', null, el('i', { class: 'ph-rem' }), `paradoxal ${nf(s.paradoxal_pct)} %`))));
      }
    } else {
      kids.push(el('p', { class: 'empty' }, 'Pas de données de sommeil pour cette nuit.'));
    }
    kids.push(el('h3', null, 'Météo de la nuit'));
    kids.push(el('dl', { class: 'kv' },
      el('div', { title: `ERA5 ${nf(w.temp_min_era5, 1)} °C, corrigé de l’altitude du camp (−6,5 °C par 1 000 m)` }, el('dt', null, 'Minimum au camp'), el('dd', null, nf(w.temp_min_camp, 1), el('small', null, ' °C'))),
      el('div', null, el('dt', null, 'Pluie'), el('dd', null, nf(w.rain_mm, 1), el('small', null, ' mm'))),
      el('div', null, el('dt', null, 'Rafales max'), el('dd', null, nf(w.gust_max), el('small', null, ' km/h'))),
      el('div', null, el('dt', null, 'Nuages'), el('dd', null, nf(w.cloud_pct), el('small', null, ' %')))));
    if (n.bag_next_morning_kg != null) {
      kids.push(el('h3', null, `Le lendemain matin · J${n.next_day}`));
      kids.push(el('dl', { class: 'kv' }, el('div', { title: T.bag_note }, el('dt', null, 'Sac, sans eau'), el('dd', null, `≈ ${nf(n.bag_next_morning_kg, 1)}`, el('small', null, ' kg'))),
        el('div', null, el('dt', null, 'Estimation'), el('dd', { class: 'dd-note' }, 'à confirmer par les pesées'))));
    }
    return kids;
  }

  function openCamp(c, nightIdx = 0) {
    resetPanel();
    stopAnim(true);
    highlight(null);
    setActive(c.id);
    setTitleDefault();
    setTabs('camps', true);
    unfoldPanel();
    flyToCamp(c);
    const body = el('div');
    const render = i => body.replaceChildren(...nightBlock(c.nights[i]));
    const tabs = c.nights.length > 1 ? el('div', { class: 'tabs', role: 'tablist' }, c.nights.map((n, i) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(i === nightIdx), onclick: e => {
        tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', 'false'));
        e.currentTarget.setAttribute('aria-selected', 'true');
        render(i);
      } }, nightLabel(n.night, n.wake)))) : null;
    panel.replaceChildren(
      backButton('Tous les bivouacs', 'camps'),
      el('h2', null, c.name),
      el('p', { class: 'meta' }, `${c.nights.length > 1 ? `${c.nights.length} nuits · ` : nightLabel(c.nights[0].night, c.nights[0].wake) + ' · '}${nf(c.alt)} m · ${c.lat.toFixed(4)} N, ${c.lon.toFixed(4)} E`),
      (T.camp_recits || {})[c.id] ? el('p', { class: 'info-text camp-recit' }, T.camp_recits[c.id]) : null,   // the bivouac's story
      ...[tabs, body].filter(Boolean));
    render(nightIdx);
    panel.scrollTop = 0;
  }

  /* ---------- elevation profile (shown in the title bubble) ---------- */
  function profileChart(pts, marks, onSeek, H = 92) {
    const W = 380, L = 30, R = 6, Tp = marks && marks.length ? 16 : 8, B = 16;
    const kmMax = pts[pts.length - 1].km || 1;
    const alts = pts.map(p => p.alt);
    const aMax = Math.max(100, Math.ceil(Math.max(...alts) / 100) * 100);
    const x = km => L + (km / kmMax) * (W - L - R);
    const ya = a => Tp + (1 - a / aMax) * (H - Tp - B);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'profile', role: 'img', 'aria-label': `Profil d’altitude, ${nf(kmMax, 1)} km, jusqu’à ${nf(Math.max(...alts))} m` });
    [0, 0.5, 1].forEach(f => {
      svg.append(sv('line', { x1: L, x2: W - R, y1: ya(f * aMax), y2: ya(f * aMax), class: 'grid' }));
      svg.append(svText({ x: L - 5, y: ya(f * aMax) + 3, class: 'axis', 'text-anchor': 'end' }, nf(f * aMax)));
    });
    [0, kmMax / 2, kmMax].forEach((k, j) =>
      svg.append(svText({ x: x(k), y: H - 3, class: 'axis', 'text-anchor': j === 0 ? 'start' : j === 2 ? 'end' : 'middle' }, `${nf(pts[idxAt(pts, k)].wk, kmMax < 20 ? 1 : 0)} km`)));
    let area = `M${x(0)},${ya(0)}`, line = '';
    pts.forEach((p, k) => {
      area += `L${x(p.km).toFixed(1)},${ya(p.alt).toFixed(1)}`;
      line += `${k && pts[k - 1].seg === p.seg ? 'L' : 'M'}${x(p.km).toFixed(1)},${ya(p.alt).toFixed(1)}`;
    });
    area += `L${x(kmMax)},${ya(0)}Z`;
    const clipId = `done-${Math.random().toString(36).slice(2, 8)}`;
    const clip = sv('clipPath', { id: clipId }), clipRect = sv('rect', { x: 0, y: 0, width: L, height: H });
    clip.append(clipRect);
    svg.append(clip, sv('path', { d: area, class: 'alt-area' }), sv('path', { d: area, class: 'alt-done', 'clip-path': `url(#${clipId})` }), sv('path', { d: line, class: 'alt-line' }));
    (marks || []).forEach((m, j, all) => {
      const close = all.length > 1 && Math.abs(x(all[1].km) - x(all[0].km)) < 90;
      const anchor = close ? (j === 0 ? 'end' : 'start') : 'middle';
      svg.append(sv('line', { x1: x(m.km), x2: x(m.km), y1: ya(m.alt), y2: Tp - 2, class: 'mark' }));
      svg.append(svText({ x: Math.min(W - R, Math.max(L, x(m.km) + (anchor === 'end' ? -3 : anchor === 'start' ? 3 : 0))), y: Tp - 5, class: 'axis mark-label', 'text-anchor': anchor }, m.label));
    });
    const cur = sv('line', { x1: L, x2: L, y1: Tp, y2: H - B, class: 'cursor' });
    const dot = sv('circle', { r: 4, cx: L, cy: ya(pts[0].alt), class: 'cursor-dot' });
    const hit = sv('rect', { x: L, y: 0, width: W - L - R, height: H - B, fill: 'transparent', class: 'hit' });
    hit.addEventListener('click', e => {
      const r = svg.getBoundingClientRect();
      onSeek(Math.max(0, Math.min(kmMax, ((e.clientX - r.left) / r.width * W - L) / (W - L - R) * kmMax)));
    });
    svg.append(cur, dot, hit);
    return { svg, move: (km, alt) => {
      const X = x(km).toFixed(1);
      cur.setAttribute('x1', X); cur.setAttribute('x2', X); dot.setAttribute('cx', X); dot.setAttribute('cy', ya(alt).toFixed(1));
      clipRect.setAttribute('width', X);
    } };
  }

  /* ---------- speed histogram: km/h km by km (5 km bins for the whole traverse); the faster, the taller ---------- */
  function speedChart(all, bin, onSeekKm, H = 96) {
    // work on walking km only: the boat is left out
    const pts = all.filter(p => p.sac !== 2).map(p => ({ ...p, km: p.wk }));
    const onSeek = wk => { const i = all.findIndex(p => p.sac !== 2 && p.wk >= wk); onSeekKm(i < 0 ? all[all.length - 1].km : all[i].km); };
    const kmMax = pts[pts.length - 1].km;
    const kmh = (k0, k1) => { const h = (movAt(pts, k1) - movAt(pts, k0)) / 3600; return h > 0 ? (k1 - k0) / h : NaN; };
    const bins = [];
    for (let k0 = 0; k0 < kmMax - 1e-6; k0 += bin) {
      const k1 = Math.min(kmMax, k0 + bin);
      if (k1 - k0 < 0.15 * bin && bins.length) { const b = bins[bins.length - 1]; b.k1 = k1; b.v = kmh(b.k0, b.k1); continue; }  // tiny last piece joins the previous bin
      bins.push({ k0, k1, v: kmh(k0, k1), sac: pts[idxAt(pts, (k0 + k1) / 2)].sac });
    }
    const vals = bins.map(b => b.v).filter(isFinite).sort((a, b) => a - b);
    const p95 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))] || 4;
    const step = p95 > 8 ? 4 : p95 > 4 ? 2 : 1;
    const yMax = Math.max(step, Math.ceil(p95 * 1.08 / step) * step);
    const W = 340, L = 30, R = 4, Tp = 6, B = 16;
    const bw = (W - L - R) / bins.length, gap = Math.min(2, bw * 0.18);
    const y = v => Tp + (1 - Math.min(isFinite(v) ? v : 0, yMax) / yMax) * (H - Tp - B);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pace', role: 'img',
      'aria-label': `Vitesse par tranche de ${bin} km, de ${nf(vals[0], 1)} à ${nf(vals[vals.length - 1], 1)} km/h` });
    [0, 0.5, 1].forEach(f => {
      svg.append(sv('line', { x1: L, x2: W - R, y1: y(f * yMax), y2: y(f * yMax), class: 'grid' }));
      svg.append(svText({ x: L - 5, y: y(f * yMax) + 3, class: 'axis', 'text-anchor': 'end' }, nf(f * yMax, (f * yMax) % 1 ? 1 : 0)));
    });
    const lab = bins.length <= 16 ? 1 : Math.ceil(bins.length / 8);
    const rects = bins.map((b, j) => {
      const r = sv('rect', { x: (L + j * bw + gap / 2).toFixed(2), y: y(b.v).toFixed(1), width: Math.max(0.6, bw - gap).toFixed(2),
        height: Math.max(0.5, H - B - y(b.v)).toFixed(1), rx: Math.min(2.5, bw / 4), class: `bar ${b.sac ? 'b-avec' : 'b-sans'} future` });
      r.addEventListener('click', () => onSeek(b.k0 + 1e-3));
      svg.append(r);
      if (b.v > yMax) svg.append(sv('rect', { x: (L + j * bw + gap / 2).toFixed(2), y: Tp + 3, width: Math.max(0.6, bw - gap).toFixed(2), height: 1.5, class: 'clip' }));
      if (j % lab === 0 || j === bins.length - 1) svg.append(svText({ x: (L + (j + 0.5) * bw).toFixed(1), y: H - 3, class: 'axis', 'text-anchor': 'middle' }, nf(bin * (j + 1))));
      return r;
    });
    const caption = el('p', { class: 'pace-now' }, '—');
    let curBin = -1;
    function move(animKm) {
      const km = all[idxAt(all, animKm)].wk;
      let j = bins.findIndex(b => km < b.k1);
      if (j < 0) j = bins.length - 1;
      if (j === curBin) return;
      curBin = j;
      rects.forEach((r, k) => { r.classList.toggle('future', k > j); r.classList.toggle('now', k === j); });
      const b = bins[j];
      caption.replaceChildren(`${bin === 1 ? `km ${j + 1}` : `km ${nf(b.k0)} à ${nf(b.k1)}`} · `, el('b', null, `${nf(b.v, 1)} km/h`),
        ` (${pace(60 / b.v)} par km) · `, b.sac ? 'avec le sac' : 'sans sac');
    }
    const key = el('div', { class: 'key' },
      bins.some(b => b.sac) ? el('span', null, el('i', { class: 'k-avec' }), 'avec le sac') : null,
      bins.some(b => !b.sac) ? el('span', null, el('i', { class: 'k-sans' }), 'sans sac') : null,
      el('span', null, 'km/h en mouvement · touche une barre pour y aller'));
    return { nodes: [svg, caption], key, move };
  }

  /* ---------- live weather of a replay: ERA5 hour by hour, nearest of the 3 zones,
     temperature brought to the walker's altitude, wind chill as "ressenti" ---------- */
  const WX = T.weather, WX_T0 = WX ? Date.parse(WX.start + 'Z') : 0;
  const BEAUFORT = [[1, 'calme'], [6, 'très légère brise'], [12, 'légère brise'], [20, 'petite brise'], [29, 'jolie brise'],
    [39, 'bonne brise'], [50, 'vent frais'], [62, 'grand frais'], [75, 'coup de vent'], [89, 'fort coup de vent'], [Infinity, 'tempête']];
  const wxIcon = {   // 24 x 24 pictograms; the sun never sets in June up here
    sun: () => [sv('circle', { cx: 12, cy: 12, r: 4.6, class: 'wi-sun' }),
      ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return sv('line', { x1: 12 + 7 * Math.cos(a), y1: 12 + 7 * Math.sin(a), x2: 12 + 9.6 * Math.cos(a), y2: 12 + 9.6 * Math.sin(a), class: 'wi-ray' }); })],
    cloud: (x = 0, y = 0, k = 'wi-cloud') => [sv('path', { d: `M${6.5 + x} ${18 + y}h11a3.6 3.6 0 0 0 .3-7.2 5.4 5.4 0 0 0-10.4-1.2A4 4 0 0 0 ${6.5 + x} ${18 + y}z`, class: k })],
    drops: n => Array.from({ length: n }, (_, i) => sv('path', { d: `M${8.5 + i * 3.6} 19.6l-1.3 2.6`, class: 'wi-drop' })),
    wind: () => [sv('path', { d: 'M3 9h11.5a2.6 2.6 0 1 0-2.6-2.6M3 13h15a2.8 2.8 0 1 1-2.8 2.8M3 17h7', class: 'wi-line' })],
    gust: () => [sv('path', { d: 'M3 8h9.5a2.4 2.4 0 1 0-2.4-2.4M3 12h13M3 16h9.5a2.4 2.4 0 1 1-2.4 2.4', class: 'wi-line' }), sv('path', { d: 'M19.5 9.5l-2.2 4h3l-2.2 4', class: 'wi-bolt' })],
    drop: () => [sv('path', { d: 'M12 3.5c3.2 4.4 5.2 7.4 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.8 2-5.8 5.2-10.2z', class: 'wi-dropfill' })],
    therm: () => [sv('path', { d: 'M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z', class: 'wi-line' }), sv('circle', { cx: 12, cy: 16.8, r: 1.9, class: 'wi-merc' }), sv('path', { d: 'M12 15V9', class: 'wi-mercl' })],
  };
  const svgIcon = (parts, cls) => { const g = sv('svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true' }); g.append(...parts); return g; };
  function skyIcon(cloud, rain) {
    if (rain >= 0.3) return svgIcon([...wxIcon.cloud(0, -3, 'wi-cloud wi-dark'), ...wxIcon.drops(rain >= 2 ? 3 : 2)], 'wi-big');
    if (cloud >= 85) return svgIcon([...wxIcon.cloud(-2, -4, 'wi-cloud wi-back'), ...wxIcon.cloud(1, 0)], 'wi-big');
    if (cloud >= 40) { const g = sv('g', { transform: 'translate(-1.5 -2.5) scale(.78)' }); g.append(...wxIcon.sun()); return svgIcon([g, ...wxIcon.cloud(2, 1.5)], 'wi-big'); }
    return svgIcon(wxIcon.sun(), 'wi-big');
  }
  const skyWord = (cloud, rain) => rain >= 2 ? 'pluie' : rain >= 0.3 ? 'averses' : cloud >= 85 ? 'couvert' : cloud >= 40 ? 'éclaircies' : 'soleil';
  function weatherAt(p) {
    if (!WX || !/^\d\d:\d\d$/.test(p.heure || '')) return null;
    const [h, m] = p.heure.split(':').map(Number);
    const t = (Date.UTC(2026, 5, 13 + p.day, h, m) - WX_T0) / 3.6e6;   // hours since the first ERA5 hour
    const z = WX.zones.reduce((b, z) => { const d = (z.lat - p.lat) ** 2 + ((z.lon - p.lon) * 0.37) ** 2; return d < b.d ? { z, d } : b; }, { z: null, d: Infinity }).z;
    const n = z.t.length, i0 = Math.max(0, Math.min(n - 1, Math.floor(t))), i1 = Math.min(n - 1, i0 + 1), f = Math.max(0, Math.min(1, t - i0));
    const lerp = a => a[i0] + (a[i1] - a[i0]) * f;
    const temp = lerp(z.t) - WX.lapse_c_per_m * (p.alt - z.elev), wind = lerp(z.wind);
    const chill = temp <= 10 && wind > 4.8 ? 13.12 + 0.6215 * temp - 11.37 * wind ** 0.16 + 0.3965 * temp * wind ** 0.16 : temp;
    return { temp, chill, wind, gust: lerp(z.gust), cloud: lerp(z.cloud), rain: z.rain[Math.min(n - 1, Math.ceil(t))], alt: p.alt };
  }
  function weatherBox() {
    const big = el('span', { class: 'wx-sky' }), temp = el('b', { class: 'wx-t' }), sub = el('span', { class: 'wx-sub' });
    // two short lines: the sky, the air temperature and how it feels; then wind, gusts and rain
    const cell = (icon, label) => { const v = el('b', { class: 'wx-v' }), u = el('small'), node = el('span', { class: 'wx-c', title: label }, svgIcon(icon(), 'wi-small'), v, u, el('span', { class: 'wx-u' }, ` ${label.toLowerCase()}`)); return { node, v, u, label }; };
    const c = { wind: cell(wxIcon.wind, 'Vent'), gust: cell(wxIcon.gust, 'Rafales'), rain: cell(wxIcon.drop, 'Pluie') };
    const feelV = el('b', { class: 'wx-v' });
    const feel = el('span', { class: 'wx-feel' }, svgIcon(wxIcon.therm(), 'wi-small'), el('span', { class: 'wx-u' }, 'ressenti '), feelV);
    const node = el('div', { class: 'wx' },
      el('div', { class: 'wx-main' }, big, el('div', { class: 'wx-tt' }, temp, sub), feel),
      el('div', { class: 'wx-row' }, c.wind.node, c.gust.node, c.rain.node));
    let last = '';
    return { node, move: p => {
      const w = weatherAt(p);
      node.hidden = !w;
      if (!w) return;
      const key = [Math.round(w.temp * 2), Math.round(w.wind), Math.round(w.gust), w.rain, Math.round(w.cloud / 5), Math.round(w.chill)].join();
      if (key === last) return;
      last = key;
      big.replaceChildren(skyIcon(w.cloud, w.rain));
      temp.replaceChildren(`${nf(w.temp, 1)}`, el('small', null, ' °C'));
      sub.textContent = `${skyWord(w.cloud, w.rain)} · nuages ${nf(w.cloud)} %`;
      const force = v => BEAUFORT.findIndex(b => v < b[0]);
      c.wind.v.textContent = nf(w.wind); c.wind.u.textContent = ' km/h';
      c.wind.node.title = `Vent : ${nf(w.wind)} km/h, ${BEAUFORT[force(w.wind)][1]} (force ${force(w.wind)} Beaufort)`;
      c.gust.v.textContent = nf(w.gust); c.gust.u.textContent = ' km/h';
      c.gust.node.title = `Rafales : ${nf(w.gust)} km/h, ${BEAUFORT[force(w.gust)][1]} (force ${force(w.gust)} Beaufort)`;
      c.rain.v.textContent = nf(w.rain, 1); c.rain.u.textContent = ' mm';
      feelV.replaceChildren(nf(w.chill, 0), el('small', null, ' °C'));
    } };
  }

  /* ---------- live watch battery of a replay: Garmin level every 5 min ---------- */
  const BATT = T.battery || [];
  function batteryAt(p) {
    if (!BATT.length || !/^\d\d:\d\d$/.test(p.heure || '')) return null;
    const [h, m] = p.heure.split(':').map(Number), t = (p.day - 1) * 1440 + h * 60 + m;
    let lo = 0, hi = BATT.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (BATT[mid][0] < t) lo = mid + 1; else hi = mid; }
    const j = Math.abs(BATT[lo][0] - t) <= Math.abs((BATT[lo - 1] || BATT[lo])[0] - t) ? lo : lo - 1;
    if (Math.abs(BATT[j][0] - t) > 12) return null;
    let k = j; while (k > 0 && BATT[j][0] - BATT[k - 1][0] <= 65 && BATT[k - 1][1] >= BATT[j][1]) k--;   // last hour, same charge
    const dt = (BATT[j][0] - BATT[k][0]) / 60;
    return { level: BATT[j][1], drain: dt >= 0.4 ? (BATT[k][1] - BATT[j][1]) / dt : null };
  }
  function batteryBox() {
    const fill = sv('rect', { x: 2.2, y: 2.2, height: 7.6, rx: 1.4, class: 'bt-fill' });
    const icon = sv('svg', { viewBox: '0 0 26 12', class: 'bt-icon', 'aria-hidden': 'true' });
    icon.append(sv('rect', { x: .7, y: .7, width: 21.6, height: 10.6, rx: 2.6, class: 'bt-shell' }), sv('rect', { x: 23, y: 3.8, width: 2.3, height: 4.4, rx: 1, class: 'bt-tip' }), fill);
    const lvl = el('b'), rate = el('span', { class: 'bt-rate' });
    const node = el('div', { class: 'batt' }, icon, el('span', { class: 'bt-l' }, 'Batterie de la montre'), lvl, rate);
    let last = '';
    return { node, move: p => {
      const b = batteryAt(p);
      node.classList.toggle('bt-none', !b);
      if (!b) { lvl.textContent = '—'; rate.textContent = ''; last = ''; return; }
      const key = `${b.level}|${b.drain == null ? '' : b.drain.toFixed(1)}`;
      if (key === last) return;
      last = key;
      fill.setAttribute('width', (19.2 * b.level / 100).toFixed(2));
      fill.classList.toggle('bt-low', b.level <= 20);
      lvl.replaceChildren(String(b.level), el('small', null, ' %'));
      rate.textContent = b.drain == null ? '' : `${b.drain > 0 ? '−' : ''}${nf(Math.abs(b.drain), 1)} % par heure`;
    } };
  }

  /* ---------- player: buttons, live counters, profile and speed in the panel ---------- */
  const kvItem = (label, value, unit) => el('div', null, el('dt', null, label), el('dd', null, value, unit ? el('small', null, ` ${unit}`) : null));
  const SPEEDS = [1, 2, 4, 8], TREK_SPEEDS = [1, 1.25, 1.5, 1.75, 2];
  const CAMS = [['drone', 'Drone'], ['orbit', 'Orbite'], ['fixed', 'Fixe']];

  function player(pts, opts) {
    const counters = {};
    const cnt = (key, label, unit) => el('div', null, el('dt', null, label),
      el('dd', null, (counters[key] = el('span', null, '—')), unit ? el('small', null, ` ${unit}`) : null));
    const board = el('dl', { class: 'kv counters' },
      cnt('km', 'Distance', 'km'), cnt('dplus', 'Dénivelé +', 'm'), cnt('mov', 'En mouvement'),
      cnt('kcal', 'Calories', 'kcal'), cnt('heure', 'Heure'), cnt('hr', 'FC', 'bpm'));
    const where = opts.showWhere ? el('p', { class: 'where' }, '—') : null;
    const state = { km: 0, speed: 1, cam: 'drone' };
    const seek = km => { state.km = km; state.lastCk = km; render(km, true); };
    const cps = checkpoints(pts);
    let chart = profileChart(pts, opts.marks, seek);
    let paces = speedChart(pts, opts.paceBin || 1, seek);
    const wx = opts.weather ? weatherBox() : null, batt = opts.weather ? batteryBox() : null;
    const altBox = el('div', { class: 'chart-box' }, chart.svg), speedBox = el('div', { class: 'chart-box' }, ...paces.nodes);

    function render(km, full) {
      const i = idxAt(pts, km), p = pts[i];
      counters.km.textContent = nf(p.wk, 1); counters.dplus.textContent = nf(p.dplus);
      counters.mov.textContent = hms(p.mov); counters.kcal.textContent = nf(p.kcal);
      counters.heure.textContent = p.heure; counters.hr.textContent = nf(p.hr);
      if (where) where.textContent = p.sac === 2 ? p.act : `J${p.day} · ${p.act}`;
      if (!full && state.lastCk != null) {
        cps.forEach(c => { if (c.km > state.lastCk && c.km <= km) fireCheckpoint(c, opts.keepPopup); });
        state.lastCk = km;
      }
      chart.move(km, p.alt);
      paces.move(km);
      if (wx) wx.move(p);
      if (batt) batt.move(p);
      drawLine(pts, i, full);
      drawHead(headAt(pts, km, i));
    }

    const playBtn = el('button', { type: 'button', class: 'play' }, '▶ Lancer');
    const speedBtn = el('button', { type: 'button', class: 'ghost', 'aria-label': 'Vitesse' }, '×1');
    const speeds = opts.speeds || SPEEDS;
    speedBtn.addEventListener('click', () => { state.speed = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length]; speedBtn.textContent = `×${nf(state.speed, (state.speed * 10) % 1 ? 2 : state.speed % 1 ? 1 : 0)}`; if (anim) anim.speed = state.speed; });
    const camBtn = el('button', { type: 'button', class: 'ghost', 'aria-label': 'Mode de caméra' }, `Caméra : ${CAMS[0][1]}`);
    camBtn.addEventListener('click', () => {
      const i = (CAMS.findIndex(c => c[0] === state.cam) + 1) % CAMS.length;
      state.cam = CAMS[i][0]; camBtn.textContent = `Caméra : ${CAMS[i][1]}`;
      if (anim) { anim.cam = state.cam; anim.orbitStart = performance.now(); anim.orbitBase = map ? map.getBearing() : 0; anim.bearing = map ? map.getBearing() : anim.bearing; }
    });
    playBtn.addEventListener('click', () => {
      if (anim && anim.running) { anim.running = false; playBtn.textContent = '▶ Reprendre'; return; }
      if (state.km >= pts[pts.length - 1].km) state.km = 0;
      state.lastCk = state.km === 0 ? -1 : state.km;
      startAnim(pts, state, opts.view, render, () => { playBtn.textContent = '↺ Rejouer'; opts.onEnd && opts.onEnd(); });
      playBtn.textContent = '❚❚ Pause';
    });

    // fixed figures of the outing go to the title bubble; what moves stays in the panel
    setTitleActivity(opts.eyebrow, opts.name, opts.summary || []);
    render(0, true);
    return {
      nodes: [el('div', { class: 'player' }, playBtn, speedBtn, camBtn), where, board,
        el('h3', null, 'Profil d’altitude', el('span', { class: 'h3-hint' }, ' · en m, touche pour te déplacer')), altBox,
        el('h3', null, opts.paceBin > 1 ? `Vitesse par tranche de ${opts.paceBin} km` : 'Vitesse par kilomètre', el('span', { class: 'h3-hint' }, ' · km/h, touche une barre')), speedBox,
        wx ? null : paces.key,
        ...(wx ? [el('h3', null, 'Météo en direct', el('span', { class: 'h3-hint' }, ' · à ton altitude')), wx.node, batt.node,
          el('p', { class: 'wx-note' }, 'ERA5 (Open-Meteo), heure par heure, zone la plus proche : nord, centre ou sud. Température ramenée à ton altitude (−6,5 °C par 1 000 m), ressenti = refroidissement par le vent. Vent et rafales à 10 m sur une maille d’environ 30 km : souvent plus fort sur les crêtes. Pluie : cumul de l’heure.')] : [])].filter(Boolean),
      start: () => playBtn.click(),
      // once in the panel: grow the two charts so the weather sits right at the bottom of the
      // panel (the grey note is then just below, by scrolling); altitude gets the larger share
      fit: () => {
        if (!wx || !panel.contains(batt.node)) return;
        const build = (hA, hS) => {
          chart = profileChart(pts, opts.marks, seek, hA); paces = speedChart(pts, opts.paceBin || 1, seek, hS);
          altBox.replaceChildren(chart.svg); speedBox.replaceChildren(...paces.nodes);
          const p = pts[idxAt(pts, state.km)]; chart.move(state.km, p.alt); paces.move(state.km);
        };
        build(92, 96);
        const st = panel.scrollTop; panel.scrollTop = 0;
        const room = panel.getBoundingClientRect().bottom - 12 - batt.node.getBoundingClientRect().bottom;   // the grey note starts just out of sight
        panel.scrollTop = st;
        if (Math.abs(room) <= 4) return;
        // a short screen shrinks them instead (down to a readable minimum)
        const kA = 380 / Math.max(1, chart.svg.getBoundingClientRect().width), kS = 340 / Math.max(1, paces.nodes[0].getBoundingClientRect().width);
        build(Math.max(70, Math.round(92 + room * 0.6 * kA)), Math.max(74, Math.round(96 + room * 0.4 * kS)));
      },
    };
  }

  /* ---------- panel: one étape (camp to camp, with the pack) ---------- */
  function openEtape(e) {
    resetPanel();
    stopAnim(true); setActive(null); setTabs('etapes', true); unfoldPanel();
    if (popup) { popup.remove(); popup = null; }
    const pts = buildSeq(e.acts);
    highlight(e.acts);
    fitPts(pts);
    const last = pts[pts.length - 1];
    const night = T.camps.find(n => n.next_day === e.day);
    const hrs = pts.map(p => p.hr).filter(v => v != null);
    const d = day(ACTS[e.acts[0]].date);
    const summary = el('dl', { class: 'title-kv' },
      kvItem('Distance', nf(last.wk, 1), 'km'), kvItem('Dénivelé +', nf(last.dplus), 'm'), kvItem('En mouvement', hms(last.mov)),
      kvItem('FC moyenne', nf(hrs.reduce((a, b) => a + b, 0) / Math.max(1, hrs.length)), 'bpm'), kvItem('Calories', nf(last.kcal), 'kcal'),
      kvItem('Sac le matin', night && night.bag_next_morning_kg ? `≈ ${nf(night.bag_next_morning_kg, 1)}` : '—', night && night.bag_next_morning_kg ? 'kg' : null));
    const pl = player(pts, { view: VIEW.etape, weather: true, onEnd: () => fitPts(pts), summary: [summary],
      eyebrow: `Étape J${e.day} · ${d.d} ${d.m} · avec le sac`, name: `${e.from} → ${e.to}` });
    panel.replaceChildren(
      backButton('Toutes les étapes', 'etapes'),
      ...pl.nodes);
    panel.scrollTop = 0;
    curFit = pl.fit; pl.fit();
  }

  /* ---------- panel: one summit (the whole trail outing of that day) ---------- */
  /* the outing that reaches a summit and the climb itself: from the lowest point since the
     previous summit of the outing (or its start) up to this one */
  function summitStats(s) {
    const ids = SUMMIT_OUTINGS[s.activite] || [s.activite];
    const pts = buildSeq(ids);
    const tops = T.summits.filter(x => x.activite === s.activite).map(x => {
      let best = 0, bd = Infinity;
      pts.forEach((p, i) => { const dd = (p.lat - x.lat) ** 2 + ((p.lon - x.lon) * 0.37) ** 2; if (dd < bd) { bd = dd; best = i; } });
      return { s: x, i: best };
    }).sort((a, b) => a.i - b.i);
    const k = Math.max(0, tops.findIndex(t => t.s.sommet === s.sommet));
    const me = tops[k];
    // the climb = from the lowest point since the previous summit (or the start) up to this one
    const from = k ? tops[k - 1].i : 0;
    let low = from;
    for (let i = from; i <= me.i; i++) if (pts[i].alt < pts[low].alt) low = i;
    const top = pts[me.i], base = pts[low], last = pts[pts.length - 1];
    const climbS = top.mov - base.mov, climbM = top.dplus - base.dplus;
    const hrs = pts.map(p => p.hr).filter(v => v != null);
    // grade-adjusted pace of the climb: each ~100 m piece counts as the flat distance that costs
    // the same energy (Minetti et al. 2002, cost of running on a slope), so steep km weigh more
    const cost = g => { g = Math.max(-0.45, Math.min(0.45, g)); return 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6; };
    let eqKm = 0, a = low;
    for (let i = low + 1; i <= me.i; i++) {
      const d = pts[i].wk - pts[a].wk;
      if (d < 0.1 && i < me.i) continue;
      if (d > 0) eqKm += d * cost((pts[i].alt - pts[a].alt) / (d * 1000)) / 3.6;
      a = i;
    }
    const gap = climbS / 60 / Math.max(0.01, eqKm);      // min per flat-equivalent km
    // the way down: from the last summit of the outing to its lowest point after it
    // (Reinebringen and Helvete share one descent, from Helvete)
    let downKm = 0, downS = 0, downM = 0, downKcal = 0;
    if (k === tops.length - 1) {
      let bottom = me.i;
      for (let i = me.i; i < pts.length; i++) if (pts[i].alt < pts[bottom].alt) bottom = i;
      downKm = pts[bottom].wk - top.wk; downS = pts[bottom].mov - top.mov; downM = top.alt - pts[bottom].alt; downKcal = pts[bottom].kcal - top.kcal;
    }
    return { ids, pts, tops, top, base, last, climbS, climbM, hrs, vv: climbM / Math.max(1 / 60, climbS / 3600), gap, eqKm, downKm, downS, downM,
      climbKcal: top.kcal - base.kcal, climbKm: top.wk - base.wk, downKcal };   // calories of the climb alone (watch estimate)
  }

  function openSummit(s) {
    resetPanel();
    stopAnim(true); setActive(null); setTabs('summits', true); unfoldPanel();
    const { ids, pts, tops, last, climbS, climbM, hrs } = summitStats(s);
    highlight(ids);
    fitPts(pts, 13.2);
    summitPopup(s);
    const d = day(s.heure.slice(0, 10));
    const several = ids.length > 1;
    const summary = [
      el('p', { class: 'title-meta' }, (s.hauteur_officielle_m ? `${nf(s.alt_gps_m)} m au GPS · ${nf(s.hauteur_officielle_m)} m officiels` : `${nf(s.alt_gps_m)} m au GPS`)
        + (several ? ` · sortie depuis ${ACTS[ids[0]].name}` : '')),
      // two rows of four: the outing at a glance, then the climb itself
      el('dl', { class: 'title-kv kv4' },
        kvItem('D+ sortie', nf(last.dplus), 'm'), kvItem('Vit. verticale', nf(climbM / Math.max(1 / 60, climbS / 3600)), 'm/h'),
        kvItem('FC max', nf(hrs.length ? Math.max(...hrs) : null), 'bpm'), kvItem(tops.length > 1 ? `${s.sommet} à` : 'Au sommet à', s.heure.slice(11, 16)),
        kvItem('Montée', hms(climbS)), kvItem('D+ montée', nf(climbM), 'm'),
        kvItem(several ? 'Sortie du jour' : 'Sortie complète', nf(last.wk, 1), 'km'), kvItem('Calories', nf(last.kcal), 'kcal'))];
    const pl = player(pts, { view: VIEW.summit, weather: true, keepPopup: true, summary, marks: tops.map(t => ({ km: pts[t.i].km, alt: pts[t.i].alt, label: t.s.sommet })), onEnd: () => fitPts(pts, 13.2),
      eyebrow: `Sommet · ${d.d} ${d.m} · ${several ? 'toute la sortie du jour' : 'sortie trail sans sac'}`, name: tops.length > 1 ? tops.map(t => t.s.sommet).join(' · ') : s.sommet });
    panel.replaceChildren(
      backButton('Tous les sommets', 'summits'),
      ...pl.nodes);
    panel.scrollTop = 0;
    curFit = pl.fit; pl.fit();
  }

  /* ---------- recaps: all the nights, all the summits ---------- */
  const PH = { deep: '#2f5fc4', light: '#86aaf0', rem: '#b55ac8' };
  const avg = a => { const v = a.filter(x => x != null && isFinite(x)); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
  const recapHead = (cls, eyebrow, title, note) => [el('p', { class: `eyebrow-sm ${cls}` }, eyebrow), el('h2', null, title), note ? el('p', { class: 'note' }, note) : null];
  function openRecap(rub) {
    stopAnim(true); setActive(null); highlight(null); setTitleDefault(); setTabs(rub, true); unfoldPanel();
    if (popup) { popup.remove(); popup = null; }
    overview();
  }
  const nightTick = n => String(day(n.night).d);   // night of the 13th, 14th…

  /* a recap fills the panel exactly: drawn once, measured, then drawn again with its charts
     stretched (or squeezed on a small screen) so that its last line ends at the panel bottom */
  function fitRecap(draw) {
    draw(0);
    panel.scrollTop = 0;
    const last = panel.lastElementChild, svg = panel.querySelector('.recap-chart');
    if (!last || !svg) return;
    const pad = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
    const room = panel.getBoundingClientRect().bottom - pad - last.getBoundingClientRect().bottom;
    if (Math.abs(room) < 3) return;
    const k = 340 / Math.max(1, svg.getBoundingClientRect().width);   // screen px -> chart units
    draw(Math.max(-60, room * k));
    panel.scrollTop = 0;
    curFit = () => fitRecap(draw);
  }
  function openNightsRecap() {
    openRecap('camps');
    panel.classList.add('recap');
    fitRecap(ex => {   // ex: extra height (chart units) shared by the three charts to end at the panel bottom
    const N = T.camps, S9 = N.map(n => n.sleep || {});
    const W = 340, L = 30, R = 30, x0 = L, bw = (W - L - R) / N.length, cx = j => x0 + (j + 0.5) * bw;
    const xLabels = (svg, H) => N.forEach((n, j) => svg.append(svText({ x: cx(j).toFixed(1), y: H - 3, class: 'axis', 'text-anchor': 'middle' }, nightTick(n))));
    const grid = (svg, y, vals, fmt, side = 'left') => vals.forEach(v => {
      svg.append(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
      svg.append(svText({ x: side === 'left' ? L - 5 : W - R + 5, y: y(v) + 3, class: 'axis', 'text-anchor': side === 'left' ? 'end' : 'start' }, fmt(v)));
    });

    // 1. sleep: stacked phases, deep at the bottom, light in the middle, REM on top
    const H1 = 112 + ex / 3, T1 = 6, B1 = 17, maxH = 11 * 60;
    const y1 = m => T1 + (1 - m / maxH) * (H1 - T1 - B1);
    const s1 = sv('svg', { viewBox: `0 0 ${W} ${H1}`, class: 'recap-chart', role: 'img', 'aria-label': 'Durée de sommeil par nuit, découpée en phases' });
    grid(s1, y1, [0, 300, 600], m => `${m / 60} h`);
    N.forEach((n, j) => {
      const sl = n.sleep; if (!sl || !sl.sommeil_min) return;
      let acc = 0;
      [['profond_min', PH.deep], ['leger_min', PH.light], ['paradoxal_min', PH.rem]].forEach(([k, col], q) => {
        const v = sl[k] || 0; if (!v) return;
        s1.append(sv('rect', { x: (cx(j) - bw * 0.32).toFixed(1), y: y1(acc + v).toFixed(1), width: (bw * 0.64).toFixed(1), height: (y1(acc) - y1(acc + v)).toFixed(1), fill: col, rx: q === 2 || (q === 1 && !sl.paradoxal_min) ? 2 : 0 }));
        acc += v;
      });
    });
    xLabels(s1, H1);
    const tot = avg(S9.map(x => x.sommeil_min)), dp = avg(S9.map(x => x.profond_min)), lg = avg(S9.map(x => x.leger_min)), rm = avg(S9.map(x => x.paradoxal_min));
    const pct = v => `${nf(100 * v / (dp + lg + rm))} %`;
    // legend and averages on the same line, under each chart
    const avgItem = (cls, label, value) => el('span', null, cls ? el('i', { class: cls }) : null, `${label} `, el('b', null, value));
    const sleepKv = el('div', { class: 'avg-line' },
      avgItem('ph-deep', 'profond', `${hm(dp)} · ${pct(dp)}`), avgItem('ph-light', 'léger', `${hm(lg)} · ${pct(lg)}`),
      avgItem('ph-rem', 'paradoxal', `${hm(rm)} · ${pct(rm)}`), avgItem(null, 'nuit moyenne', hm(tot)));

    // 2. resting heart rate (white dots, red ring and line) and HRV (dashed, right axis)
    const H2 = 124 + ex / 3, T2 = 8, B2 = 17;
    const fc = S9.map(x => x.fc_repos), hv = S9.map(x => x.hrv_moy_ms);
    const fcMin = 40, fcMax = 55, hvMin = 20, hvMax = 70;
    const y2 = v => T2 + (1 - (v - fcMin) / (fcMax - fcMin)) * (H2 - T2 - B2);
    const y2h = v => T2 + (1 - (v - hvMin) / (hvMax - hvMin)) * (H2 - T2 - B2);
    const s2 = sv('svg', { viewBox: `0 0 ${W} ${H2}`, class: 'recap-chart', role: 'img', 'aria-label': 'FC au repos et HRV par nuit' });
    grid(s2, y2, [40, 45, 50, 55], v => nf(v));
    [20, 45, 70].forEach(v => s2.append(svText({ x: W - R + 5, y: y2h(v) + 3, class: 'axis hrv-axis', 'text-anchor': 'start' }, nf(v))));
    const path = (vals, y) => vals.map((v, j) => v == null ? '' : `${j && vals[j - 1] != null ? 'L' : 'M'}${cx(j).toFixed(1)},${y(v).toFixed(1)}`).join('');
    s2.append(sv('path', { d: path(hv, y2h), class: 'hrv-line' }));
    hv.forEach((v, j) => v != null && s2.append(sv('circle', { cx: cx(j).toFixed(1), cy: y2h(v).toFixed(1), r: 2.6, class: 'hrv-dot' })));
    s2.append(sv('path', { d: path(fc, y2), class: 'fc-line' }));
    fc.forEach((v, j) => v != null && s2.append(sv('circle', { cx: cx(j).toFixed(1), cy: y2(v).toFixed(1), r: 3.6, class: 'fc-dot' })));
    xLabels(s2, H2);
    const fcKv = el('div', { class: 'avg-line' },
      avgItem('k-fc', 'FC au repos (gauche)', `${nf(avg(fc))} bpm`), avgItem('k-hrv', 'HRV (droite)', `${nf(avg(hv))} ms`),
      avgItem(null, 'FC la plus basse', `${nf(Math.min(...fc.filter(v => v != null)))} bpm`), avgItem(null, 'HRV la plus haute', `${nf(Math.max(...hv.filter(v => v != null)))} ms`));

    // 3. Body Battery of the following day: from its low to its high, with the night's recharge
    const H3 = 112 + ex / 3, T3 = 8, B3 = 17;
    const y3 = v => T3 + (1 - v / 100) * (H3 - T3 - B3);
    const s3 = sv('svg', { viewBox: `0 0 ${W} ${H3}`, class: 'recap-chart', role: 'img', 'aria-label': 'Body Battery du lendemain, du minimum au maximum' });
    grid(s3, y3, [0, 25, 50, 75, 100], v => nf(v));
    N.forEach((n, j) => {
      const b = n.body_battery_day; if (!b) return;
      s3.append(sv('rect', { x: (cx(j) - bw * 0.2).toFixed(1), y: y3(b.max).toFixed(1), width: (bw * 0.4).toFixed(1), height: (y3(b.min) - y3(b.max)).toFixed(1), rx: 3, class: 'bb-bar' }));
      s3.append(sv('circle', { cx: cx(j).toFixed(1), cy: y3(b.max).toFixed(1), r: 3.4, class: 'bb-top' }));
    });
    xLabels(s3, H3);
    const BB = N.map(n => n.body_battery_day || {});
    const bbKv = el('div', { class: 'avg-line' },
      avgItem('k-bb', 'max', nf(avg(BB.map(b => b.max)))), avgItem(null, 'min', nf(avg(BB.map(b => b.min)))),
      avgItem(null, 'recharge par nuit', `+${nf(avg(S9.map(x => x.body_battery_recharge)))}`));

    panel.replaceChildren(
      el('h2', { class: 'recap-title', title: 'Garmin Connect, nuit par nuit. Moyennes sur les 9 nuits, nuit courte de Bunes beach comprise.' }, 'Récap des nuits'),
      el('h3', null, 'Sommeil et phases · nuits du 13 au 21'), s1, sleepKv,
      el('h3', null, 'FC au repos et HRV'), s2, fcKv,
      el('h3', null, 'Body Battery du lendemain (min → max)'), s3, bbKv);
    });
  }

  function openSummitsRecap() {
    openRecap('summits');
    panel.classList.add('recap');
    fitRecap(ex => {   // ex: extra height (chart units): 40 % more space between the altitude bars, 60 % for the pace lines
    const rows = T.summits.map(s => ({ s, ...summitStats(s) }));
    const altOf = r => r.s.hauteur_officielle_m || r.s.alt_gps_m;
    const best = rows.reduce((a, b) => b.gap < a.gap ? b : a), cold = rows.filter(r => r.s.temp_c != null).reduce((a, b) => b.s.temp_c < a.s.temp_c ? b : a);
    const high = rows.reduce((a, b) => altOf(b) > altOf(a) ? b : a);
    const hardest = rows.reduce((a, b) => b.gap > a.gap ? b : a);
    const W = 340, L = 100, R = 72, T0 = 2, rowH = 15 + 0.4 * ex / T.summits.length;
    // 1. altitude of each summit, with the air temperature up there
    const H1 = T0 + rows.length * rowH + 4, aMax = 800;
    const s1 = sv('svg', { viewBox: `0 0 ${W} ${H1}`, class: 'recap-chart', role: 'img', 'aria-label': 'Altitude et température de chaque sommet' });
    rows.forEach((r, j) => {
      const y = T0 + j * rowH, alt = r.s.hauteur_officielle_m || r.s.alt_gps_m, w = (W - L - R) * alt / aMax;
      s1.append(svText({ x: L - 8, y: y + 11.5, class: 'axis peak-label', 'text-anchor': 'end' }, r.s.sommet));
      s1.append(sv('rect', { x: L, y: y + 2.5, width: w.toFixed(1), height: 11, rx: 3, class: `peak-bar${r === high ? ' top' : ''}` }));
      s1.append(svText({ x: L + w + 6, y: y + 11.5, class: 'axis peak-val' }, `${nf(alt)} m`));
      if (r.s.temp_c != null) s1.append(svText({ x: W - 2, y: y + 11.5, class: `axis peak-temp-t${r === cold ? ' cold' : ''}`, 'text-anchor': 'end' }, `${nf(r.s.temp_c, 0)} °C`));
    });
    // 2. grade-adjusted pace of each climb (the longer the line, the faster)
    const sp = r => 60 / r.gap, vMax = Math.ceil(Math.max(...rows.map(sp)) / 2) * 2;
    const rowH2 = 20 + 0.6 * ex / rows.length, H2 = T0 + rows.length * rowH2 + 4;   // the pace chart gets more room
    const s2 = sv('svg', { viewBox: `0 0 ${W} ${H2}`, class: 'recap-chart chart-big', role: 'img', 'aria-label': 'Allure ajustée à la pente de chaque montée' });
    rows.forEach((r, j) => {
      const y = T0 + j * rowH2, w = (W - L - R) * sp(r) / vMax;
      s2.append(svText({ x: L - 8, y: y + 14, class: 'axis peak-label', 'text-anchor': 'end' }, r.s.sommet));
      s2.append(sv('line', { x1: L, x2: L + w, y1: y + 9.5, y2: y + 9.5, class: 'vv-stem' }));
      s2.append(sv('circle', { cx: (L + w).toFixed(1), cy: y + 9.5, r: 5, class: `vv-dot${r === best ? ' top' : ''}${r === hardest ? ' hard' : ''}` }));
      s2.append(svText({ x: L + w + 9, y: y + 14, class: 'axis peak-val' }, `${pace(r.gap)} /km`));
    });
    // totals: climbs, descents and the whole outings (each outing counted once)
    const sum = f => rows.reduce((a, r) => a + (f(r) || 0), 0);
    const outings = [...new Map(rows.map(r => [r.ids.join('+'), r])).values()];
    const up = { m: sum(r => r.climbM), s: sum(r => r.climbS), km: sum(r => r.climbKm), kcal: sum(r => r.climbKcal) };
    const dn = { m: sum(r => r.downM), s: sum(r => r.downS), km: sum(r => r.downKm), kcal: sum(r => r.downKcal) };
    const all = { m: outings.reduce((a, r) => a + r.last.dplus, 0), s: outings.reduce((a, r) => a + r.last.mov, 0),
      km: outings.reduce((a, r) => a + r.last.wk, 0), kcal: outings.reduce((a, r) => a + r.last.kcal, 0) };
    const cell = (v, u) => el('td', null, v, u ? el('small', null, ` ${u}`) : null);
    const line = (label, t, sign) => el('tr', null, el('th', null, label), cell(`${sign}${nf(t.m)}`, 'm'), cell(hms(t.s)), cell(nf(t.km, 1), 'km'), cell(nf(t.kcal), 'kcal'));
    const kv = el('table', { class: 'tot-table' },
      el('thead', null, el('tr', null, el('th'), el('th', null, 'dénivelé'), el('th', null, 'temps'), el('th', null, 'distance'), el('th', null, 'calories'))),
      el('tbody', null,
        line('Montées', up, '+'), line('Descentes', dn, '−'), line('Sorties', all, '+')));
    const av = (label, value, unit) => el('div', null, el('span', null, label), el('b', null, value, el('small', null, ` ${unit}`)));
    const avgs = el('div', { class: 'tot-avg' },
      av('vit. verticale ↗', nf(up.m / (up.s / 3600)), 'm/h'), av('allure ajustée ↗', pace(up.s / 60 / sum(r => r.eqKm)), '/km'),
      av('dépense ↗', nf(up.kcal / (up.s / 3600)), 'kcal/h'), av('dépense ↘', nf(dn.kcal / (dn.s / 3600)), 'kcal/h'));
    const hard = rows.reduce((a, b) => b.gap > a.gap ? b : a);
    const down = rows.filter(r => r.downKm > 0.2).reduce((a, b) => b.downS / b.downKm < a.downS / a.downKm ? b : a);

    panel.replaceChildren(
      el('h2', { class: 'recap-title' }, 'Récap des sommets'),
      el('h3', null, 'Altitude et température au sommet'), s1,
      el('h3', { title: 'Chaque morceau de montée compte comme la distance à plat qui demande le même effort (Minetti et al., 2002).' }, 'Allure ajustée à la pente, du pied au sommet'), s2,
      el('h3', null, 'Totaux et moyennes'), kv, avgs);
    });
  }

  /* ---------- panel: the whole traverse ---------- */
  function openTrek() {
    resetPanel();
    stopAnim(true); setActive(null); highlight([]); setTabs(null, false); unfoldPanel();
    if (popup) { popup.remove(); popup = null; }
    const pts = buildSeq(T.acts.map(a => a.id));
    const summary = el('dl', { class: 'title-kv' },
      ...statItems().map(([k, v, u]) => kvItem(k, v, u)));
    summary.classList.add('stats-grid');
    const pl = player(pts, { view: VIEW.trek, paceBin: 5, speeds: TREK_SPEEDS, showWhere: true, marks: [], onEnd: () => overview(), summary: [summary],
      eyebrow: '14 → 22 juin 2026 · Napp → Moskenes', name: 'Toute la traversée' });
    panel.replaceChildren(
      backButton('Retour aux rubriques'),
      el('p', { class: 'note' }, 'Tout dans l’ordre, avec et sans sac, sommets compris. Monte la vitesse pour l’effet, baisse-la pour lire.'),
      ...pl.nodes);
    panel.scrollTop = 0;
    overview();
    setTimeout(pl.start, reduceMotion ? 0 : 2500);
  }
  document.getElementById('btn-trek').addEventListener('click', openTrek);
  document.getElementById('btn-depart').addEventListener('click', openDepart);
  document.getElementById('btn-sources').addEventListener('click', openSources);
  placeSources();
  placeDepart(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeDepart);

  /* ---------- map ---------- */
  if (typeof maplibregl === 'undefined') {
    document.getElementById('map-error').hidden = false;
    showHome();
    layoutChanged();
    return;
  }

  const DEM = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium', tileSize: 256, maxzoom: 15,
    attribution: 'Relief : <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen / AWS Terrain Tiles</a>' };
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        sat: { type: 'raster', tileSize: 256, maxzoom: 18,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics' },
        topo: { type: 'raster', tileSize: 256, maxzoom: 17,
          tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' },
        dem: DEM,
        hs: { ...DEM },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#141b1f' } },
        { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -0.1, 'raster-contrast': 0.05 } },
        { id: 'topo', type: 'raster', source: 'topo', layout: { visibility: 'none' } },
        { id: 'hillshade', type: 'hillshade', source: 'hs',
          paint: { 'hillshade-exaggeration': 0.3, 'hillshade-shadow-color': '#0b1118', 'hillshade-highlight-color': '#ffffff' } },
      ],
    },
    center: [13.15, 68.0], zoom: 8.6, pitch: 0, maxPitch: 80,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  /* compass rose: turns with the map, leans with the tilt; a tap puts north back up */
  {
    const ticks = document.getElementById('compass-ticks');
    for (let d = 0; d < 360; d += 15) {
      if (d % 90 === 0) continue;
      const r1 = d % 45 === 0 ? 34 : 37, t = d * Math.PI / 180;
      ticks.append(sv('line', { x1: (r1 * Math.sin(t)).toFixed(2), y1: (-r1 * Math.cos(t)).toFixed(2), x2: (41 * Math.sin(t)).toFixed(2), y2: (-41 * Math.cos(t)).toFixed(2), class: d % 45 === 0 ? 'c-tick big' : 'c-tick' }));
    }
    const rose = document.getElementById('compass-rose'), btn = document.getElementById('compass');
    const turn = () => { btn.style.setProperty('--tilt', `${(map.getPitch() * 0.55).toFixed(1)}deg`); rose.setAttribute('transform', `rotate(${(-map.getBearing()).toFixed(1)})`); };
    map.on('move', turn); turn();
    btn.addEventListener('click', () => { stopAnim(false); map.easeTo({ bearing: 0, duration: reduceMotion ? 0 : 900 }); });
  }

  const bounds = new maplibregl.LngLatBounds();
  T.trace.features.forEach(f => f.geometry.coordinates.forEach(c => bounds.extend([c[0], c[1]])));

  /* free area of the map = the window minus the bubbles that are open */
  function padding() {
    const t = titleBox.getBoundingClientRect(), p = panelBox.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (isPhone()) return { top: Math.round(t.bottom) + 12, bottom: Math.round(vh - p.top) + 12, left: 24, right: 24 };
    const titleTall = t.height > vh * 0.3;
    return {
      top: titleTall ? 40 : Math.round(t.bottom) + 16,
      bottom: 80,
      left: titleTall ? Math.round(t.right) + 24 : 40,
      right: Math.round(vw - p.left) + 24,
    };
  }
  /* camera framing: on wide screens the subject sits in the middle of the screen
     (the bubbles are see-through); on phones, between the title and the bottom sheet */
  const ZERO = { top: 0, bottom: 0, left: 0, right: 0 };
  const centerPad = () => isPhone() ? padding() : ZERO;
  const fitPad = () => isPhone() ? padding() : { top: 110, bottom: 70, left: 110, right: 110 };
  const OVERVIEW_ZOOM_BONUS = -0.3;   // a bit closer than "everything fits": the island outlines stay readable
  function overview(instant) {
    if (!map) return;
    const pad = isPhone() ? padding() : { top: 40, bottom: 40, left: 40, right: 40 };
    const cam = map.cameraForBounds ? map.cameraForBounds(bounds, { padding: pad, bearing: -18 }) : null;
    if (!cam) { map.fitBounds(bounds, { padding: pad, pitch: 48, bearing: -18, duration: instant || reduceMotion ? 0 : 2400, essential: true }); return; }
    map.easeTo({ center: cam.center, zoom: cam.zoom + OVERVIEW_ZOOM_BONUS, pitch: 48, bearing: -18, padding: isPhone() ? pad : ZERO,
      duration: instant || reduceMotion ? 0 : 2400, essential: true });
  }
  function fitPts(pts, maxZoom = 13.6) {
    if (!map) return;
    const b = new maplibregl.LngLatBounds();
    pts.forEach(p => b.extend([p.lon, p.lat]));
    map.fitBounds(b, { padding: fitPad(), pitch: 52, bearing: -15, maxZoom, duration: reduceMotion ? 0 : 2200, essential: true });
  }
  function flyToCamp(c) {
    if (!map) return;
    map.flyTo({ center: [c.lon, c.lat], zoom: 13.2, pitch: 60, bearing: CAMP_BEARING[c.name] ?? (c.id * 47) % 360 - 180, duration: reduceMotion ? 0 : 2800, essential: true, padding: centerPad() });
  }

  /* dim the whole trace while one sequence is on stage */
  function highlight(ids) {
    if (!map || !map.getLayer('trace')) return;
    if (ids == null) {
      map.setPaintProperty('trace', 'line-opacity', 1);
      map.setPaintProperty('trace-casing', 'line-opacity', 0.85);
      return;
    }
    const on = ['in', ['get', 'id'], ['literal', ids]];
    map.setPaintProperty('trace', 'line-opacity', ['case', on, 0.45, 0.15]);
    map.setPaintProperty('trace-casing', 'line-opacity', ['case', on, 0.45, 0.12]);
  }

  /* ---------- animation ---------- */
  function drawLine(pts, k, force) {
    if (!map || !map.getSource('anim')) return;
    const now = performance.now();
    if (!force && now - lastLineDraw < 90) return;
    lastLineDraw = now;
    const feats = [];
    let cur = null;
    for (let i = 0; i <= k; i++) {
      const p = pts[i];
      if (!cur || cur.properties.sac !== p.sac || cur.seg !== p.seg) {
        const join = cur && cur.seg === p.seg ? [cur.geometry.coordinates[cur.geometry.coordinates.length - 1]] : [];
        cur = { type: 'Feature', seg: p.seg, properties: { sac: p.sac }, geometry: { type: 'LineString', coordinates: join } };
        feats.push(cur);
      }
      cur.geometry.coordinates.push([p.lon, p.lat]);
    }
    map.getSource('anim').setData({ type: 'FeatureCollection', features: feats.filter(f => f.geometry.coordinates.length > 1).map(({ seg, ...f }) => f) });
  }
  function drawHead(h) {
    if (!map || !map.getSource('head')) return;
    const onBoat = h.sac === 2;
    if (boatMarker) { boatMarker.getElement().hidden = !onBoat; if (onBoat) boatMarker.setLngLat([h.lon, h.lat]); }
    map.getSource('head').setData(onBoat ? { type: 'FeatureCollection', features: [] }
      : { type: 'Feature', properties: { sac: h.sac }, geometry: { type: 'Point', coordinates: [h.lon, h.lat] } });
  }
  function clearAnim() {
    if (!map || !map.getSource('anim')) return;
    map.getSource('anim').setData({ type: 'FeatureCollection', features: [] });
    map.getSource('head').setData({ type: 'FeatureCollection', features: [] });
    if (boatMarker) boatMarker.getElement().hidden = true;
  }
  function startAnim(pts, state, view, render, onEnd) {
    stopAnim(false);
    const kmMax = pts[pts.length - 1].km;
    if (!tracks.has(pts)) tracks.set(pts, headingTrack(pts, view.W, view.S));
    const heading = tracks.get(pts);
    const a = anim = { running: true, speed: state.speed, cam: state.cam, last: performance.now(),
      bearing: map ? map.getBearing() : 0, center: null, pad: null,
      orbitStart: performance.now(), orbitBase: map ? map.getBearing() : 0, delayUntil: 0 };
    if (map && a.cam !== 'fixed' && !reduceMotion) {
      const h = headAt(pts, state.km);
      a.bearing = a.cam === 'drone' ? heading(state.km) : map.getBearing();
      map.easeTo({ center: [h.lon, h.lat], zoom: view.zoom, pitch: view.pitch, bearing: a.bearing, duration: 1600, padding: centerPad(), essential: true });
      a.delayUntil = performance.now() + 1650;
      a.orbitBase = a.bearing;
    }
    const step = now => {
      if (a !== anim || !a.running) return;
      const dt = Math.min(0.1, (now - a.last) / 1000); a.last = now;
      if (now < a.delayUntil) { a.orbitStart = now; requestAnimationFrame(step); return; }
      if (a.holdUntil && now < a.holdUntil) { requestAnimationFrame(step); return; }   // the walker stops while the rocks fall
      state.km = Math.min(kmMax, state.km + dt / view.secPerKm * a.speed);
      render(state.km, false);
      if (map && a.cam !== 'fixed') {
        const h = headAt(pts, state.km);
        const fc = ease(dt, 0.12);
        a.center = a.center ? { lon: a.center.lon + (h.lon - a.center.lon) * fc, lat: a.center.lat + (h.lat - a.center.lat) * fc } : h;
        if (a.cam === 'drone') {
          // turn towards the smoothed heading, gently and never faster than maxRate
          const diff = angleDiff(a.bearing, heading(state.km));
          const maxRate = 12 * Math.sqrt(a.speed) * dt;
          a.bearing += Math.max(-maxRate, Math.min(maxRate, diff * ease(dt, 1.1)));
        } else {
          a.bearing = a.orbitBase + (now - a.orbitStart) / 1000 * 8;
        }
        const target = centerPad();
        if (!a.pad) a.pad = { ...target };
        const fp = ease(dt, 0.35);
        for (const k in target) a.pad[k] += (target[k] - a.pad[k]) * fp;
        map.jumpTo({ center: [a.center.lon, a.center.lat], bearing: a.bearing, pitch: view.pitch, zoom: view.zoom, padding: a.pad });
      }
      if (state.km >= kmMax) { a.running = false; render(kmMax, true); onEnd(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function stopAnim(clear) {
    if (anim) anim.running = false;
    anim = null;
    if (clear) clearAnim();
  }

  let terrainOn = true;
  const terrain = { source: 'dem', exaggeration: 1.3 };

  map.on('load', () => {
    try { map.setTerrain(terrain); } catch (e) { terrainOn = false; }
    try { if (map.setSky) map.setSky({ 'sky-color': '#9cc7d8', 'horizon-color': '#f4d6a0', 'fog-color': '#cfe0e4', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.9 }); } catch (e) { /* sky optional */ }

    map.addSource('trace', { type: 'geojson', data: { type: 'FeatureCollection', features: T.trace.features.concat(BOAT_FEATURES) } });
    const notBoat = ['!=', ['get', 'sac'], 'bateau'];
    const isBoat = ['==', ['get', 'sac'], 'bateau'];
    map.addLayer({ id: 'trace-boat-casing', type: 'line', source: 'trace', filter: isBoat, layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#0b1014', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 7.5] } });
    map.addLayer({ id: 'trace-boat', type: 'line', source: 'trace', filter: isBoat, layout: { 'line-cap': 'round' },
      paint: { 'line-color': COL.boat, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4.5] } });
    map.addLayer({ id: 'trace-casing', type: 'line', source: 'trace', filter: notBoat, layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': COL.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4.5, 14, 9], 'line-opacity': 0.85 } });
    map.addLayer({ id: 'trace', type: 'line', source: 'trace', filter: notBoat, layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['match', ['get', 'sac'], 'avec', COL.pack, COL.trail], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 14, 5] } });

    map.addSource('anim', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('head', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'anim-casing', type: 'line', source: 'anim', filter: ['!=', ['get', 'sac'], 2], layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': COL.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 6, 14, 11] } });
    map.addLayer({ id: 'anim', type: 'line', source: 'anim', filter: ['!=', ['get', 'sac'], 2], layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['match', ['get', 'sac'], 1, COL.pack, 2, COL.boat, COL.trail], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3.5, 14, 6.5] } });
    map.addLayer({ id: 'head', type: 'circle', source: 'head',
      paint: { 'circle-radius': 7, 'circle-color': ['match', ['get', 'sac'], 1, COL.pack, COL.trail], 'circle-stroke-color': COL.casing, 'circle-stroke-width': 3 } });

    /* camps and summits are drawn by the map itself (not HTML markers) so they stay
       glued to their coordinates on the 3D relief, exactly like the trace */
    map.addImage('peak', peakImage(), { pixelRatio: 2 });
    camps.forEach((c, i) => map.addImage(`camp-${c.id}`, campImage(String(i + 1), undefined, i === 0 ? COL_START_FILL : undefined), { pixelRatio: 2 }));
    map.addImage('finish', finishImage(), { pixelRatio: 2 });
    map.addImage('alert', alertImage(), { pixelRatio: 2 });
    ['sat', 'topo'].forEach(t => {
      ['photo', 'info'].forEach(k => map.addImage(`${k}-${t}`, badgeImage(k, t), { pixelRatio: 2 }));
      map.addImage(`photo-fav-${t}`, badgeImage('photo', t, true), { pixelRatio: 2 });
      map.addImage(`info-stack-${t}`, badgeImage('info', t, false, true), { pixelRatio: 2 });   // no pointer, sits on a photo pin
    });
    VILLAGES.forEach(v => map.addImage(`village-${v.name}`, villageImage(v.name, v.beside), { pixelRatio: 2 }));
    map.addSource('villages', { type: 'geojson', data: { type: 'FeatureCollection', features: VILLAGES.map(v =>
      ({ type: 'Feature', properties: { icon: `village-${v.name}` }, geometry: { type: 'Point', coordinates: [v.lon, v.lat] } })) } });
    map.addLayer({ id: 'villages', type: 'symbol', source: 'villages', minzoom: 9,
      layout: { 'icon-image': ['get', 'icon'], 'icon-anchor': 'left', 'icon-offset': [-4, 0], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport' },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 9.6, 0.9] } });
    map.addSource('pois', { type: 'geojson', data: { type: 'FeatureCollection', features: [
      ...camps.map(c => ({ type: 'Feature', properties: { kind: 'camp', cid: c.id, icon: `camp-${c.id}` }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })),
      ...T.summits.map(x => ({ type: 'Feature', properties: { kind: 'peak', name: x.sommet, icon: 'peak' }, geometry: { type: 'Point', coordinates: [x.lon, x.lat] } })),
      { type: 'Feature', properties: { kind: 'finish', icon: 'finish' }, geometry: { type: 'Point', coordinates: [FINISH.lon, FINISH.lat] } },
      ...ALERTS.map(a => ({ type: 'Feature', properties: { kind: 'alert', aid: a.id, icon: 'alert' }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } })),
      ...PHOTOS.map(a => ({ type: 'Feature', properties: { kind: 'photo', aid: a.id, fav: a.favori === 'oui' }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } })),
      // an info at the same spot as a photo sits just above the photo pin
      ...INFOS.map(a => ({ type: 'Feature', properties: { kind: 'info', aid: a.id,
        stack: PHOTOS.some(p => Math.abs(p.lat - a.lat) < 0.0004 && Math.abs(p.lon - a.lon) < 0.001) }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } })),
    ] } });
    const sym = { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport' };
    map.addLayer({ id: 'peaks', type: 'symbol', source: 'pois', filter: ['==', ['get', 'kind'], 'peak'], layout: { ...sym, 'icon-anchor': 'bottom' } });
    map.addLayer({ id: 'finish', type: 'symbol', source: 'pois', filter: ['==', ['get', 'kind'], 'finish'], layout: sym });
    map.addLayer({ id: 'alerts', type: 'symbol', source: 'pois', filter: ['==', ['get', 'kind'], 'alert'], layout: { ...sym, 'icon-anchor': 'bottom' } });
    map.on('click', 'alerts', e => { const a = ALERTS.find(x => x.id === e.features[0].properties.aid); if (a) openAlert(a); });
    map.addLayer({ id: 'photos', type: 'symbol', source: 'pois', filter: ['==', ['get', 'kind'], 'photo'], layout: { ...sym, 'icon-image': photoIconExpr('sat'), 'icon-anchor': 'bottom', 'icon-offset': [0, -2], 'symbol-sort-key': ['case', ['get', 'fav'], 1, 0], 'icon-size': ['case', ['get', 'fav'], 1.25, 1] } });
    map.addLayer({ id: 'infos', type: 'symbol', source: 'pois', filter: ['==', ['get', 'kind'], 'info'], layout: { ...sym, 'icon-image': 'info-sat', 'icon-anchor': 'bottom', 'icon-offset': [0, -2] } });
    // field of view of the open photo: a turquoise wedge that fades with distance
    map.on('move', drawFov);
    map.on('click', 'photos', e => { const a = PHOTOS.find(x => x.id === e.features[0].properties.aid); if (a) openRoutePoint('photos', a); });
    map.on('click', 'infos', e => { const a = INFOS.find(x => x.id === e.features[0].properties.aid); if (a) openRoutePoint('infos', a); });
    updateLayers();
    map.addLayer({ id: 'camps', type: 'symbol', source: 'pois', filter: ['==', ['get', 'kind'], 'camp'], layout: { ...sym, 'icon-size': 1 } });
    map.on('click', 'camps', e => { const c = camps.find(x => x.id === e.features[0].properties.cid); if (c) openCamp(c); });
    map.on('click', 'peaks', e => { const x = T.summits.find(q => q.sommet === e.features[0].properties.name); if (x) openSummit(x); });
    ['camps', 'peaks', 'alerts', 'photos', 'infos'].forEach(l => {
      map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
    });
    setActive(activeCamp);

    map.on('click', 'trace', e => {
      if (map.queryRenderedFeatures(e.point, { layers: ['camps', 'peaks', 'alerts', 'photos', 'infos'] }).length) return;
      const p = e.features[0].properties;
      new maplibregl.Popup({ closeButton: false, offset: 8 }).setLngLat(e.lngLat)
        .setDOMContent(el('div', null,
          el('div', { class: 'pop-title' }, p.name),
          el('div', { class: 'pop-meta' }, `J${p.day} · ${day(p.date).d} ${day(p.date).m} · départ ${p.start}`),
          el('div', { class: 'pop-meta' }, `${nf(p.km, 1)} km · ${nf(p.dplus)} m D+ · ${p.sac === 'avec' ? 'avec le sac' : 'sans sac'}`)))
        .addTo(map);
    });
    map.on('mouseenter', 'trace', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'trace', () => { map.getCanvas().style.cursor = ''; });

    overview();
  });

  map.on('error', e => {
    if (e && e.error && /Failed to fetch|NetworkError/.test(String(e.error.message)) && !map.areTilesLoaded()) {
      document.getElementById('map-error').hidden = false;
    }
  });

  /* icons drawn on a canvas for the map's symbol layers (no font server needed) */
  const COL_START_FILL = '#22a559';   // bivouac 1: the whole badge green, like a start flag
  function campImage(label, ring = '#ffffff', fill = COL.camp) {
    const S = 2, W = 30, cv = document.createElement('canvas'); cv.width = cv.height = W * S;
    const g = cv.getContext('2d'); g.scale(S, S);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 5; g.shadowOffsetY = 1.5;
    g.beginPath(); g.arc(W / 2, W / 2, 12, 0, 2 * Math.PI); g.fillStyle = ring; g.fill();
    g.shadowColor = 'transparent';
    g.beginPath(); g.arc(W / 2, W / 2, 10, 0, 2 * Math.PI); g.fillStyle = fill; g.fill();
    g.fillStyle = '#fff'; g.font = '700 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, W / 2, W / 2 + 0.5);
    return g.getImageData(0, 0, W * S, W * S);
  }
  function finishImage() {   // round badge with a chequered flag
    const S = 2, W = 32, cv = document.createElement('canvas'); cv.width = cv.height = W * S;
    const g = cv.getContext('2d'); g.scale(S, S);
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 5; g.shadowOffsetY = 1.5;
    g.beginPath(); g.arc(16, 16, 13, 0, 2 * Math.PI); g.fillStyle = '#fff'; g.fill(); g.shadowColor = 'transparent';
    g.beginPath(); g.arc(16, 16, 11, 0, 2 * Math.PI); g.fillStyle = COL.finish; g.fill();
    g.fillStyle = '#fff'; g.fillRect(10, 8, 1.6, 16);                       // pole
    const x0 = 11.6, y0 = 8.5, c = 2.6;                                       // 4 × 3 chequers
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? COL.finish : '#fff'; g.fillRect(x0 + i * c, y0 + j * c, c, c); }
    g.strokeStyle = '#fff'; g.lineWidth = .8; g.strokeRect(x0, y0, 4 * c, 3 * c);
    return g.getImageData(0, 0, W * S, W * S);
  }
  function villageImage(name, beside) {   // small dot + name, white with a dark halo
    const S = 2, font = '600 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    const probe = document.createElement('canvas').getContext('2d'); probe.font = font;
    const x0 = beside ? 20 : 11, W = Math.ceil(x0 + probe.measureText(name).width + 6), H = 20;
    const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const g = cv.getContext('2d'); g.scale(S, S);
    g.font = font; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 3;
    if (!beside) { g.beginPath(); g.arc(4, H / 2, 2.4, 0, 2 * Math.PI); g.fillStyle = 'rgba(255,255,255,.95)'; g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText(name, x0, H / 2 + .5); g.fillText(name, x0, H / 2 + .5);
    return g.getImageData(0, 0, W * S, H * S);
  }
  /* photo: turquoise badge with a camera (black on the satellite map, white on the topo map);
     info: round badge with an "i" (dark on the satellite map, white on the topo map) */
  function badgeImage(kind, theme, fav, noTail) {
    const S = 2, W = 28, H = 30, cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const g = cv.getContext('2d'); g.scale(S, S);
    const sat = theme === 'sat';
    let ring = kind === 'info' && sat ? '#e9eef0' : '#fff';
    if (fav) {   // the favourite photo: a gold ring instead of the white one
      ring = g.createLinearGradient(4, 1, 24, 28);
      ring.addColorStop(0, '#fff1b8'); ring.addColorStop(.45, '#e9b93c'); ring.addColorStop(1, '#a8741a');
    }
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
    if (!noTail) { g.beginPath(); g.moveTo(14, 29); g.lineTo(10, 22); g.lineTo(18, 22); g.closePath(); g.fillStyle = ring; g.fill(); }
    g.beginPath(); g.arc(14, 12, 11.5, 0, 2 * Math.PI); g.fillStyle = ring; g.fill(); g.shadowColor = 'transparent';
    if (kind === 'photo') {
      const cam = sat ? '#111418' : '#fff';
      g.beginPath(); g.arc(14, 12, fav ? 9.2 : 9.8, 0, 2 * Math.PI); g.fillStyle = COL_PHOTO; g.fill();
      g.fillStyle = cam; roundRect(g, 7.6, 8.4, 12.8, 9, 2); g.fill(); roundRect(g, 11.3, 6.6, 5.4, 2.6, .8); g.fill();
      g.beginPath(); g.arc(14, 12.9, 2.7, 0, 2 * Math.PI); g.fillStyle = COL_PHOTO; g.fill();
    } else {
      g.beginPath(); g.arc(14, 12, 10, 0, 2 * Math.PI); g.fillStyle = sat ? '#1b2328' : '#fff'; g.fill();
      if (!sat) { g.lineWidth = 1.2; g.strokeStyle = '#111418'; g.stroke(); }
      g.fillStyle = sat ? '#9fd0ff' : '#2f6fb0';
      g.beginPath(); g.arc(14, 7.4, 1.6, 0, 2 * Math.PI); g.fill(); roundRect(g, 12.6, 10.2, 2.8, 8, 1.3); g.fill();
    }
    return g.getImageData(0, 0, W * S, H * S);
  }
  const photoIconExpr = base => ['case', ['get', 'fav'], `photo-fav-${base}`, `photo-${base}`];
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function alertImage() {   // yellow and black warning triangle
    const S = 2, W = 26, H = 24, cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const g = cv.getContext('2d'); g.scale(S, S);
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
    g.beginPath(); g.moveTo(13, 2.2); g.lineTo(24, 21.5); g.lineTo(2, 21.5); g.closePath();
    g.lineJoin = 'round'; g.fillStyle = '#f4d35e'; g.fill(); g.shadowColor = 'transparent';
    g.lineWidth = 2.2; g.strokeStyle = '#111418'; g.stroke();
    g.fillStyle = '#111418'; g.fillRect(11.9, 8.5, 2.2, 7.2); g.beginPath(); g.arc(13, 18.3, 1.3, 0, 2 * Math.PI); g.fill();
    return g.getImageData(0, 0, W * S, H * S);
  }
  function peakImage() {
    const S = 2, W = 24, H = 22, cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const g = cv.getContext('2d'); g.scale(S, S);
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
    g.beginPath(); g.moveTo(12, 2.5); g.lineTo(21.5, 19); g.lineTo(2.5, 19); g.closePath();
    g.fillStyle = '#111418'; g.fill(); g.shadowColor = 'transparent';
    g.lineJoin = 'round'; g.lineWidth = 2.4; g.strokeStyle = COL.trail; g.stroke();
    return g.getImageData(0, 0, W * S, H * S);
  }
  function setActive(id) {
    activeCamp = id == null ? -1 : id;
    if (map && map.getLayer && map.getLayer('camps')) map.setLayoutProperty('camps', 'icon-size', ['case', ['==', ['get', 'cid'], activeCamp], 1.25, 1]);
  }
  /* summit card: name, altitude, air temperature when he stood there */
  let popupTimer = null;
  function summitPopup(s, ttl) {
    if (!map) return;
    if (popup) popup.remove();
    clearTimeout(popupTimer);
    popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 24, anchor: 'bottom', className: 'peak-pop', maxWidth: '260px' })
      .setLngLat([s.lon, s.lat])
      .setDOMContent(el('div', { class: 'peak-card' },
        el('div', { class: 'peak-name' }, peakIcon(), s.sommet),
        el('div', { class: 'peak-figs' },
          el('span', { class: 'peak-alt' }, nf(s.hauteur_officielle_m || s.alt_gps_m), el('small', null, ' m')),
          s.temp_c != null ? el('span', { class: 'peak-temp' }, `${nf(s.temp_c, 0)} °C`) : null,
          (T.ressentis || {})[s.sommet] ? el('span', { class: 'peak-feel' }, `ressenti ${T.ressentis[s.sommet].sommet} °C`) : null)))
      .addTo(map);
    if (ttl) { const mine = popup; popupTimer = setTimeout(() => { if (popup === mine) { mine.remove(); popup = null; } }, ttl); }
  }
  /* alert passed during a replay: a small discreet card with its title, above the warning sign */
  let alertPop = null, alertPopTimer = 0;
  function alertPopup(a, ttl, kind = 'alert') {
    if (!map) return;
    if (alertPop) alertPop.remove();
    clearTimeout(alertPopTimer);
    const mine = alertPop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 22, anchor: 'bottom', className: `peak-pop alert-pop pop-${kind}`, maxWidth: '220px' })
      .setLngLat([a.lon, a.lat])
      .setDOMContent(el('div', { class: 'alert-card' }, a.titre))
      .addTo(map);
    alertPopTimer = setTimeout(() => { if (alertPop === mine) { mine.remove(); alertPop = null; } }, ttl);
  }
  /* checkpoint: one shockwave, a flash of light, an aura and a burst of sparks,
     like a chest opening in a video game. It follows its point on the map while it plays. */
  const fxLayer = document.body.appendChild(el('div', { class: 'fx-layer', 'aria-hidden': 'true' }));
  const bursts = [];
  let fxLoop = 0;
  function burst(kind, lon, lat, effect) {
    if (reduceMotion || !map) return;
    let node, life = 1800;
    if (kind === 'warn') {
      // warning: a triangle-shaped shockwave, then the "!" swells a little and shakes
      const tri = () => { const s = sv('svg', { viewBox: '0 0 40 36' }); s.append(sv('path', { d: 'M20 2 38 34H2Z' })); return s; };
      const bang = el('i', { class: 'fx-bang' }); bang.append(warnIcon());
      node = el('div', { class: `fx fx-warn${effect ? ` fx-${effect}` : ''}` },
        el('i', { class: 'fx-aura' }), el('i', { class: 'fx-flash' }), el('i', { class: 'fx-tri' }, tri()), el('i', { class: 'fx-tri fx-tri2' }, tri()),
        effect === 'eboulement' ? [el('i', { class: 'fx-dust' }), el('i', { class: 'fx-dust fx-dust2' }),
          ...Array.from({ length: 16 }, (_, i) => el('i', { class: 'fx-rock', style: `--x:${((i * 37) % 16 - 7.5) * 6}px;--y:${125 + (i * 23) % 70}px;--rot:${(i % 2 ? 1 : -1) * (160 + i * 35)}deg;--d:${120 + i * 85}ms;--s:${4 + (i % 4) * 1.6}px` }))] : null,
        bang);
      life = effect === 'eboulement' ? 3900 : 2400;
    } else {
      const star = kind === 'fav' ? el('i', { class: 'fx-star' }, (() => { const s = sv('svg', { viewBox: '0 0 40 40' });
        s.append(sv('path', { d: 'M20 2.5 25.2 14l12.5 1.3-9.4 8.4 2.7 12.3L20 29.6 9 36l2.7-12.3-9.4-8.4L14.8 14Z' })); return s; })()) : null;
      node = el('div', { class: `fx fx-${kind}` },
        el('i', { class: 'fx-aura' }), el('i', { class: 'fx-beam' }), el('i', { class: 'fx-flash' }), el('i', { class: 'fx-wave' }), star,
        Array.from({ length: 12 }, (_, i) => el('i', { class: 'fx-spark', style: `--a:${i * 30 + (i % 2 ? 9 : -6)}deg;--d:${(i % 3) * 40}ms;--r:${46 + (i % 4) * 9}px` })));
    }
    fxLayer.append(node);
    if (kind === 'fav') life = 2600;
    bursts.push({ node, lon, lat, dy: kind === 'peak' ? -9 : kind === 'warn' ? -11 : kind === 'fav' ? -18 : 0, t0: performance.now(), life });
    if (!fxLoop) fxLoop = requestAnimationFrame(moveBursts);
  }
  function moveBursts(now) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      if (now - b.t0 > b.life) { b.node.remove(); bursts.splice(i, 1); continue; }
      const pt = map.project([b.lon, b.lat]);
      b.node.style.transform = `translate(${pt.x.toFixed(1)}px, ${(pt.y + b.dy).toFixed(1)}px)`;
    }
    fxLoop = bursts.length ? requestAnimationFrame(moveBursts) : 0;
  }
  fireCheckpoint = (c, keepPopup) => {
    if (c.type === 'summit') { burst('peak', c.s.lon, c.s.lat); summitPopup(c.s, keepPopup ? 0 : 5000); }
    else if (c.type === 'finish') burst('finish', FINISH.lon, FINISH.lat);
    else if (c.type === 'info') { if (infosOn) alertPopup(c.a, 4500, 'info'); }
    else if (c.type === 'photo') {
      if (!photosOn) return;
      if (c.a.favori === 'oui') {   // the favourite point: a golden star, a golden card, and the walker stops a moment
        burst('fav', c.a.lon, c.a.lat); alertPopup(c.a, 5000, 'fav');
        if (anim) anim.holdUntil = performance.now() + 2200;
      } else if (c.a.nom_en_replay === 'oui') alertPopup(c.a, 4500, 'photo');   // only the photos whose name he wants shown
    }
    else if (c.type === 'alert') {
      if (!alertsOn) return;
      burst('warn', c.a.lon, c.a.lat, c.a.effet);
      if (c.a.effet === 'eboulement') { if (anim) anim.holdUntil = performance.now() + 3000; }   // the falling stones say it all
      else alertPopup(c.a, 4500);
    }
    else burst('camp', c.c.lon, c.c.lat);
  };

  /* boat head: a small boat that sails the arc */
  {
    const node = el('div', { class: 'm-boat', 'aria-hidden': 'true' });
    const svg = sv('svg', { viewBox: '0 0 24 24' });
    svg.append(sv('path', { d: 'M3 14h18l-2.6 4.6a2 2 0 0 1-1.7 1H7.3a2 2 0 0 1-1.7-1z', fill: '#fff' }),
      sv('path', { d: 'M12 3v9M12 4l6 7h-6', fill: 'none', stroke: '#fff', 'stroke-width': '1.8', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    node.append(svg);
    node.hidden = true;
    boatMarker = new maplibregl.Marker({ element: node }).setLngLat([13, 68]).addTo(map);
  }

  /* controls */
  document.getElementById('btn-overview').addEventListener('click', () => { showHome(); overview(); });
  const btnRelief = document.getElementById('btn-relief');
  btnRelief.addEventListener('click', () => {
    terrainOn = !terrainOn;
    try { map.setTerrain(terrainOn ? terrain : null); } catch (e) { terrainOn = false; }
    btnRelief.setAttribute('aria-pressed', String(terrainOn));
    map.easeTo({ pitch: terrainOn ? 55 : 0, duration: reduceMotion ? 0 : 900 });
  });
  const toggle = (id, get, set) => {
    const b = document.getElementById(id);
    b.addEventListener('click', () => { set(!get()); b.setAttribute('aria-pressed', String(get())); updateLayers(); });
  };
  toggle('btn-alerts', () => alertsOn, v => { alertsOn = v; });
  toggle('btn-photos', () => photosOn, v => { photosOn = v; });
  toggle('btn-infos', () => infosOn, v => { infosOn = v; });
  const btnBase = document.getElementById('btn-base');
  let base = 'sat';
  btnBase.addEventListener('click', () => {
    base = base === 'sat' ? 'topo' : 'sat';
    map.setLayoutProperty('sat', 'visibility', base === 'sat' ? 'visible' : 'none');
    map.setLayoutProperty('topo', 'visibility', base === 'topo' ? 'visible' : 'none');
    btnBase.textContent = base === 'sat' ? 'Satellite' : 'Carte topo';
    document.body.classList.toggle('base-topo', base === 'topo');
    if (map.getLayer('villages')) map.setLayoutProperty('villages', 'visibility', base === 'sat' ? 'visible' : 'none');
    if (map.getLayer('photos')) map.setLayoutProperty('photos', 'icon-image', photoIconExpr(base));
    infoBase = base; infoLayout();
    // the trace keeps a white edge on the imagery and gets a black one on the pale topo map
    const edge = base === 'sat' ? COL.casing : '#0b1014';
    ['trace-casing', 'anim-casing'].forEach(l => map.getLayer(l) && map.setPaintProperty(l, 'line-color', edge));
  });

  showHome();
  layoutChanged();
})();

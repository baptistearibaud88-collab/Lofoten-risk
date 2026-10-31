/* Traversée des Lofoten — carte 3D : trace, bivouacs, sommets, étapes et traversée complète animées.
   Les données viennent de data.js (window.TREK), généré par src/export_site.py. */
(function () {
  'use strict';

  const T = window.TREK;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => window.matchMedia('(max-width: 820px)').matches;
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const COL = { pack: '#1d3f8f', trail: '#e0472f', casing: '#f4f7fa' };
  const nf = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

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
  const day = iso => { const d = new Date(iso + 'T12:00:00'); return { d: d.getDate(), m: MONTHS[d.getMonth()] }; };
  const nightLabel = (night, wake) => { const a = day(night), b = day(wake); return `nuit du ${a.d} au ${b.d} ${b.m}`; };
  const hm = min => min == null ? '—' : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
  const hms = s => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

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
  function buildSeq(ids) {
    const pts = [];
    let km = 0, mov = 0, kcal = 0, dplus = 0, prevAlt = null;
    ids.forEach((id, seg) => {
      const a = ACTS[id];
      a.pts.forEach((p, j) => {
        km += j ? p[3] : 0; mov += j ? p[4] : 0; kcal += j ? p[6] : 0;
        if (j && prevAlt != null && p[2] > prevAlt) dplus += p[2] - prevAlt;
        prevAlt = p[2];
        pts.push({ lon: p[0], lat: p[1], alt: p[2], km, mov, hr: p[5], kcal, dplus, heure: p[7],
          sac: a.sac === 'avec' ? 1 : 0, seg, act: a.name, day: a.day });
      });
      prevAlt = null;
    });
    return pts;
  }

  /* ---------- stats ---------- */
  const S = T.stats;
  const statItems = [
    ['Distance', `${nf(S.km)} km`], ['Dénivelé +', `${nf(S.dplus)} m`], ['Jours', S.days],
    ['Bivouacs', S.camps], ['Sommets', S.summits], ['Avec le sac', `${nf(S.bag_hours, 1)} h`],
  ];
  document.getElementById('stats').append(...statItems.map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v))));

  /* ---------- shared state ---------- */
  const panel = document.getElementById('panel-inner');
  const markers = new Map();
  let map = null, popup = null, rubric = 'camps';
  let anim = null;

  /* ---------- panel: home with three rubrics ---------- */
  const RUBRICS = [['camps', 'Bivouacs'], ['summits', 'Sommets'], ['etapes', 'Étapes']];

  function showHome(which) {
    stopAnim(true);
    setActive(null);
    highlight(null);
    if (which) rubric = which;
    const body = el('div');
    const tabs = el('div', { class: 'tabs rubrics', role: 'tablist' }, RUBRICS.map(([id, label]) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(id === rubric), onclick: () => showHome(id) }, label)));
    if (rubric === 'camps') {
      body.append(
        el('p', { class: 'note' }, 'Bivouac 100 % autonome, tente montée chaque soir. Choisis-en un pour voler jusqu’à lui et lire sa nuit.'),
        el('ul', { class: 'camp-list' }, camps.map((c, i) => el('li', null,
          el('button', { type: 'button', class: 'camp-row', onclick: () => openCamp(c) },
            el('span', { class: 'camp-num' }, String(i + 1).padStart(2, '0')),
            el('span', { class: 'camp-name' }, c.name),
            el('span', { class: 'camp-dates' }, c.nights.map(n => day(n.night).d).join(' + ') + ' ' + day(c.nights[0].night).m))))));
    } else if (rubric === 'summits') {
      body.append(
        el('p', { class: 'note' }, 'Neuf sommets en trail, sans le sac. Choisis-en un pour rejouer la montée.'),
        el('ul', { class: 'camp-list' }, T.summits.map(s => el('li', null,
          el('button', { type: 'button', class: 'camp-row', onclick: () => openSummit(s) },
            el('span', { class: 'camp-num' }, '▲'),
            el('span', { class: 'camp-name' }, s.sommet),
            el('span', { class: 'camp-dates' }, `${nf(s.alt_gps_m)} m`))))));
    } else {
      body.append(
        el('p', { class: 'note' }, 'La marche avec le gros sac, de bivouac en bivouac. Les J6 et J8 se passent sans sac : ils sont dans les sommets.'),
        el('ul', { class: 'camp-list' }, T.etapes.map(e => {
          const seq = buildSeq(e.acts), last = seq[seq.length - 1];
          return el('li', null,
            el('button', { type: 'button', class: 'camp-row stage-row', onclick: () => openEtape(e) },
              el('span', { class: 'camp-num' }, `J${e.day}`),
              el('span', { class: 'stage-main' },
                el('span', { class: 'camp-name' }, `${e.from} → ${e.to}`),
                el('span', { class: 'stage-meta' }, `${nf(last.km, 1)} km · ${nf(last.dplus)} m D+ · ${hms(last.mov)}`))));
        })));
    }
    panel.replaceChildren(el('h2', null, 'Neuf jours, sept bivouacs'), tabs, body,
      el('p', { class: 'foot' }, 'Positions, altitudes et fréquence cardiaque : montre GPS Garmin. Météo : réanalyse ERA5. Sommeil : Garmin Connect.'));
    panel.scrollTop = 0;
  }

  function backButton(label, to) {
    return el('button', { type: 'button', class: 'back', onclick: () => { showHome(to); overview(); } }, `← ${label}`);
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
      el('div', null, el('dt', null, 'Minimum au camp'), el('dd', null, `${nf(w.temp_min_camp, 1)} °C`)),
      el('div', null, el('dt', null, 'Pluie'), el('dd', null, `${nf(w.rain_mm, 1)} mm`)),
      el('div', null, el('dt', null, 'Rafales max'), el('dd', null, `${nf(w.gust_max)} km/h`)),
      el('div', null, el('dt', null, 'Nuages'), el('dd', null, `${nf(w.cloud_pct)} %`))));
    kids.push(el('p', { class: 'meta' }, `ERA5 ${nf(w.temp_min_era5, 1)} °C, corrigé de l’altitude du camp (−6,5 °C par 1 000 m).`));
    if (n.bag_next_morning_kg != null) {
      kids.push(el('h3', null, `Le lendemain matin · J${n.next_day}`));
      kids.push(el('dl', { class: 'kv' }, el('div', null, el('dt', null, 'Sac, sans eau'), el('dd', null, `≈ ${nf(n.bag_next_morning_kg, 1)} kg`))));
      kids.push(el('p', { class: 'meta' }, T.bag_note));
    }
    return kids;
  }

  function openCamp(c, nightIdx = 0) {
    stopAnim(true);
    highlight(null);
    setActive(c.id);
    flyToCamp(c);
    const body = el('div');
    const render = i => body.replaceChildren(el('p', { class: 'note' }, c.nights[i].note || ''), ...nightBlock(c.nights[i]));
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
      tabs, body);
    render(nightIdx);
    panel.scrollTop = 0;
  }

  /* ---------- profile chart ---------- */
  function profileChart(pts, marks, onSeek) {
    const W = 360, H = 150, L = 30, R = 30, Tp = 12, B = 20;
    const kmMax = pts[pts.length - 1].km || 1;
    const alts = pts.map(p => p.alt), hrs = pts.map(p => p.hr).filter(v => v != null);
    const aMax = Math.max(100, Math.ceil(Math.max(...alts) / 100) * 100);
    const hMin = hrs.length ? Math.floor(Math.min(...hrs) / 10) * 10 : 60, hMax = hrs.length ? Math.ceil(Math.max(...hrs) / 10) * 10 : 180;
    const x = km => L + (km / kmMax) * (W - L - R);
    const ya = a => Tp + (1 - a / aMax) * (H - Tp - B);
    const yh = h => Tp + (1 - (h - hMin) / Math.max(1, hMax - hMin)) * (H - Tp - B);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'profile', role: 'img', 'aria-label': `Profil d’altitude et fréquence cardiaque, ${nf(kmMax, 1)} km` });
    [0, 0.5, 1].forEach(f => {
      svg.append(sv('line', { x1: L, x2: W - R, y1: ya(f * aMax), y2: ya(f * aMax), class: 'grid' }));
      const t = sv('text', { x: L - 5, y: ya(f * aMax) + 3, class: 'axis', 'text-anchor': 'end' }); t.textContent = nf(f * aMax); svg.append(t);
      const hv = hMin + f * (hMax - hMin);
      const t2 = sv('text', { x: W - R + 5, y: yh(hv) + 3, class: 'axis hr-axis' }); t2.textContent = nf(hv); svg.append(t2);
    });
    [0, kmMax / 2, kmMax].forEach((k, j) => {
      const t = sv('text', { x: x(k), y: H - 5, class: 'axis', 'text-anchor': j === 0 ? 'start' : j === 2 ? 'end' : 'middle' });
      t.textContent = `${nf(k, 1)} km`; svg.append(t);
    });
    let area = `M${x(0)},${ya(0)}`, line = '', hr = '', pen = false;
    pts.forEach((p, k) => {
      area += `L${x(p.km)},${ya(p.alt)}`;
      line += `${k && pts[k - 1].seg === p.seg ? 'L' : 'M'}${x(p.km)},${ya(p.alt)}`;
      if (p.hr == null || (k && pts[k - 1].seg !== p.seg)) pen = false;
      if (p.hr != null) { hr += `${pen ? 'L' : 'M'}${x(p.km)},${yh(p.hr)}`; pen = true; }
    });
    area += `L${x(kmMax)},${ya(0)}Z`;
    svg.append(sv('path', { d: area, class: 'alt-area' }), sv('path', { d: line, class: 'alt-line' }), sv('path', { d: hr, class: 'hr-line' }));
    (marks || []).forEach((m, j, all) => {
      const close = all.length > 1 && Math.abs(x(all[1].km) - x(all[0].km)) < 90;
      const anchor = close ? (j === 0 ? 'end' : 'start') : 'middle';
      svg.append(sv('line', { x1: x(m.km), x2: x(m.km), y1: ya(m.alt), y2: Tp - 2, class: 'mark' }));
      const t = sv('text', { x: Math.min(W - R, Math.max(L, x(m.km) + (anchor === 'end' ? -3 : anchor === 'start' ? 3 : 0))), y: Tp - 3, class: 'axis mark-label', 'text-anchor': anchor });
      t.textContent = m.label; svg.append(t);
    });
    const cur = sv('line', { x1: L, x2: L, y1: Tp, y2: H - B, class: 'cursor' });
    const dot = sv('circle', { r: 3.5, cx: L, cy: ya(pts[0].alt), class: 'cursor-dot' });
    const hit = sv('rect', { x: L, y: Tp, width: W - L - R, height: H - Tp - B, fill: 'transparent', class: 'hit' });
    hit.addEventListener('click', e => {
      const r = svg.getBoundingClientRect();
      onSeek(Math.max(0, Math.min(kmMax, ((e.clientX - r.left) / r.width * W - L) / (W - L - R) * kmMax)));
    });
    svg.append(cur, dot, hit);
    return { svg, move: (km, alt) => { cur.setAttribute('x1', x(km)); cur.setAttribute('x2', x(km)); dot.setAttribute('cx', x(km)); dot.setAttribute('cy', ya(alt)); } };
  }

  /* ---------- player: buttons, live counters, profile ---------- */
  const SPEEDS = [1, 2, 4, 8];
  const CAMS = [['drone', 'Caméra : drone'], ['orbit', 'Caméra : orbite'], ['fixed', 'Caméra : fixe']];

  function player(pts, opts) {
    const counters = {};
    const cnt = (key, label, unit) => el('div', null, el('dt', null, label),
      el('dd', null, (counters[key] = el('span', null, '—')), unit ? el('small', null, ` ${unit}`) : null));
    const board = el('dl', { class: 'kv counters' },
      cnt('km', 'Distance', 'km'), cnt('dplus', 'Dénivelé +', 'm'), cnt('mov', 'En mouvement'),
      cnt('kcal', 'Calories', 'kcal'), cnt('heure', 'Heure'), cnt('hr', 'FC', 'bpm'));
    const where = opts.showWhere ? el('p', { class: 'where' }, '—') : null;
    const chart = profileChart(pts, opts.marks, km => { state.km = km; render(km, true); });
    const state = { km: 0, speed: 1, cam: 'drone' };

    function idxAt(km) {          // last point at or before km
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].km <= km) lo = mid; else hi = mid - 1; }
      return lo;
    }
    function render(km, full) {
      const i = idxAt(km), p = pts[i];
      counters.km.textContent = nf(p.km, 1); counters.dplus.textContent = nf(p.dplus);
      counters.mov.textContent = hms(p.mov); counters.kcal.textContent = nf(p.kcal);
      counters.heure.textContent = p.heure; counters.hr.textContent = nf(p.hr);
      if (where) where.textContent = `J${p.day} · ${p.act}`;
      chart.move(p.km, p.alt);
      drawLine(pts, i, full);
      drawHead(headAt(pts, km, i));
    }

    const playBtn = el('button', { type: 'button', class: 'play' }, '▶ Lancer la trace');
    const speedBtn = el('button', { type: 'button', class: 'ghost', 'aria-label': 'Vitesse' }, '×1');
    speedBtn.addEventListener('click', () => { state.speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length]; speedBtn.textContent = `×${state.speed}`; if (anim) anim.speed = state.speed; });
    const camBtn = el('button', { type: 'button', class: 'ghost' }, CAMS[0][1]);
    camBtn.addEventListener('click', () => {
      const i = (CAMS.findIndex(c => c[0] === state.cam) + 1) % CAMS.length;
      state.cam = CAMS[i][0]; camBtn.textContent = CAMS[i][1];
      if (anim) { anim.cam = state.cam; anim.orbitStart = performance.now(); anim.orbitBase = map ? map.getBearing() : 0; }
    });
    playBtn.addEventListener('click', () => {
      if (anim && anim.running) { anim.running = false; playBtn.textContent = '▶ Reprendre'; return; }
      if (state.km >= pts[pts.length - 1].km) state.km = 0;
      startAnim(pts, state, opts.secPerKm, render, () => { playBtn.textContent = '↺ Rejouer'; opts.onEnd && opts.onEnd(); });
      playBtn.textContent = '❚❚ Pause';
    });
    render(0, true);
    return {
      nodes: [el('div', { class: 'player' }, playBtn, speedBtn, camBtn), where, board].filter(Boolean).concat([ el('h3', null, 'Profil'), chart.svg,
        el('div', { class: 'phase-key' },
          el('span', null, el('i', { class: 'k-alt' }), 'altitude (m)'),
          el('span', null, el('i', { class: 'k-hr' }), 'fréquence cardiaque lissée (bpm)'),
          el('span', null, 'touche le profil pour te déplacer'))]),
      start: () => playBtn.click(),
    };
  }

  /* ---------- panel: one étape (camp to camp, with the pack) ---------- */
  function openEtape(e) {
    stopAnim(true); setActive(null);
    const pts = buildSeq(e.acts);
    highlight(e.acts);
    fitPts(pts);
    const last = pts[pts.length - 1];
    const night = T.camps.find(n => n.next_day === e.day);
    const hrs = pts.map(p => p.hr).filter(v => v != null);
    const pl = player(pts, { secPerKm: 3.2, onEnd: () => fitPts(pts) });
    panel.replaceChildren(
      backButton('Toutes les étapes', 'etapes'),
      el('p', { class: 'eyebrow-sm' }, `Étape J${e.day} · ${day(ACTS[e.acts[0]].date).d} ${day(ACTS[e.acts[0]].date).m} · avec le sac`),
      el('h2', null, `${e.from} → ${e.to}`),
      el('dl', { class: 'kv' },
        el('div', null, el('dt', null, 'Distance'), el('dd', null, nf(last.km, 1), el('small', null, ' km'))),
        el('div', null, el('dt', null, 'Dénivelé +'), el('dd', null, nf(last.dplus), el('small', null, ' m'))),
        el('div', null, el('dt', null, 'En mouvement'), el('dd', null, hms(last.mov))),
        el('div', null, el('dt', null, 'FC moyenne'), el('dd', null, nf(hrs.reduce((a, b) => a + b, 0) / Math.max(1, hrs.length)), el('small', null, ' bpm'))),
        el('div', null, el('dt', null, 'Calories'), el('dd', null, nf(last.kcal), el('small', null, ' kcal'))),
        el('div', null, el('dt', null, 'Sac le matin'), el('dd', null, night && night.bag_next_morning_kg ? `≈ ${nf(night.bag_next_morning_kg, 1)} kg` : '—'))),
      el('h3', null, 'Rejouer l’étape'),
      ...pl.nodes,
      el('p', { class: 'foot' }, `Calories : estimation de la montre. Sac : ${T.bag_note}. Les passages non enregistrés (bateau, liaisons) sont sautés.`));
    panel.scrollTop = 0;
  }

  /* ---------- panel: one summit (the trail outing that reaches it) ---------- */
  function openSummit(s) {
    stopAnim(true); setActive(null);
    const pts = buildSeq([s.activite]);
    highlight([s.activite]);
    fitPts(pts);
    summitPopup(s);
    const tops = T.summits.filter(x => x.activite === s.activite).map(x => {
      let best = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = (p.lat - x.lat) ** 2 + ((p.lon - x.lon) * 0.37) ** 2; if (d < bd) { bd = d; best = i; } });
      return { s: x, i: best };
    });
    const me = tops.find(t => t.s.sommet === s.sommet) || tops[0];
    const atTop = pts[me.i], last = pts[pts.length - 1];
    const hrs = pts.map(p => p.hr).filter(v => v != null);
    const pl = player(pts, { secPerKm: 4, marks: tops.map(t => ({ km: pts[t.i].km, alt: pts[t.i].alt, label: t.s.sommet })), onEnd: () => fitPts(pts) });
    const d = day(s.heure.slice(0, 10));
    panel.replaceChildren(
      backButton('Tous les sommets', 'summits'),
      el('p', { class: 'eyebrow-sm' }, `Sommet · ${d.d} ${d.m} · sans sac`),
      el('h2', null, s.sommet),
      el('p', { class: 'meta' }, s.hauteur_officielle_m ? `${nf(s.alt_gps_m)} m au GPS · ${nf(s.hauteur_officielle_m)} m officiels` : `${nf(s.alt_gps_m)} m au GPS`),
      el('dl', { class: 'kv' },
        el('div', null, el('dt', null, 'Départ'), el('dd', null, nf(pts[0].alt), el('small', null, ' m'))),
        el('div', null, el('dt', null, 'Sommet à'), el('dd', null, s.heure.slice(11, 16))),
        el('div', null, el('dt', null, 'Montée'), el('dd', null, hms(atTop.mov))),
        el('div', null, el('dt', null, 'D+ jusqu’au sommet'), el('dd', null, nf(atTop.dplus), el('small', null, ' m'))),
        el('div', null, el('dt', null, 'Vitesse verticale'), el('dd', null, nf(atTop.dplus / Math.max(1 / 60, atTop.mov / 3600)), el('small', null, ' m/h'))),
        el('div', null, el('dt', null, 'FC max (lissée)'), el('dd', null, nf(hrs.length ? Math.max(...hrs) : null), el('small', null, ' bpm'))),
        el('div', null, el('dt', null, 'Sortie complète'), el('dd', null, nf(last.km, 1), el('small', null, ' km'))),
        el('div', null, el('dt', null, 'Calories'), el('dd', null, nf(last.kcal), el('small', null, ' kcal')))),
      el('h3', null, 'Rejouer la sortie'),
      ...pl.nodes);
    panel.scrollTop = 0;
  }

  /* ---------- panel: the whole traverse ---------- */
  function openTrek() {
    stopAnim(true); setActive(null); highlight([]);
    const pts = buildSeq(T.acts.map(a => a.id));
    const pl = player(pts, { secPerKm: 0.6, showWhere: true, marks: [], onEnd: () => overview() });
    panel.replaceChildren(
      backButton('Retour aux rubriques'),
      el('p', { class: 'eyebrow-sm' }, '14 → 22 juin 2026 · 24 enregistrements'),
      el('h2', null, 'Toute la traversée'),
      el('p', { class: 'note' }, 'Les 159 km dans l’ordre, avec et sans sac, sommets compris. Monte la vitesse pour l’effet, baisse-la pour lire.'),
      ...pl.nodes);
    panel.scrollTop = 0;
    overview();
    setTimeout(pl.start, reduceMotion ? 0 : 2500);
  }
  document.getElementById('btn-trek').addEventListener('click', openTrek);

  /* ---------- map ---------- */
  if (typeof maplibregl === 'undefined') {
    document.getElementById('map-error').hidden = false;
    showHome();
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
        { id: 'bg', type: 'background', paint: { 'background-color': '#0f1720' } },
        { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.05 } },
        { id: 'topo', type: 'raster', source: 'topo', layout: { visibility: 'none' } },
        { id: 'hillshade', type: 'hillshade', source: 'hs',
          paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#0b1118', 'hillshade-highlight-color': '#ffffff' } },
      ],
    },
    center: [13.15, 68.0], zoom: 8.6, pitch: 0, maxPitch: 80,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

  const bounds = new maplibregl.LngLatBounds();
  T.trace.features.forEach(f => f.geometry.coordinates.forEach(c => bounds.extend([c[0], c[1]])));

  function padding() {
    return isPhone()
      ? { top: 110, bottom: Math.round(window.innerHeight * 0.46) + 20, left: 20, right: 20 }
      : { top: 60, bottom: 90, left: 470, right: 420 };
  }
  function overview(instant) {
    if (!map) return;
    map.fitBounds(bounds, { padding: padding(), pitch: 48, bearing: -18, duration: instant || reduceMotion ? 0 : 2400, essential: true });
  }
  function fitPts(pts) {
    if (!map) return;
    const b = new maplibregl.LngLatBounds();
    pts.forEach(p => b.extend([p.lon, p.lat]));
    map.fitBounds(b, { padding: padding(), pitch: 55, bearing: -15, maxZoom: 14, duration: reduceMotion ? 0 : 2200, essential: true });
  }
  function flyToCamp(c) {
    if (!map) return;
    map.flyTo({ center: [c.lon, c.lat], zoom: 13.4, pitch: 62, bearing: (c.id * 47) % 360 - 180, duration: reduceMotion ? 0 : 2800, essential: true, padding: padding() });
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
  let lastLineDraw = 0;
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
  function headAt(pts, km, i) {
    const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    if (b === a || b.seg !== a.seg || b.km <= a.km) return { lon: a.lon, lat: a.lat, sac: a.sac };
    const f = Math.min(1, Math.max(0, (km - a.km) / (b.km - a.km)));
    return { lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f, sac: a.sac };
  }
  function drawHead(h) {
    if (!map || !map.getSource('head')) return;
    map.getSource('head').setData({ type: 'Feature', properties: { sac: h.sac }, geometry: { type: 'Point', coordinates: [h.lon, h.lat] } });
  }
  function clearAnim() {
    if (!map || !map.getSource('anim')) return;
    map.getSource('anim').setData({ type: 'FeatureCollection', features: [] });
    map.getSource('head').setData({ type: 'FeatureCollection', features: [] });
  }
  const bearingTo = (a, b) => {
    const toR = Math.PI / 180, y = Math.sin((b.lon - a.lon) * toR) * Math.cos(b.lat * toR);
    const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lon - a.lon) * toR);
    return Math.atan2(y, x) / toR;
  };
  const lerpAngle = (a, b, t) => { const d = ((b - a + 540) % 360) - 180; return a + d * t; };

  function startAnim(pts, state, secPerKm, render, onEnd) {
    stopAnim(false);
    const kmMax = pts[pts.length - 1].km;
    const trek = kmMax > 60;
    const a = anim = { running: true, speed: state.speed, cam: state.cam, last: performance.now(),
      bearing: map ? map.getBearing() : 0, center: null, orbitStart: performance.now(), orbitBase: map ? map.getBearing() : 0, delayUntil: 0 };
    const zoom = trek ? 12.6 : 14.2, pitch = 64;
    if (map && a.cam !== 'fixed' && !reduceMotion) {
      const h = headAt(pts, state.km, 0);
      map.easeTo({ center: [h.lon, h.lat], zoom, pitch, duration: 1400, padding: padding() });
      a.delayUntil = performance.now() + 1450;
    }
    const step = now => {
      if (a !== anim || !a.running) return;
      const dt = now - a.last; a.last = now;
      if (now < a.delayUntil) { requestAnimationFrame(step); return; }
      state.km = Math.min(kmMax, state.km + (dt / 1000) / secPerKm * a.speed);
      render(state.km, false);
      if (map && a.cam !== 'fixed') {
        const i = pts.findIndex(p => p.km >= state.km);
        const h = headAt(pts, state.km, Math.max(0, (i < 0 ? pts.length : i) - 1));
        a.center = a.center ? { lon: a.center.lon + (h.lon - a.center.lon) * 0.12, lat: a.center.lat + (h.lat - a.center.lat) * 0.12 } : h;
        let bearing;
        if (a.cam === 'drone') {
          const ahead = headAt(pts, Math.min(kmMax, state.km + (trek ? 1.5 : 0.35)), Math.max(0, pts.findIndex(p => p.km >= Math.min(kmMax, state.km + (trek ? 1.5 : 0.35))) - 1));
          const target = (ahead.lon !== h.lon || ahead.lat !== h.lat) ? bearingTo(h, ahead) : a.bearing;
          bearing = a.bearing = lerpAngle(a.bearing, target, 0.025);
        } else {
          bearing = a.bearing = a.orbitBase + (now - a.orbitStart) / 1000 * 9;
        }
        map.jumpTo({ center: [a.center.lon, a.center.lat], bearing, pitch, zoom, padding: padding() });
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
  const terrain = { source: 'dem', exaggeration: 1.35 };

  map.on('load', () => {
    try { map.setTerrain(terrain); } catch (e) { terrainOn = false; }
    try { if (map.setSky) map.setSky({ 'sky-color': '#1d3346', 'horizon-color': '#f2b544', 'fog-color': '#0f1720', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.85 }); } catch (e) { /* sky optional */ }

    map.addSource('trace', { type: 'geojson', data: T.trace });
    map.addLayer({ id: 'trace-casing', type: 'line', source: 'trace', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': COL.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4.5, 14, 9], 'line-opacity': 0.85 } });
    map.addLayer({ id: 'trace', type: 'line', source: 'trace', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['match', ['get', 'sac'], 'avec', COL.pack, COL.trail], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 14, 5] } });

    map.addSource('anim', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('head', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'anim-casing', type: 'line', source: 'anim', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': COL.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 6, 14, 11] } });
    map.addLayer({ id: 'anim', type: 'line', source: 'anim', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['match', ['get', 'sac'], 1, COL.pack, COL.trail], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3.5, 14, 6.5] } });
    map.addLayer({ id: 'head', type: 'circle', source: 'head',
      paint: { 'circle-radius': 7, 'circle-color': ['match', ['get', 'sac'], 1, COL.pack, COL.trail], 'circle-stroke-color': COL.casing, 'circle-stroke-width': 3 } });

    map.on('click', 'trace', e => {
      const p = e.features[0].properties;
      new maplibregl.Popup({ closeButton: false, offset: 6 }).setLngLat(e.lngLat)
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

  /* markers */
  camps.forEach((c, i) => {
    const node = el('button', { type: 'button', class: 'marker m-camp', 'aria-label': `Bivouac ${c.name}` }, String(i + 1));
    node.addEventListener('click', e => { e.stopPropagation(); openCamp(c); });
    markers.set(c.id, node);
    new maplibregl.Marker({ element: node }).setLngLat([c.lon, c.lat]).addTo(map);
  });
  function setActive(id) { markers.forEach((n, k) => n.classList.toggle('active', k === id)); }
  function summitPopup(s) {
    if (!map) return;
    if (popup) popup.remove();
    const d = day(s.heure.slice(0, 10));
    popup = new maplibregl.Popup({ closeButton: false, offset: 16 }).setLngLat([s.lon, s.lat])
      .setDOMContent(el('div', null,
        el('div', { class: 'pop-title' }, s.sommet),
        el('div', { class: 'pop-meta' }, `${nf(s.alt_gps_m)} m au GPS · ${d.d} ${d.m} à ${s.heure.slice(11, 16)}`)))
      .addTo(map);
  }
  T.summits.forEach(s => {
    const node = el('button', { type: 'button', class: 'marker m-peak', 'aria-label': `Sommet ${s.sommet}` });
    const svg = sv('svg', { viewBox: '0 0 20 18', width: '20', height: '18', 'aria-hidden': 'true' });
    svg.append(sv('polygon', { points: '10,1.8 18.4,16.4 1.6,16.4', fill: '#111418', stroke: COL.trail, 'stroke-width': '2.2', 'stroke-linejoin': 'round' }));
    node.append(svg);
    node.addEventListener('click', e => { e.stopPropagation(); rubric = 'summits'; openSummit(s); });
    new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat([s.lon, s.lat]).addTo(map);
  });

  /* controls */
  document.getElementById('btn-overview').addEventListener('click', () => { showHome(); overview(); });
  const btnRelief = document.getElementById('btn-relief');
  btnRelief.addEventListener('click', () => {
    terrainOn = !terrainOn;
    try { map.setTerrain(terrainOn ? terrain : null); } catch (e) { terrainOn = false; }
    btnRelief.setAttribute('aria-pressed', String(terrainOn));
    map.easeTo({ pitch: terrainOn ? 55 : 0, duration: reduceMotion ? 0 : 900 });
  });
  const btnBase = document.getElementById('btn-base');
  let base = 'sat';
  btnBase.addEventListener('click', () => {
    base = base === 'sat' ? 'topo' : 'sat';
    map.setLayoutProperty('sat', 'visibility', base === 'sat' ? 'visible' : 'none');
    map.setLayoutProperty('topo', 'visibility', base === 'topo' ? 'visible' : 'none');
    btnBase.textContent = base === 'sat' ? 'Fond : satellite' : 'Fond : topo';
  });

  showHome();
})();

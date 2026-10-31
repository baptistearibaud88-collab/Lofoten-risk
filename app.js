/* Traversée des Lofoten — carte 3D : trace, bivouacs, sommets, étapes animées.
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

  /* ---------- camps grouped by place ---------- */
  const camps = [];
  for (const n of T.camps) {
    let c = camps.find(x => x.id === n.camp_id);
    if (!c) { c = { id: n.camp_id, name: n.camp, lat: n.lat, lon: n.lon, alt: n.alt, nights: [] }; camps.push(c); }
    c.nights.push(n);
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
  let anim = null;          // running stage animation

  /* ---------- panel: home with three rubrics ---------- */
  const RUBRICS = [['camps', 'Bivouacs'], ['summits', 'Sommets'], ['stages', 'Étapes']];

  function showHome(which) {
    stopAnim(true);
    setActive(null);
    highlightDay(null);
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
        el('p', { class: 'note' }, 'Neuf sommets, tous faits en trail, sans le sac. Choisis-en un pour plonger dessus.'),
        el('ul', { class: 'camp-list' }, T.summits.map(s => el('li', null,
          el('button', { type: 'button', class: 'camp-row', onclick: () => flyToSummit(s) },
            el('span', { class: 'camp-num' }, '▲'),
            el('span', { class: 'camp-name' }, s.sommet),
            el('span', { class: 'camp-dates' }, `${nf(s.alt_gps_m)} m`))))));
    } else {
      body.append(
        el('p', { class: 'note' }, 'Une étape par jour. Choisis-en une, puis lance la trace pour la rejouer avec les compteurs.'),
        el('ul', { class: 'camp-list' }, T.stages.map(st => el('li', null,
          el('button', { type: 'button', class: 'camp-row stage-row', onclick: () => openStage(st) },
            el('span', { class: 'camp-num' }, `J${st.day}`),
            el('span', { class: 'stage-main' },
              el('span', { class: 'camp-name' }, st.title),
              el('span', { class: 'stage-meta' }, `${day(st.date).d} ${day(st.date).m} · ${nf(st.km, 1)} km · ${nf(st.dplus)} m D+`)))))));
    }
    panel.replaceChildren(
      el('h2', null, 'Neuf jours, sept bivouacs'),
      tabs, body,
      el('p', { class: 'foot' }, 'Positions, altitudes et fréquence cardiaque : montre GPS Garmin. Météo : réanalyse ERA5. Sommeil : Garmin Connect.'));
    panel.scrollTop = 0;
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
      kids.push(el('dl', { class: 'kv' },
        el('div', null, el('dt', null, 'Sac, sans eau'), el('dd', null, `≈ ${nf(n.bag_next_morning_kg, 1)} kg`))));
      kids.push(el('p', { class: 'meta' }, T.bag_note));
    }
    return kids;
  }

  function backButton(label) {
    return el('button', { type: 'button', class: 'back', onclick: () => { showHome(); overview(); } }, `← ${label}`);
  }

  function openCamp(c, nightIdx = 0) {
    stopAnim(true);
    highlightDay(null);
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
      backButton('Tous les bivouacs'),
      el('h2', null, c.name),
      el('p', { class: 'meta' }, `${c.nights.length > 1 ? `${c.nights.length} nuits · ` : nightLabel(c.nights[0].night, c.nights[0].wake) + ' · '}${nf(c.alt)} m · ${c.lat.toFixed(4)} N, ${c.lon.toFixed(4)} E`),
      tabs, body);
    render(nightIdx);
    panel.scrollTop = 0;
  }

  /* ---------- panel: one stage ---------- */
  function stageSeries(st) {
    const i = Object.fromEntries(st.cols.map((c, k) => [c, k]));
    let dplus = 0;
    return st.pts.map((p, k) => {
      if (k && p[i.alt] > st.pts[k - 1][i.alt]) dplus += p[i.alt] - st.pts[k - 1][i.alt];
      return { lon: p[i.lon], lat: p[i.lat], alt: p[i.alt], km: p[i.km], mov: p[i.mov_s], hr: p[i.hr], kcal: p[i.kcal], heure: p[i.heure], sac: p[i.sac], dplus };
    });
  }

  function profileChart(pts, onSeek) {
    const W = 360, H = 150, L = 30, R = 30, Tp = 10, B = 20;
    const kmMax = pts[pts.length - 1].km || 1;
    const alts = pts.map(p => p.alt), hrs = pts.map(p => p.hr).filter(v => v != null);
    const aMin = 0, aMax = Math.max(100, Math.ceil(Math.max(...alts) / 100) * 100);
    const hMin = hrs.length ? Math.floor(Math.min(...hrs) / 10) * 10 : 60, hMax = hrs.length ? Math.ceil(Math.max(...hrs) / 10) * 10 : 180;
    const x = km => L + (km / kmMax) * (W - L - R);
    const ya = a => Tp + (1 - (a - aMin) / (aMax - aMin)) * (H - Tp - B);
    const yh = h => Tp + (1 - (h - hMin) / Math.max(1, hMax - hMin)) * (H - Tp - B);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'profile', role: 'img', 'aria-label': `Profil d’altitude et fréquence cardiaque, ${nf(kmMax, 1)} km` });
    [0, 0.5, 1].forEach(f => {
      const a = aMin + f * (aMax - aMin);
      svg.append(sv('line', { x1: L, x2: W - R, y1: ya(a), y2: ya(a), class: 'grid' }));
      const t = sv('text', { x: L - 6, y: ya(a) + 4, class: 'axis', 'text-anchor': 'end' }); t.textContent = `${nf(a)}`; svg.append(t);
      const hv = hMin + f * (hMax - hMin);
      const t2 = sv('text', { x: W - R + 6, y: yh(hv) + 4, class: 'axis hr-axis' }); t2.textContent = `${nf(hv)}`; svg.append(t2);
    });
    [0, kmMax / 2, kmMax].forEach((k, j) => {
      const t = sv('text', { x: x(k), y: H - 6, class: 'axis', 'text-anchor': j === 0 ? 'start' : j === 2 ? 'end' : 'middle' });
      t.textContent = `${nf(k, 1)} km`; svg.append(t);
    });
    // altitude area, coloured by pack / trail
    let area = `M${x(pts[0].km)},${ya(aMin)}`;
    pts.forEach(p => { area += `L${x(p.km)},${ya(p.alt)}`; });
    area += `L${x(kmMax)},${ya(aMin)}Z`;
    svg.append(sv('path', { d: area, class: 'alt-area' }));
    let line = '';
    pts.forEach((p, k) => { line += `${k ? 'L' : 'M'}${x(p.km)},${ya(p.alt)}`; });
    svg.append(sv('path', { d: line, class: 'alt-line' }));
    // smoothed heart rate
    let hr = '', pen = false;
    pts.forEach(p => { if (p.hr == null) { pen = false; return; } hr += `${pen ? 'L' : 'M'}${x(p.km)},${yh(p.hr)}`; pen = true; });
    svg.append(sv('path', { d: hr, class: 'hr-line' }));
    // cursor
    const cur = sv('line', { x1: L, x2: L, y1: Tp, y2: H - B, class: 'cursor' });
    const dot = sv('circle', { r: 3.5, cx: L, cy: ya(pts[0].alt), class: 'cursor-dot' });
    svg.append(cur, dot);
    const hit = sv('rect', { x: L, y: Tp, width: W - L - R, height: H - Tp - B, fill: 'transparent', class: 'hit' });
    hit.addEventListener('click', e => {
      const r = svg.getBoundingClientRect();
      const km = ((e.clientX - r.left) / r.width * W - L) / (W - L - R) * kmMax;
      let k = pts.findIndex(p => p.km >= km); if (k < 0) k = pts.length - 1;
      onSeek(k);
    });
    svg.append(hit);
    return { svg, move: k => { const p = pts[k]; cur.setAttribute('x1', x(p.km)); cur.setAttribute('x2', x(p.km)); dot.setAttribute('cx', x(p.km)); dot.setAttribute('cy', ya(p.alt)); } };
  }

  function openStage(st) {
    stopAnim(true);
    setActive(null);
    highlightDay(st.day);
    const pts = stageSeries(st);
    fitStage(pts);

    const counters = {};
    const cnt = (key, label, unit) => el('div', null, el('dt', null, label), el('dd', null, (counters[key] = el('span', null, '—')), unit ? el('small', null, ` ${unit}`) : null));
    const board = el('dl', { class: 'kv counters' },
      cnt('km', 'Distance', 'km'), cnt('dplus', 'Dénivelé +', 'm'),
      cnt('mov', 'Temps en mouvement'), cnt('kcal', 'Calories', 'kcal'),
      cnt('heure', 'Heure'), cnt('hr', 'FC', 'bpm'));
    let k = 0;
    const show = i => {
      const p = pts[i];
      counters.km.textContent = nf(p.km, 1); counters.dplus.textContent = nf(p.dplus);
      counters.mov.textContent = hms(p.mov); counters.kcal.textContent = nf(p.kcal);
      counters.heure.textContent = p.heure; counters.hr.textContent = nf(p.hr);
      chart.move(i);
    };
    const chart = profileChart(pts, i => { k = i; drawAnim(pts, k); show(k); if (anim) anim.k = k; });

    const playBtn = el('button', { type: 'button', class: 'play' }, '▶ Lancer la trace');
    const speeds = [1, 2, 4];
    let speed = 1;
    const speedBtn = el('button', { type: 'button', class: 'ghost', 'aria-label': 'Vitesse' }, '×1');
    speedBtn.addEventListener('click', () => { speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; speedBtn.textContent = `×${speed}`; if (anim) anim.speed = speed; });
    const follow = el('button', { type: 'button', class: 'ghost', 'aria-pressed': 'true' }, 'Caméra qui suit');
    follow.addEventListener('click', () => { const on = follow.getAttribute('aria-pressed') !== 'true'; follow.setAttribute('aria-pressed', String(on)); if (anim) anim.follow = on; });

    playBtn.addEventListener('click', () => {
      if (anim && anim.running) { anim.running = false; playBtn.textContent = '▶ Reprendre'; return; }
      if (k >= pts.length - 1) k = 0;
      startAnim(pts, k, speed, follow.getAttribute('aria-pressed') === 'true', i => { k = i; show(i); }, () => { playBtn.textContent = '↺ Rejouer'; fitStage(pts); });
      playBtn.textContent = '❚❚ Pause';
    });

    panel.replaceChildren(
      backButton('Toutes les étapes'),
      el('p', { class: 'eyebrow-sm' }, `Étape J${st.day} · ${day(st.date).d} ${day(st.date).m}`),
      el('h2', null, st.title),
      el('p', { class: 'meta' }, `${nf(st.km, 1)} km · ${nf(st.dplus)} m D+ · ${nf(st.moving_h, 1)} h en mouvement · ${nf(st.kcal)} kcal (montre) · ${st.n_acts} enregistrement${st.n_acts > 1 ? 's' : ''}`),
      el('div', { class: 'player' }, playBtn, speedBtn, follow),
      board,
      el('h3', null, 'Profil'),
      chart.svg,
      el('div', { class: 'phase-key' },
        el('span', null, el('i', { class: 'k-alt' }), 'altitude (m)'),
        el('span', null, el('i', { class: 'k-hr' }), 'fréquence cardiaque lissée (bpm)'),
        el('span', null, 'touche le profil pour te déplacer')),
      el('p', { class: 'foot' }, 'Calories : estimation de la montre, réparties sur le temps en mouvement. Les arrêts et les trajets non enregistrés (bateau, liaisons) sont sautés.'));
    show(0);
    drawAnim(pts, 0);
    panel.scrollTop = 0;
  }

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
    center: [13.15, 68.0],
    zoom: 8.6,
    pitch: 0,
    maxPitch: 80,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

  const bounds = new maplibregl.LngLatBounds();
  T.trace.features.forEach(f => f.geometry.coordinates.forEach(c => bounds.extend([c[0], c[1]])));

  function padding() {
    return isPhone()
      ? { top: 130, bottom: Math.round(window.innerHeight * 0.46) + 30, left: 24, right: 24 }
      : { top: 60, bottom: 90, left: 470, right: 420 };
  }
  function overview(instant) {
    if (!map) return;
    map.fitBounds(bounds, { padding: padding(), pitch: 48, bearing: -18, duration: instant || reduceMotion ? 0 : 2400, essential: true });
  }
  function fitStage(pts) {
    if (!map) return;
    const b = new maplibregl.LngLatBounds();
    pts.forEach(p => b.extend([p.lon, p.lat]));
    map.fitBounds(b, { padding: padding(), pitch: 55, bearing: -15, maxZoom: 14, duration: reduceMotion ? 0 : 2200, essential: true });
  }
  function flyToCamp(c) {
    if (!map) return;
    map.flyTo({ center: [c.lon, c.lat], zoom: 13.4, pitch: 62, bearing: (c.id * 47) % 360 - 180,
      duration: reduceMotion ? 0 : 2800, essential: true, padding: padding() });
  }
  function flyToSummit(s) {
    if (!map) return;
    stopAnim(true);
    highlightDay(null);
    map.flyTo({ center: [s.lon, s.lat], zoom: 13.6, pitch: 66, bearing: -30, duration: reduceMotion ? 0 : 2800, essential: true, padding: padding() });
    summitPopup(s);
  }

  function highlightDay(d) {
    if (!map || !map.getLayer('trace')) return;
    const op = d == null ? 1 : ['case', ['==', ['get', 'day'], d], 0.35, 0.18];
    map.setPaintProperty('trace', 'line-opacity', op);
    map.setPaintProperty('trace-casing', 'line-opacity', d == null ? 0.85 : ['case', ['==', ['get', 'day'], d], 0.4, 0.15]);
  }

  /* animated stage: the drawn part of the day, split by pack / trail, and a moving head */
  function drawAnim(pts, k) {
    if (!map || !map.getSource('anim')) return;
    const feats = [];
    let cur = null;
    for (let i = 0; i <= k; i++) {
      const p = pts[i];
      if (!cur || cur.properties.sac !== p.sac) {
        cur = { type: 'Feature', properties: { sac: p.sac }, geometry: { type: 'LineString', coordinates: cur ? [cur.geometry.coordinates[cur.geometry.coordinates.length - 1]] : [] } };
        feats.push(cur);
      }
      cur.geometry.coordinates.push([p.lon, p.lat]);
    }
    map.getSource('anim').setData({ type: 'FeatureCollection', features: feats.filter(f => f.geometry.coordinates.length > 1) });
    map.getSource('head').setData({ type: 'Feature', properties: { sac: pts[k].sac }, geometry: { type: 'Point', coordinates: [pts[k].lon, pts[k].lat] } });
  }
  function clearAnim() {
    if (!map || !map.getSource('anim')) return;
    map.getSource('anim').setData({ type: 'FeatureCollection', features: [] });
    map.getSource('head').setData({ type: 'FeatureCollection', features: [] });
  }
  function startAnim(pts, from, speed, follow, onStep, onEnd) {
    stopAnim(false);
    const BASE_MS = 24000;                 // a whole stage at ×1
    const perPt = BASE_MS / pts.length;
    anim = { running: true, k: from, speed, follow, acc: 0, last: performance.now(), lastFollow: 0 };
    if (follow && map) map.easeTo({ center: [pts[from].lon, pts[from].lat], zoom: 13.6, pitch: 62, duration: reduceMotion ? 0 : 1200, padding: padding() });
    const a = anim;
    const step = now => {
      if (a !== anim || !a.running) return;
      a.acc += (now - a.last) * a.speed; a.last = now;
      const adv = Math.floor(a.acc / perPt);
      if (adv > 0) {
        a.acc -= adv * perPt;
        a.k = Math.min(pts.length - 1, a.k + adv);
        drawAnim(pts, a.k); onStep(a.k);
        if (a.follow && now - a.lastFollow > 700) {
          a.lastFollow = now;
          map.easeTo({ center: [pts[a.k].lon, pts[a.k].lat], duration: reduceMotion ? 0 : 900, easing: t => t, padding: padding() });
        }
      }
      if (a.k >= pts.length - 1) { a.running = false; onEnd(); return; }
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
    map.addLayer({ id: 'trace-casing', type: 'line', source: 'trace',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': COL.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4.5, 14, 9], 'line-opacity': 0.85 } });
    map.addLayer({ id: 'trace', type: 'line', source: 'trace',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['match', ['get', 'sac'], 'avec', COL.pack, COL.trail],
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 14, 5] } });

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
  function setActive(id) {
    markers.forEach((n, k) => n.classList.toggle('active', k === id));
  }
  function summitPopup(s) {
    if (popup) popup.remove();
    const d = day(s.heure.slice(0, 10));
    popup = new maplibregl.Popup({ closeButton: false, offset: 16 }).setLngLat([s.lon, s.lat])
      .setDOMContent(el('div', null,
        el('div', { class: 'pop-title' }, s.sommet),
        el('div', { class: 'pop-meta' }, `${nf(s.alt_gps_m)} m au GPS · ${d.d} ${d.m} à ${s.heure.slice(11, 16)}`),
        el('div', { class: 'pop-meta' }, `départ à ${nf(s.alt_depart_m)} m · +${nf(s.alt_gps_m - s.alt_depart_m)} m`)))
      .addTo(map);
  }
  T.summits.forEach(s => {
    const node = el('button', { type: 'button', class: 'marker m-peak', 'aria-label': `Sommet ${s.sommet}` });
    const svg = sv('svg', { viewBox: '0 0 20 18', width: '20', height: '18', 'aria-hidden': 'true' });
    svg.append(sv('polygon', { points: '10,1.8 18.4,16.4 1.6,16.4', fill: '#111418', stroke: COL.trail, 'stroke-width': '2.2', 'stroke-linejoin': 'round' }));
    node.append(svg);
    node.addEventListener('click', e => { e.stopPropagation(); summitPopup(s); });
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

/* Lofoten Traverse — page d'accueil : carte 3D, trace, campements, sommets.
   Les données viennent de data.js (window.TREK), généré par src/export_site.py. */
(function () {
  'use strict';

  const T = window.TREK;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => window.matchMedia('(max-width: 820px)').matches;
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const nf = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ---------- small DOM helper ---------- */
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
  const day = iso => { const d = new Date(iso + 'T12:00:00'); return { d: d.getDate(), m: MONTHS[d.getMonth()] }; };
  const nightLabel = (night, wake) => { const a = day(night), b = day(wake); return `nuit du ${a.d} au ${b.d} ${b.m}`; };
  const hm = min => min == null ? '—' : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;

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
    ['Campements', S.camps], ['Sommets', S.summits], ['Avec le sac', `${nf(S.bag_hours, 1)} h`],
  ];
  document.getElementById('stats').append(...statItems.map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v))));

  /* ---------- panel views ---------- */
  const panel = document.getElementById('panel-inner');
  const markers = new Map();
  let map = null;
  let popup = null;

  function showHome() {
    setActive(null);
    panel.replaceChildren(
      el('h2', null, 'Neuf nuits, sept campements'),
      el('p', { class: 'note' }, 'La trace bleu clair est marchée avec le gros sac, la rouge en trail sans sac. Choisis un campement pour voler jusqu’à lui et lire sa nuit : sommeil, cœur, météo, poids du sac le lendemain.'),
      el('h3', null, 'Campements'),
      el('ul', { class: 'camp-list' }, camps.map((c, i) => el('li', null,
        el('button', { type: 'button', class: 'camp-row', onclick: () => openCamp(c) },
          el('span', { class: 'camp-num' }, String(i + 1).padStart(2, '0')),
          el('span', { class: 'camp-name' }, c.name),
          el('span', { class: 'camp-dates' }, c.nights.map(n => day(n.night).d).join(' + ') + ' ' + day(c.nights[0].night).m))))),
      el('h3', null, 'Sommets'),
      el('ul', { class: 'camp-list' }, T.summits.map(s => el('li', null,
        el('button', { type: 'button', class: 'camp-row', onclick: () => flyToSummit(s) },
          el('span', { class: 'camp-num' }, '▲'),
          el('span', { class: 'camp-name' }, s.sommet),
          el('span', { class: 'camp-dates' }, `${nf(s.alt_gps_m)} m`))))),
      el('p', { class: 'foot' }, 'Altitudes et positions : montre GPS Garmin. Météo : réanalyse ERA5. Sommeil : Garmin Connect.')
    );
    panel.scrollTop = 0;
  }

  function nightBlock(n) {
    const s = n.sleep, w = n.weather;
    const kids = [];
    kids.push(el('h3', null, 'La nuit'));
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

  function openCamp(c, nightIdx = 0) {
    setActive(c.id);
    flyToCamp(c);
    const body = el('div');
    const render = i => body.replaceChildren(
      el('p', { class: 'note' }, c.nights[i].note || ''),
      ...nightBlock(c.nights[i]));
    const tabs = c.nights.length > 1 ? el('div', { class: 'tabs', role: 'tablist' }, c.nights.map((n, i) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(i === nightIdx), onclick: e => {
        tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', 'false'));
        e.currentTarget.setAttribute('aria-selected', 'true');
        render(i);
      } }, nightLabel(n.night, n.wake)))) : null;
    panel.replaceChildren(
      el('button', { type: 'button', class: 'back', onclick: () => { showHome(); overview(); } }, '← Tous les campements'),
      el('h2', null, c.name),
      el('p', { class: 'meta' }, `${c.nights.length > 1 ? `${c.nights.length} nuits · ` : nightLabel(c.nights[0].night, c.nights[0].wake) + ' · '}${nf(c.alt)} m · ${c.lat.toFixed(4)} N, ${c.lon.toFixed(4)} E`),
      tabs, body);
    render(nightIdx);
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
      ? { top: 140, bottom: Math.round(window.innerHeight * 0.46) + 30, left: 24, right: 24 }
      : { top: 60, bottom: 90, left: 470, right: 420 };
  }
  function overview(instant) {
    if (!map) return;
    map.fitBounds(bounds, { padding: padding(), pitch: 48, bearing: -18, duration: instant || reduceMotion ? 0 : 2400, essential: true });
  }
  function flyToCamp(c) {
    if (!map) return;
    map.flyTo({ center: [c.lon, c.lat], zoom: 13.4, pitch: 62, bearing: (c.id * 47) % 360 - 180,
      duration: reduceMotion ? 0 : 2800, essential: true, padding: padding() });
  }
  function flyToSummit(s) {
    if (!map) return;
    map.flyTo({ center: [s.lon, s.lat], zoom: 13.6, pitch: 66, bearing: -30, duration: reduceMotion ? 0 : 2800, essential: true, padding: padding() });
    summitPopup(s);
  }

  let terrainOn = true;
  const terrain = { source: 'dem', exaggeration: 1.35 };

  map.on('load', () => {
    try { map.setTerrain(terrain); } catch (e) { terrainOn = false; }
    try { if (map.setSky) map.setSky({ 'sky-color': '#1d3346', 'horizon-color': '#f2b544', 'fog-color': '#0f1720', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.85 }); } catch (e) { /* sky optional */ }

    map.addSource('trace', { type: 'geojson', data: T.trace });
    map.addLayer({ id: 'trace-casing', type: 'line', source: 'trace',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#0b1118', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 8], 'line-opacity': 0.75 } });
    map.addLayer({ id: 'trace', type: 'line', source: 'trace',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['match', ['get', 'sac'], 'avec', '#8fd0f5', '#e0472f'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4.5] } });

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
    // a few missing tiles are normal; only report when nothing at all can load
    if (e && e.error && /Failed to fetch|NetworkError/.test(String(e.error.message)) && !map.areTilesLoaded()) {
      document.getElementById('map-error').hidden = false;
    }
  });

  /* markers */
  camps.forEach((c, i) => {
    const node = el('button', { type: 'button', class: 'marker m-camp', 'aria-label': `Campement ${c.name}` }, String(i + 1));
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
    popup = new maplibregl.Popup({ closeButton: false, offset: 14 }).setLngLat([s.lon, s.lat])
      .setDOMContent(el('div', null,
        el('div', { class: 'pop-title' }, s.sommet),
        el('div', { class: 'pop-meta' }, `${nf(s.alt_gps_m)} m au GPS · ${d.d} ${d.m} à ${s.heure.slice(11, 16)}`),
        el('div', { class: 'pop-meta' }, `départ à ${nf(s.alt_depart_m)} m · +${nf(s.alt_gps_m - s.alt_depart_m)} m`)))
      .addTo(map);
  }
  T.summits.forEach(s => {
    const node = el('button', { type: 'button', class: 'marker m-peak', 'aria-label': `Sommet ${s.sommet}` });
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

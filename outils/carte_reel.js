// Carte de la trace réelle, en relief (vue oblique) : une image autonome, sans fond de carte.
// Entrées : data.js (trace GPS de la montre, campements, sommets) ; donnees/cotes_osm.json (trait de côte
//           OpenStreetMap) et donnees/eaux_osm.json (lacs) : © contributeurs OpenStreetMap, ODbL, exports overpass-turbo simplifiés à 4 m.
// Sortie : docs/carte_reel.svg   (node outils/carte_reel.js)
//
// Le sol est vu en oblique (nord en haut, profondeur écrasée), et chaque point de la trace est relevé de son altitude :
// un « rideau » relie le sol à la trace, comme un ruban. La couleur suit les jours (J1 turquoise → J9 ambre).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
eval(fs.readFileSync(path.join(root, 'data', 'data.js'), 'utf8'));
const T = window.TREK;
const EAUX = JSON.parse(fs.readFileSync(path.join(root, 'donnees', 'eaux_osm.json'), 'utf8')).eaux;
const COTES = JSON.parse(fs.readFileSync(path.join(root, 'donnees', 'cotes_osm.json'), 'utf8')).lignes;

// ---------- géométrie ----------
const W = 1460, H = 1060, TILT = 0.64, EXAG = 2.2;
const P = T.acts.flatMap(a => a.pts);
const lon0 = (Math.min(...P.map(p => p[0])) + Math.max(...P.map(p => p[0]))) / 2;
const lat0 = (Math.min(...P.map(p => p[1])) + Math.max(...P.map(p => p[1]))) / 2;
const KX = 111.32 * Math.cos(lat0 * Math.PI / 180), KY = 110.57;
const km = (lon, lat) => [(lon - lon0) * KX, (lat - lat0) * KY];
const xs = P.map(p => km(p[0], p[1])[0]), ys = P.map(p => km(p[0], p[1])[1]);
const bx = [Math.min(...xs), Math.max(...xs)], by = [Math.min(...ys), Math.max(...ys)];
const S = Math.min(1300 / (bx[1] - bx[0]), 840 / ((by[1] - by[0]) * TILT));   // px par km
const OX = (1600 - (bx[1] - bx[0]) * S) / 2 - 85, OY = 112 + by[1] * TILT * S;
const ZK = S / 1000 * EXAG;                                                            // px par mètre d'altitude
const G = (lon, lat) => { const [x, y] = km(lon, lat); return [OX + (x - bx[0]) * S, OY - y * TILT * S]; };   // au sol
const E = (lon, lat, alt) => { const [x, y] = G(lon, lat); return [x, y - Math.max(0, alt) * ZK]; };          // relevé
const r1 = v => Math.round(v * 10) / 10;

// ---------- couleur selon l'avancement (J1 → J9) ----------
// teintes hypsométriques : vert au bord de l'eau, ocre à mi-hauteur, brun puis gris roche au sommet
const ALT = [[0, '#3f9a7c'], [120, '#8fbf6a'], [260, '#d9cf72'], [400, '#e0a457'], [550, '#c0703f'], [680, '#8e5a47'], [780, '#6f6a6e']];
const STOPS = ALT.map(a => a[1]), AMAX = 780;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const altCol = h => { const v = Math.max(0, Math.min(AMAX, h)); let i = 0; while (i < ALT.length - 2 && v > ALT[i + 1][0]) i++;
  const f = (v - ALT[i][0]) / (ALT[i + 1][0] - ALT[i][0]), a = hex(ALT[i][1]), b = hex(ALT[i + 1][1]); return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(',')})`; };
const col = t => { const u = Math.max(0, Math.min(1, t)) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(u)), f = u - i;
  const a = hex(STOPS[i]), b = hex(STOPS[i + 1]); return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`; };
// avancement : jour − 1 + part du jour déjà marchée, sur 9
const days = [...new Set(T.acts.map(a => a.day))].sort((a, b) => a - b), ND = days.length;
const dayPts = Object.fromEntries(days.map(d => [d, T.acts.filter(a => a.day === d).reduce((s, a) => s + a.pts.length, 0)]));
const pts = []; { const seen = {}; T.acts.forEach((a, ai) => a.pts.forEach((p, k) => { seen[a.day] = (seen[a.day] || 0) + 1;
  pts.push({ lon: p[0], lat: p[1], alt: p[2], t: (a.day - 1 + seen[a.day] / dayPts[a.day]) / ND, act: ai, first: k === 0 }); })); }

// ---------- dessin ----------
const out = [];
const add = s => out.push(s);
add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">`);
add(`<defs>
  <radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="${W * 0.4}" cy="${H * 0.42}" r="${Math.hypot(W, H) * 0.6}"><stop offset="0" stop-color="#eef3f2"/><stop offset=".6" stop-color="#e3ecec"/><stop offset="1" stop-color="#d3dfe1"/></radialGradient>
  <filter id="flou" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="20"/></filter>
  <mask id="terremask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${(() => { const [ax, ay] = G(12.90, 68.14), [bx, by] = G(13.47, 67.86);   // emprise de l'export : ses bords coupent les îles, on les fond dans la mer
    return `<rect x="${r1(ax + 34)}" y="${r1(ay + 30)}" width="${r1(bx - ax - 68)}" height="${r1(by - ay - 60)}" fill="#fff" filter="url(#flou)"/>`; })()}</mask>
  <clipPath id="cadre"><rect width="${W}" height="${H}"/></clipPath>
  <linearGradient id="leg" x1="0" x2="1">${ALT.map(([h, c]) => `<stop offset="${r1(h / AMAX * 100)}%" stop-color="${c}"/>`).join('')}</linearGradient>
  <radialGradient id="sun" cx="10%" cy="-6%" r="62%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".30"/><stop offset=".4" stop-color="#ffc47a" stop-opacity=".08"/><stop offset="1" stop-color="#ff8f5a" stop-opacity="0"/></radialGradient>
  <radialGradient id="fade" cx="50%" cy="50%" r="60%"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
  <mask id="gridmask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="halo" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>`);
add(`<clipPath id="arrondi"><rect x="0" y="0" width="${W}" height="${H}" rx="34"/></clipPath><g clip-path="url(#arrondi)">`);
add(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
// les îles : terre couleur papier sur une mer gris-bleu, trait de côte discret (OpenStreetMap)
{ const ring = l => l.pts.map((p, i) => { const [x, y] = G(p[0], p[1]); return `${i ? 'L' : 'M'}${r1(x)},${r1(y)}`; }).join('') + 'Z';
  const terre = COTES.filter(l => l.pts.length >= 3);
  add(`<g clip-path="url(#cadre)" mask="url(#terremask)"><path d="${terre.map(ring).join('')}" fill="#f6f0e2" fill-rule="evenodd" stroke="#a99a7c" stroke-opacity=".55" stroke-width=".9" stroke-linejoin="round"/>`);
  add(`<path d="${EAUX.map(ring).join('')}" fill="url(#bg)" fill-rule="evenodd" stroke="#a99a7c" stroke-opacity=".55" stroke-width=".6" stroke-linejoin="round"/></g>`); }
// rose des vents, discrète, en haut à gauche
add(`<g transform="translate(${G(12.95, 68.10).map(r1).join(",")}) scale(1.9)" opacity=".6" stroke="#50646b" fill="none" stroke-width="1"><circle r="30"/><circle r="22" stroke-opacity=".5"/>
  ${[0, 90, 180, 270].map(a => `<path transform="rotate(${a})" d="M0,-36L5,-5L0,0L-5,-5Z" fill="${a ? '#fbf8f1' : '#50646b'}"/>`).join('')}
  ${[45, 135, 225, 315].map(a => `<path transform="rotate(${a})" d="M0,-24L3,-3L0,0L-3,-3Z" fill="#fbf8f1"/>`).join('')}
  <text y="-42" text-anchor="middle" font-size="12" font-weight="700" fill="#50646b" stroke="none">N</text></g>`);
add(`<rect width="${W}" height="${H}" fill="url(#sun)"/>`);

// graticule au sol : méridiens et parallèles, très discrets
{ const g = [], lo = [12.5, 13.9], la = [67.7, 68.35];   // le quadrillage couvre toute l'image, jusqu'au cadre
  for (let x = 12.5; x <= 13.9001; x += 0.05) { const a = G(x, la[0]), b = G(x, la[1]); g.push(`M${r1(a[0])},${r1(a[1])}L${r1(b[0])},${r1(b[1])}`); }
  for (let y = 67.7; y <= 68.3501; y += 0.025) { const a = G(lo[0], y), b = G(lo[1], y); g.push(`M${r1(a[0])},${r1(a[1])}L${r1(b[0])},${r1(b[1])}`); }
  add(`<path d="${g.join('')}" stroke="#8f7e60" stroke-opacity=".40" stroke-width="1" fill="none" clip-path="url(#cadre)"/>`); }

// ombre de la trace au sol
const gnd = pts.map(p => G(p.lon, p.lat)), elv = pts.map(p => E(p.lon, p.lat, p.alt));
const line = (A, from, to) => A.slice(from, to).map((q, i) => `${i ? 'L' : 'M'}${r1(q[0])},${r1(q[1])}`).join('');
const runs = []; { let s = 0; for (let i = 1; i <= pts.length; i++) if (i === pts.length || pts[i].first) { runs.push([s, i]); s = i; } }
add(`<path d="${runs.map(([a, b]) => line(gnd, a, b)).join('')}" stroke="#6b5434" stroke-opacity=".22" stroke-width="4" fill="none" filter="url(#soft)"/>`);
add(`<path d="${runs.map(([a, b]) => line(gnd, a, b)).join('')}" stroke="#8a7a62" stroke-opacity=".35" stroke-width="1" fill="none"/>`);

// rideau : du sol à la trace, du fond vers l'avant
{ const idx = pts.map((_, i) => i).filter(i => i % 2 === 0 && pts[i].alt > 15).sort((a, b) => gnd[a][1] - gnd[b][1]);
  add(`<g stroke-width="1.3" stroke-linecap="round">${idx.map(i => `<line x1="${r1(gnd[i][0])}" y1="${r1(gnd[i][1])}" x2="${r1(elv[i][0])}" y2="${r1(elv[i][1])}" stroke="${altCol(pts[i].alt)}" stroke-opacity=".32"/>`).join('')}</g>`); }

// trace relevée, par petits morceaux pour suivre le dégradé, avec une lueur dessous
{ const seg = []; runs.forEach(([a, b]) => { for (let i = a; i < b - 1; i += 12) seg.push([i, Math.min(b, i + 13)]); });
  add(`<g fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".95"><path d="${runs.map(([a, b]) => line(elv, a, b)).join('')}" stroke="#fffaf0" stroke-width="5.5"/></g>`);
  add(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">${seg.map(([a, b]) => `<path d="${line(elv, a, b)}" stroke="${altCol(pts[a + 6 < pts.length ? a + 6 : a].alt)}" stroke-width="2.8"/>`).join('')}</g>`); }

// liaisons entre sorties : le bateau (Kirkefjord → Vindstad) et les petits trous GPS
runs.slice(1).forEach(([a]) => { const p = elv[a - 1], q = elv[a], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
  if (d < 2) return; const boat = d > 100;
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, nx = -(q[1] - p[1]) / d, ny = (q[0] - p[0]) / d, bow = boat ? -0.28 * d : 0;   // arc côté fjord
  add(`<path d="M${r1(p[0])},${r1(p[1])}Q${r1(mx + nx * bow * 2)},${r1(my + ny * bow * 2)} ${r1(q[0])},${r1(q[1])}" fill="none" stroke="${boat ? '#5d7f8a' : altCol(pts[a + 6 < pts.length ? a + 6 : a].alt)}" stroke-opacity="${boat ? .55 : .6}" stroke-width="${boat ? 1.4 : 1.6}" stroke-dasharray="${boat ? '2 6' : '1 4'}" stroke-linecap="round"/>`);
  if (boat) add(`<text x="${r1(mx + nx * bow + 8)}" y="${r1(my + ny * bow + 4)}" font-size="13" font-style="italic" fill="#5d7f8a" fill-opacity=".7">bateau</text>`); });

// villages traversés : icône de maison, au point de la trace le plus proche des coordonnées publiées
{ const V = [['Nusfjord', 68.0353, 13.3478, 0, 0, 'none'], ['Nesland', null, 'nusfjord_nesland', 12, 16], ['Ramberg', 68.0897, 13.2297, 12, 4, 'start', true]   // pas sur la trace : à ses coordonnées publiées
   , ['Fredvang', 68.0841, 13.1667, 0, -10, 'middle'],
    ['Reine', null, 'munkebu_reine', 12, 4], ['Sørvågen', null, 'sorvagen_a@0', 0, 0, 'none'], ['Å', null, 'sorvagen_a', -12, 16, 'end']];   // Nusfjord et Sørvågen : nommés par le campement
  const near = (la, lo) => pts.reduce((b, p, i) => { const d = (p.lat - la) ** 2 + ((p.lon - lo) * 0.37) ** 2; return d < b[0] ? [d, i] : b; }, [1e9, 0])[1];
  V.forEach(([nm, la, lo, dx, dy, an, exact]) => { let i;
    if (la != null) i = near(la, lo);
    else { const [id, at] = lo.split('@'), a = T.acts.findIndex(x => x.id === id), first = pts.findIndex(p => p.act === a); i = at === '0' ? first : first + T.acts[a].pts.length - 1; }
    const [x, y] = exact ? G(lo, la) : gnd[i];
    add(`<g transform="translate(${r1(x)},${r1(y)})"><path d="M-5,1L0,-4L5,1V6H-5Z" fill="#fffaf0" stroke="#3b4a52" stroke-width="1.3" stroke-linejoin="round"/></g>`);
    if (an !== 'none') add(`<text x="${r1(x + dx)}" y="${r1(y + dy)}" text-anchor="${an || 'start'}" font-size="12" font-style="italic" fill="#3b4a52" paint-order="stroke" stroke="#fbf8f1" stroke-width="3">${nm}</text>`); }); }

// sommets atteints
// [x, y, ancre, rappel] : position absolue de l'étiquette ; rappel = trait fin jusqu'au point (zones chargées)
// [dx, dy, ancre, rappel] : décalage de l'étiquette par rapport au point ; rappel = trait fin jusqu'au point
const LBL = { Volandstinden: [70, -50, 'start', 1], Ryten: [-10, -12, 'end'], Moltinden: [82, -42, 'start', 1], Munken: [-150, -14, 'end', 1], Helvete: [175, -24, 'start', 1],
  Reinebringen: [140, -6, 'start', 1], 'Støvla': [-60, 0, 'end', 1], Gylttinden: [180, 8, 'start', 1], Andstabben: [-14, 4, 'end'] };
const callout = (x, y, lx, ly, an, c) => { const ex = an === 'end' ? lx + 6 : lx - 6;
  add(`<path d="M${r1(x)},${r1(y)}L${r1(ex)},${r1(ly - 4)}" stroke="${c}" stroke-opacity=".45" stroke-width="1"/><circle cx="${r1(ex)}" cy="${r1(ly - 4)}" r="1.8" fill="${c}" fill-opacity=".7"/>`); };
T.summits.forEach(s => { const alt = s.hauteur_officielle_m || s.alt_gps_m, [x, y] = E(s.lon, s.lat, alt), [ox, oy, an, ro] = LBL[s.sommet] || [10, -10, 'start'], lx = x + ox, ly = y + oy;
  if (ro) callout(x, y - 2, lx, ly, an, '#22313a');
  add(`<path d="M${r1(x)},${r1(y - 7)}L${r1(x + 6)},${r1(y + 3)}L${r1(x - 6)},${r1(y + 3)}Z" fill="#3a2f2a" stroke="#fbf8f1" stroke-width="1.2"/>`);
  add(`<text x="${r1(lx)}" y="${r1(ly)}" text-anchor="${an}" font-size="14" font-weight="600" fill="#22313a" paint-order="stroke" stroke="#fbf8f1" stroke-width="3">${s.sommet} <tspan font-weight="400" fill="#6a7378">${alt} m</tspan></text>`); });

// campements (nuits)
{ const m = new Map(); T.camps.forEach((c, i) => { if (!m.has(c.camp)) m.set(c.camp, { ...c, n: [] }); m.get(c.camp).n.push(i + 1); });
  const CL = { Napp: [14, 5, 'start'], Nusfjord: [14, 5, 'start'], 'Hauteurs de Kvalvika': [-110, 51, 'end', 1], 'Horseid beach': [-14, 5, 'end'], 'Bunes beach': [-14, 5, 'end'],
    Munkebu: [-130, -20, 'end', 1], 'Sørvågen': [-130, -50, 'end', 1] };
  [...m.values()].forEach(c => { const [x, y] = E(c.lon, c.lat, c.alt), [ox, oy, an, ro] = CL[c.camp] || [14, 5, 'start'], lx = x + ox, ly = y + oy;
    if (ro) callout(x, y, lx, ly, an, '#1f5f74');
    add(`<circle cx="${r1(x)}" cy="${r1(y)}" r="11" fill="#1f5f74" opacity=".18" filter="url(#halo)"/>`);
    add(`<circle cx="${r1(x)}" cy="${r1(y)}" r="5.5" fill="#fffaf0" stroke="#1f5f74" stroke-width="2.2"/>`);
    add(`<text x="${r1(lx)}" y="${r1(ly)}" text-anchor="${an}" font-size="13" fill="#1f5f74" paint-order="stroke" stroke="#fbf8f1" stroke-width="3"><tspan font-family="ui-monospace, Menlo, monospace" font-weight="700">N${c.n.length > 1 ? `${c.n[0]}–${c.n[c.n.length - 1]}` : c.n[0]}</tspan> ${c.camp.replace('Hauteurs de ', '')}</text>`); }); }

// départ et arrivée
{ const a = elv[0], b = elv[elv.length - 1];
  add(`<text x="${r1(a[0] + 16)}" y="${r1(a[1] - 16)}" font-size="12" letter-spacing="1.5" font-weight="700" fill="#2f8a72">DÉPART · 14/06</text>`);
  add(`<circle cx="${r1(b[0])}" cy="${r1(b[1])}" r="5" fill="#d9822b"/><text x="${r1(b[0] + 14)}" y="${r1(b[1] + 26)}" font-size="12" letter-spacing="1.5" font-weight="700" fill="#d9822b">ARRIVÉE AU PORT · 22/06</text>`); }

// cartouche : titre, chiffres, légende des jours, échelle
{ const x0 = 893, y0 = 642;
  add(`<text x="${x0}" y="${y0}" font-size="12" letter-spacing="3" font-weight="600" fill="#6b7f86">TRAVERSÉE AUTONOME · NORVÈGE</text>`);
  add(`<text x="${x0 - 3}" y="${y0 + 62}" font-size="64" font-weight="800" letter-spacing="-1.5" fill="#1d2b33">Lofoten <tspan fill="#d9822b">2026</tspan></text>`);
  add(`<text x="${x0}" y="${y0 + 94}" font-size="16" fill="#50646b">14 – 22 juin, sous le soleil de minuit</text>`);
  const st = [['170', 'km', 0], ['10\u202f000', 'm de D+', 104], ['9', 'jours', 266], [String(T.summits.length), 'sommets', 340]];
  st.forEach(([v, u, dx], i) => { const x = x0 + dx;
    if (i) add(`<path d="M${x - 18},${y0 + 128}v46" stroke="#6b7f86" stroke-opacity=".25"/>`);
    add(`<text x="${x}" y="${y0 + 152}" font-size="32" font-weight="700" letter-spacing="-.5" fill="#1d2b33" style="font-variant-numeric: tabular-nums">${v}</text><text x="${x}" y="${y0 + 172}" font-size="13" fill="#6b7f86">${u}</text>`); });
  const lw = 470, ly = y0 + 212;
  add(`<rect x="${x0}" y="${ly}" width="${lw}" height="6" rx="3" fill="url(#leg)"/>`);
  add(`<text x="${x0}" y="${ly - 10}" font-size="11" letter-spacing="2" font-weight="600" fill="#6b7f86">ALTITUDE DE LA TRACE</text>`);
  [0, 200, 400, 600, 776].forEach(h => { const x = x0 + h / AMAX * lw;
    add(`<path d="M${r1(x)},${ly + 8}v4" stroke="#50646b"/><text x="${r1(x)}" y="${ly + 26}" text-anchor="middle" font-size="11" font-family="ui-monospace, Menlo, monospace" fill="#50646b">${h}${h === 776 ? ' m' : ''}</text>`); });
  // échelle (au sol, est-ouest) et nord
  const L5 = 5 * S, sx = x0, sy = ly + 102;
  add(`<path d="M${sx},${sy}h${r1(L5)}M${sx},${sy - 5}v10M${r1(sx + L5)},${sy - 5}v10" stroke="#50646b" stroke-width="1.4"/><text x="${r1(sx + L5 + 10)}" y="${sy + 4}" font-size="12" font-family="ui-monospace, Menlo, monospace" fill="#50646b">5 km</text>`);
  const A5 = 500 * ZK, ax = sx + L5 + 64;   // échelle des hauteurs : 500 m, avec l'exagération
  add(`<path d="M${r1(ax)},${sy + 5}v${r1(-A5)}M${r1(ax - 5)},${sy + 5}h10M${r1(ax - 5)},${r1(sy + 5 - A5)}h10" stroke="#50646b" stroke-width="1.4"/><text x="${r1(ax + 10)}" y="${r1(sy + 9 - A5 / 2)}" font-size="12" font-family="ui-monospace, Menlo, monospace" fill="#50646b">500 m</text>`);
  add(`<text x="${x0}" y="${sy + 34}" font-size="11.5" fill="#7d8a8e">Trace GPS de la montre (7 184 points) · relief exagéré ×${String(EXAG).replace('.', ',')} · une nuit = un rond · couleur = altitude</text>`);
  add(`<text x="${x0}" y="${sy + 50}" font-size="11.5" fill="#7d8a8e">Côtes et lacs © contributeurs OpenStreetMap (ODbL)</text>`); }

// cadre orange, comme « 2026 »
add('</g>');
add(`<rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="23" fill="none" stroke="#d9822b" stroke-width="22"/><rect x="30" y="30" width="${W - 60}" height="${H - 60}" rx="8" fill="none" stroke="#d9822b" stroke-opacity=".6" stroke-width="2"/>`);
add('</svg>');
const file = path.join(root, 'docs', 'carte_reel.svg');
fs.writeFileSync(file, out.join('\n'));
console.log(`docs/carte_reel.svg · ${(fs.statSync(file).size / 1024).toFixed(0)} Ko · échelle ${r1(S)} px/km`);

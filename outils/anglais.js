// Version anglaise du site : produite à partir des pages françaises et des dictionnaires de outils/anglais/.
//   node outils/anglais.js
// Sorties : map.html (carte), risk.html (rapport), assets/js/en/*.js, data/en/*.js
// Le français reste la source : après une modification d'un texte français, relancer ce script ;
// il signale chaque texte français qui n'a pas de traduction (« à traduire »).
const fs = require('fs'), path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const root = path.join(__dirname, '..'), dict = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'anglais', f), 'utf8'));
const missing = [];
const FRENCH = /[àâçéèêëîïôûùüÿœ]|\b(le|la|les|des|du|et|une|pour|par|avec|sans|dans|est|sont|jour|jours|nuit|sortie|pluie|sac)\b/i;

// jours : J1 → D1 (Day 1)
const days = s => s.replace(/\bJ(\d)/g, 'D$1');

// --- scripts : chaque chaîne et chaque morceau de gabarit est remplacé par sa traduction ---
function script(src, D, name, extra = []) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest' }), edits = [];
  walk.full(ast, n => {
    let a, b, raw;
    if (n.type === 'Literal' && typeof n.value === 'string') { a = n.start + 1; b = n.end - 1; raw = src.slice(a, b); }
    else if (n.type === 'TemplateElement') { a = n.start; b = n.end; raw = src.slice(a, b); }
    else return;
    const key = raw.replace(/\n/g, '\\n');
    let en = D[key];
    if (en == null) {
      if (raw === 'J') en = 'D';
      else if (/J$/.test(raw) && n.type === 'TemplateElement' && !n.tail && /(^|[\s(>·–])J$/.test(raw)) en = raw.replace(/J$/, 'D');
      else if (/\bJ\d/.test(raw)) en = days(raw);
      else { if (!/^--/.test(raw) && FRENCH.test(raw.replace(/<[^>]*>/g, ' ')) && /[a-zà-ÿ]{3,}/i.test(raw)) missing.push(`${name} : ${raw.slice(0, 90)}`); return; }
    } else en = days(raw.includes('\n') ? en.replace(/\\n/g, '\n') : en);
    if (n.type === 'Literal') { const q = src[n.start]; if (q !== '`') en = en.split(q).join('\\' + q); }
    edits.push([a, b, en]);
  });
  edits.sort((x, y) => y[0] - x[0]);
  let out = src; edits.forEach(([a, b, t]) => { out = out.slice(0, a) + t + out.slice(b); });
  extra.forEach(([from, to]) => { const hit = from instanceof RegExp ? from.test(out) : out.includes(from);
    if (!hit) missing.push(`${name} : remplacement introuvable « ${from} »`); out = from instanceof RegExp ? out.replace(from, to) : out.split(from).join(to); });
  return out;
}

const w = (rel, s) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// rapport
w('assets/js/en/risque.js', script(read('assets/js/risque.js'), dict('risque.json'), 'risque.js', [
  [/decimal: ',', thousands: '[^']*'/, "decimal: '.', thousands: ','"],
  [/(\d|\})( |\\u00a0|&nbsp;)%/g, '$1%'],
  ["${f0(v)} j`", "${f0(v)} d`"], ["unit: 'j'", "unit: 'd'"], ["s.unit === 'j'", "s.unit === 'd'"],
  ['${fs2(st.e)} : <b>', '${fs2(st.e)}: <b>'], ['${firstLow.camp} : ${', '${firstLow.camp}: ${'],
  ['`2026 : ${', '`2026: ${'], ['}centile ${f0(o.pct)}', '}percentile ${f0(o.pct)}'], ['${wd[0]} : ${W.wet}', '${wd[0]}: ${W.wet}'],
  ['${f0(M.dry.pct)} ; ', '${f0(M.dry.pct)}; '], ['${cL(SC.L4.real_pct)} ou ${', '${cL(SC.L4.real_pct)} or ${'], ['part 07${G ? ` : ${', 'part 07${G ? `: ${'],
  ['Robustness of the percentile ${', 'Robustness of percentile ${'],
  ['E[k] + .5)} j`', 'E[k] + .5)} d`'], ["narrow ? 'calage' : `J1–D", "narrow ? 'calibration' : `D1–D"], [".text('bateau')", ".text('boat')"], ["O.stage_days.join(', J')", "O.stage_days.join(', D')"], ["N[i].camp.replace('Heights of ', '')", "N[i].camp.replace(' heights', '')"], ["if (v === 'rain')", "if (v === 'pluie')"], ['aria-label="Fermer"', 'aria-label="Close"'], ["'blocs', 'start')", "'blocks', 'start')"], ["'normale', 'start')", "'normal', 'start')"], ['`moyenne ${pct(RH.sac)}`', '`average ${pct(RH.sac)}`'],
  ["'without pack'", "'no pack'"], ["stage${k > 1 ? 's' : ''}", "stage${k !== 1 ? 's' : ''}"], ["stage${d.k > 1 ? 's' : ''}", "stage${d.k !== 1 ? 's' : ''}"],
]));
if (fs.existsSync(path.join(__dirname, 'anglais', 'app.json')))
  w('assets/js/en/app.js', script(read('assets/js/app.js'), dict('app.json'), 'app.js', [["'fr-FR'", "'en-GB'"],
      ['`de ${act.name}`', '`of ${act.name}`'], ['D${m.day} to ${hFr(m.heure)}`', 'D${m.day} at ${hFr(m.heure)}`'], ["a.rubrique === 'summit'", "a.rubrique === 'sommet'"], [/const MONTHS = \[[^\]]*\];/, "const MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];"], ['} nuits`', '} nights`'], ['} sommets`', '} summits`'], ["P.age, 'ans')", "P.age, 'years')"],
      ["['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf']", "['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']"],
      ['`${s.sommet} à`', '`${s.sommet} at`'],]));


// --- pages : textes entre balises et attributs lisibles ---
function page(src, D, name, extra = []) {
  const parts = src.split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/);
  const out = parts.map((p, k) => k % 2 ? p : p
    .replace(/>([^<]+)</g, (m, t) => { const key = t.trim(); if (!key || !/[A-Za-zÀ-ÿ]{2,}/.test(key)) return m;
      if (D[key] == null) { if (FRENCH.test(key)) missing.push(`${name} : ${key.slice(0, 90)}`); return m; }
      return '>' + t.replace(key, D[key]) + '<'; })
    .replace(/\b(title|aria-label|alt|content|placeholder)="([^"]*)"/g, (m, a, v) => D[v] != null ? `${a}="${D[v]}"` : (FRENCH.test(v) && /[a-zà-ÿ]{3,}/i.test(v) ? (missing.push(`${name} : [${a}] ${v.slice(0, 80)}`), m) : m))
  ).join('');
  let o = out.replace('<html lang="fr">', '<html lang="en">').replace(/content="fr_FR"/g, 'content="en_GB"');
  extra.forEach(([from, to]) => { const hit = from instanceof RegExp ? from.test(o) : o.includes(from);
    if (!hit) missing.push(`${name} : remplacement introuvable « ${from} »`); o = from instanceof RegExp ? o.replace(from, to) : o.split(from).join(to); });
  return o;
}

// --- données : chaque valeur texte traduite (les noms de lieux restent) ---
function data(src, D, name) {
  const vm = require('vm'); const ctx = { window: {} }; vm.runInNewContext(src, ctx);
  const keys = Object.keys(ctx.window);
  const tr = (o, k) => typeof o === 'string' ? (D[o] != null ? D[o] : /^J\d+$/.test(o) ? 'D' + o.slice(1) : (k !== 'id' && !o.includes('@') && FRENCH.test(o) && /[a-zà-ÿ]{3,}/i.test(o) && / /.test(o) ? (missing.push(`${name} : ${o.slice(0, 90)}`), o) : o))
    : Array.isArray(o) ? o.map(v => tr(v, k)) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([kk, v]) => [kk, kk === 'pts' || kk === 'coordinates' ? v : tr(v, kk)])) : o;
  return '// généré par outils/anglais.js depuis data/' + name + ' : ne pas modifier à la main\n' + keys.map(k => `window.${k} = ${JSON.stringify(tr(ctx.window[k]))};`).join('\n') + '\n';
}

const DD = dict('donnees.json');
const DATA_FR = ['data.js', 'risque_data.js', 'risque_plan.js', 'risque_cd.js', 'ressentis_episodes.js', 'risque_carte.js', 'risque_episodes.js', 'risque_acte2.js', 'risque_bougies.js', 'risque_mc.js', 'risque_sens.js'];
DATA_FR.forEach(f => w('data/en/' + f, data(read('data/' + f), DD, f)));
const useEn = html => html.replace(/src="data\/([a-z0-9_]+\.js)(\?v=[^"]*)?"/g, (m, f, v) => DATA_FR.includes(f) ? `src="data/en/${f}${v || ''}"` : m)
  .replace(/src="assets\/js\/(risque|app)\.js(\?v=[^"]*)?"/g, 'src="assets/js/en/$1.js$2"');
w('risk.html', useEn(page(read('risque.html'), dict('page_rapport.json'), 'risque.html', [
  ['href="index.html"', 'href="map.html"'],
  [/(<link rel="stylesheet" href="assets\/css\/risque\.css[^"]*">)/, '$1\n<link rel="stylesheet" href="assets/css/risque_en.css?v=20261126-1">'],
  [/<\/b> :/g, '</b>:'],
])));
w('map.html', useEn(page(read('index.html'), dict('page_carte.json'), 'index.html', [
  ['content="https://baptistearibaud88-collab.github.io/Lofoten-risk/"', 'content="https://baptistearibaud88-collab.github.io/Lofoten-risk/map.html"'],
])));

module.exports = { script, missing };
if (require.main === module) {
  console.log(missing.length ? `à traduire (${missing.length}) :\n` + missing.join('\n') : 'tout est traduit');
}

// --- carte du parcours du README : docs/carte_reel_en.svg (puis PNG, voir README) ---
if (fs.existsSync(path.join(__dirname, '..', 'docs', 'carte_reel.svg'))) {
  let svg = read('docs/carte_reel.svg');
  [['>DÉPART · 14/06<', '>START · 14/06<'], ['>ARRIVÉE AU PORT · 22/06<', '>FINISH AT THE PORT · 22/06<'],
   ['>TRAVERSÉE AUTONOME · NORVÈGE<', '>SELF-SUPPORTED TRAVERSE · NORWAY<'], ['>14 – 22 juin, sous le soleil de minuit<', '>14 – 22 June, under the midnight sun<'],
   ['>m de D+<', '>m of D+<'], ['>jours<', '>days<'], ['>sommets<', '>summits<'], ['>ALTITUDE DE LA TRACE<', '>ALTITUDE OF THE TRACK<'], ['>bateau<', '>boat<'], ['<text x="-45" y="4.5">O<', '<text x="-45" y="4.5">W<'],
   ['9 892', '9,892'],
   [/>Trace GPS de la montre \(7 184 points\) · relief exagéré ×(\d),(\d) · une nuit = un rond · couleur = altitude</, '>Watch GPS track (7,184 points) · relief exaggerated ×$1.$2 · one dot = one night · colour = altitude<'],
   ['>Côtes et lacs © contributeurs OpenStreetMap (ODbL)<', '>Coastline and lakes © OpenStreetMap contributors (ODbL)<'],
  ].forEach(([a, b]) => { const hit = a instanceof RegExp ? a.test(svg) : svg.includes(a); if (!hit) missing.push(`carte_reel.svg : introuvable « ${a} »`); svg = a instanceof RegExp ? svg.replace(a, b) : svg.split(a).join(b); });
  w('docs/carte_reel_en.svg', svg);
}

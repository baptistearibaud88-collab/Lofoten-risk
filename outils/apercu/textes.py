#!/usr/bin/env python3
"""Compte les mots des encadrés du rapport, partie par partie (texte affiché, après le JS).

Usage :
  python3 outils/apercu/textes.py          # toutes les parties
  python3 outils/apercu/textes.py s2 s3    # certaines parties
  python3 outils/apercu/textes.py s2 -v    # affiche aussi les textes

Repères de la version courte : intro ≤ 45, « Comment lire » ≤ 35,
pas de « Méthode », « À retenir » ≤ 55.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from captures import serveur, D3_LOCAL
from playwright.sync_api import sync_playwright

JS = r"""
(sid) => {
  const s = document.getElementById(sid); if (!s) return null;
  const out = [];
  const add = (nom, el) => { const t = (el.innerText || '').replace(/\s+/g, ' ').trim(); if (t) out.push([nom, t]); };
  s.querySelectorAll('.lede').forEach(e => add('Introduction', e));
  s.querySelectorAll('.notes > div').forEach(d => {
    const h = d.querySelector('h4'); const nom = h ? h.textContent.trim() : 'Encadré';
    const c = d.cloneNode(true); const hh = c.querySelector('h4'); if (hh) hh.remove();
    add(nom, c);
  });
  s.querySelectorAll('.ex-body, .cards').forEach(e => add('Bloc ' + (e.className.split(' ')[0]), e));
  const all = (s.innerText || '').replace(/\s+/g, ' ').trim();
  return { blocs: out, total: all.split(' ').length };
}
"""
LIM = {'Introduction': 45, 'Comment lire': 35, 'À retenir': 55, 'Méthode': 0}


def main():
    v = '-v' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    parts = args or [f's{i}' for i in range(1, 11)]
    s = serveur()
    d3 = next((p for p in D3_LOCAL if os.path.exists(p)), None)
    with sync_playwright() as p:
        nav = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = nav.new_page(viewport={'width': 1280, 'height': 900})
        if d3:
            page.route('**/d3.min.js', lambda r: r.fulfill(path=d3, content_type='application/javascript'))
        page.goto(f'http://127.0.0.1:{s.server_address[1]}/risque.html', wait_until='networkidle')
        page.wait_for_timeout(1200)
        grand = 0
        for sid in parts:
            r = page.evaluate(JS, sid)
            if not r: continue
            grand += r['total']
            print(f'\n== {sid} · {r["total"]} mots affichés au total')
            for nom, t in r['blocs']:
                n = len(t.split())
                lim = LIM.get(nom)
                flag = '' if lim is None else ('  ✓' if n <= lim else f'  ✗ (max {lim})')
                print(f'  {nom:<16} {n:>4}{flag}')
                if v: print('     ', t)
        print(f'\nTotal des parties : {grand} mots')
        nav.close()
    s.shutdown()


if __name__ == '__main__':
    main()

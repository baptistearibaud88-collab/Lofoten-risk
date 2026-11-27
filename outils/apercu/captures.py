#!/usr/bin/env python3
"""Captures d'écran du rapport (risque.html) partie par partie.

Usage :
  python3 outils/apercu/captures.py s1 s6        # une ou plusieurs parties
  python3 outils/apercu/captures.py tout         # toutes les parties
  python3 outils/apercu/captures.py s4 --mobile  # largeur téléphone

Les images vont dans apercu/ (à la racine, ignoré par git).
d3 est servi depuis une copie locale si le CDN n'est pas joignable.
"""
import functools, http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SORTIE = os.path.join(RACINE, 'apercu')
# d3 servi en local (npm install) pour que les captures marchent sans réseau ; D3_PATH pour un autre emplacement
D3_LOCAL = [p for p in (os.environ.get('D3_PATH'), os.path.join(RACINE, 'node_modules/d3/dist/d3.min.js')) if p]
# Chromium de Playwright par défaut ; CHROME=/chemin/vers/chrome pour utiliser un autre navigateur
LANCEMENT = {'args': ['--no-sandbox'], **({'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {})}
TOUTES = [f's{i}' for i in range(1, 11)]


def serveur():
    class Silencieux(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Silencieux, directory=RACINE)
    s = socketserver.TCPServer(('127.0.0.1', 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    mobile = '--mobile' in sys.argv
    parts = TOUTES if (not args or 'tout' in args) else args
    os.makedirs(SORTIE, exist_ok=True)
    s = serveur()
    url = f'http://127.0.0.1:{s.server_address[1]}/risque.html'
    d3 = next((p for p in D3_LOCAL if os.path.exists(p)), None)
    with sync_playwright() as p:
        nav = p.chromium.launch(**LANCEMENT)
        vp = {'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 900}
        page = nav.new_page(viewport=vp, device_scale_factor=2 if mobile else 1)
        erreurs = []
        page.on('pageerror', lambda e: erreurs.append(str(e)))
        if d3:
            page.route('**/d3.min.js', lambda r: r.fulfill(path=d3, content_type='application/javascript'))
        page.goto(url, wait_until='networkidle')
        page.wait_for_timeout(1500)
        page.add_style_tag(content='.topbar{position:static!important}')
        for sid in parts:
            el = page.query_selector(f'#{sid}')
            if not el:
                print(f'{sid} : introuvable'); continue
            el.scroll_into_view_if_needed(); page.wait_for_timeout(400)
            nom = os.path.join(SORTIE, f'{sid}{"_mobile" if mobile else ""}.png')
            el.screenshot(path=nom)
            print(nom)
        for e in erreurs:
            print('ERREUR JS :', e)
        nav.close()
    s.shutdown()


if __name__ == '__main__':
    main()

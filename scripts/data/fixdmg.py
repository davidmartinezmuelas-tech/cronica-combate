"""Quita del botón de daño las tiradas condicionales o alternativas.

El texto conserva la alternativa («o 18 (4d6 + 4) si…», «más 2 (1d4) si…»),
pero `dmg` solo debe llevar el daño que se aplica siempre, porque la app suma
todas sus partes. También elimina la cláusula duplicada que dejó la plantilla
de Foundry en los goblins.

Uso: python fixdmg.py ruta/al/srd52_es.json  (o importar fix() desde post.py)
"""
import json, re, sys

SECS = ['tr', 'ac_', 'ba', 're', 'lg']
DUP = re.compile(r'( más (\d+ \(\d+d\d+\) de daño \w+)), más \2 (si la tirada de ataque tenía Ventaja)')


def _norm(s):
    return s.replace(' ', '').replace('−', '-')


def _conditional(text, expr):
    for m in re.finditer(r'\((\d+d\d+(?: ?[+−-] ?\d+)?)\)', text):
        if _norm(m.group(1)) == _norm(expr):
            clause = re.split(r'[.,—]', text[m.end():], 1)[0]
            return re.search(r'\bsi\b', clause) is not None
    return False


def fix(d):
    changed = []
    for m in d['m']:
        for k in SECS:
            for f in m.get(k, []):
                f['d'] = DUP.sub(r', más \2 \3', f['d'])
                dm = f.get('dmg')
                if not dm or len(dm) < 2:
                    continue
                keep = [dm[0]] + [p for p in dm[1:] if not _conditional(f['d'], p[0])]
                if len(keep) != len(dm):
                    changed.append((m['id'], f['n'], [p[0] for p in dm if p not in keep]))
                    f['dmg'] = keep
    return changed


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    path = sys.argv[1]
    d = json.load(open(path, encoding='utf-8'))
    for c in fix(d):
        print(c)
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

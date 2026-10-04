"""Separa el daño fijo del daño condicional o alternativo.

La app suma todas las partes de `dmg`, así que ahí solo debe ir el daño que se
aplica siempre. Las tiradas que dependen de una condición («o 18 (4d6 + 4)
si…», «más 2 (1d4) si…») pasan a `alt`: [{"l": etiqueta, "dmg": partes}], con
el daño completo que se tira en ese caso. También elimina la cláusula
duplicada que dejó la plantilla de Foundry en los goblins.

Uso: python fixdmg.py ruta/al/srd52_es.json  (o importar fix() desde post.py)
"""
import json, re, sys

SECS = ['tr', 'ac_', 'ba', 're', 'lg']
DUP = re.compile(r'( más (\d+ \(\d+d\d+\) de daño \w+)), más \2 (si la tirada de ataque tenía Ventaja)')
LABELS = [
    (r'ventaja', 'con ventaja'),
    (r'si el enjambre está Ensangrentado', 'si está Ensangrentado'),
    (r'si el objetivo está Ensangrentado', 'si el objetivo está Ensangrentado'),
    (r'si el objetivo está agarrado', 'si el objetivo está agarrado'),
    (r'se movió (\d+ pies)', r'tras moverse \1'),
]


def _norm(s):
    return s.replace(' ', '').replace('−', '-')


def _find(text, expr):
    """Devuelve (es_alternativa, cláusula condicional) para la primera aparición de expr, o None."""
    for m in re.finditer(r'\((\d+d\d+(?: ?[+−-] ?\d+)?)\)', text):
        if _norm(m.group(1)) == _norm(expr):
            clause = re.split(r'[.,—]', text[m.end():], 1)[0]
            if not re.search(r'\bsi\b', clause):
                return None
            before = text[max(0, m.start() - 12):m.start()]
            return (re.search(r'\bo \d*\s*$', before) is not None, clause[clause.index('si'):].strip())
    return None


def _label(clause):
    for pat, lab in LABELS:
        mm = re.search(pat, clause, re.I)
        if mm:
            return mm.expand(lab)
    return clause


def fix(d):
    changed = []
    for m in d['m']:
        for k in SECS:
            for f in m.get(k, []):
                f['d'] = DUP.sub(r', más \2 \3', f['d'])
                dm = f.get('dmg')
                if not dm or len(dm) < 2:
                    continue
                keep, alts = [dm[0]], []
                for p in dm[1:]:
                    hit = _find(f['d'], p[0])
                    if hit is None:
                        keep.append(p)
                    else:
                        alts.append((p, hit))
                if not alts:
                    continue
                f['dmg'] = keep
                f['alt'] = []
                for p, (is_or, clause) in alts:
                    # «o X si…» sustituye al daño principal; «más X si…» se suma a todo
                    parts = [p] + keep[1:] if is_or else keep + [p]
                    f['alt'].append({'l': _label(clause), 'dmg': parts})
                changed.append((m['id'], f['n'], f['alt']))
    return changed


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    d = json.load(open(src, encoding='utf-8'))
    for c in fix(d):
        print(c)
    json.dump(d, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

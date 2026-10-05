"""Genera public/data/reglas_es.json: glosario, capítulos de reglas y conjuros del SRD 5.2.1 en español.

Fuentes (CC-BY-4.0):
- translate-dnd5e-sdr2-es: compendium/dnd5e.content24.json y dnd5e.spells24.json (texto en español).
- dnd5e de Foundry VTT: packs/_source/content24/appendices/rules-glossary.yml (glosario en inglés,
  solo para estructura y enlaces) y packs/_source/spells24 (nivel, escuela, alcance… de cada conjuro).
- glossary_es.py: traducción propia del glosario (la traducción de origen solo trae los nombres).

Uso: python rules.py <dir_traduccion_compendium> <dir_foundry_packs_source> <salida.json>
"""
import glob, html, json, os, re, sys

import yaml

from embeds_es import EMBEDS_ES
from fixtext import unify_terms
from glossary_es import GLOSSARY_ES

# Capítulos que interesan en mesa (se excluyen clases, especies, trasfondos, creación de personaje…)
CHAPTERS = {
    'phbD20Tests00000': 'Pruebas de d20',
    'phbActions000000': 'Acciones',
    'phbCombat0000000': 'Combate',
    'phbDamageAndHeal': 'Daño y curación',
    'phbExploration00': 'Exploración',
    'phbSocialInterac': 'Interacción social',
    'phbSpells0000000': 'Lanzar conjuros',
    'phbEquipment0000': 'Equipo',
    'phbMountsAndVehi': 'Monturas y vehículos',
    'phbMagicItems000': 'Objetos mágicos',
    'dmgRunningCombat': 'Dirigir el combate',
    'dmgDmsToolbox000': 'Caja de herramientas del DM',
}
GLOSSARY_ENTRY = 'phbAppendixCRule'

# Otros nombres con los que se busca un término (nombres de la app, de 2014 o abreviaturas)
ALIASES = {
    'Restrained': ['Restringido'], 'Deafened': ['Sordo'], 'Disengage': ['Destrabarse'], 'Hide': ['Esconderse'],
    'Hit Points': ['PG'], 'Armor Class': ['CA'], 'Difficulty Class': ['CD'], 'Challenge Rating': ['VD', 'Valor de desafío'],
    'Nonplayer Character (NPC)': ['PNJ', 'NPC'], 'Experience Points': ['PX', 'XP'], 'Opportunity Attacks': ['Ataque de oportunidad'],
    'Bonus Action': ['Acción bonus'], 'Critical Hit': ['Crítico'], 'Temporary Hit Points': ['PG temporales'], 'Death Saving Throw': ['Salvación de muerte'],
    'Proficiency': ['Bonificador por competencia', 'BC'], 'Utilize': ['Usar un objeto'], 'Exhaustion': ['Cansancio'],
}

TABLE_FIX = {
    ('phbsplConfusionB', '1-1'): 'El objetivo no realiza ninguna acción y usa todo su movimiento para moverse. Tira 1d4 para la dirección: 1, norte; 2, este; 3, sur; 4, oeste.',
}

SCHOOLS = {'abj': 'Abjuración', 'con': 'Conjuración', 'div': 'Adivinación', 'enc': 'Encantamiento', 'evo': 'Evocación', 'ill': 'Ilusión', 'nec': 'Nigromancia', 'trs': 'Transmutación'}


# ---------- HTML -> marcado ligero ----------
# Marcado: párrafos separados por línea en blanco; "### " título; "- " lista; tablas "| a | b |"
# (la primera fila con "|#" es cabecera); **negrita**, *cursiva*; enlaces [[id|texto]].

ABIL = {'str': 'Fuerza', 'dex': 'Destreza', 'con': 'Constitución', 'int': 'Inteligencia', 'wis': 'Sabiduría', 'cha': 'Carisma'}
SKILL = {'acr': 'Acrobacias', 'ani': 'Trato con animales', 'arc': 'Conocimiento arcano', 'ath': 'Atletismo', 'dec': 'Engaño', 'his': 'Historia',
         'ins': 'Perspicacia', 'itm': 'Intimidación', 'inv': 'Investigación', 'med': 'Medicina', 'nat': 'Naturaleza', 'prc': 'Percepción',
         'prf': 'Interpretación', 'per': 'Persuasión', 'rel': 'Religión', 'slt': 'Juego de manos', 'ste': 'Sigilo', 'sur': 'Supervivencia'}


def _roll(m):
    """Tiradas incrustadas de Foundry ([[/save con 15]], [[/check 10 skill=med]], [[/damage 2d6 fire]]…) a texto."""
    body, label = m.group(1).strip(), m.group(2)
    if label:
        return label
    before = re.sub(r'<[^>]+>', '', m.string[max(0, m.start() - 60):m.start()])
    parts = body.split()
    cmd = parts[0] if parts else ''
    args = [a.split('=')[-1] for a in parts[1:]]
    dc = next((a for a in args if a.isdigit()), None)
    if cmd in ('/save', '/check', '/skill'):
        names = [ABIL.get(a) or SKILL.get(a) for a in args if (ABIL.get(a) or SKILL.get(a))]
        name = names[0] if names else ''
        txt = ('de ' + name + ' ' if name and name.lower() not in before.lower() else '') + ('CD ' + dc if dc else '')
        return txt.strip()
    if cmd in ('/r', '/roll', '/gmr', '/damage', '/healing', '/heal'):
        return next((a for a in args if re.match(r'^[\d(]', a)), '')
    return ''


def inline(s, resolve):
    s = re.sub(r'\[\[(/[^\]]*|[^\]]*)\]\](?:\{([^}]*)\})?', _roll, s)
    # contenido incrustado: se marca y to_markup lo sustituye por el texto en español
    s = re.sub(r'@Embed\[([^\]\s]+)[^\]]*\](?:\{[^}]*\})?', lambda m: '§EMBED:' + m.group(1).split('.')[-1] + '§', s)
    s = re.sub(r'@UUID\[([^\]]+)\](?:\{([^}]*)\})?', lambda m: resolve.uuid(m.group(1), m.group(2)), s)
    s = re.sub(r'&(?:amp;)?[Rr]eference\[([^\]]+?)\](?:\{([^}]*)\})?', lambda m: resolve.ref(re.sub(r'\s+\w+=\S+', '', m.group(1)), m.group(2)), s)
    s = re.sub(r'<(strong|b)>\s*(.*?)\s*</\1>', r'**\2**', s, flags=re.S)
    s = re.sub(r'<(em|i)>\s*(.*?)\s*</\1>', r'*\2*', s, flags=re.S)
    s = s.replace('***', '**').replace('****', '')
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    # palabras partidas en la maquetación original: «con - juro», «murcié - lago»
    s = re.sub(r'([a-záéíóúñü]) - ([a-záéíóúñü])', lambda m: m.group(1) + m.group(2), s)
    return re.sub(r'\s+', ' ', s).strip()


def to_markup(h, resolve):
    if not h:
        return ''
    out = []
    # ayudas propias de Foundry VTT (botones, tokens, notas de configuración): no aplican fuera de Foundry
    h = re.sub(r'<section class="(?:fvtt[^"]*|secret)"[^>]*>.*?</section>', '', h, flags=re.S)
    h = re.sub(r'<(div|section|span|article|aside|figure)[^>]*>|</(div|section|span|article|aside|figure)>', '', h)
    if not re.search(r'<(h[1-6]|p|ul|ol|table|blockquote)[\s>]', h):
        h = '<p>' + h + '</p>'
    for m in re.finditer(r'<(h[1-6]|p|ul|ol|table|blockquote)[^>]*>(.*?)</\1>', h, flags=re.S):
        tag, body = m.group(1), m.group(2)
        if tag.startswith('h'):
            t = inline(body, resolve)
            if t: out.append('### ' + t)
        elif tag in ('p', 'blockquote'):
            t = inline(body, resolve)
            if t: out.append(t)
        elif tag in ('ul', 'ol'):
            items = [inline(li, resolve) for li in re.findall(r'<li[^>]*>(.*?)</li>', body, flags=re.S)]
            out.append('\n'.join('- ' + i for i in items if i))
        elif tag == 'table':
            rows = []
            cap = re.search(r'<caption[^>]*>(.*?)</caption>', body, flags=re.S)
            if cap: rows.append('### ' + inline(cap.group(1), resolve))
            grid = []
            for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', body, flags=re.S):
                cells = re.findall(r'<(th|td)[^>]*>(.*?)</\1>', tr, flags=re.S)
                grid.append((all(c[0] == 'th' for c in cells), [cell_safe(inline(c[1], resolve)) for c in cells]))
            width = max((len(c) for _, c in grid), default=0)
            while width > 1 and all(len(c) < width or not c[width - 1] for _, c in grid):
                width -= 1
            heads = [i for i, (h_, _) in enumerate(grid) if h_]
            for i, (head, cells) in enumerate(grid):
                cells = cells[:width]
                if head and heads and i != heads[-1] and i < (heads[-1] if heads else 0):
                    continue  # cabeceras agrupadoras («——— Dificultad ———»): basta la última
                if len([c for c in cells if c]) == 1 and cells[0] and not head and width > 2:
                    cells = [cells[0]]  # fila de categoría: una celda que ocupa todo el ancho
                rows.append(('|#' if head else '|') + ' ' + ' | '.join(cells) + ' |')
            out.append('\n'.join(rows))
    # secciones incrustadas (@Embed): el texto en español de la página o el objeto citado
    expanded = []
    for o in out:
        mk = re.fullmatch(r'§EMBED:(\w+)§', o.strip())
        if mk:
            sub = resolve.embed(mk.group(1)) if hasattr(resolve, 'embed') else ''
            if sub: expanded.append(sub)
        else:
            def flat(mm):
                sub = resolve.embed(mm.group(1)) if hasattr(resolve, 'embed') else ''
                return re.sub(r'\s*\n+\s*', ' ', re.sub(r'(^|\n)### ', r'\1', sub)).strip()
            o = re.sub(r'\*\*([^*]+?[^.:*\s])\*\*\s*(?=§EMBED)', r'**\1.** ', o)
            expanded.append(re.sub(r'\s{2,}', ' ', re.sub(r'§EMBED:(\w+)§', lambda mm: ' ' + flat(mm), o)).strip())
    out = expanded
    # notas de configuración de Foundry al final de algunos conjuros y fórmulas internas sin sentido fuera de Foundry
    for i, o in enumerate(out):
        if re.fullmatch(r'\**Nota de Foundry\**', o.strip()):
            out = out[:i]
            break
    return '\n\n'.join(o for o in out if o.strip() and not re.search(r'lookup|@item|@attributes', o))


def cell_safe(t):
    return re.sub(r'\|(?![^\[]*\]\])', '/', t)


def link_en(t, ref_by_en):
    """[[Nombre en inglés|texto]] (traducciones propias) -> [[id|texto]]."""
    return re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', lambda m: '[[' + ref_by_en.get(m.group(1).lower(), (m.group(1),))[0] + '|' + m.group(2) + ']]', t.strip())


class Resolver:
    def __init__(self, known_pages, ref_by_en, embeds=None):
        self.known = known_pages  # id de página -> nombre en español
        self.ref_by_en = ref_by_en  # nombre en inglés del glosario/regla -> (id, nombre es)
        self.embeds = embeds or {}  # id de página u objeto incrustado -> función que da su texto

    def embed(self, pid):
        f = self.embeds.get(pid)
        return f() if f else ''

    def uuid(self, target, label):
        pid = target.split('.')[-1]
        if pid in self.known:
            return '[[' + pid + '|' + (label or self.known[pid]) + ']]'
        return label or ''

    def ref(self, name, label):
        hit = self.ref_by_en.get(name.strip().lower())
        if hit:
            return '[[' + hit[0] + '|' + (label or hit[1]) + ']]'
        return label or name


def spell_meta(sys_):
    lvl = sys_.get('level', 0)
    act = sys_.get('activation') or {}
    at = act.get('type')
    av = act.get('value')
    ct = {'action': 'Acción', 'bonus': 'Acción adicional', 'reaction': 'Reacción'}.get(at)
    if not ct:
        units = {'minute': ('minuto', 'minutos'), 'hour': ('hora', 'horas')}.get(at)
        ct = (str(av or 1) + ' ' + (units[0] if (av or 1) == 1 else units[1])) if units else (at or '')
    du = sys_.get('duration') or {}
    dv, dun = du.get('value'), du.get('units')
    dmap = {'inst': 'Instantánea', 'perm': 'Hasta que se disipe', 'spec': 'Especial', 'disp': 'Hasta que se disipe'}
    if dun in dmap:
        dur = dmap[dun]
    else:
        names = {'round': ('asalto', 'asaltos'), 'minute': ('minuto', 'minutos'), 'hour': ('hora', 'horas'), 'day': ('día', 'días'), 'turn': ('turno', 'turnos')}
        n = names.get(dun, (dun or '', dun or ''))
        dur = (str(dv) + ' ' + (n[0] if str(dv) == '1' else n[1])).strip()
    props = sys_.get('properties') or []
    conc = 'concentration' in props
    rg = sys_.get('range') or {}
    ru = rg.get('units')
    rmap = {'self': 'Personal', 'touch': 'Toque', 'spec': 'Especial', 'any': 'Ilimitado', 'sight': 'Vista'}
    rng = rmap.get(ru) or ((str(rg.get('value')) + (' pies' if ru == 'ft' else ' millas' if ru == 'mi' else ' ' + str(ru))) if rg.get('value') else (ru or ''))
    tpl = ((sys_.get('target') or {}).get('template') or {})
    if tpl.get('type') and tpl.get('size'):
        shape = {'sphere': 'esfera', 'cone': 'cono', 'cube': 'cubo', 'line': 'línea', 'cylinder': 'cilindro', 'radius': 'emanación', 'square': 'cuadrado', 'wall': 'muro'}.get(tpl['type'], tpl['type'])
        rng += ' (' + shape + ' de ' + str(tpl['size']) + ' pies)'
    cmp = ', '.join(x for x, p in (('V', 'vocal'), ('S', 'somatic'), ('M', 'material')) if p in props)
    return {
        'l': lvl, 'esc': SCHOOLS.get(sys_.get('school'), ''), 'ct': ct + (' o ritual' if 'ritual' in props else ''), 'r': rng,
        'du': ('Concentración, hasta ' + dur.lower()) if conc and dur else dur, 'c': 1 if conc else 0, 'rit': 1 if 'ritual' in props else 0, 'cmp': cmp,
    }


def main(tr_dir, packs, out_path):
    content = json.load(open(os.path.join(tr_dir, 'dnd5e.content24.json'), encoding='utf-8'))['entries']
    spells_es = json.load(open(os.path.join(tr_dir, 'dnd5e.spells24.json'), encoding='utf-8'))['entries']
    gloss_en = yaml.safe_load(open(os.path.join(packs, 'content24', 'appendices', 'rules-glossary.yml'), encoding='utf-8'))['pages']
    gloss_es_names = {p['key']: (pid, p['name']) for pid, p in content[GLOSSARY_ENTRY]['pages'].items()}

    # páginas conocidas (para enlaces): glosario + capítulos
    known = {}
    ref_by_en = {}
    for g in gloss_en:
        pid, nm = gloss_es_names.get(g['name'], (g['_id'], g['name']))
        known[g['_id']] = nm
        ref_by_en[g['name'].lower()] = (g['_id'], nm)
    for ek in CHAPTERS:
        for pid, p in content[ek]['pages'].items():
            if '(2014)' in p.get('name', ''):
                continue
            known[pid] = p['name']
            ref_by_en.setdefault(str(p.get('key', '')).lower(), (pid, p['name']))
    res = Resolver(known, ref_by_en)
    # contenido que los capítulos incrustan: apéndice de referencias (traducción propia), glosario y trampas del compendio de equipo
    appx = yaml.safe_load(open(os.path.join(packs, 'content24', 'appendices', 'appendix-d-rule-references.yml'), encoding='utf-8'))['pages']
    for a in appx:
        if a['name'] in EMBEDS_ES:
            res.embeds[a['_id']] = (lambda t=EMBEDS_ES[a['name']]: link_en(t, ref_by_en))
    for g in gloss_en:
        if g['name'] in GLOSSARY_ES:
            res.embeds[g['_id']] = (lambda t=GLOSSARY_ES[g['name']]: link_en(t, ref_by_en))
    act_path = os.path.join(tr_dir, 'dnd5e.actors24.json')
    if os.path.exists(act_path):
        for a in json.load(open(act_path, encoding='utf-8'))['entries'].values():
            for iid, it in (a.get('items') or {}).items():
                if it.get('description'):
                    res.embeds[iid] = (lambda h=it['description']: to_markup(h, res))
    for sid, sp_ in spells_es.items():
        res.embeds[sid] = (lambda h=sp_.get('description', ''): to_markup(h, res))
    tab_path = os.path.join(tr_dir, 'dnd5e.tables24.json')
    if os.path.exists(tab_path):
        for tid, tb in json.load(open(tab_path, encoding='utf-8'))['entries'].items():
            def table_mk(tb=tb, tid_=tid):
                rows = ['### ' + tb.get('name', ''), '|# Tirada | Resultado |']
                for rk, rv in (tb.get('results') or {}).items():
                    rv = TABLE_FIX.get((tid_, rk), rv)
                    a_, b_ = (rk.split('-') + [''])[:2]
                    txt = ' '.join(inline(x, res) for x in (re.findall(r'<p[^>]*>(.*?)</p>', rv, flags=re.S) or [rv]))
                    rows.append('| ' + (a_ if a_ == b_ or not b_ else a_ + '–' + b_) + ' | ' + cell_safe(txt) + ' |')
                return '\n'.join(rows)
            res.embeds[tid] = table_mk
    eq_path = os.path.join(tr_dir, 'dnd5e.equipment24.json')
    if os.path.exists(eq_path):
        for iid, it in json.load(open(eq_path, encoding='utf-8'))['entries'].items():
            if it.get('description'):
                res.embeds[iid] = (lambda h=it['description']: to_markup(h, res))

    entries = []
    missing = []
    for g in gloss_en:
        nm = gloss_es_names.get(g['name'], (None, g['name']))[1]
        t = GLOSSARY_ES.get(g['name'])
        if t is None:
            missing.append(g['name'])
            continue
        t = link_en(t, ref_by_en)
        cat = 'Estados' if (g.get('system') or {}).get('type') == 'condition' else 'Glosario'
        e = {'id': g['_id'], 'n': nm, 'en': g['name'], 'cat': cat, 't': t}
        if g['name'] in ALIASES:
            e['al'] = ALIASES[g['name']]
        entries.append(e)

    for ek, chap in CHAPTERS.items():
        for pid, p in content[ek]['pages'].items():
            if '(2014)' in p.get('name', ''):
                continue
            t = p.get('text') or ''
            if isinstance(t, dict):
                t = t.get('content') or ''
            mk = to_markup(t, res)
            if len(mk) < 30 or 'Foundry' in p.get('name', '') or re.search(r'\btoken\b|Foundry', mk, re.I):
                continue
            entries.append({'id': pid, 'n': p['name'], 'en': p.get('key', ''), 'cat': chap, 't': mk})

    en_sp = {}
    for f in glob.glob(os.path.join(packs, 'spells24', '**', '*.yml'), recursive=True):
        d = yaml.safe_load(open(f, encoding='utf-8'))
        if d and d.get('type') == 'spell':
            en_sp[d['_id']] = d
    for sid, s in spells_es.items():
        en = en_sp.get(sid)
        if not en:
            missing.append('conjuro ' + sid)
            continue
        meta = spell_meta(en['system'])
        mat = s.get('materials')
        if mat:
            mat = re.sub(r'([a-záéíóúñü]) - ([a-záéíóúñü])', lambda m: m.group(1) + m.group(2), mat)
        if mat and 'M' in meta['cmp']:
            meta['cmp'] += ' (' + mat + ')'
        entries.append({'id': 'sp-' + sid, 'n': s['name'], 'en': en['name'], 'cat': 'Conjuros', 't': to_markup(s.get('description', ''), res), **meta})

    # nombres de los estados como en la app (Apresado, Ensordecido) y con mayúscula tras «condición»
    for e in entries:
        e['n'] = unify_terms(e['n'])
        e['t'] = unify_terms(e['t'])
    # enlaces a páginas que no se incluyen: se quedan como texto
    ids = {e['id'] for e in entries}
    for e in entries:
        e['t'] = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', lambda m: m.group(0) if m.group(1) in ids else m.group(2), e['t'])
    # control: títulos sin texto debajo (contenido que no se ha podido incrustar)
    for e in entries:
        blocks = e['t'].split('\n\n')
        for i, b in enumerate(blocks):
            if b.startswith('### ') and '\n' not in b and (i + 1 == len(blocks) or blocks[i + 1].startswith('### ')):
                missing.append('vacío: ' + e['n'] + ' > ' + b[4:])
    print('entradas', len(entries), '| sin traducir:', missing)
    out = {'v': 1, 'src': 'SRD 5.2.1 (CC-BY-4.0)', 'e': entries}
    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1], sys.argv[2], sys.argv[3])

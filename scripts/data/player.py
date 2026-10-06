"""Genera public/data/jugador_es.json: clases, especies, trasfondos, dotes, armas y armaduras del SRD 5.2.1.

Fuentes (las mismas que el bestiario y las reglas):
- foundryvtt/dnd5e: packs/_source/classes24, origins24, feats24, equipment24 (datos estructurados, inglés).
- translate-dnd5e-sdr2-es: compendium/dnd5e.classes24.json, origins24, feats24, equipment24 (texto en español).

Uso: python player.py <dir_traducciones> <packs/_source> public/data/jugador_es.json
"""
import glob
import json
import os
import re
import sys

import yaml

sys.path.insert(0, os.path.dirname(__file__))
from fixtext import unify_terms  # noqa: E402
from rules import ABIL, SKILL, Resolver, to_markup  # noqa: E402

DMG = {'acid': 'ácido', 'bludgeoning': 'contundente', 'slashing': 'cortante', 'cold': 'frío', 'fire': 'fuego', 'force': 'fuerza',
       'necrotic': 'necrótico', 'piercing': 'perforante', 'psychic': 'psíquico', 'radiant': 'radiante', 'lightning': 'relámpago',
       'thunder': 'trueno', 'poison': 'veneno'}
SIZES = {'tiny': 'Diminuto', 'sm': 'Pequeño', 'med': 'Mediano', 'lg': 'Grande', 'huge': 'Enorme', 'grg': 'Gargantuesco'}
# maestrías de armas (2024)
MASTERY = {'cleave': 'Hendir', 'graze': 'Rozar', 'nick': 'Mella', 'push': 'Empujar', 'sap': 'Debilitar', 'slow': 'Ralentizar',
           'topple': 'Derribar', 'vex': 'Hostigar'}
PROPS = {'amm': 'Munición', 'fin': 'Sutil', 'hvy': 'Pesada', 'lgt': 'Ligera', 'lod': 'Carga', 'rch': 'Alcance', 'thr': 'Arrojadiza',
         'two': 'A dos manos', 'ver': 'Versátil'}


def load(path):
    return yaml.safe_load(open(path, encoding='utf-8'))


def tr_entries(tr_dir, name):
    p = os.path.join(tr_dir, 'dnd5e.' + name + '.json')
    return json.load(open(p, encoding='utf-8'))['entries'] if os.path.exists(p) else {}


RES = Resolver({}, {})


def text(html):
    return unify_terms(to_markup(html or '', RES))


def es(tr, item, field='name'):
    """Texto en español de un objeto (por su _id) o, si falta, el original."""
    e = tr.get(item['_id']) or {}
    if field == 'name':
        return unify_terms(e.get('name') or item['name'])
    return text(e.get('description') or (item['system'].get('description') or {}).get('value'))


def index_items(root):
    out = {}
    for p in glob.glob(os.path.join(root, '**', '*.yml'), recursive=True):
        if os.path.basename(p).startswith('_'):
            continue
        d = load(p)
        if isinstance(d, dict) and '_id' in d:
            out[d['_id']] = d
    return out


def advs(sys_):
    """Avances de un objeto (en algunos archivos son una lista y en otros un diccionario por id)."""
    a = sys_.get('advancement') or []
    return list(a.values()) if isinstance(a, dict) else a


def uses_of(item):
    """Usos de un rasgo: fórmula de máximo (número, @scale…, @prof o modificador) y cuándo se recupera."""
    u = item['system'].get('uses') or {}
    mx = str(u.get('max') or '').strip()
    if not mx:
        return None
    rec = [r.get('period') for r in (u.get('recovery') or []) if r.get('period')]
    per = 'sr' if 'sr' in rec else 'lr' if 'lr' in rec else (rec[0] if rec else '')
    return {'max': mx, 'per': per}


def features(adv, items, tr):
    out = []
    for a in adv:
        if a.get('type') != 'ItemGrant' or a.get('level') is None:
            continue
        for it in (a.get('configuration') or {}).get('items') or []:
            iid = it['uuid'].split('.')[-1]
            f = items.get(iid)
            if not f:
                continue
            row = {'lv': a['level'], 'n': es(tr, f), 'd': es(tr, f, 'd')}
            u = uses_of(f)
            if u:
                row['u'] = u
            out.append(row)
    out.sort(key=lambda r: r['lv'])
    return out


def scales(adv, cls_id):
    out = {}
    for a in adv:
        if a.get('type') != 'ScaleValue':
            continue
        c = a.get('configuration') or {}
        ident = c.get('identifier') or re.sub(r'[^a-z0-9]+', '-', (a.get('title') or '').lower()).strip('-')
        table = {}
        for lv, v in (c.get('scale') or {}).items():
            val = v.get('value') if 'value' in v else (str(v.get('number') or 1) + 'd' + str(v.get('faces')) if v.get('faces') else None)
            if val is not None:
                table[int(lv)] = val
        if table:
            out[cls_id + '.' + ident] = table
    return out


def traits(adv, kind):
    """Competencias concedidas y opciones a elegir de un tipo (saves, skills, armor, weapon)."""
    grants, choices = [], []
    for a in adv:
        if a.get('type') != 'Trait' or a.get('level') not in (0, 1, None):
            continue
        c = a.get('configuration') or {}
        if c.get('mode') not in (None, 'default'):
            continue
        grants += [g.split(':', 1)[1] for g in c.get('grants') or [] if g.startswith(kind + ':')]
        for ch in c.get('choices') or []:
            pool = [g.split(':', 1)[1] for g in ch.get('pool') or [] if g.startswith(kind + ':')]
            if pool:
                choices.append({'count': ch.get('count') or 1, 'pool': pool})
    return grants, choices


def build_classes(packs, tr, items):
    out = []
    for p in sorted(glob.glob(os.path.join(packs, 'classes24', '*', '*.yml'))):
        d = load(p)
        if not isinstance(d, dict) or d.get('type') != 'class':
            continue
        s = d['system']
        adv = advs(s)
        cid = s['identifier']
        saves, _ = traits(adv, 'saves')
        skills_g, skills_c = traits(adv, 'skills')
        # la primera aparición de armas y armaduras es la del personaje de nivel 1 (la segunda, la de multiclase)
        armor = next((a['configuration']['grants'] for a in adv if a.get('type') == 'Trait' and a.get('title') == 'Armor Training'), [])
        weapons = next((a['configuration']['grants'] for a in adv if a.get('type') == 'Trait' and a.get('title') == 'Weapon Proficiencies'), [])
        sub = None
        for sp in glob.glob(os.path.join(os.path.dirname(p), '*.yml')):
            sd = load(sp)
            if isinstance(sd, dict) and sd.get('type') == 'subclass':
                sub = {'id': sd['system']['identifier'], 'n': es(tr, sd), 'en': sd['name'], 'd': es(tr, sd, 'd'), 'f': features(advs(sd['system']), items, tr),
                       'lv': next((a['level'] for a in adv if a.get('type') == 'Subclass'), 3)}
        sc = s.get('spellcasting') or {}
        out.append({
            'id': cid, 'n': es(tr, d), 'en': d['name'], 'hd': int(str(s['hd']['denomination']).lstrip('d')),
            'saves': saves, 'skills': skills_c[0] if skills_c else {'count': 0, 'pool': []},
            'armor': [a.split(':')[-1] for a in armor], 'weapons': [w.split(':')[-1] for w in weapons],
            'caster': sc.get('progression') or 'none', 'spellAb': sc.get('ability') or '',
            'primary': (s.get('primaryAbility') or {}).get('value') or [],
            'asi': sorted({a['level'] for a in adv if a.get('type') == 'AbilityScoreImprovement'}),
            'f': features(adv, items, tr), 'sc': scales(adv, cid), 'sub': sub, 'd': es(tr, d, 'd'),
        })
    return out


def spell_lists(packs):
    """Listas de conjuros de cada clase (capítulo 7 del SRD): id de clase -> ids de conjuro de reglas_es.json (sp-<id>)."""
    out = {}
    d = load(os.path.join(packs, 'content24', 'chapter-7', 'spells.yml'))
    for p in d.get('pages') or []:
        s = p.get('system') or {}
        if p.get('type') == 'spells' and s.get('type') == 'class':
            out[s['identifier']] = ['sp-' + u.split('.')[-1] for u in s.get('spells') or []]
    return out


def build_species(packs, tr, items):
    out = []
    for p in sorted(glob.glob(os.path.join(packs, 'origins24', 'species', '*.yml'))):
        d = load(p)
        if not isinstance(d, dict) or d.get('type') != 'race':
            continue
        s = d['system']
        adv = advs(s)
        size = next((a['configuration']['sizes'] for a in adv if a.get('type') == 'Size'), ['med'])
        res = [g.split(':')[-1] for a in adv if a.get('type') == 'Trait' for g in (a.get('configuration') or {}).get('grants') or [] if g.startswith('dr:')]
        out.append({'id': s['identifier'], 'n': es(tr, d), 'en': d['name'], 'size': [SIZES.get(z, z) for z in size],
                    'speed': (s.get('movement') or {}).get('walk') or 30, 'dv': (s.get('senses') or {}).get('darkvision') or 0,
                    'res': [DMG.get(r, r) for r in res], 't': features([dict(a, level=a.get('level') or 0) for a in adv], items, tr)})
    return out


def build_backgrounds(packs, tr, feats_by_id):
    out = []
    for p in sorted(glob.glob(os.path.join(packs, 'origins24', 'backgrounds', '*.yml'))):
        d = load(p)
        if not isinstance(d, dict) or d.get('type') != 'background':
            continue
        adv = advs(d['system'])
        asi = next((a['configuration'] for a in adv if a.get('type') == 'AbilityScoreImprovement'), {})
        abil = [k for k in ABIL if k not in (asi.get('locked') or [])]
        grants = [g for a in adv if a.get('type') == 'Trait' for g in (a.get('configuration') or {}).get('grants') or []]
        feat = next((it['uuid'].split('.')[-1] for a in adv if a.get('type') == 'ItemGrant' for it in a['configuration']['items']), None)
        out.append({'id': d['system']['identifier'], 'n': es(tr, d), 'en': d['name'], 'abil': abil,
                    'skills': [g.split(':')[-1] for g in grants if g.startswith('skills:')],
                    'tool': next((g.split(':')[-1] for g in grants if g.startswith('tool:')), ''),
                    'feat': feats_by_id.get(feat, {}).get('n', '') if feat else '', 'd': es(tr, d, 'd')})
    return out


def build_feats(packs, tr):
    out = []
    for p in sorted(glob.glob(os.path.join(packs, 'feats24', '*', '*.yml'))):
        d = load(p)
        if not isinstance(d, dict) or d.get('type') != 'feat':
            continue
        cat = os.path.basename(os.path.dirname(p)).replace('-feats', '')
        row = {'id': d['_id'], 'n': es(tr, d), 'en': d['name'], 'cat': cat, 'd': es(tr, d, 'd')}
        u = uses_of(d)
        if u:
            row['u'] = u
        out.append(row)
    return out


def build_weapons(packs, tr):
    out = []
    for p in sorted(glob.glob(os.path.join(packs, 'equipment24', 'weapons', '**', '*.yml'), recursive=True)):
        if '/magical' in p.replace('\\', '/') or '/staff' in p.replace('\\', '/'):
            continue
        d = load(p)
        if not isinstance(d, dict) or d.get('type') != 'weapon':
            continue
        s = d['system']
        t = (s.get('type') or {}).get('value') or ''
        if t not in ('simpleM', 'simpleR', 'martialM', 'martialR'):
            continue
        base = (s.get('damage') or {}).get('base') or {}
        ver = (s.get('damage') or {}).get('versatile') or {}
        rg = s.get('range') or {}
        out.append({
            'id': d['_id'], 'n': es(tr, d), 'en': d['name'], 'base': (s.get('type') or {}).get('baseItem') or '', 'cat': 'sim' if t.startswith('simple') else 'mar',
            'kind': 'ranged' if t.endswith('R') else 'melee',
            'dmg': (str(base.get('number') or 1) + 'd' + str(base['denomination'])) if base.get('denomination') else '1',
            'type': DMG.get((base.get('types') or ['bludgeoning'])[0], ''),
            'ver': (str(ver.get('number') or 1) + 'd' + str(ver['denomination'])) if ver.get('denomination') else '',
            'props': [PROPS[x] for x in s.get('properties') or [] if x in PROPS],
            'range': (str(rg['value']) + '/' + str(rg['long']) + ' pies') if rg.get('value') and rg.get('long') else '',
            'mastery': MASTERY.get(s.get('mastery') or '', ''),
        })
    return out


def build_armor(packs, tr):
    out = []
    for p in sorted(glob.glob(os.path.join(packs, 'equipment24', 'armor', '**', '*.yml'), recursive=True)):
        if '/magical' in p.replace('\\', '/'):
            continue
        d = load(p)
        if not isinstance(d, dict) or d.get('type') != 'equipment':
            continue
        s = d['system']
        t = (s.get('type') or {}).get('value')
        if t not in ('light', 'medium', 'heavy', 'shield'):
            continue
        a = s.get('armor') or {}
        out.append({'id': d['_id'], 'n': es(tr, d), 'en': d['name'], 'type': {'light': 'lgt', 'medium': 'med', 'heavy': 'hvy', 'shield': 'shl'}[t],
                    'ac': a.get('value') or 0, 'dex': a.get('dex'), 'str': s.get('strength') or 0,
                    'stealth': 'stealthDisadvantage' in (s.get('properties') or [])})
    return out


def main(tr_dir, packs, out_path):
    tr_cls = tr_entries(tr_dir, 'classes24')
    tr_org = tr_entries(tr_dir, 'origins24')
    tr_ft = tr_entries(tr_dir, 'feats24')
    tr_eq = tr_entries(tr_dir, 'equipment24')
    items = {**index_items(os.path.join(packs, 'classes24')), **index_items(os.path.join(packs, 'origins24'))}
    feats = build_feats(packs, tr_ft)
    lists = spell_lists(packs)
    data = {
        'v': 1,
        'src': 'SRD 5.2.1 (CC-BY-4.0); traducción basada en translate-dnd5e-sdr2-es (CC-BY-4.0)',
        'abil': ABIL, 'skills': SKILL,
        'classes': [dict(c, spells=lists.get(c['id'], [])) for c in build_classes(packs, tr_cls, items)],
        'species': build_species(packs, tr_org, items),
        'backgrounds': build_backgrounds(packs, tr_org, {f['id']: f for f in feats}),
        'feats': feats,
        'weapons': build_weapons(packs, tr_eq),
        'armor': build_armor(packs, tr_eq),
    }
    json.dump(data, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print({k: len(v) for k, v in data.items() if isinstance(v, list)}, os.path.getsize(out_path) // 1024, 'KB')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(*sys.argv[1:4])

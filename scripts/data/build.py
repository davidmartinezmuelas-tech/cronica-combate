import json, re, pickle, html, collections, sys

D = json.load(open('m2024.json'))
FA = pickle.load(open('fa.pkl', 'rb'))
ES = json.load(open('es/translate-dnd5e-sdr2-es/compendium/dnd5e.actors24.json'))['entries']

DMG = {'acid': 'ácido', 'bludgeoning': 'contundente', 'cold': 'frío', 'fire': 'fuego', 'force': 'fuerza', 'lightning': 'relámpago',
       'necrotic': 'necrótico', 'piercing': 'perforante', 'poison': 'veneno', 'psychic': 'psíquico', 'radiant': 'radiante',
       'slashing': 'cortante', 'thunder': 'trueno'}
DMG_PHRASE = {'ácido': 'de ácido', 'contundente': 'contundente', 'frío': 'de frío', 'fuego': 'de fuego', 'fuerza': 'de fuerza',
              'relámpago': 'de relámpago', 'necrótico': 'necrótico', 'perforante': 'perforante', 'veneno': 'de veneno',
              'psíquico': 'psíquico', 'radiante': 'radiante', 'cortante': 'cortante', 'trueno': 'de trueno'}
COND = {'blinded': 'cegado', 'charmed': 'hechizado', 'deafened': 'ensordecido', 'exhaustion': 'agotamiento', 'frightened': 'asustado',
        'grappled': 'agarrado', 'incapacitated': 'incapacitado', 'invisible': 'invisible', 'paralyzed': 'paralizado',
        'petrified': 'petrificado', 'poisoned': 'envenenado', 'prone': 'derribado', 'restrained': 'apresado',
        'unconscious': 'inconsciente', 'stunned': 'aturdido'}
SIZE = {'Tiny': 'Diminuto', 'Small': 'Pequeño', 'Medium': 'Mediano', 'Large': 'Grande', 'Huge': 'Enorme', 'Gargantuan': 'Gargantuesco',
        'Medium or small': 'Mediano o Pequeño'}
TYPE = {'aberration': 'aberración', 'beast': 'bestia', 'celestial': 'celestial', 'construct': 'constructo', 'dragon': 'dragón',
        'elemental': 'elemental', 'fey': 'feérico', 'fiend': 'infernal', 'giant': 'gigante', 'humanoid': 'humanoide',
        'monstrosity': 'monstruosidad', 'ooze': 'cieno', 'plant': 'planta', 'undead': 'muerto viviente',
        'swarm of tiny beasts': 'enjambre de bestias diminutas', 'swarm of tiny undead': 'enjambre de muertos vivientes diminutos'}
ALIGN = {'unaligned': 'sin alineamiento', 'neutral': 'neutral', 'chaotic evil': 'caótico malvado', 'lawful evil': 'legal malvado',
         'neutral evil': 'neutral malvado', 'lawful good': 'legal bueno', 'chaotic good': 'caótico bueno', 'neutral good': 'neutral bueno',
         'chaotic neutral': 'caótico neutral', 'lawful neutral': 'legal neutral'}
SKILL = {'Perception': 'Percepción', 'Stealth': 'Sigilo', 'Athletics': 'Atletismo', 'Acrobatics': 'Acrobacias', 'Arcana': 'Arcanos',
         'Deception': 'Engaño', 'History': 'Historia', 'Insight': 'Perspicacia', 'Intimidation': 'Intimidación',
         'Investigation': 'Investigación', 'Medicine': 'Medicina', 'Nature': 'Naturaleza', 'Performance': 'Interpretación',
         'Persuasion': 'Persuasión', 'Religion': 'Religión', 'Sleight of Hand': 'Juego de Manos', 'Survival': 'Supervivencia',
         'Animal Handling': 'Trato con Animales'}
SENSE = {'blindsight': 'vista ciega', 'darkvision': 'visión en la oscuridad', 'tremorsense': 'sentido de la vibración', 'truesight': 'visión verdadera'}
SPEED = {'walk': '', 'fly': 'volar', 'swim': 'nadar', 'climb': 'trepar', 'burrow': 'excavar'}
HAB = {'arctic': 'ártico', 'coastal': 'costa', 'desert': 'desierto', 'forest': 'bosque', 'grassland': 'pradera', 'hill': 'colina',
       'mountain': 'montaña', 'swamp': 'pantano', 'underdark': 'Infraoscuridad', 'underwater': 'submarino', 'urban': 'urbano',
       'planar': 'planar', 'any': 'cualquiera'}
LANG = [('Understands', 'entiende'), ('understands', 'entiende'), ("but can’t speak them", 'pero no puede hablarlos'),
        ("but can’t speak", 'pero no puede hablar'), ("can’t speak in", 'no puede hablar en'), ('bear form', 'forma de oso'),
        ('boar form', 'forma de jabalí'), ('rat form', 'forma de rata'), ('tiger form', 'forma de tigre'), ('wolf form', 'forma de lobo'),
        ('plus one other language', 'y un idioma más'), ('plus two other languages', 'y dos idiomas más'),
        ('plus three other languages', 'y tres idiomas más'), ('plus five other languages', 'y cinco idiomas más'),
        ('telepathy', 'telepatía'), ('Thieves’ Cant', 'jerga de ladrones'), ('Deep Speech', 'habla profunda'),
        ('Undercommon', 'infracomún'), ('Common', 'común'), ('Draconic', 'dracónico'), ('Giant', 'gigante'), ('Goblin', 'goblin'),
        ('Infernal', 'infernal'), ('Abyssal', 'abisal'), ('Celestial', 'celestial'), ('Primordial', 'primordial'), ('Elvish', 'élfico'),
        ('Sylvan', 'silvano'), ('Druidic', 'druídico'), ('Gnoll', 'gnoll'), ('Sahuagin', 'sahuagin'), ('Blink Dog', 'perro intermitente'),
        ('Otyugh', 'otyugh'), ('Ignan', 'ígneo'), ('Terran', 'terrano'), ('Aquan', 'acuano'), ('Auran', 'aurano'), ('All', 'todos'),
        (' and ', ' y '), (' ft.', ' pies'), ('works only with creatures that understand', 'solo con criaturas que entiendan'),
        ("doesn’t allow the receiving creature to respond telepathically", 'el receptor no puede responder telepáticamente')]
FORM = {'Vampire Form': 'forma de vampiro', 'Bat Form': 'forma de murciélago', 'Mist Form': 'forma de niebla', 'Human Form': 'forma humana',
        'Hybrid Form': 'forma híbrida', 'Bear Form': 'forma de oso', 'Boar Form': 'forma de jabalí', 'Rat Form': 'forma de rata',
        'Tiger Form': 'forma de tigre', 'Wolf Form': 'forma de lobo'}
TPL = {'cone': 'cono', 'line': 'línea', 'sphere': 'esfera', 'cube': 'cubo', 'cylinder': 'cilindro', 'radius': 'radio', 'emanation': 'emanación', 'square': 'cuadrado', 'wall': 'muro'}
AFFECTS = {'creature': 'criatura', 'object': 'objeto', 'ally': 'aliado', 'enemy': 'enemigo', 'any': 'objetivo', 'space': 'espacio', 'creatureOrObject': 'criatura u objeto', 'willing': 'criatura voluntaria'}
UNITS = {'ft': 'pies', 'mi': 'millas', 'round': 'asalto', 'minute': 'minuto', 'hour': 'hora', 'day': 'día', 'turn': 'turno'}
ABK = ['str', 'dex', 'con', 'int', 'wis', 'cha']
ABES = {'str': 'Fuerza', 'dex': 'Destreza', 'con': 'Constitución', 'int': 'Inteligencia', 'wis': 'Sabiduría', 'cha': 'Carisma',
        'STR': 'FUE', 'DEX': 'DES', 'CON': 'CON', 'INT': 'INT', 'WIS': 'SAB', 'CHA': 'CAR'}
SKK = {'ath': 'Atletismo', 'acr': 'Acrobacias', 'prc': 'Percepción', 'ste': 'Sigilo', 'ins': 'Perspicacia', 'inv': 'Investigación', 'arc': 'Arcanos'}

def crs(cr):
    return {0.125: '1/8', 0.25: '1/4', 0.5: '1/2'}.get(cr, str(int(cr)))

def strip_html(s):
    s = re.sub(r'</p>\s*<p[^>]*>', '\n', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<li>', '\n• ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n\s*\n+', '\n', s)
    return s.strip()

def eng_damage_segments(en):
    segs = re.split(r'(?=\b(?:Hit|Failure|Success|Failure or Success|Trigger|Response)\s*:)', en)
    out = []
    for sg in segs:
        parts = re.findall(r'(\d+) \(([^)]+)\) (\w+) damage', sg) or [(p[0], '', p[1]) for p in re.findall(r'\b(\d+) (\w+) damage', sg) if p[1].lower() in DMG]
        if parts:
            lab = re.match(r'(Hit|Failure|Success)', sg.strip())
            out.append((lab.group(1) if lab else '', parts))
    return out

def dmg_phrase(parts):
    res = []
    for avg, dice, t in parts:
        tes = DMG.get(t.lower(), t.lower())
        res.append(f'{avg}' + (f' ({dice})' if dice else '') + f' de daño {DMG_PHRASE.get(tes, tes)}')
    return ' más '.join(res)

def avg_of(f):
    m = re.match(r'(\d+)d(\d+)\s*([+-]\s*\d+)?', f.replace(' ', ''))
    if not m:
        return f
    n, s = int(m.group(1)), int(m.group(2))
    b = int(m.group(3).replace(' ', '')) if m.group(3) else 0
    return int(n * (s + 1) / 2 + b)

def attack_phrase(en):
    m = re.search(r'(Melee or Ranged|Melee|Ranged) Attack Roll:\s*([+−-]\d+),\s*(.*?)\.\s*(?:Hit|$)', en)
    if not m:
        return None
    kind = {'Melee or Ranged': 'cuerpo a cuerpo o a distancia', 'Melee': 'cuerpo a cuerpo', 'Ranged': 'a distancia'}[m.group(1)]
    tail = m.group(3)
    tail = re.sub(r'reach (\d+) ft\.?', r'alcance \1 pies', tail)
    tail = re.sub(r'range ([\d/]+) ft\.?', r'distancia \1 pies', tail)
    tail = tail.replace(' or ', ' o ').replace('one target', 'un objetivo').replace('one creature', 'una criatura')
    return f'Tirada de ataque {kind}: {m.group(2)}, {tail}'

class Ctx:
    def __init__(s, name_es, items_en2es, en_desc, act):
        s.name = name_es; s.items = items_en2es; s.en = en_desc; s.act = act
        s.dcs = re.findall(r'DC (\d+)', en_desc)
        s.sizes = re.findall(r'(\d+)-foot', en_desc)
        s.widths = re.findall(r'(\d+) feet wide', en_desc)
        s.dsegs = eng_damage_segments(en_desc)
        s.i_dc = s.i_size = s.i_w = s.i_seg = 0
        s.bad = False
        s.ids = {}
    def fail(s, body):
        s.bad = True; FAILS.append(body); return ''

def resolve(desc_es, c):
    t = desc_es
    t = re.sub(r'@Embed\[[^\]]*\]', '', t)
    t = re.sub(r'@UUID\[[^\]]*\]\{([^}]*)\}', r'\1', t)
    t = re.sub(r'&(?:amp;)?Reference\[([a-zA-Z]+)[^\]]*\]\{([^}]*)\}', r'\2', t)
    t = re.sub(r'&(?:amp;)?Reference\[([a-zA-Z]+)[^\]]*\]', lambda m: COND.get(m.group(1).lower(), m.group(1)), t)

    def rep(m):
        body = m.group(1).strip(); label = m.group(2)
        if label:
            if body.startswith('/r') or body.startswith('/item'):
                return label
        if body.startswith('lookup @name'):
            return c.name.lower() if 'lowercase' in body else c.name[0].upper() + c.name[1:]
        if body.startswith('/item'):
            nm = body[5:].strip().split()[0] if body[5:].strip() else ''
            if nm.startswith('.'):
                r = c.ids.get(nm[1:].split('.')[0])
                if r: return r
                return c.fail(body)
            return c.items.get(nm.lower(), nm) if nm else ''
        if body.startswith('/attack') and 'extended' not in body:
            mm2 = re.search(r'Attack Roll:\s*([+−-]\d+)', c.en)
            if mm2: return mm2.group(1)
            return c.fail(body)
        if body.startswith('/attack'):
            p = attack_phrase(c.en)
            if p: return p
            return c.fail(body)
        if body.startswith('/damage') or body.startswith('/healing'):
            args = body.split()[1:]
            formula = next((a for a in args if re.match(r'^\d+d\d+', a)), None)
            if formula:
                ty = next((a.split('=')[1] for a in args if a.startswith('type=')), None) or next((a for a in args if a in DMG), None)
                tes = DMG.get(ty, '') if ty else ''
                if body.startswith('/healing'):
                    return f'{avg_of(formula)} ({formula})'
                return f'{avg_of(formula)} ({formula}) de daño {DMG_PHRASE.get(tes, tes)}'.strip()
            if body.startswith('/healing'):
                mh = re.search(r'(\d+) \(([^)]+)\) (?:temporary )?Hit Points', c.en)
                if mh: return f'{mh.group(1)} ({mh.group(2)})'
                return c.fail(body)
            if c.i_seg < len(c.dsegs):
                lab, parts = c.dsegs[c.i_seg]; c.i_seg += 1
                ph = dmg_phrase(parts)
                if 'extended' in args and lab == 'Hit':
                    return 'Impacto: ' + ph
                return ph
            return c.fail(body)
        if body.startswith('/r'):
            f = body[2:].strip().split('#')[0]
            return f
        if body.startswith('lookup'):
            path = body.split()[1]
            a = c.act
            if path in ('@save.dc.value', '@attributes.spell.dc', '@attributes.spelldc', '@check.dc.value') or re.match(r'@abilities\.\w+\.dc', path):
                if c.i_dc < len(c.dcs):
                    v = c.dcs[c.i_dc]; c.i_dc += 1; return v
                return c.fail(body)
            if path == '@skills.ath.passive':
                m2 = re.search(r'escape DC (\d+)', c.en) or re.search(r'DC (\d+)', c.en)
                if m2: return m2.group(1)
                return c.fail(body)
            if path == '@target.template.size':
                if c.i_size < len(c.sizes):
                    v = c.sizes[c.i_size]; c.i_size += 1; return v
                v = (a or {}).get('target', {}).get('template', {}).get('size')
                if v: return str(v)
                return c.fail(body)
            if path == '@target.template.width':
                if c.i_w < len(c.widths):
                    v = c.widths[c.i_w]; c.i_w += 1; return v
                v = (a or {}).get('target', {}).get('template', {}).get('width')
                if v: return str(v)
                return c.fail(body)
            if path == '@target.template.height':
                v = (a or {}).get('target', {}).get('template', {}).get('height')
                if v: return str(v)
                return c.fail(body)
            if path == '@target.template.type':
                v = (a or {}).get('target', {}).get('template', {}).get('type', '')
                r = TPL.get(v, v)
                return r.capitalize() if 'capitalize' in body else r
            if path == '@target.template.units':
                return 'pies'
            if path == '@target.affects.type':
                v = (a or {}).get('target', {}).get('affects', {}).get('type', '')
                return AFFECTS.get(v, 'criatura')
            if path in ('@target.affects.special', '@target.affects.labels.statblock'):
                v = (a or {}).get('target', {}).get('affects', {}).get('special', '')
                if path.endswith('statblock'):
                    tp = (a or {}).get('target', {}).get('affects', {}).get('type', '')
                    return 'cada ' + AFFECTS.get(tp, 'criatura') + ((' ' + v) if v else '')
                return v
            if path == '@range.value':
                v = (a or {}).get('range', {}).get('value')
                if v: return str(v)
                m2 = re.search(r'(\d+) feet', c.en)
                if m2: return m2.group(1)
                return c.fail(body)
            if path == '@item.range.reach':
                m2 = re.search(r'reach (\d+) ft', c.en)
                if m2: return m2.group(1)
                return c.fail(body)
            if path in ('@item.range.value', '@item.range.long'):
                m2 = re.search(r'range (\d+)/(\d+) ft', c.en)
                if m2: return m2.group(1) if path.endswith('value') else m2.group(2)
                return c.fail(body)
            if path == '@range.units':
                return UNITS.get((a or {}).get('range', {}).get('units', 'ft'), 'pies')
            if path == '@range.special':
                v = (a or {}).get('range', {}).get('special', '')
                if v: return v.replace(' feet', ' pies').replace(' ft.', ' pies')
                return c.fail(body)
            if path == '@activation.condition':
                v = (a or {}).get('activation', {}).get('condition', '')
                if v: return v
                return c.fail(body)
            if path == '@duration.value':
                v = (a or {}).get('duration', {}).get('value')
                if v: return str(v)
                return c.fail(body)
            if path == '@duration.units':
                return UNITS.get((a or {}).get('duration', {}).get('units', ''), '')
            if path == '@duration.special':
                return (a or {}).get('duration', {}).get('special', '')
            if path == '@damage.onSave':
                v = (a or {}).get('damage', {}).get('onSave', '')
                return {'half': 'Mitad de daño', 'none': 'Sin daño'}.get(v, v)
            if path == '@roll.formula':
                v = (a or {}).get('roll', {}).get('formula', '')
                if v: return v
                return c.fail(body)
            if path == '@healing.formula':
                h = (a or {}).get('healing', {})
                f = (h.get('custom') or {}).get('formula') or (f"{h.get('number')}d{h.get('denomination')}" if h.get('number') else '')
                if f: return f
                return c.fail(body)
            return c.fail(body)
        if body.startswith('/save'):
            a = c.act or {}
            sv = a.get('save', {})
            ab = (sv.get('ability') or [''])[0]
            dc = c.dcs[c.i_dc] if c.i_dc < len(c.dcs) else ''
            c.i_dc += 1
            if ab and dc:
                return f'Tirada de salvación de {ABES.get(ab, ab)}: CD {dc}'
            return c.fail(body)
        if body.startswith('/check'):
            kv = dict(x.split('=', 1) for x in body.split()[1:] if '=' in x)
            ab = ABES.get(kv.get('ability', ''), '')
            sk = SKK.get(kv.get('skill', ''), '')
            dc = kv.get('dc', '')
            if not dc or dc.startswith('@'):
                dc = c.dcs[c.i_dc] if c.i_dc < len(c.dcs) else ''
                c.i_dc += 1
            if ab:
                return f'prueba de {ab}' + (f' ({sk})' if sk else '') + (f' CD {dc}' if dc else '')
            return c.fail(body)
        return c.fail(body)

    t = re.sub(r'\[\[([^\]]*)\]\](?:\{([^}]*)\})?', rep, t)
    t = strip_html(t)
    t = re.sub(r'(de daño (?:de )?\w+) de daño', r'\1', t)
    t = re.sub(r'de daño de daño', 'de daño', t)
    if '@' in t or '[[' in t or ']]' in t:
        c.bad = True
    return t

def first_act(it, aid=None):
    acts = (it or {}).get('system', {}).get('activities') or {}
    if aid and aid in acts:
        return acts[aid]
    for a in acts.values():
        return a
    return None

stats = collections.Counter()
BADS=[]
FAILS=[]
SPELLS = {}
OUT = []

def fd_actor(idx):
    if idx in FA: return FA[idx]
    base = idx.split('-')[0]
    return FA.get(base)

for x in D:
    a = fd_actor(x['index'])
    eid = a['_id'] if a else None
    es = ES.get(eid, {}) if eid else {}
    name_es = es.get('name') or x['name']
    if ',' in x['name'] and a:
        form = x['name'].split(',')[1].strip()
        name_es = f"{es.get('name', x['name'].split(',')[0])} ({FORM.get(form, form)})"
    fitems = {}
    for i in sorted((a['items'] if a else []), key=lambda i: 0 if i['type'] == 'spell' else 1):
        fitems[i['name'].lower().replace("'", '’')] = i
    es_items = es.get('items', {})
    items_en2es = {}
    for i in (a['items'] if a else []):
        items_en2es[i['name'].lower()] = es_items.get(i['_id'], {}).get('name', i['name'])
    sysd = a['system'] if a else {}
    pb = x['proficiency_bonus']
    abil = [x[k] for k in ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']]
    mods = [(v - 10) // 2 for v in abil]
    saves = list(mods)
    skills = []
    for p in x['proficiencies']:
        nm = p['proficiency']['name']
        if nm.startswith('Saving Throw: '):
            i = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].index(nm.split(': ')[1])
            saves[i] = p['value']
        elif nm.startswith('Skill: '):
            sk = nm.split(': ')[1]
            skills.append(f"{SKILL.get(sk, sk)} {'+' if p['value'] >= 0 else '−'}{abs(p['value'])}")
    init = mods[1]
    if a:
        ib = (sysd['attributes'].get('init') or {}).get('bonus') or ''
        if ib == '@prof': init += pb
        elif ib == '@prof * 2': init += 2 * pb
        elif ib == '@abilities.int.mod': init += mods[3]
    res = sysd.get('resources', {}) if a else {}
    has_lair = bool((res.get('lair') or {}).get('value'))
    legact = (res.get('legact') or {}).get('max') or 0
    spd = []
    for k, v in x['speed'].items():
        if k == 'hover': continue
        v = str(v).replace(' ft.', ' pies')
        spd.append((SPEED.get(k, k) + ' ' + v).strip())
    if x['speed'].get('hover'): spd[-1] += ' (levitar)'
    sens = []
    for k, v in x['senses'].items():
        if k == 'passive_perception': continue
        sens.append(f"{SENSE.get(k, k)} {str(v).replace(' ft.', ' pies')}")
    lang = x['languages']
    if lang in ('None', '', '—'): lang = '—'
    else:
        for e1, e2 in LANG: lang = lang.replace(e1, e2)
    hab = []
    if a:
        for h in (sysd['details'].get('habitat') or {}).get('value', []):
            hab.append(HAB.get(h.get('type'), h.get('type')))
    ac = x['armor_class'][0]['value'] if x['armor_class'] else 10
    typ = TYPE.get(x['type'], x['type'])
    if x.get('subtype'): typ += f" ({x['subtype']})"
    folder = es.get('folder')
    m = {
        'id': x['index'], 'n': name_es, 'en': x['name'], 'sz': SIZE.get(x['size'], x['size']), 't': typ,
        'al': ALIGN.get(x['alignment'], x['alignment']), 'ac': ac, 'hp': x['hit_points'],
        'hd': (x.get('hit_points_roll') or x['hit_dice']).replace(' ', ''), 'ini': init, 'spd': ', '.join(spd),
        'ab': abil, 'sv': saves, 'sk': ', '.join(skills),
        'vul': [DMG.get(t, t) for t in x['damage_vulnerabilities']],
        'res': [DMG.get(t, t) for t in x['damage_resistances']],
        'imm': [DMG.get(t, t) for t in x['damage_immunities']],
        'ci': [COND.get((cc['name'] if isinstance(cc, dict) else cc).lower(), cc) for cc in x['condition_immunities']],
        'sen': ', '.join(sens), 'pp': x['senses'].get('passive_perception', 10), 'lang': lang,
        'cr': crs(x['challenge_rating']), 'xp': x['xp'], 'pb': pb,
    }
    if x.get('xp_in_lair'): m['xpl'] = x['xp_in_lair']
    if has_lair: m['lair'] = 1
    if hab: m['hab'] = hab
    feats = {}
    for key, short in [('special_abilities', 'tr'), ('actions', 'ac_'), ('bonus_actions', 'ba'), ('reactions', 're'), ('legendary_actions', 'lg')]:
        lst = []
        for f in x.get(key, []):
            fen = f['name']
            it = fitems.get(fen.lower().replace("'", '’')) or fitems.get(fen.lower())
            if x['index'] == 'mule' and not it:
                continue
            nm_es = fen
            desc = None
            if it:
                ei = es_items.get(it['_id'], {})
                nm_es = ei.get('name', fen)
                dsc = ei.get('description')
                if dsc:
                    acts = it['system'].get('activities') or {}
                    aid = None
                    mm = re.search(r'activity=(\w+)', dsc)
                    if mm: aid = mm.group(1)
                    c = Ctx(name_es, items_en2es, f.get('desc', ''), first_act(it, aid))
                    c.ids = {i['_id']: es_items.get(i['_id'], {}).get('name', i['name']) for i in (a['items'] if a else [])}
                    desc = resolve(dsc, c)
                    if c.bad or not desc:
                        stats['fallback'] += 1
                        BADS.append((x['index'], fen, dsc[:300]))
                        desc = None
                    else:
                        stats['es'] += 1
            if desc is None:
                desc = f.get('desc', '')
                stats['en_total'] += 1
            desc = re.split(r'\n?\s*(?:Nota de Foundry|Foundry Note)', desc)[0].strip()
            o = {'n': nm_es, 'd': desc}
            en_d = f.get('desc', '')
            if re.search(r'start of (?:each of )?its turns?|at the start of each of its turns', en_d) or re.search(r'(?:al )?(?:inicio|comienzo) de (?:cada uno de )?sus turnos', desc):
                o['sot'] = 1
            mr = re.search(r'regains (\d+) Hit Points at the start', en_d)
            if mr: o['regen'] = int(mr.group(1))
            if desc == re.split(r'\n?\s*(?:Nota de Foundry|Foundry Note)', f.get('desc', ''))[0].strip():
                o['en'] = 1
            if f.get('attack_bonus') is not None:
                o['atk'] = f['attack_bonus']
            dm = []
            for dd in f.get('damage', []) or []:
                if 'damage_dice' in dd:
                    dm.append([dd['damage_dice'].replace(' ', ''), DMG.get(dd.get('damage_type', {}).get('index', ''), '')])
                elif 'from' in dd:
                    pass
            if dm: o['dmg'] = dm
            if f.get('dc') and 'dc_value' in f['dc']:
                o['dc'] = [f['dc']['dc_value'], ABES.get(f['dc']['dc_type']['name'], f['dc']['dc_type']['name'])]
                if f['dc'].get('success_type') == 'half': o['half'] = 1
            u = f.get('usage') or {}
            if u.get('type') == 'recharge on roll': o['rc'] = u.get('min_value', 6)
            elif u.get('type') == 'per day':
                o['day'] = u.get('times', 1)
                if u.get('times_in_lair'): o['dayl'] = u['times_in_lair']
            elif u.get('type') == 'recharge after rest': o['rest'] = 1
            cm = re.search(r'Costs (\d+) Actions', fen) or re.search(r'Costs (\d+) Actions', f.get('desc', ''))
            if short == 'lg' and cm: o['cost'] = int(cm.group(1))
            if f.get('spellcasting'):
                sc = f['spellcasting']
                sp = []
                for s in sc.get('spells', []):
                    su = s.get('usage') or {}
                    if su.get('type') == 'at will': us = 'a voluntad'
                    elif su.get('type') == 'per day': us = f"{su.get('times', 1)}/día"
                    else: us = ''
                    sp.append([s['index'], us])
                    if s['index'] not in SPELLS:
                        SPELLS[s['index']] = {'en': s['name'], 'l': s.get('level', 0)}
                o['sp'] = sp
                if sc.get('dc'): o['sdc'] = sc['dc']
                if sc.get('modifier') is not None: o['satk'] = sc['modifier']
            if fen == 'Legendary Resistance' or nm_es.startswith('Resistencia legendaria'):
                m['lr'] = u.get('times', 3)
                if u.get('times_in_lair'): m['lrl'] = u['times_in_lair']
            lst.append(o)
        if lst: m[short] = lst
    if m.get('lg'):
        m['la'] = legact or 3
    # spells: es names & descriptions from actor items
    if a:
        for i in a['items']:
            if i['type'] != 'spell': continue
            ident = i['system'].get('identifier') or re.sub(r'[^a-z0-9]+', '-', i['name'].lower()).strip('-')
            ei = es_items.get(i['_id'], {})
            key = ident
            if key in SPELLS and 'n' not in SPELLS[key]:
                SPELLS[key]['n'] = ei.get('name', i['name'])
                dsc = ei.get('description', '')
                if dsc:
                    c = Ctx(name_es, {}, '', None)
                    txt = resolve(dsc, c)
                    if not c.bad:
                        SPELLS[key]['d'] = txt
                    else:
                        txt2 = re.sub(r'\[\[[^\]]*\]\](\{[^}]*\})?', '', dsc)
                        SPELLS[key]['d'] = strip_html(txt2)
                sysi = i['system']
                SPELLS[key]['l'] = sysi.get('level', SPELLS[key]['l'])
                SPELLS[key]['c'] = 1 if 'concentration' in (sysi.get('properties') or []) else 0
                act = (sysi.get('activation') or {}).get('type', '')
                SPELLS[key]['ct'] = {'action': 'acción', 'bonus': 'acción adicional', 'reaction': 'reacción', 'minute': 'minutos', 'hour': 'horas'}.get(act, act)
                rg = sysi.get('range') or {}
                ru = rg.get('units')
                if rg.get('value'):
                    v = str(rg.get('value')); SPELLS[key]['r'] = v + (' milla' + ('' if v == '1' else 's') if ru == 'mi' else ' pies')
                else:
                    SPELLS[key]['r'] = {'self': 'personal', 'touch': 'toque', 'any': 'ilimitado', 'spec': 'especial'}.get(ru, ru or '')
                du = sysi.get('duration') or {}
                PL = {'round': ('asalto', 'asaltos'), 'minute': ('minuto', 'minutos'), 'hour': ('hora', 'horas'), 'day': ('día', 'días'), 'turn': ('turno', 'turnos')}
                dv = str(du.get('value') or '')
                if dv and not dv.isdigit(): dv = '24' if du.get('units') == 'hour' else '1'
                if dv:
                    u = PL.get(du.get('units'), (du.get('units') or '', du.get('units') or ''))
                    SPELLS[key]['du'] = dv + ' ' + (u[0] if dv == '1' else u[1])
                else:
                    SPELLS[key]['du'] = {'inst': 'instantánea', 'perm': 'permanente', 'spec': 'especial'}.get(du.get('units'), du.get('units') or '')
    OUT.append(m)

FIXN = {'scrying': 'Escudriñamiento', 'acid-arrow': 'Flecha ácida', 'cure-wounds': 'Curar heridas', 'lesser-restoration': 'Restablecimiento menor', 'remove-curse': 'Levantar maldición', 'spirit-guardians': 'Guardianes espirituales', 'bless': 'Bendición', 'etherealness': 'Excursión etérea'}
for k, v in FIXN.items():
    if k in SPELLS: SPELLS[k]['n'] = v
missing_sp = [k for k, v in SPELLS.items() if 'n' not in v]
for k in missing_sp:
    SPELLS[k]['n'] = SPELLS[k]['en']
print(stats, 'monsters', len(OUT), 'spells', len(SPELLS), 'missing spell es', len(missing_sp), missing_sp[:20], file=sys.stderr)
json.dump({'v': 1, 'src': 'SRD 5.2.1 (CC-BY-4.0)', 'm': OUT, 'sp': SPELLS}, open('srd52_es.json', 'w'), ensure_ascii=False, separators=(',', ':'))

import random
for b in BADS[:71]: print(b, file=open('bads.txt','a'))

print(collections.Counter(re.sub(r'activity=\w+','',f) for f in FAILS).most_common(30), file=sys.stderr)

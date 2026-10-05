import json, re
from trans import T, SPELL_DESC
d = json.load(open('srd52_es.json'))
SECS = ['tr','ac_','ba','re','lg']
ens = [(m, k, i, f) for m in d['m'] for k in SECS for i, f in enumerate(m.get(k, [])) if f.get('en')]
done = {}
missing = []
for j, (m, k, i, f) in enumerate(ens):
    src = f['d']
    if j in T:
        nm, ds = T[j]
        done[src] = (nm, ds, f['n'])
    elif src in done:
        nm, ds, _ = done[src]
    else:
        missing.append((j, m['id'], f['n'])); continue
    if nm: f['n'] = nm
    elif re.search(r'[A-Za-z]', f['n']) and f['n'] in ('Bite','Rend','Multiattack','Handaxe','Gore','Javelin','Tusk','Hand Crossbow','Longbow','Prowl'):
        pass
    f['d'] = ds
    f.pop('en', None)
# name fixes for duplicates whose english names remain
NAMES = {'Bite':'Mordisco','Rend':'Desgarrar','Multiattack':'Multiataque','Handaxe':'Hacha de mano','Gore':'Cornada','Javelin':'Jabalina','Tusk':'Colmillo','Hand Crossbow':'Ballesta de mano','Longbow':'Arco largo','Prowl':'Merodear','Forbiddance':'Prohibición','Running Water':'Agua corriente','Stake to the Heart':'Estaca en el corazón','Sunlight':'Luz del sol','Grave Strike':'Golpe sepulcral','Divine Aid':'Ayuda divina','Rampage':'Arrasar'}
left = []
for m in d['m']:
    for k in SECS:
        for f in m.get(k, []):
            if f['n'] in NAMES: f['n'] = NAMES[f['n']]
            if f.get('en'): left.append((m['id'], f['n']))
            # sot only for traits about the creature itself
            f.pop('sot', None)
            if k == 'tr' and re.search(r'al (inicio|comienzo) de cada uno de sus turnos', f['d']) and not re.search(r'\bel objetivo\b', f['d']):
                f['sot'] = 1
print('missing trans', missing, 'left english', left)
print('sot', [(m['n'], f['n']) for m in d['m'] for f in m.get('tr', []) if f.get('sot')])

# spells metadata from 5e-database 2024
sp = {s['index']: s for s in json.load(open('sp2024.json'))}
def tr_time(t):
    t = (t or '').strip()
    low = t.lower()
    if low.startswith('bonus action'): base = 'acción adicional'
    elif low.startswith('action'): base = 'acción'
    elif low.startswith('reaction'):
        rest = t.split(',', 1)[1].strip() if ',' in t else ''
        rest = rest.replace('which you take when you are hit by an attack roll or targeted by the Magic Missile spell', 'cuando recibes un impacto de una tirada de ataque o eres objetivo de Proyectil mágico').replace('which you take when you see a creature within 60 feet of yourself casting a spell with Verbal, Somatic, or Material components', 'cuando ves a una criatura a 60 pies o menos lanzar un conjuro con componentes verbales, somáticos o materiales')
        base = 'reacción' + (' (' + rest + ')' if rest and not re.search(r'[a-z]{4,} [a-z]{4,} you', rest) else '')
    else:
        m = re.match(r'(\d+) (minutes|minute|hours|hour)', low)
        U = {'minute':'minuto','minutes':'minutos','hour':'hora','hours':'horas'}
        base = (m.group(1) + ' ' + U[m.group(2)]) if m else t
    if 'ritual' in low: base += ' o ritual'
    return base
def tr_range(r):
    r = r or ''
    r = r.replace('Self', 'personal').replace('Touch', 'toque').replace('Sight', 'vista').replace('Unlimited', 'ilimitado').replace('Special', 'especial')
    r = re.sub(r'(\d+)-foot-radius Sphere', r'esfera de \1 pies de radio', r)
    r = re.sub(r'(\d+)-foot (Cone|Line|Cube|Emanation|Sphere)', lambda m: {'Cone':'cono','Line':'línea','Cube':'cubo','Emanation':'emanación','Sphere':'esfera'}[m.group(2)] + ' de ' + m.group(1) + ' pies', r)
    r = re.sub(r'\s*Component.*$', '', r); r = re.sub(r'(\d[\d,]*) feet', r'\1 pies', r); r = re.sub(r'1 mile', '1 milla', r); r = re.sub(r'(\d+) miles', r'\1 millas', r)
    return r
def tr_dur(du, conc):
    du = du or ''
    du = re.sub(r'^[Uu]p to ', '', du)
    du = du.replace('Instantaneous', 'instantánea').replace('Until dispelled or triggered', 'hasta que se disipe o se active').replace('Until dispelled', 'hasta que se disipe').replace('Special', 'especial')
    U = {'round':'asalto','rounds':'asaltos','minute':'minuto','minutes':'minutos','hour':'hora','hours':'horas','day':'día','days':'días'}
    du = re.sub(r'(\d+) (rounds?|minutes?|hours?|days?)', lambda m: m.group(1) + ' ' + U[m.group(2)], du)
    return ('hasta ' + du if conc else du)
fixed = 0
for k, v in d['sp'].items():
    s = sp.get(k)
    if s:
        v['l'] = s.get('level', v.get('l', 0))
        v['ct'] = tr_time(s.get('casting_time'))
        v['r'] = tr_range(s.get('range'))
        v['c'] = 1 if s.get('concentration') else 0
        v['du'] = tr_dur(s.get('duration'), v['c'])
        if s.get('ritual'): v['rit'] = 1
        v['cmp'] = ', '.join(s.get('components', []))
        fixed += 1
    if not v.get('d') and k in SPELL_DESC: v['d'] = SPELL_DESC[k]
print('spells meta from 5e-db', fixed, '/', len(d['sp']), 'no desc', [k for k, v in d['sp'].items() if not v.get('d')])
for k in ['clairvoyance', 'fireball', 'command', 'detect-magic', 'shield']: print(k, {x: d['sp'][k].get(x) for x in ['n', 'l', 'ct', 'r', 'du', 'c', 'cmp']})
from fixtext import fix as fix_text
print('texto corregido', fix_text(d))
from fixdmg import fix
print('dmg condicional quitado', fix(d))
d['v'] = 2
json.dump(d, open('srd52_es_v2.json', 'w'), ensure_ascii=False, separators=(',', ':'))

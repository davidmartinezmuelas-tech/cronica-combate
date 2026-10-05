"""Corrige el texto del bestiario en español: restos en inglés, «DC», plantillas sin resolver
(«un(a)», «el/la»), palabras repetidas y artículos que no concuerdan con el género del monstruo.

Se aplica antes de fixdmg.py (post.py llama a los dos). Uso suelto:
    python fixtext.py entrada.json [salida.json]
"""
import json, re, sys

SECS = ['tr', 'ac_', 'ba', 're', 'lg']

SIZE = {'Tiny': 'Diminuta', 'Small': 'Pequeña', 'Medium': 'Mediana', 'Large': 'Grande', 'Huge': 'Enorme', 'Gargantuan': 'Gargantuesca'}

# Patrones repetidos en muchos monstruos
GENERIC = [
    (r'\bDC (\d+)', r'CD \1'),
    (r'\((?:with|con) Advantage if the target doesn’t have all its Hit Points?\)', '(con Ventaja si el objetivo no tiene todos sus puntos de golpe)'),
    (r'\(with Advantage if the target is Grappled by the (\w+)\)', r'(con Ventaja si el objetivo está agarrado por el \1)'),
    (r'(?:está |es )?hit by a melee attack roll while holding a weapon', 'recibe un impacto de una tirada de ataque cuerpo a cuerpo mientras empuña un arma'),
    (r'(?:mediante|por) spending (\d+) feet of movement', r'gastando \1 pies de movimiento'),
    (r'\bmoved (\d+)\+ feet', r'se movió \1 pies o más'),
    (r'se movió (\d+)\+ pies', r'se movió \1 pies o más'),
    (r'until the start of its next turn', 'hasta el inicio de su siguiente turno'),
    (r'half its Speed or Burrow Speed', 'la mitad de su Velocidad o de su Velocidad de excavación'),
    (r'half its Speed', 'la mitad de su Velocidad'),
    (r'explota when it dies', 'explota al morir'),
    (r'\breach (\d+) feet', r'alcance \1 pies'),
    (r'\brange (\d+) feet', r'alcance \1 pies'),
    (r'OpportunityAttacks', 'ataques de oportunidad'),
    (r'\bBonus Actions?\b', 'Acción adicional'),
    (r'\bno puede realizar Reaction\b', 'no puede realizar Reacciones'),
    (r'\bReactions?\b', 'Reacción'),
    (r'\bestando Bloodied\b', 'estando Ensangrentado'),
    (r'\bestá Bloodied\b', 'está Ensangrentado'),
    (r'\bMaltrecho\b', 'Ensangrentado'),
    (r'saliendo de Prono', 'saliendo Derribado'),
    (r'\beach creature Grappled por\b', 'cada criatura agarrada por'),
    (r'\bone (Large|Medium|Huge) or smaller creature Grappled por\b', lambda m: 'una criatura ' + SIZE[m.group(1)] + ' o más pequeña agarrada por'),
    (r'\bone (Large|Medium|Huge) or smaller creature\b', lambda m: 'una criatura ' + SIZE[m.group(1)] + ' o más pequeña'),
    (r'\bcriatura (Large|Medium|Huge|Small) or smaller\b', lambda m: 'criatura ' + SIZE[m.group(1)] + ' o más pequeña'),
    (r'\b(?:un|una|un\(a\)) (Large|Medium|Huge|Small) or smaller (?:criatura|creature)\b', lambda m: 'una criatura ' + SIZE[m.group(1)] + ' o más pequeña'),
    (r'\bun\(a\) criatura\b', 'una criatura'),
    # áreas mal montadas por la plantilla: «un(a) 30 pies Cono», «un/una 60 pies de Cono», «un(a) Línea de…»
    (r'\bun(?:\(a\)|/una) (\d+) pies (?:de )?Cono\b', r'un cono de \1 pies'),
    (r'\bun\(a\) (\d+) pies de largo(?: por|,) (\d+) pies de ancho,? Línea\b', r'una línea de \1 pies de largo y \2 pies de ancho'),
    (r'\bun\(a\) Línea\b', 'una línea'),
    (r'\bel/la Cono\b', 'el cono'),
    # palabras repetidas por la plantilla
    (r'\b(contundente|perforante|cortante|de ácido|de fuego|de frío|de veneno) \1\b', r'\1'),
    (r'\bdaño (contundente|perforante|cortante) daño\b', r'daño \1'),
    # embestidas: la plantilla repite el daño extra como si fuera fijo («… más 3 (1d6) de daño contundente. Si … se movió …
    # recibe 3 (1d6) de daño contundente adicional»); solo vale tras la carga
    (r' más (\d+ \(\d+d\d+\)) de daño (\w+)(?=\. Si [^.]*?\1 de daño \2 adicional)', ''),
]

# Correcciones concretas: (id, sección, nombre de la acción) -> [(texto, sustituto), ...]
MANUAL = {
    ('aboleth', 'ac_', 'Consumir recuerdos'): [('cada criatura that is Charmed or Grappled a 30 pies. that is Charmed or Grappled por el aboleth.', 'cada criatura hechizada o agarrada por el aboleth que esté a 30 pies o menos.')],
    ('balor', 'ba', 'Teletransporte'): [('se teletransporta a sí mismo itself or a willing demon within 10 feet hasta 60 pies', 'se teletransporta, a sí mismo o a un demonio voluntario que esté a 10 pies o menos, hasta 60 pies')],
    ('barbed-devil', 'tr', 'Piel espinada'): [('a cualquier criatura it is grappling or any creature grappling it.', 'a cualquier criatura a la que esté agarrando o que lo esté agarrando a él.')],
    ('behir', 'ba', 'Tragar'): [('que ya no tiene agarrado', 'que deja de estar agarrado')],
    ('black-pudding', 're', 'Dividir'): [(None, 'Desencadenante: mientras es de tamaño Grande o Mediano y tiene 10 puntos de golpe o más, la gelatina negra queda Ensangrentada o recibe daño de relámpago o cortante. Respuesta: la gelatina negra se divide en dos nuevas gelatinas negras. Cada una es un tamaño menor que la original y actúa en su iniciativa. Los puntos de golpe de la gelatina negra original se reparten por igual entre las nuevas (redondeando hacia abajo).')],
    ('ochre-jelly', 're', 'Dividir'): [(None, 'Desencadenante: mientras es de tamaño Grande o Mediano y tiene 10 puntos de golpe o más, la gelatina ocre queda Ensangrentada o recibe daño de relámpago o cortante.\nRespuesta: la gelatina ocre se divide en dos nuevas gelatinas ocres. Cada una es un tamaño menor que la original y actúa en su iniciativa. Los puntos de golpe de la gelatina ocre original se reparten por igual entre las nuevas (redondeando hacia abajo).')],
    ('centaur-trooper', 'ba', 'Carga arrolladora'): [('los espacios de Medium or smaller creatures', 'los espacios de criaturas Medianas o más pequeñas')],
    ('chuul', 'ac_', 'Tentáculos Paralizantes'): [('un criatura atrapado (Grappled) por el chuul', 'una criatura agarrada por el chuul')],
    ('doppelganger', 'ac_', 'Golpe'): [('+6 (with Advantage during the first round of each combat)', 'Tirada de ataque cuerpo a cuerpo: +6 (con Ventaja durante la primera ronda de cada combate)')],
    ('doppelganger', 'ba', 'Cambio de forma'): [('se convierte en un/una Medium or smaller, o vuelve', 'se convierte en un humanoide Mediano o Pequeño, o vuelve')],
    ('dryad', 'ba', 'Paso arbóreo'): [(None, 'Si está a 5 pies o menos de un árbol Grande o mayor, la dríade se teletransporta a un espacio desocupado a 5 pies o menos de un segundo árbol que esté a 60 pies o menos del primero.')],
    ('ghoul', 'ac_', 'Garra'): [('Si el objetivo es un criatura that isn’t an Undead or elf, queda', 'Si el objetivo es una criatura que no sea un muerto viviente ni un elfo, queda')],
    ('goblin-boss', 're', 'Redirigir ataque'): [('elige a Small or Medium ally a 5 pies de sí mismo', 'elige a un aliado Pequeño o Mediano que esté a 5 pies o menos de él')],
    ('harpy', 'ac_', 'Canción seductora'): [('cada Humanoid and Giant en una', 'cada humanoide y gigante en una')],
    ('hydra', 'tr', 'Cabezas reactivas'): [('obtiene una Reaction adicional que solo puede usarse para OpportunityAttacks', 'obtiene una Reacción adicional que solo puede usar para ataques de oportunidad')],
    ('kraken', 'ac_', 'Lanzar'): [('lanza a un Large or smaller creature Agarrado por él a un espacio que pueda ver dentro de 60 pies that isn’t in the air.', 'lanza a una criatura Grande o más pequeña que tenga agarrada a un espacio que pueda ver a 60 pies o menos y que no esté en el aire.')],
    ('mimic', 'ba', 'Cambio de forma'): [('un objeto Medium or Small', 'un objeto Mediano o Pequeño')],
    ('nalfeshnee', 're', 'Persecución'): [('debe ser within 10 feet of the triggering creature.', 'debe estar a 10 pies o menos de la criatura que lo ha provocado.')],
    ('pit-fiend', 'tr', 'Aura de miedo'): [('any enemy that starts its turn in the aura.', 'cualquier enemigo que empiece su turno en el aura.')],
    ('rust-monster', 'ac_', 'Destruir metal'): [(None, 'El monstruo oxidante toca un objeto de metal no mágico que esté a 5 pies o menos de él y que nadie lleve puesto ni cargue. El toque destruye un cubo de 1 pie del objeto.')],
    ('sea-hag', 'ac_', 'Mirada mortal'): [('one Frightened creature que', 'una criatura asustada que')],
    ('shambling-mound', 'ac_', 'Engullir'): [('un Medium or smaller creature a 5 pies o menos', 'una criatura Mediana o más pequeña a 5 pies o menos')],
    ('adult-silver-dragon', 'lg', 'Vendaval gélido'): [('el target is pushed up to 30 feet straight away del dragón plateado adulto', 'el objetivo es empujado hasta 30 pies en línea recta, alejándose del dragón plateado adulto')],
    ('tarrasque', 'ac_', 'Bramido atronador'): [('each creature and each object that isn’t being worn or carried en una 150-pies. Cono.', 'cada criatura y cada objeto que nadie lleve puesto ni cargue en un cono de 150 pies.')],
    ('tarrasque', 'ba', 'Tragar'): [('tiene Total contra ataques', 'tiene cobertura total contra ataques')],
    ('will-o-wisp', 'ba', 'Consumir vida'): [('one living creature que el fuego fatuo pueda ver a 5 pies. que tenga 0 Puntos de Golpe.', 'una criatura viva con 0 puntos de golpe que el fuego fatuo pueda ver a 5 pies o menos.'),
                                             ('el fuego fatuo recupera 10 (3d6).', 'el fuego fatuo recupera 10 (3d6) puntos de golpe.')],
    ('giant-frog', 'ac_', 'Tragar'): [('un objetivo Small or smaller', 'un objetivo Pequeño o más pequeño')],
    ('lich', 'lg', 'Teletransporte mortífero'): [('se teletransporta hasta 60 pies. to an unoccupied space it can see,', 'se teletransporta hasta 60 pies a un espacio desocupado que pueda ver,')],
    ('mummy-lord', 're', 'Torbellino de arena'): [('se teletransporta hasta 60 pies. to an unoccupied space it can see.', 'se teletransporta hasta 60 pies a un espacio desocupado que pueda ver.')],
    ('sea-hag', 'tr', 'Apariencia vil'): [('cualquier Beast or Humanoid que', 'cualquier bestia o humanoide que')],
    ('ice-devil', 'ac_', 'Lanza de hielo'): [('no puede realizar una Bonus ni una Reaction', 'no puede realizar una Acción adicional ni una Reacción')],
    ('boar', 'ac_', 'Cornada'): [('recibe 9 (2d8) de daño perforante adicional', 'recibe 3 (1d6) de daño perforante adicional')],
    ('constrictor-snake', 'ac_', 'Constricción'): [('una Medium or smaller criatura', 'una criatura Mediana o más pequeña')],
}

# Defensas escritas en inglés
FIELDS = {
    ('half-dragon', 'res'): ['el tipo de daño elegido en su rasgo Origen dracónico'],
    ('shield-guardian', 'lang'): 'entiende las órdenes dadas en cualquier idioma, pero no puede hablar',
    ('rakshasa', 'vul'): ['daño perforante de armas empuñadas por criaturas bajo los efectos del conjuro Bendición'],
}

NAMES = {'commoner': 'Plebeyo', 'white-dragon-wyrmling': 'Cría de dragón blanco', 'steam-mephit': 'Mefit de vapor', 'wight': 'Tumulario'}

# Nombres cuya primera palabra es femenina («la tarasca», no «el tarasca»). Águila no: «el águila».
FEM = {'Alfombra', 'Araña', 'Armadura', 'Avispa', 'Bruja', 'Cabra', 'Cocatriz', 'Comadreja', 'Cría', 'Draña', 'Dríade', 'Erinia', 'Espada',
       'Esfinge', 'Estirge', 'Extremidad', 'Gelatina', 'Gorgona', 'Gárgola', 'Harpía', 'Hidra', 'Hiena', 'Infantería', 'Lamia', 'Mantícora',
       'Marilith', 'Medusa', 'Momia', 'Mula', 'Naga', 'Orca', 'Pantera', 'Pesadilla', 'Piraña', 'Quimera', 'Rana', 'Rata', 'Salamandra',
       'Serpiente', 'Sombra', 'Tarasca', 'Tortuga'}


# Nombres de los estados como los usa la app (Apresado, Ensordecido) y siempre con mayúscula tras «condición».
# Solo se cambian las formas con mayúscula: en minúscula son adjetivos normales («un rugido sordo»).
CONDITION_WORDS = ['agarrad', 'apresad', 'asustad', 'aturdid', 'cegad', 'derribad', 'ensordecid', 'envenenad', 'hechizad',
                   'incapacitad', 'inconsciente', 'invisible', 'paralizad', 'petrificad', 'agotamiento']


def unify_terms(t):
    t = re.sub(r'\bRestringid(o|a|os|as)\b', r'Apresad\1', t)
    t = re.sub(r'\bSord(o|a|os|as)\b', r'Ensordecid\1', t)

    def cap_list(m):
        words = re.sub(r'\b([a-záéíóúñ]+)\b', lambda w: w.group(1)[0].upper() + w.group(1)[1:] if any(w.group(1).startswith(c) for c in CONDITION_WORDS) else w.group(1), m.group(2))
        return m.group(1) + words
    return re.sub(r'(\b[Cc]ondici[oó]n(?:es)? (?:de )?)((?:[a-záéíóúñ]+)(?:(?:, | y | e | o )[a-záéíóúñ]+)*)', cap_list, t)


def _articles(t, name):
    """«el/del/al/un NOMBRE» -> «la/de la/a la/una NOMBRE» (sin distinguir mayúsculas en el nombre)."""
    n = re.escape(name)
    t = re.sub(r'\b([Ee])l (' + n + r')\b', lambda m: ('L' if m.group(1) == 'E' else 'l') + 'a ' + m.group(2), t, flags=re.I)
    t = re.sub(r'\b([Dd])el (' + n + r')\b', lambda m: m.group(1) + 'e la ' + m.group(2), t, flags=re.I)
    t = re.sub(r'\b([Aa])l (' + n + r')\b', lambda m: m.group(1) + ' la ' + m.group(2), t, flags=re.I)
    t = re.sub(r'\b([Uu])n (' + n + r')\b', lambda m: m.group(1) + 'na ' + m.group(2), t, flags=re.I)
    return t


def fix(d):
    report = {'generic': 0, 'manual': 0, 'fields': 0, 'names': 0, 'articles': 0}
    done = set()
    for m in d['m']:
        if m['id'] in NAMES:
            m['n'] = NAMES[m['id']]
            report['names'] += 1
        for (mid, k), v in FIELDS.items():
            if m['id'] == mid:
                m[k] = v
                report['fields'] += 1
        fem = m['n'].split()[0] in FEM
        for sec in SECS:
            for f in m.get(sec) or []:
                t = f['d']
                for old, new in MANUAL.get((m['id'], sec, f['n']), []):
                    if old is None:
                        t = new
                    else:
                        assert old in t, (m['id'], f['n'], old)
                        t = t.replace(old, new)
                    done.add((m['id'], sec, f['n']))
                    report['manual'] += 1
                for pat, rep in GENERIC:
                    t, k = re.subn(pat, rep, t)
                    report['generic'] += k
                if fem:
                    t2 = _articles(t, m['n'])
                    report['articles'] += t2 != t
                    t = t2
                t2 = unify_terms(t)
                report['terms'] = report.get('terms', 0) + (t2 != t)
                f['d'] = t2
    for sp in d.get('sp', {}).values():
        if sp.get('d'):
            sp['d'] = unify_terms(sp['d'])
    missing = set(MANUAL) - done
    assert not missing, 'correcciones sin aplicar: %s' % missing
    return report


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    data = json.load(open(src, encoding='utf-8'))
    print(fix(data))
    json.dump(data, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

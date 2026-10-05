"""Traducción propia al español del glosario de reglas del SRD 5.2.1 (CC-BY-4.0).

Clave: nombre en inglés de la entrada. Valor: texto en el marcado de rules.py
(párrafos separados por línea en blanco, **negrita**, *cursiva*, "- " listas,
tablas "| a | b |" con "|#" en la cabecera y enlaces [[Nombre en inglés|texto]]).
Terminología según la traducción oficial española de las reglas de 2024.
"""

GLOSSARY_ES = {
    'Bloodied': """Una criatura está Ensangrentada mientras le quede la mitad de sus [[Hit Points|puntos de golpe]] o menos.""",

    'Concentration': """Algunos conjuros y otros efectos requieren Concentración para seguir activos, como indica su descripción. Si el creador del efecto pierde la Concentración, el efecto termina. Si el efecto tiene una duración máxima, su descripción indica cuánto tiempo puede concentrarse en él su creador: hasta 1 minuto, 1 hora u otra duración. El creador puede terminar la Concentración en cualquier momento (no requiere acción). Estos factores rompen la Concentración:

**Otro efecto de Concentración.** Pierdes la Concentración en un efecto en el momento en que empiezas a lanzar un conjuro que requiere Concentración o activas otro efecto que la requiere.

**Daño.** Si recibes daño, debes superar una tirada de salvación de Constitución para mantener la Concentración. La CD es 10 o la mitad del daño recibido (redondeando hacia abajo), lo que sea mayor, hasta una CD máxima de 30.

**Incapacitado o muerto.** Tu Concentración termina si tienes el estado [[Incapacitated|Incapacitado]] o mueres.""",

    'Cover': """La cobertura ofrece cierto grado de protección a un objetivo situado detrás de ella. Hay tres grados de cobertura, y cada uno da un beneficio distinto al objetivo:

|# Grado | Beneficio para el objetivo | Ofrecida por… |
| Media | +2 a la CA y a las tiradas de salvación de Destreza | Otra criatura o un objeto que cubre al menos la mitad del objetivo |
| Tres cuartos | +5 a la CA y a las tiradas de salvación de Destreza | Un objeto que cubre al menos tres cuartas partes del objetivo |
| Total | No puede ser objetivo directo de ataques ni conjuros | Un objeto que cubre por completo al objetivo |

Si está detrás de más de un grado de cobertura, el objetivo solo se beneficia del que más protege. *Véase también* el capítulo Combate.""",

    'Grappled': """Mientras tengas el estado Agarrado, sufres estos efectos:

**Velocidad 0.** Tu [[Speed|Velocidad]] es 0 y no puede aumentar.

**Ataques afectados.** Tienes [[Disadvantage|Desventaja]] en las tiradas de ataque contra cualquier objetivo que no sea quien te agarra.

**Desplazable.** Quien te agarra puede arrastrarte o llevarte consigo cuando se mueve, pero cada pie de movimiento le cuesta 1 pie extra, salvo que seas Diminuto o dos o más tamaños más pequeño que él.""",

    'Opportunity Attacks': """Puedes realizar un Ataque de oportunidad cuando una criatura que puedes ver sale de tu alcance usando su acción, su [[Bonus Action|Acción adicional]], su [[Reaction|Reacción]] o una de sus velocidades. Para realizarlo, usa tu Reacción para hacer un ataque cuerpo a cuerpo con un arma o un [[Unarmed Strike|Golpe sin armas]] contra la criatura que lo ha provocado. El ataque ocurre justo antes de que la criatura salga de tu alcance. *Véase también* el capítulo Combate.""",

    'Prone': """Mientras tengas el estado Derribado, sufres estos efectos:

**Movimiento limitado.** Solo puedes moverte gateando o gastar una cantidad de movimiento igual a la mitad de tu [[Speed|Velocidad]] (redondeando hacia abajo) para levantarte y así terminar el estado. Si tu Velocidad es 0, no puedes levantarte.

**Ataques afectados.** Tienes [[Disadvantage|Desventaja]] en las tiradas de ataque. Una tirada de ataque contra ti tiene [[Advantage|Ventaja]] si el atacante está a 5 pies o menos de ti. Si no, esa tirada de ataque tiene Desventaja.""",
}

# El resto del glosario, por lotes en orden alfabético (inglés)
import importlib as _il

for _i in range(1, 10):
    try:
        GLOSSARY_ES.update(_il.import_module('glossary_es_b%d' % _i).G)
    except ModuleNotFoundError:
        pass

"""Traducción propia de las secciones del apéndice de referencias de reglas (SRD 5.2.1) que los
capítulos incrustan (@Embed) y que la traducción de origen trae vacías.

Clave: nombre en inglés de la página del apéndice. Valor: texto en el marcado de rules.py.
"""

EMBEDS_ES = {
    'Range': """Solo puedes hacer ataques a distancia contra objetivos que estén dentro de un alcance concreto. Si un ataque a distancia, como el de un conjuro, tiene un único alcance, no puedes atacar a un objetivo más allá.

Algunos ataques a distancia, como los de un arco largo, tienen dos alcances. El número menor es el alcance normal y el mayor, el alcance largo. Tu tirada de ataque tiene [[Disadvantage|Desventaja]] si el objetivo está más allá del alcance normal, y no puedes atacar a un objetivo más allá del alcance largo.""",

    'Ranged Attacks in Close Combat': """Apuntar un ataque a distancia es más difícil con un enemigo al lado. Cuando haces una tirada de ataque a distancia con un arma, un conjuro u otro medio, tienes [[Disadvantage|Desventaja]] en la tirada si estás a 5 pies o menos de un enemigo que puede verte y que no tiene el estado [[Incapacitated|Incapacitado]].""",

    'Reach': """Una criatura tiene un alcance de 5 pies, así que puede atacar a objetivos que estén a 5 pies o menos cuando hace un ataque cuerpo a cuerpo. Algunas criaturas tienen ataques cuerpo a cuerpo con un alcance mayor de 5 pies, como indica su descripción.""",

    'Controlling a Mount': """Solo puedes controlar una montura si está adiestrada para aceptar jinete. Los caballos domésticos, las mulas y criaturas parecidas tienen ese adiestramiento.

Cuando montas una montura controlada, su iniciativa pasa a ser la tuya. Se mueve en tu turno según la dirijas, y en ese turno solo tiene tres opciones de acción: [[Dash|Correr]], [[Disengage|Retirarse]] y [[Dodge|Esquivar]]. Una montura controlada puede moverse y actuar incluso en el turno en que la montas.

En cambio, una montura independiente (una que te deja montarla pero no obedece) conserva su lugar en el orden de iniciativa y se mueve y actúa como quiere.""",

    'Mounting and Dismounting': """Durante tu movimiento, puedes montar en una criatura que esté a 5 pies o menos de ti, o desmontar. Hacerlo cuesta tanto movimiento como la mitad de tu [[Speed|Velocidad]] (redondeando hacia abajo). Por ejemplo, con una Velocidad de 30 pies, gastas 15 pies de movimiento para montar en un caballo.""",

    'Healing': """Los puntos de golpe se pueden restablecer con magia, como el conjuro *Curar heridas* o una *poción de curación*, o con un [[Short Rest|descanso corto]] o un [[Long Rest|descanso largo]].

Cuando recibes curación, suma los puntos de golpe restablecidos a los que tienes. Tus puntos de golpe no pueden superar tu máximo, así que los que recuperes por encima se pierden. Por ejemplo, si recibes 8 puntos de golpe de curación y tienes 14 con un máximo de 20, recuperas 6, no 8.""",

    'Difficult Terrain': """Cada pie de movimiento en [[Difficult Terrain|terreno difícil]] cuesta 1 pie extra, aunque en un mismo espacio haya varias cosas que cuenten como terreno difícil.""",

    'Moving Around Other Creatures': """Durante tu movimiento, puedes atravesar el espacio de un aliado, de una criatura con el estado [[Incapacitated|Incapacitado]], de una criatura Diminuta o de una criatura dos tamaños mayor o menor que tú.

El espacio de otra criatura es [[Difficult Terrain|terreno difícil]] para ti, salvo que esa criatura sea Diminuta o aliada tuya.

No puedes terminar voluntariamente un movimiento en un espacio ocupado por otra criatura. Si de algún modo terminas un turno en el espacio de otra criatura, tienes el estado [[Prone|Derribado]], salvo que seas Diminuto o de un tamaño mayor que ella.""",

    'Weapon Masteries': """Cada arma tiene una propiedad de maestría, que solo puede usar un personaje con un rasgo, como Maestría con armas, que se la desbloquee. Las propiedades son estas:

### Hender (Cleave)

Si impactas a una criatura con una tirada de ataque cuerpo a cuerpo con esta arma, puedes hacer otra tirada de ataque cuerpo a cuerpo con ella contra una segunda criatura que esté a 5 pies o menos de la primera y dentro de tu alcance. Si impactas, la segunda criatura recibe el daño del arma, pero sin sumar tu modificador por característica, salvo que sea negativo. Solo puedes hacer este ataque extra una vez por turno.

### Rozar (Graze)

Si tu tirada de ataque con esta arma falla contra una criatura, puedes infligirle tanto daño como el modificador por característica que usaste en la tirada. El daño es del mismo tipo que el del arma, y solo puede aumentar si aumenta ese modificador.

### Mella (Nick)

Cuando haces el ataque extra de la propiedad Ligera, puedes hacerlo como parte de la acción de [[Attack|Atacar]] en lugar de como [[Bonus Action|Acción adicional]]. Solo puedes hacer este ataque extra una vez por turno.

### Empujar (Push)

Si impactas a una criatura con esta arma, puedes empujarla hasta 10 pies en línea recta alejándola de ti, si es de tamaño Grande o menor.

### Debilitar (Sap)

Si impactas a una criatura con esta arma, esa criatura tiene [[Disadvantage|Desventaja]] en su siguiente tirada de ataque antes del inicio de tu siguiente turno.

### Ralentizar (Slow)

Si impactas a una criatura con esta arma y le infliges daño, puedes reducir su [[Speed|Velocidad]] en 10 pies hasta el inicio de tu siguiente turno. Si la criatura recibe más de un impacto de armas con esta propiedad, la reducción de Velocidad no pasa de 10 pies.

### Derribar (Topple)

Si impactas a una criatura con esta arma, puedes obligarla a hacer una tirada de salvación de Constitución (CD 8 más el modificador por característica que usaste en la tirada de ataque y tu bonificador por competencia). Si la falla, tiene el estado [[Prone|Derribado]].

### Acosar (Vex)

Si impactas a una criatura con esta arma y le infliges daño, tienes [[Advantage|Ventaja]] en tu siguiente tirada de ataque contra ella antes del final de tu siguiente turno.""",

    'Reactions': """Una [[Reaction|Reacción]] es una acción especial que se realiza en respuesta a un desencadenante que define su descripción. Puedes realizar una Reacción en el turno de otra criatura, y si la realizas en tu turno, puedes hacerlo aunque también realices una acción, una [[Bonus Action|Acción adicional]] o ambas. Cuando realizas una Reacción, no puedes realizar otra hasta el inicio de tu siguiente turno. El [[Opportunity Attacks|ataque de oportunidad]] es una Reacción que tienen todas las criaturas.""",

    'Travel Pace': """Mientras viaja fuera del combate, un grupo puede moverse a ritmo rápido, normal o lento, como muestra la tabla de Ritmo de viaje. La tabla indica cuánto avanza el grupo en un periodo de tiempo; si van a caballo o en otras monturas, pueden recorrer el doble de esa distancia durante 1 hora, tras lo cual las monturas necesitan un [[Short Rest|descanso corto]] o [[Long Rest|largo]] antes de volver a ir a ese ritmo. La *Guía del Máster* tiene reglas sobre qué ritmo se puede elegir en ciertos terrenos.

### Ritmo de viaje
|# Ritmo | Por minuto | Por hora | Por día |
| Rápido | 400 pies | 4 millas | 30 millas |
| Normal | 300 pies | 3 millas | 24 millas |
| Lento | 200 pies | 2 millas | 18 millas |

Cada ritmo de viaje tiene un efecto de juego:

**Rápido.** Viajar a ritmo rápido impone [[Disadvantage|Desventaja]] en las pruebas de Sabiduría (Percepción o Supervivencia) y de Destreza (Sigilo) de los viajeros.

**Normal.** Viajar a ritmo normal impone Desventaja en las pruebas de Destreza (Sigilo).

**Lento.** Viajar a ritmo lento da [[Advantage|Ventaja]] en las pruebas de Sabiduría (Percepción o Supervivencia).""",

    'Your Turn': """En tu turno, puedes moverte una distancia de hasta tu [[Speed|Velocidad]] y realizar una [[Action|acción]]. Tú decides si te mueves primero o actúas primero.

Las acciones principales que puedes realizar están en Acciones. Los rasgos de un personaje y el bloque de estadísticas de un monstruo también dan opciones de acción. El movimiento se explica en Movimiento y posición.

**Comunicarse.** Puedes comunicarte como puedas, con frases breves y gestos, durante tu turno. No gasta ni tu acción ni tu movimiento.

Una comunicación larga, como explicar algo con detalle o intentar persuadir a un enemigo, requiere una acción. La acción de [[Influence|Influir]] es la forma principal de intentar influir en un monstruo.

**Interactuar con cosas.** Puedes interactuar gratis con un objeto o elemento del entorno durante tu movimiento o tu acción. Por ejemplo, puedes abrir una puerta mientras avanzas hacia un enemigo.

Si quieres interactuar con un segundo objeto, debes realizar la acción de [[Utilize|Utilizar]]. Algunos objetos mágicos y otros objetos especiales siempre requieren una acción para usarse, como indica su descripción.

El DM puede pedirte que uses una acción para cualquiera de estas actividades cuando requiera un cuidado especial o presente un obstáculo inusual. Por ejemplo, puede pedirte la acción de Utilizar para abrir una puerta atascada o girar una manivela para bajar un puente levadizo.

**No hacer nada en tu turno.** Puedes renunciar a moverte, a actuar o a hacer nada en tu turno. Si no sabes qué hacer, plantéate la acción defensiva de [[Dodge|Esquivar]] o la de [[Ready|Preparar]] para actuar más tarde.""",
}

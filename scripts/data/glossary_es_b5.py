"""Glosario de reglas (SRD 5.2.1) en español, lote 5: Malnutrition – Spell."""

G = {
    'Malnutrition': """Una criatura necesita cada día una cantidad de comida según su tamaño, como muestra la tabla de Necesidades de comida diarias. Una criatura que come, pero menos de la mitad de lo que necesita en un día, debe superar una tirada de salvación de Constitución CD 10 o ganará 1 nivel de [[Exhaustion|Agotamiento]] al final del día. Una criatura que no come nada durante 5 días gana automáticamente 1 nivel de Agotamiento al final del quinto día y otro más al final de cada día siguiente sin comer.

El Agotamiento causado por malnutrición no puede eliminarse hasta que la criatura coma toda la comida que necesita en un día.

### Necesidades de comida diarias
|# Tamaño | Comida |
| Diminuto | 1/4 de libra |
| Pequeño | 1 libra |
| Mediano | 1 libra |
| Grande | 4 libras |
| Enorme | 16 libras |
| Gargantuesco | 64 libras |""",

    'Monster': """Un monstruo es una criatura que controla el DM, aunque sea benévola. *Véase también* [[Creature|Criatura]] y [[Nonplayer Character (NPC)|PNJ]].""",

    'Nonplayer Character (NPC)': """Un personaje no jugador (PNJ) es un monstruo con nombre propio y una personalidad diferenciada. *Véase también* [[Monster|Monstruo]].""",

    'Object': """Un objeto es una cosa inanimada y diferenciada. Las cosas compuestas, como los edificios, constan de más de un objeto. *Véase también* [[Breaking Objects|Romper objetos]].""",

    'Occupied Space': """Un espacio está ocupado si hay una criatura en él o si está completamente lleno de objetos.""",

    'Paralyzed': """Mientras tengas el estado Paralizado, sufres estos efectos:

**Incapacitado.** Tienes el estado [[Incapacitated|Incapacitado]].

**Velocidad 0.** Tu Velocidad es 0 y no puede aumentar.

**Salvaciones afectadas.** Fallas automáticamente las tiradas de salvación de Fuerza y Destreza.

**Ataques afectados.** Las tiradas de ataque contra ti tienen [[Advantage|Ventaja]].

**Críticos automáticos.** Cualquier tirada de ataque que te impacte es un [[Critical Hit|golpe crítico]] si el atacante está a 5 pies o menos de ti.""",

    'Passive Perception': """La Percepción pasiva es una puntuación que refleja lo atenta que está una criatura a lo que la rodea en general. El DM la usa para decidir si una criatura se da cuenta de algo sin hacer conscientemente una prueba de Sabiduría (Percepción).

La Percepción pasiva de una criatura es 10 más su bonificador a las pruebas de Sabiduría (Percepción). Si tiene [[Advantage|Ventaja]] en esas pruebas, súmale 5; si tiene [[Disadvantage|Desventaja]], réstale 5. Por ejemplo, un personaje de nivel 1 con Sabiduría 15 y competencia en Percepción tiene una Percepción pasiva de 14 (10 + 2 + 2). Si ese personaje tiene Ventaja en las pruebas de Sabiduría (Percepción), su puntuación pasa a 19.""",

    'Per Day': """Si una regla dice que puedes usar algo cierto número de veces por día, significa que, cuando gastes todos los usos, debes terminar un [[Long Rest|descanso largo]] para volver a usarlo.""",

    'Petrified': """Mientras tengas el estado Petrificado, sufres estos efectos:

**Convertido en sustancia inanimada.** Te transformas, junto con los objetos no mágicos que llevas puestos o cargas, en una sustancia sólida e inanimada (normalmente piedra). Tu peso se multiplica por diez y dejas de envejecer.

**Incapacitado.** Tienes el estado [[Incapacitated|Incapacitado]].

**Velocidad 0.** Tu Velocidad es 0 y no puede aumentar.

**Ataques afectados.** Las tiradas de ataque contra ti tienen [[Advantage|Ventaja]].

**Salvaciones afectadas.** Fallas automáticamente las tiradas de salvación de Fuerza y Destreza.

**Resistes el daño.** Tienes [[Resistance|Resistencia]] a todo el daño.

**Inmune al veneno.** Tienes inmunidad al estado [[Poisoned|Envenenado]].""",

    'Player Character': """Un personaje jugador es un personaje que controla un jugador.""",

    'Poisoned': """Mientras tengas el estado Envenenado, sufres este efecto:

**Pruebas de característica y ataques afectados.** Tienes [[Disadvantage|Desventaja]] en las tiradas de ataque y en las pruebas de característica.""",

    'Possession': """Algunos efectos hacen que una criatura quede poseída por otra criatura o entidad. El efecto de posesión define cómo funciona. La posesión se puede impedir con el conjuro *Protección contra el bien y el mal* y terminar con *Disipar el bien y el mal*.""",

    'Proficiency': """Si eres competente con algo, puedes sumar tu bonificador por competencia a cualquier [[D20 Test|prueba de d20]] que hagas usando eso. Una criatura puede ser competente en una habilidad o una tirada de salvación, o con un arma o una herramienta.""",

    'Reaction': """Una reacción es una respuesta instantánea a un desencadenante. Solo puedes realizar una Reacción por ronda; la recuperas al inicio de tu turno. El ejemplo más habitual es el [[Opportunity Attacks|ataque de oportunidad]]. *Véase también* [[Ready|Preparar]].""",

    'Ready': """Realizas la acción de Preparar para esperar a una circunstancia concreta antes de actuar. Para ello, realizas esta acción en tu turno, lo que te permite actuar con una [[Reaction|Reacción]] antes del inicio de tu siguiente turno.

Primero, decides qué circunstancia perceptible desencadenará tu Reacción. Después, eliges la acción que realizarás en respuesta, o decides moverte hasta tu Velocidad en respuesta. Por ejemplo: «Si el sectario pisa la trampilla, tiraré de la palanca que la abre» o «Si el zombi se pone a mi lado, me alejo».

Cuando ocurre el desencadenante, puedes realizar tu Reacción justo cuando termina o ignorarlo.

Cuando preparas un conjuro, lo lanzas de forma normal (gastando los recursos necesarios), pero contienes su energía, que liberas con tu Reacción cuando ocurre el desencadenante. Para poder prepararlo, el conjuro debe tener un tiempo de lanzamiento de una acción, y contener su magia requiere [[Concentration|Concentración]], que puedes mantener hasta el inicio de tu siguiente turno. Si se rompe tu Concentración, el conjuro se disipa sin efecto.""",

    'Resistance': """Si tienes resistencia a un tipo de daño, el daño de ese tipo que recibes se reduce a la mitad (redondeando hacia abajo). La resistencia solo se aplica una vez a cada ocasión de daño. *Véase también* [[Vulnerability|Vulnerabilidad]] y el capítulo Daño y curación.""",

    'Restrained': """Mientras tengas el estado Restringido, sufres estos efectos:

**Velocidad 0.** Tu [[Speed|Velocidad]] es 0 y no puede aumentar.

**Ataques afectados.** Las tiradas de ataque contra ti tienen [[Advantage|Ventaja]] y tus tiradas de ataque tienen [[Disadvantage|Desventaja]].

**Salvaciones afectadas.** Tienes Desventaja en las tiradas de salvación de Destreza.""",

    'Ritual': """Si tienes preparado un conjuro con la etiqueta Ritual, puedes lanzarlo como ritual. La versión ritual tarda 10 minutos más de lo normal en lanzarse. Tampoco gasta un espacio de conjuro, por lo que no puede lanzarse a un nivel superior. *Véase también* el capítulo Lanzar conjuros.""",

    'Round Down': """Siempre que dividas o multipliques un número en el juego, redondea hacia abajo si obtienes una fracción, aunque sea de un medio o más. Algunas reglas hacen una excepción y te piden redondear hacia arriba.""",

    'Save': """Salvación es otro nombre de la tirada de salvación. *Véase también* [[Saving Throw|Tirada de salvación]].""",

    'Saving Throw': """Una tirada de salvación (o salvación) representa un intento de evitar o resistir una amenaza. Normalmente solo haces una cuando una regla te lo pide, pero puedes decidir fallarla sin tirar. El resultado lo detalla el efecto que la provoca. Si un objetivo debe hacer una salvación y no tiene la puntuación de característica que usa, falla automáticamente. *Véase también* [[D20 Test|Prueba de d20]].""",

    'Search': """Cuando realizas la acción de Buscar, haces una prueba de Sabiduría para descubrir algo que no es evidente. La tabla de Buscar sugiere qué habilidades sirven según lo que intentes detectar.

### Buscar
|# Habilidad | Qué detectar |
| Perspicacia | El estado de ánimo de una criatura |
| Medicina | La dolencia o la causa de la muerte de una criatura |
| Percepción | Una criatura u objeto ocultos |
| Supervivencia | Huellas o comida |""",

    'Shape-Shifting': """Si un efecto, como Forma salvaje o el conjuro *Polimorfar*, te permite cambiar de forma, su descripción indica qué te ocurre. Salvo que diga lo contrario, los efectos que te afecten (estados, conjuros, maldiciones y demás) se mantienen al pasar de una forma a otra. Vuelves a tu forma verdadera si mueres.""",

    'Short Rest': """Un descanso corto es un periodo de 1 hora de inactividad durante el que una criatura no hace nada más agotador que leer, hablar, comer o montar guardia. Para empezar un descanso corto debes tener al menos 1 punto de golpe.

**Beneficios del descanso.** Al terminarlo, obtienes estos beneficios:

**Gastar Dados de golpe.** Puedes gastar uno o más de tus [[Hit Point Dice|Dados de golpe]] para recuperar puntos de golpe. Por cada uno que gastes, tíralo y súmale tu modificador por Constitución. Recuperas tantos puntos de golpe como el total (mínimo 1). Puedes decidir gastar otro Dado de golpe después de cada tirada.

**Rasgos especiales.** Algunos rasgos se recargan con un descanso corto. Si tienes alguno, se recarga como indique su descripción.

**Interrumpir el descanso.** Un descanso corto se interrumpe por cualquiera de estas cosas:

- Tirar iniciativa
- Lanzar un conjuro que no sea un truco
- Recibir cualquier daño

Un descanso corto interrumpido no da ningún beneficio.""",

    'Simultaneous Effects': """Si dos o más cosas ocurren a la vez en un turno, la persona de la mesa (jugador o DM) a la que le toca el turno decide en qué orden ocurren. Por ejemplo, si dos efectos ocurren al inicio del turno de un personaje jugador, el jugador decide cuál ocurre primero.""",

    'Size': """Una criatura o un objeto pertenece a una categoría de tamaño: Diminuto, Pequeño, Mediano, Grande, Enorme o Gargantuesco. El tamaño de una criatura determina cuánto espacio ocupa en combate. El tamaño de un objeto afecta a sus puntos de golpe. *Véase también* [[Breaking Objects|Romper objetos]] y el capítulo Combate.""",

    'Skill': """Una habilidad es un área de especialización asociada a una prueba de característica. Si eres competente en una habilidad, puedes sumar tu bonificador por competencia cuando hagas una prueba de característica asociada a ella. *Véase también* [[Proficiency|Competencia]].""",

    'Speed': """Una criatura tiene una Velocidad, que es la distancia en pies que puede recorrer cuando se mueve en su turno. *Véase también* [[Climbing|Trepar]], [[Crawling|Gatear]], [[Flying|Volar]], [[Jumping|Saltar]] y [[Swimming|Nadar]].

**Velocidades especiales.** Algunas criaturas tienen velocidades especiales, como Velocidad de excavación, de trepar, de vuelo o de nado, definidas en este glosario. Si tienes más de una velocidad, elige cuál usar al moverte; puedes cambiar de una a otra durante el movimiento. Cada vez que cambies, resta la distancia ya recorrida de la nueva velocidad: el resultado es cuánto más puedes moverte. Si es 0 o menos, no puedes usar la nueva velocidad en este movimiento. Por ejemplo, con Velocidad 30 y Velocidad de vuelo 40 podrías volar 10 pies, caminar 10 pies y saltar al aire para volar 20 pies más.

**Cambios en tus velocidades.** Si un efecto aumenta o reduce tu Velocidad durante un tiempo, tus velocidades especiales aumentan o se reducen lo mismo durante ese tiempo. Por ejemplo, si tu Velocidad se reduce a 0 y tienes Velocidad de trepar, esta también se reduce a 0. Del mismo modo, si tu Velocidad se reduce a la mitad y tienes Velocidad de vuelo, esta también se reduce a la mitad.""",

    'Spell': """Un conjuro es un efecto mágico con las características descritas en el capítulo Lanzar conjuros. Cada conjuro tiene un nivel (los trucos son de nivel 0), un tiempo de lanzamiento, un alcance, unos componentes y una duración.""",
}

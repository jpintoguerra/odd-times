# Documentación técnica

## 1. Arquitectura final

```
                 proceso "bot" (npm run bot)                    proceso "web" (npm run web)
 Árbitro  ◄──►  arbiter/client.js ◄── arbiter/loop.js            api/server.js ◄──► Navegador (web/)
 (HTTPS,                                   │                          │
 long polling)                             ▼                          ▼
                                 engine/index.js  chooseMove  ◄───────┘   (mismo código)
                                           │
                              engine/search.js · evaluate.js · position.js
                                           │
                                   rules/board.js  (reglas puras)
```

| Capa | Archivos | Depende de | I/O |
|---|---|---|---|
| Reglas | `src/rules/board.js` | nada | no |
| Motor | `src/engine/*` | reglas | no |
| Cliente del árbitro | `src/arbiter/client.js`, `loop.js` | motor, reglas | HTTP saliente |
| API web | `src/api/server.js` | motor, reglas | HTTP entrante |
| Frontend | `web/*` | API | navegador |
| Árbitro simulado | `mock/mock-arbiter.js` | reglas | HTTP entrante |

- **Reglas y motor son puros**: se prueban sin levantar servidores.
- **El mismo `chooseMove`** juega el torneo y la app web.
- `npm start` corre el bot y **lanza la web en un proceso hijo** (ver Desviaciones §5.1).

## 2. Cómo funciona el algoritmo

### 2.1 Búsqueda: negamax con poda alfa-beta
Es minimax escrito de forma compacta: el puntaje de una posición para el jugador que mueve es el **negativo** del mejor puntaje que el rival puede obtener desde ahí. La poda alfa-beta deja de explorar una rama en cuanto demuestra que el rival nunca la permitiría. El resultado es el mismo que con minimax, pero se visitan muchas menos posiciones.

Mejoras que hacen que llegue más profundo en el mismo tiempo:

| Técnica | Qué hace | Dónde |
|---|---|---|
| **Atajos de raíz** | Si podemos ganar ya, jugamos ahí. Si el rival amenaza ganar, bloqueamos. Sin buscar. | `search.js` (inicio) |
| **Ordenamiento central** | Explora columnas `3,4,2,5,1,6,0,7`; el centro participa en más líneas y suele ser mejor, y explorar primero lo mejor poda más | `CENTER_ORDER` |
| **Mejor jugada previa primero** | La mejor jugada guardada en la tabla de transposición (o la de la iteración anterior en la raíz) se explora primero | `negamax`, `rootOrder` |
| **Jugadas suicidas al final** | Las jugadas que dejan al rival una victoria justo encima se exploran al final | `negamax` (`bad`) |
| **Tabla de transposición (TT)** | Guarda posiciones ya evaluadas (puntaje, profundidad, tipo de cota, mejor jugada) para no repetir trabajo cuando se llega a la misma posición por otro orden | `Map` + hash Zobrist |
| **Hash Zobrist** | Clave de ~53 bits por posición, actualizada con XOR en cada jugar/deshacer (O(1)) | `position.js` |
| **Jugar/deshacer en sitio** | Un solo arreglo plano `Int8Array(56)` que se modifica y se restaura; no se copian tableros durante la búsqueda | `position.js` |

**Puntajes de victoria:** `1,000,000 − número de fichas`. Así el bot **prefiere ganar rápido y perder tarde**. Como la cantidad de fichas es la misma en una posición sin importar el orden en que se llegó, estos puntajes son seguros de guardar en la TT.

### 2.2 Heurística (cuando no llega al final de la partida)
`evaluate.js` recorre las **107 líneas de 4 casillas** del tablero 8×7 (35 horizontales, 32 verticales, 40 diagonales):
- Una línea que tiene fichas **de ambos** jugadores ya no le sirve a nadie y vale 0.
- Si solo tiene fichas mías: 1 ficha = +1, 2 = +8, 3 = +60.
- Lo mismo, en negativo, para el rival.
- Bonus por ficha según la columna `[0,1,2,4,4,2,1,0]`: el centro vale más.

### 2.3 Manejo del tiempo
- El árbitro da **3,000 ms** desde `served_at`. Nosotros buscamos como máximo `THINK_MS = 1800`: `min(THINK_MS, deadline_ms − 1200)`. Los 1,200 ms de margen cubren la red y la serialización.
- Medimos con el **reloj local** desde que llega la respuesta, no con `served_at`, para que una diferencia de reloj con el servidor no nos afecte.
- **Iterative deepening:** buscamos a profundidad 1, 2, 3… y usamos la última profundidad **completa**. Cada 1,024 nodos se revisa el reloj; si se acabó el tiempo, se aborta la iteración en curso (una excepción interna) y la posición se restaura gracias al `finally`.
- **Medido en una MacBook Air (Node 22):** profundidad ~13 con el tablero vacío y ~15–17 a media partida, en 1.5–1.8 s (≈ 1.2 M posiciones por segundo).
- **Red de seguridad:** si el motor fallara por cualquier motivo, `chooseMove` devuelve la primera columna legal en orden central. Y el ciclo **nunca** envía una columna que no esté en `legal_moves`.

### 2.4 Ejemplo real (app web, partida de prueba)
El humano jugó las columnas 4 y 3, dejando dos fichas juntas abajo. El bot (profundidad 15, 2.1 M posiciones en 1.5 s) jugó la columna 5 para cortar el "tres abierto" antes de que existiera. Después armó su propia fila de tres en la segunda fila y ganó cuando el humano rellenó la casilla de abajo (captura en `docs/img/04-gano-el-bot.jpg`). Es justo el patrón que premian la heurística (+60 por tres) y la regla de "no jugar debajo de la casilla ganadora del rival".

## 3. Decisiones tomadas

| Decisión | Alternativas | Por qué |
|---|---|---|
| Node.js + JavaScript ESM | Python, Go, TypeScript | El cliente de referencia está en Node, Node ya estaba instalado y todo el equipo puede leer un solo lenguaje. TypeScript se descartó por el costo de configurarlo hoy |
| Negamax alfa-beta + ID + TT | MCTS, heurística pura | Determinista, explicable, estándar en Connect 4 (Pons); ID garantiza responder a tiempo |
| Representación rápida aparte de las reglas | Usar `board[fila][col]` en la búsqueda | Copiar tableros en cada nodo es lento; las pruebas comprueban que ambas representaciones coinciden |
| API stateless (el navegador manda `moves`) | Partidas guardadas en el servidor | Nada que limpiar ni sincronizar; el servidor puede reiniciarse sin perder nada |
| Frontend vanilla servido por Express | React/Vite, v0 | Sin build ni CORS; la lógica no se duplica en el navegador |
| Confiar en `board` y `you` del árbitro | Reconstruir desde `moves` | El ejemplo de las bases tiene `moves` y `board` inconsistentes; `board` es lo que el árbitro dice explícitamente |

## 4. Fuentes
- Pascal Pons, *Solving Connect 4: how to build a perfect AI*, http://blog.gamesolver.org/ — negamax, alfa-beta, orden central, tabla de transposición. Adaptado por nosotros a 8×7 y a búsqueda con límite de tiempo y heurística, porque un solver exacto no termina en 3 s en este tablero.
- Zobrist hashing: técnica estándar de motores de juegos (A. Zobrist, 1970).

## 5. Desviaciones respecto a los planes (y por qué)

| # | Plan | Lo que se hizo | Por qué |
|---|---|---|---|
| 5.1 | Un solo proceso Node para bot y web | `npm start` lanza la web en un **proceso hijo** | Detectado durante el desarrollo: la búsqueda bloquea el event loop 1.8 s; si alguien juega en la web durante el torneo, la jugada del árbitro podía atrasarse hasta un timeout |
| 5.2 | Búsqueda sobre `board[fila][col]`; bitboards como opcional | Representación plana `Int8Array` + Zobrist (sin bitboards) | Más rápido que copiar matrices y más simple de explicar que bitboards de 64 bits en JS (requerirían BigInt o dos enteros de 32 bits) |
| 5.3 | `parseTurn` tomaría `board` o `moves` indistintamente | Prioridad explícita a `board`/`you` | El ejemplo de las bases es inconsistente (ver Bitácora #3) |
| 5.4 | Proyecto en el Escritorio | Proyecto movido a `~/ai-challenge`, fuera de carpetas sincronizadas | La sincronización de iCloud del Escritorio bloqueaba la lectura de `node_modules` y creaba copias de conflicto dentro de `.git` (`refs/heads/main 2`) (Bitácora #4) |
| 5.5 | Opcionales del frontend "si sobra tiempo" | Se implementaron deshacer, historial y dificultad (fácil = profundidad 2) | Eran baratos con la API stateless |

## 6. Uso de la IA
Ver [`BITACORA_IA.md`](BITACORA_IA.md): qué pedimos, qué devolvió mal y cómo lo detectamos. En resumen:
- **Delegado a la IA:** primer borrador de reglas, motor, cliente, mock, API, frontend, pruebas y documentación.
- **Verificado por humanos:** signo de negamax y cotas de la TT (revisión de código + pruebas de "gana en 1", "bloquea en 1" y "victoria forzada en 2"); consistencia de las dos representaciones del tablero; el protocolo contra el ejemplo de las bases; la app jugando partidas reales.

## 7. Reporte de cobertura
`npm test` (Vitest + v8), 75 pruebas en verde:

| Archivo | Líneas | Ramas |
|---|---|---|
| **Total** | **98.0 %** | **93.9 %** |
| `src/rules/board.js` | 100 % | 98.6 % |
| `src/engine/*` | 98.2 % | 95.6 % |
| `src/arbiter/*` | 100 % | 90 % |
| `src/api/server.js` | 100 % | 100 % |
| `mock/mock-arbiter.js` | 93.5 % | 83.6 % |

El umbral mínimo configurado en `vitest.config.js` es 70 %: si la cobertura baja de ahí, `npm test` falla.

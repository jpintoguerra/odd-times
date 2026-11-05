# PLAN_BACKEND.md — Bot de Cuatro en línea 8×7

> Escrito antes de la primera línea de código. Las desviaciones se documentarán en `docs/TECNICO.md`.

## 1. Alcance
**Incluye:** reglas del juego 8×7, motor de búsqueda, cliente del árbitro (long polling), API HTTP para la app web, árbitro simulado (mock) y pruebas automatizadas con cobertura.
**No incluye:** URL pública (el bot es cliente), persistencia en base de datos, usuarios/autenticación propia.

## 2. Arquitectura
```
            ┌──────────── proceso Node (npm start) ────────────┐
 Árbitro ◄──┤ arbiter/loop.js ──► engine/chooseMove ◄── api/server.js ├──► Navegador (web/)
 (HTTPS)    │        │                    │                         │
            │ arbiter/client.js       rules/board.js (puro)         │
            └──────────────────────────────────────────────────────┘
```
- Capas: **rules** (puro) → **engine** (puro, depende de rules) → **arbiter** / **api** (I/O, dependen de engine).
- Un solo `chooseMove` para torneo y app web.

## 3. Módulos
| Módulo | Responsabilidad | Interfaz principal |
|---|---|---|
| `rules/board.js` | Representación y reglas | `createBoard()`, `drop(board, col, player)`, `legalMoves(board)`, `winner(board)`, `winningCells(board)`, `isFull(board)`, `fromMoves(moves)` |
| `engine/evaluate.js` | Heurística estática | `evaluate(board, player) -> number` |
| `engine/search.js` | Negamax alfa-beta + ID + TT | `search(board, player, {deadline}) -> {column, score, depth, nodes}` |
| `engine/index.js` | Fachada segura | `chooseMove(board, player, legalMoves, {timeMs})` — siempre devuelve una columna de `legalMoves` |
| `arbiter/client.js` | HTTP con árbitro | `next(wait)`, `move(gameId, column)`, `me()`, `practice()`, `submit(repoUrl, commit)` |
| `arbiter/loop.js` | Ciclo del torneo | `runLoop({client, chooseMove, signal})` |
| `api/server.js` | API app web + estáticos | ver §5 |
| `mock/mock-arbiter.js` | Árbitro simulado | mismos endpoints `/api/next`, `/api/move`, `/api/me`, `/api/practice` |

## 4. Algoritmo elegido y por qué
**Negamax con poda alfa-beta + iterative deepening + tabla de transposición + ordenamiento de jugadas**, con control de tiempo.

- **Por qué:** Cuatro en línea es un juego de suma cero, información perfecta y factor de ramificación bajo (≤ 8). Alfa-beta es el estándar probado (Pascal Pons, *Solving Connect 4*, http://blog.gamesolver.org/ — fuente que citaremos), es determinista y explicable. Monte Carlo (MCTS) es más difícil de afinar en 1.8 s y de explicar con precisión. Los solvers 7×6 no aplican a 8×7, así que no hay libro de aperturas: compensamos con búsqueda profunda.
- **Detalles:**
  1. **Victoria inmediata / bloqueo inmediato** antes de buscar (atajos baratos y seguros).
  2. **Ordenamiento central:** columnas `[3,4,2,5,1,6,0,7]` (el centro participa en más líneas); la mejor jugada de la iteración previa va primero.
  3. **Iterative deepening:** profundidad 1, 2, 3… hasta agotar el tiempo; se usa el resultado de la última profundidad **completa**.
  4. **Tabla de transposición** (`Map` con clave de la posición) para no reevaluar posiciones repetidas.
  5. **Heurística:** se puntúan todas las ventanas de 4 casillas (horizontal, vertical, 2 diagonales): 3 propias + 1 vacía = +50, 2+2 vacías = +5, igual negativo para el rival con peso mayor en amenazas de 3; bonus por fichas en columnas centrales. Victoria = ±(1,000,000 − profundidad) para preferir ganar rápido / perder tarde.
  6. **Tiempo:** `THINK_MS = 1800` desde que recibimos el turno; se revisa el reloj cada N nodos y se aborta limpio.
- **Optimización si sobra tiempo:** bitboards (64 bits = 8 columnas × 8 bits; en JS con dos `Uint32` o `BigInt`) para multiplicar la profundidad.

## 5. API para la app web (stateless; el cliente guarda la lista de jugadas)
| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /api/state` | `{ moves: number[] }` | `{ board, turn, legalMoves, status: "playing"\|"won"\|"draw", winner, winningCells }` |
| `POST /api/bot-move` | `{ moves: number[], level?: "easy"\|"normal" }` | `{ column, stats: {depth, nodes, ms, score}, state }` |
| `GET /api/health` | — | `{ ok: true }` |
- Errores: `400 { error: "illegal_move" }` si `moves` contiene una jugada ilegal.

## 6. Cliente del árbitro (basado en el cliente de referencia de las bases)
1. `GET /api/next?wait=20` con `Authorization: Bearer $TEAM_TOKEN`.
2. `status !== "turn"` → volver a llamar de inmediato.
3. `turn` → registrar `t0 = Date.now()`; `chooseMove(board, you, legal_moves, {timeMs: min(THINK_MS, deadline_ms − 1200)})`.
4. Verificar que la columna esté en `legal_moves` (si no, usar la primera legal en orden central).
5. `POST /api/move {game_id, column}`. Manejo: `200 playing/won/draw` → log; `409` → ignorar; `400` → log de error; `401` → abortar con mensaje claro.
6. Errores de red → backoff 1 s, 2 s, máx 5 s, y seguir (no quedar desconectado > 30 s).
7. Tolerante a campos extra/faltantes: si falta `board` se reconstruye desde `moves`.

## 7. Pasos en orden (con criterio de listo)
| # | Paso | Listo cuando | Responsable |
|---|---|---|---|
| 0 | Repo, `package.json`, Vitest, planes commiteados | `npm test` corre (0 pruebas) | Líder |
| 1 | `rules/board.js` + pruebas | caída, legales, 4 direcciones de victoria, empate, columna llena: verde | P1 |
| 2 | `engine` básico (alfa-beta prof. fija) + pruebas | nunca ilegal; gana en 1; bloquea en 1; una sola columna libre | P2 |
| 3 | `mock-arbiter` + `arbiter/client` + `loop` + pruebas | el bot juega una partida completa contra el mock | P3 |
| 4 | `api/server.js` + pruebas con supertest | `/api/state` y `/api/bot-move` responden correcto | P3/P4 |
| 5 | Iterative deepening + TT + tiempo | prueba: responde < 2,000 ms en tablero vacío y medio lleno | P2 |
| 6 | 08:00 conectar al árbitro real, práctica | partida de práctica ganada/terminada sin errores | Líder |
| 7 | Ajustar al OpenAPI definitivo | práctica sin errores tras el ajuste | P3 |
| 8 | Registrar entrega (`PUT /api/me/submission`) antes de 9:45 | `/api/me` muestra la entrega | Líder |

## 8. Riesgos y mitigación
| Riesgo | Mitigación |
|---|---|
| Timeout (derrota automática) | presupuesto 1,800 ms, chequeo de reloj en búsqueda, fallback a mejor jugada de la iteración previa |
| Jugada ilegal | validar contra `legal_moves` antes de enviar; prueba dedicada |
| Laptop suspendida / bot caído en la liga | desactivar suspensión (`caffeinate -dims`), correr con reinicio automático (`while true; do npm run bot; sleep 1; done`) |
| OpenAPI definitivo distinto | toda la dependencia aislada en `arbiter/` + mock; el loop tolera campos extra |
| Clock skew con `served_at` | medimos tiempo con reloj local desde que llega la respuesta, no con `served_at` |
| Rendimiento de JS insuficiente | ID garantiza respuesta; bitboards como mejora opcional |
| Token filtrado | solo env var; `.env` en `.gitignore`; si se filtra, pedir otro |

## 9. Validación
- **Unitarias:** reglas, motor (legalidad, tiempo, tableros límite), cliente con árbitro simulado (fetch inyectado), API con supertest.
- **Integración:** bot vs `mock-arbiter` partida completa; bot vs bot de la casa (`/api/practice`) a las 8:00.
- **Cobertura:** `npm test` reporta; objetivo ≥ 80 % en `src/rules` y `src/engine`.
- La fuerza del bot la mide el torneo, no los unit tests.

## 10. Qué se delega a la IA y cómo se verifica
| Se delega | Verificación humana |
|---|---|
| Esqueleto de reglas y pruebas de las 4 direcciones | revisar casos borde (diagonales en bordes, fila 0 abajo) y que las pruebas fallen si se rompe la regla |
| Negamax + alfa-beta + TT | revisar a mano el signo de negamax y la clave de la TT; posiciones de prueba "gana en 1 / bloquea en 1" |
| Heurística | jugar contra el bot en la app y revisar jugadas raras |
| Mock del árbitro a partir del protocolo | contrastar contra el OpenAPI; probar 409/400/401/idle |
| Documentación | lectura por alguien que no la escribió |
Registraremos en `docs/TECNICO.md` qué pedimos, qué devolvió mal y cómo lo detectamos (insumo para la exposición).

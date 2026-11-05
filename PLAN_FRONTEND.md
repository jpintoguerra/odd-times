# PLAN_FRONTEND.md — App web para jugar contra el bot

> Escrito antes de la primera línea de código. Las desviaciones se documentarán en `docs/TECNICO.md`.

## 1. Alcance
Una página donde una persona juega Cuatro en línea 8×7 contra el bot del equipo, en la misma computadora o en la red local (`http://<ip-laptop>:3000`).
**Mínimo:** tablero interactivo, indicador de turno, columnas disponibles, elegir quién abre, reiniciar, resultado con línea ganadora resaltada o empate.
**Opcional (en orden):** responsive para teléfono → historial de jugadas → deshacer → nivel de dificultad → replay de una partida del árbitro (`GET /api/games/{id}`).

## 2. Decisión técnica
HTML + CSS + JavaScript vanilla (ES modules), **sin build**, servido por el mismo Express del bot (`web/`).
**Por qué:** cero configuración, mismo origen (sin CORS), nada que pueda romperse a las 9:40. La lógica de juego **no** se duplica en el navegador: el estado lo calcula la API con el mismo `rules/board.js` del bot.

## 3. Pantalla y componentes (una sola pantalla)
```
┌─────────────────────────────────────────┐
│  Cuatro en línea 8×7        [Equipo 1]  │  Header
├─────────────────────────────────────────┤
│  ¿Quién abre?  (•) Yo  ( ) Bot  [Nueva] │  Controles
│  Estado: "Tu turno (rojo)" / "Bot pensando…" / "¡Ganaste!" │
├─────────────────────────────────────────┤
│   ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼   (hover/flecha en columna libre) │
│  ○ ○ ○ ○ ○ ○ ○ ○                         │
│  ... 7 filas × 8 columnas (fila 0 abajo) │  Tablero
├─────────────────────────────────────────┤
│  Jugadas: 4, 3, 4, ...   [Deshacer]     │  Historial (opcional)
└─────────────────────────────────────────┘
```
| Componente (función en `app.js`) | Responsabilidad |
|---|---|
| `renderBoard(state)` | dibuja 56 celdas (CSS grid 8×7), colores por jugador, resalta `winningCells` |
| `renderStatus(state)` | texto + color del turno; "Bot pensando…" con spinner; resultado final |
| `renderControls()` | selector de quién abre, botón Nueva partida |
| `onColumnClick(col)` | valida que sea turno humano y columna legal; si no, feedback visual (shake) |
| `api.state(moves)`, `api.botMove(moves)` | `fetch` a la API; manejo de errores con mensaje visible (no solo consola) |

## 4. Comunicación con el bot
- Estado del cliente: `{ moves: number[], humanPlayer: 1|2 }`.
- Jugada humana → `POST /api/state {moves}` → render → si `status==="playing"` y le toca al bot → `POST /api/bot-move {moves}` → render.
- Bloquear clics mientras el bot piensa (≈ 2 s). Mostrar `stats.depth` del bot en pequeño (ayuda a la exposición).

## 5. Estados de UI (criterio del jurado: "estados claros")
`idle` (elige quién abre) · `human_turn` · `bot_thinking` · `illegal` (columna llena: animación + mensaje) · `won` (línea resaltada + quién ganó) · `draw` · `error` (API caída: banner con "Reintentar").

## 6. Pasos en orden (con criterio de listo)
| # | Paso | Listo cuando |
|---|---|---|
| 1 | `index.html` + `styles.css`: tablero estático 8×7 | se ve el tablero vacío centrado en laptop |
| 2 | Clic en columna con estado local mock | la ficha cae a la fila correcta |
| 3 | Conectar a `/api/state` y `/api/bot-move` | partida completa humano vs bot |
| 4 | Quién abre, reiniciar, resultado y línea ganadora | los 3 desenlaces se ven claros |
| 5 | Estados ilegal/error/pensando | ningún error en consola durante una partida |
| 6 | Responsive (≤ 420 px) | jugable en teléfono por la red local |
| 7 | Capturas para `docs/MANUAL.md` | 4–6 capturas guardadas en `docs/img/` |

## 7. Riesgos
| Riesgo | Mitigación |
|---|---|
| Fila 0 abajo vs DOM arriba | renderizar filas de 6 → 0; prueba visual con una sola jugada |
| Doble clic mientras el bot piensa | flag `busy` que deshabilita el tablero |
| API caída | banner de error + botón reintentar |
| Teléfono no alcanza la laptop | servidor escucha en `0.0.0.0`; README indica cómo ver la IP |

## 8. Validación
- Prueba manual guiada: abrir humano, abrir bot, ganar, perder, empate (forzado con lista de jugadas), columna llena.
- Consola del navegador sin errores.
- Persona ajena al código sigue `docs/MANUAL.md` y logra jugar.

## 9. Qué se delega a la IA
Maquetación CSS del tablero y animación de caída, `app.js` de render/estado, redacción del manual. Verificamos visualmente en laptop y teléfono y revisamos que no haya lógica de juego duplicada en el frontend.

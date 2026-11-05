# CLAUDE.md — Reglas del agente para este repositorio

Proyecto: bot de **Cuatro en línea 8×7** + app web, para el challenge de IA (Yompi/Yalutec/Migo, 5-nov-2026).
Bases originales: `Bases_Challenge_Cuatro_en_Linea.pdf` (no se versiona). Planes: `PLAN_BACKEND.md`, `PLAN_FRONTEND.md`.

## Reglas del juego (fuente de verdad)
- Tablero 8 columnas (0–7) × 7 filas (0–6). **Fila 0 = abajo.** `board[fila][columna]`, 0 vacío, 1 jugador 1, 2 jugador 2.
- Jugador 1 abre. Victoria: 4 consecutivas horizontal, vertical o 2 diagonales. Empate: 56 casillas llenas.
- Árbitro: 3,000 ms por jugada desde `served_at`. **Presupuesto interno de búsqueda: 1,800 ms máx.**
- Jugada ilegal, timeout o no recoger turno en 30 s = derrota. Nunca enviar una columna que no esté en `legal_moves`.

## Stack
- Node.js ≥ 20, JavaScript ESM (`"type": "module"`), sin TypeScript (velocidad > tipado hoy).
- Servidor: Express. Frontend: HTML/CSS/JS vanilla servido estáticamente por el mismo servidor (`web/`).
- Pruebas: Vitest + `@vitest/coverage-v8`. **Comando único: `npm test`** (incluye cobertura).

## Estructura (respetarla; un módulo = una responsabilidad)
```
src/
  rules/board.js        # reglas puras: crear tablero, drop, legalMoves, checkWin, winningCells, isDraw
  engine/evaluate.js    # heurística (ventanas de 4, centro)
  engine/search.js      # negamax + alfa-beta + iterative deepening + TT + control de tiempo
  engine/index.js       # chooseMove(board, player, legalMoves, {timeMs}) -> {column, depth, score, nodes}
  arbiter/client.js     # HTTP con el árbitro (next, move, me, practice, submission). Sin lógica de juego.
  arbiter/loop.js       # ciclo long polling: next -> chooseMove -> move; backoff ante errores
  api/server.js         # API para la app web + sirve web/
  config.js             # lee env vars (ARBITRO_URL, TEAM_TOKEN, PORT, THINK_MS)
  index.js              # arranca loop del árbitro y/o API según flags
mock/mock-arbiter.js    # árbitro simulado local (mismo contrato que el OpenAPI)
web/                    # index.html, styles.css, app.js
test/                   # *.test.js, espejo de src/
docs/TECNICO.md, docs/MANUAL.md
```

## Reglas para el agente
1. **Las reglas y el motor son puros**: nada de `fetch`, `express` ni `console` en `src/rules` ni `src/engine`. Se prueban sin levantar servidores.
2. El algoritmo del torneo y el de la app web son **el mismo** `chooseMove`. No duplicar lógica en el frontend: el frontend pide el estado a la API.
3. Todo cambio en `src/rules` o `src/engine` va con su prueba. Cobertura objetivo ≥ 80 % (mínimo exigido 70 %).
4. Nunca escribir el token en código, logs ni commits. Solo `process.env.TEAM_TOKEN`. `.env` está en `.gitignore`.
5. Si el OpenAPI definitivo cambia campos, adaptar **solo** `src/arbiter/` y `mock/`, y anotar el cambio en `docs/TECNICO.md` (sección "Desviaciones").
6. Commits pequeños y descriptivos (`feat(engine): ...`, `test(rules): ...`, `docs: ...`). No reescribir historial: el jurado revisa que los planes precedan al código.
7. No modificar `PLAN_*.md` para "hacerlos coincidir" con lo construido; las desviaciones se explican en `docs/TECNICO.md`.
8. Antes de declarar algo listo: `npm test` en verde.

## Comandos
```bash
npm install
npm test                 # todas las pruebas + cobertura
npm run mock             # árbitro simulado en http://localhost:4000
npm run bot              # ciclo contra el árbitro (usa ARBITRO_URL, TEAM_TOKEN)
npm run web              # API + app web en http://localhost:3000
npm start                # bot + web juntos
```

## Variables de entorno (`.env`, ver `.env.example`)
`ARBITRO_URL`, `TEAM_TOKEN`, `PORT` (3000), `THINK_MS` (1800).

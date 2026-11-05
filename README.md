# Cuatro en línea 8×7 — Equipo 1

Bot que juega Cuatro en línea en un tablero de 8 columnas × 7 filas, conectado al árbitro del challenge, y una app web para jugar contra él.

- Plan del bot: [PLAN_BACKEND.md](PLAN_BACKEND.md) · Plan de la app: [PLAN_FRONTEND.md](PLAN_FRONTEND.md)
- Documentación técnica: [docs/TECNICO.md](docs/TECNICO.md) · Manual de usuario: [docs/MANUAL.md](docs/MANUAL.md)
- Reglas para agentes de IA: [CLAUDE.md](CLAUDE.md)

## Requisitos
Node.js ≥ 20.

## Instalación
```bash
npm install
cp .env.example .env   # y completar ARBITRO_URL y TEAM_TOKEN
```

## Variables de entorno
| Variable | Descripción | Default |
|---|---|---|
| `ARBITRO_URL` | URL base del árbitro (se entrega el día del reto) | `http://localhost:4000` (mock) |
| `TEAM_TOKEN` | Token del equipo. **Nunca se commitea.** | — |
| `PORT` | Puerto de la API y la app web | `3000` |
| `THINK_MS` | Tiempo máximo de búsqueda por jugada (ms) | `1800` |

## Pruebas (comando único)
```bash
npm test
```
Ejecuta todas las pruebas (reglas, algoritmo, cliente del árbitro, API) y reporta cobertura.

## Correr
```bash
npm run mock   # árbitro simulado local (desarrollo sin árbitro real)
npm run bot    # conecta el bot al árbitro (ARBITRO_URL)
npm run web    # app web en http://localhost:3000
npm start      # bot + app web
```
Para jugar desde el teléfono en la misma red: `http://<IP-de-la-laptop>:3000` (IP con `ipconfig getifaddr en0` en macOS).

`npm start` corre el bot y levanta la web en un **proceso aparte**, para que una partida en la web nunca retrase una jugada del torneo.

## Estructura
```
src/rules/     reglas puras (tablero, jugadas legales, victoria, empate)
src/engine/    algoritmo: negamax + alfa-beta + iterative deepening + tabla de transposición
src/arbiter/   cliente HTTP del árbitro y ciclo de long polling
src/api/       API para la app web
web/           app web (HTML/CSS/JS, sin build)
mock/          árbitro simulado para desarrollar sin el árbitro real
test/          pruebas (Vitest)
docs/          documentación técnica, manual de usuario y bitácora de uso de IA
```

## Durante el torneo
```bash
caffeinate -dims &                               # evitar que la laptop se suspenda
while true; do npm run bot; sleep 1; done        # reinicio automático si el proceso cae
```
> ⚠️ No corras el bot desde una carpeta sincronizada con iCloud o Dropbox (Escritorio o Documentos en macOS con iCloud activado): la sincronización puede bloquear la lectura de `node_modules`. Ver `docs/TECNICO.md` §5.4.

Registrar la entrega (antes de las 9:45, hora de Guatemala):
```bash
curl -X PUT "$ARBITRO_URL/api/me/submission" \
  -H "Authorization: Bearer $TEAM_TOKEN" -H "Content-Type: application/json" \
  -d "{\"repo_url\":\"https://github.com/<org>/<repo>\",\"commit\":\"$(git rev-parse HEAD)\"}"
```
Los nombres de los campos (`repo_url`, `commit`) son provisionales hasta ver el OpenAPI definitivo.

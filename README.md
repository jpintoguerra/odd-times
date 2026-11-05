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

## Durante el torneo
```bash
caffeinate -dims &                               # evitar que la laptop se suspenda
while true; do npm run bot; sleep 1; done        # reinicio automático si el proceso cae
```

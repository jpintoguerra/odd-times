// Punto de entrada.
//   node src/index.js --bot          ciclo contra el árbitro
//   node src/index.js --web          API + app web
//   node src/index.js --bot --web    ambos, la web en un PROCESO HIJO aparte para que una
//                                     partida en la web nunca retrase una jugada del torneo.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createArbiterClient } from './arbiter/client.js';
import { runLoop } from './arbiter/loop.js';
import { createApp } from './api/server.js';
import { chooseMove } from './engine/index.js';

const args = new Set(process.argv.slice(2));
const config = loadConfig();
const wantBot = args.has('--bot');
const wantWeb = args.has('--web');

if (!wantBot && !wantWeb) {
  console.log('Uso: node src/index.js [--bot] [--web]');
  process.exit(1);
}

if (wantWeb && !wantBot) {
  createApp({ thinkMs: config.thinkMs }).listen(config.port, '0.0.0.0', () => {
    console.log(`App web en http://localhost:${config.port}`);
  });
}

if (wantBot) {
  if (wantWeb) fork(fileURLToPath(import.meta.url), ['--web'], { stdio: 'inherit' });
  if (!config.teamToken) console.warn('⚠️  TEAM_TOKEN vacío: el árbitro responderá 401.');
  console.log(`Bot conectado a ${config.arbitroUrl} (THINK_MS=${config.thinkMs})`);
  const client = createArbiterClient({ baseUrl: config.arbitroUrl, token: config.teamToken });
  runLoop({ client, decide: chooseMove, thinkMs: config.thinkMs }).catch(() => process.exit(1));
}

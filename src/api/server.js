// API HTTP para la app web + archivos estáticos de web/.
// Stateless: el navegador guarda la lista de jugadas y la envía en cada petición.
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stateFromMoves } from '../rules/board.js';
import { chooseMove, LEVELS } from '../engine/index.js';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');

function parseMoves(body) {
  const moves = body?.moves;
  if (!Array.isArray(moves) || !moves.every(Number.isInteger)) return null;
  return moves;
}

export function createApp({ decide = chooseMove, thinkMs = 1800 } = {}) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/state', (req, res) => {
    const moves = parseMoves(req.body);
    if (!moves) return res.status(400).json({ error: 'bad_request', message: 'moves debe ser un arreglo de enteros' });
    try {
      return res.json(stateFromMoves(moves));
    } catch (err) {
      return res.status(400).json({ error: 'illegal_move', message: err.message });
    }
  });

  app.post('/api/bot-move', (req, res) => {
    const moves = parseMoves(req.body);
    if (!moves) return res.status(400).json({ error: 'bad_request', message: 'moves debe ser un arreglo de enteros' });
    let state;
    try {
      state = stateFromMoves(moves);
    } catch (err) {
      return res.status(400).json({ error: 'illegal_move', message: err.message });
    }
    if (state.status !== 'playing') return res.status(400).json({ error: 'game_over', state });

    const maxDepth = LEVELS[req.body.level] ?? LEVELS.normal;
    const stats = decide(state.board, state.turn, state.legalMoves, {
      timeMs: thinkMs,
      maxDepth: Number.isFinite(maxDepth) ? maxDepth : undefined,
    });
    return res.json({
      column: stats.column,
      stats: { depth: stats.depth, nodes: stats.nodes, ms: stats.ms, score: stats.score },
      state: stateFromMoves([...moves, stats.column]),
    });
  });

  app.use(express.static(WEB_DIR));
  return app;
}

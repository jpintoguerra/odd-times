// Árbitro simulado: implementa el protocolo de las bases (sección "Protocolo con el árbitro")
// para desarrollar y probar sin el árbitro real. Uso: `npm run mock` (puerto 4000).
// Cada vez que el bot pide turno y no hay partida activa, crea una de práctica contra
// un "bot de la casa" que juega al azar (o con la estrategia que se le inyecte).
import express from 'express';
import { fileURLToPath } from 'node:url';
import { stateFromMoves, legalMoves, otherPlayer } from '../src/rules/board.js';

const randomHouseBot = (state) => state.legalMoves[Math.floor(Math.random() * state.legalMoves.length)];

export function createMockArbiter({
  token = 'test-token',
  deadlineMs = 3000,
  houseBot = randomHouseBot,
  autoPractice = true,
  now = Date.now,
} = {}) {
  const games = new Map(); // game_id -> { id, you, moves, status, winner, servedAt, kind }
  let seq = 0;
  let nextYou = 1;
  const submissions = { repo_url: null, commit: null };

  function createGame(kind = 'practice', you = null) {
    const id = `g_mock_${++seq}`;
    const game = { id, kind, you: you ?? nextYou, moves: [], status: 'playing', winner: null, servedAt: null, log: [] };
    nextYou = otherPlayer(nextYou); // alterna quién abre entre partidas
    games.set(id, game);
    houseMoveIfNeeded(game);
    return game;
  }

  function applyMove(game, column, by) {
    const state = stateFromMoves([...game.moves, column]);
    game.moves.push(column);
    game.log.push({ by, column, at: new Date(now()).toISOString() });
    if (state.status !== 'playing') {
      game.status = state.status;
      game.winner = state.winner;
    }
    return state;
  }

  function houseMoveIfNeeded(game) {
    if (game.status !== 'playing') return;
    const state = stateFromMoves(game.moves);
    if (state.turn !== game.you) applyMove(game, houseBot(state), otherPlayer(game.you));
  }

  function pendingGame() {
    for (const g of games.values()) {
      if (g.status === 'playing' && stateFromMoves(g.moves).turn === g.you) return g;
    }
    return null;
  }

  function turnPayload(game) {
    const state = stateFromMoves(game.moves);
    if (!game.servedAt) game.servedAt = now();
    const last = game.moves.length
      ? { by: game.moves.length % 2 === 1 ? 1 : 2, column: game.moves[game.moves.length - 1] }
      : null;
    return {
      status: 'turn',
      game_id: game.id,
      match_id: `m_${game.id}`,
      kind: game.kind,
      you: game.you,
      opponent: 'Bot de la casa (mock)',
      turn: game.moves.length + 1,
      board: state.board,
      moves: game.moves.slice(),
      last_move: last,
      legal_moves: legalMoves(state.board),
      deadline_ms: deadlineMs,
      served_at: new Date(game.servedAt).toISOString(),
    };
  }

  const app = express();
  app.use(express.json());

  app.use('/api', (req, res, next) => {
    const isPublic = req.method === 'GET' && (req.path.startsWith('/games/') || req.path === '/standings');
    if (isPublic) return next();
    if (req.get('authorization') !== `Bearer ${token}`) return res.status(401).json({ error: 'unauthorized' });
    return next();
  });

  app.get('/api/next', async (req, res) => {
    const wait = Math.min(Math.max(Number(req.query.wait) || 0, 0), 25) * 1000;
    const until = Date.now() + wait;
    if (autoPractice && !pendingGame() && ![...games.values()].some((g) => g.status === 'playing')) {
      createGame('practice');
    }
    let game = pendingGame();
    while (!game && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 25));
      game = pendingGame();
    }
    if (!game) return res.json({ status: 'idle' });
    return res.json(turnPayload(game));
  });

  app.post('/api/move', (req, res) => {
    const { game_id: gameId, column } = req.body || {};
    const game = games.get(gameId);
    if (!game || game.status !== 'playing' || stateFromMoves(game.moves).turn !== game.you) {
      return res.status(409).json({ ok: false, error: 'not_your_turn' });
    }
    const lose = (error) => {
      game.status = 'won';
      game.winner = otherPlayer(game.you);
      return res.status(400).json({ ok: false, error });
    };
    if (game.servedAt && now() - game.servedAt > deadlineMs) return lose('timeout');
    const state = stateFromMoves(game.moves);
    if (!state.legalMoves.includes(column)) return lose('illegal_move');

    game.servedAt = null;
    const after = applyMove(game, column, game.you);
    if (after.status === 'won') return res.json({ ok: true, state: 'won', winning_cells: after.winningCells });
    if (after.status === 'draw') return res.json({ ok: true, state: 'draw' });
    houseMoveIfNeeded(game);
    return res.json({ ok: true, state: 'playing' });
  });

  app.post('/api/practice', (_req, res) => {
    const game = createGame('practice');
    res.status(201).json({ ok: true, game_id: game.id, you: game.you });
  });

  app.get('/api/me', (_req, res) => {
    const pending = pendingGame();
    res.json({ team: 'Equipo mock', position: 1, pending_turns: pending ? 1 : 0, submission: submissions });
  });

  app.put('/api/me/submission', (req, res) => {
    Object.assign(submissions, { repo_url: req.body?.repo_url ?? null, commit: req.body?.commit ?? null });
    res.json({ ok: true, submission: submissions });
  });

  app.get('/api/games/:id', (req, res) => {
    const game = games.get(req.params.id);
    if (!game) return res.status(404).json({ error: 'not_found' });
    return res.json({ game_id: game.id, kind: game.kind, you: game.you, moves: game.moves, log: game.log, status: game.status, winner: game.winner });
  });

  app.get('/api/standings', (_req, res) => res.json({ standings: [] }));

  return { app, games, createGame, submissions };
}

// Ejecución directa: `node mock/mock-arbiter.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MOCK_PORT) || 4000;
  const token = process.env.TEAM_TOKEN || 'test-token';
  createMockArbiter({ token }).app.listen(port, () => {
    console.log(`Árbitro simulado en http://localhost:${port} (token: ${token === 'test-token' ? 'test-token' : '<TEAM_TOKEN>'})`);
  });
}

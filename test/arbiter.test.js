import { describe, it, expect, vi, afterEach } from 'vitest';
import { createArbiterClient, ArbiterAuthError } from '../src/arbiter/client.js';
import { parseTurn, thinkBudget, playTurn, runLoop, NETWORK_MARGIN_MS } from '../src/arbiter/loop.js';
import { createMockArbiter } from '../mock/mock-arbiter.js';
import { chooseMove } from '../src/engine/index.js';
import { createBoard, stateFromMoves } from '../src/rules/board.js';
import { loadConfig } from '../src/config.js';

// Turno de ejemplo copiado de las bases del challenge.
const SAMPLE_TURN = {
  status: 'turn',
  game_id: 'g_7f3a',
  match_id: 'm_12',
  kind: 'league',
  you: 2,
  opponent: 'Los Recursivos',
  turn: 9,
  board: [
    [0, 0, 1, 2, 1, 0, 0, 0],
    [0, 0, 2, 1, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  moves: [3, 2, 3, 2, 4, 3, 2, 3],
  last_move: { by: 1, column: 3 },
  legal_moves: [0, 1, 2, 3, 4, 5, 6, 7],
  deadline_ms: 3000,
  served_at: '2026-11-05T15:04:05.123Z',
};

/** fetch falso que registra las llamadas y responde lo indicado. */
function fakeFetch(responder) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const { status = 200, body } = responder(url, init) ?? {};
    return {
      status,
      json: async () => {
        if (body === undefined) throw new Error('sin cuerpo');
        return body;
      },
    };
  };
  fn.calls = calls;
  return fn;
}

describe('cliente del árbitro', () => {
  it('envía el token Bearer y el content-type en cada llamada', async () => {
    const f = fakeFetch(() => ({ body: { status: 'idle' } }));
    const c = createArbiterClient({ baseUrl: 'https://arb.test', token: 'abc', fetchImpl: f });
    await c.next(20);
    expect(f.calls[0].url).toBe('https://arb.test/api/next?wait=20');
    expect(f.calls[0].headers.Authorization).toBe('Bearer abc');
    expect(f.calls[0].headers['Content-Type']).toBe('application/json');
  });

  it('limita wait al rango 0–25', async () => {
    const f = fakeFetch(() => ({ body: { status: 'idle' } }));
    const c = createArbiterClient({ baseUrl: 'x', token: 't', fetchImpl: f });
    await c.next(99);
    await c.next(-5);
    expect(f.calls[0].url).toContain('wait=25');
    expect(f.calls[1].url).toContain('wait=0');
  });

  it('construye el cuerpo de la jugada como { game_id, column }', async () => {
    const f = fakeFetch(() => ({ body: { ok: true, state: 'playing' } }));
    const c = createArbiterClient({ baseUrl: 'x', token: 't', fetchImpl: f });
    const r = await c.move('g_7f3a', 4);
    expect(f.calls[0].method).toBe('POST');
    expect(f.calls[0].url).toBe('x/api/move');
    expect(f.calls[0].body).toEqual({ game_id: 'g_7f3a', column: 4 });
    expect(r).toEqual({ status: 200, data: { ok: true, state: 'playing' } });
  });

  it('lanza ArbiterAuthError con 401', async () => {
    const f = fakeFetch(() => ({ status: 401 }));
    const c = createArbiterClient({ baseUrl: 'x', token: 'malo', fetchImpl: f });
    await expect(c.me()).rejects.toBeInstanceOf(ArbiterAuthError);
  });

  it('tolera respuestas sin cuerpo JSON', async () => {
    const f = fakeFetch(() => ({ status: 204 }));
    const c = createArbiterClient({ baseUrl: 'x', token: 't', fetchImpl: f });
    expect(await c.practice()).toEqual({ status: 204, data: null });
  });

  it('expone submission y game con las rutas correctas', async () => {
    const f = fakeFetch(() => ({ body: { ok: true } }));
    const c = createArbiterClient({ baseUrl: 'x', token: 't', fetchImpl: f });
    await c.submit('https://github.com/e/r', 'abc123');
    await c.game('g 1');
    expect(f.calls[0]).toMatchObject({ method: 'PUT', url: 'x/api/me/submission', body: { repo_url: 'https://github.com/e/r', commit: 'abc123' } });
    expect(f.calls[1].url).toBe('x/api/games/g%201');
  });
});

describe('interpretación del turno', () => {
  it('interpreta el ejemplo de las bases', () => {
    const t = parseTurn(SAMPLE_TURN);
    expect(t).toMatchObject({ gameId: 'g_7f3a', you: 2, deadlineMs: 3000, kind: 'league' });
    expect(t.board).toBe(SAMPLE_TURN.board);
    expect(t.legalMoves).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('si board y moves no coinciden, confía en board (el ejemplo de las bases es inconsistente)', () => {
    // En las bases, moves tiene 8 jugadas pero board solo 6 fichas, y turn 9 no corresponde a you 2.
    expect(stateFromMoves(SAMPLE_TURN.moves).board).not.toEqual(SAMPLE_TURN.board);
    const t = parseTurn(SAMPLE_TURN);
    expect(t.board).toBe(SAMPLE_TURN.board);
    expect(t.you).toBe(2);
  });

  it('idle y respuestas inválidas devuelven null', () => {
    expect(parseTurn({ status: 'idle' })).toBeNull();
    expect(parseTurn(null)).toBeNull();
    expect(parseTurn({ status: 'turn' })).toBeNull();
  });

  it('reconstruye board y legal_moves si el árbitro no los envía', () => {
    const t = parseTurn({ status: 'turn', game_id: 'g', you: 1, moves: [0, 0, 0, 0, 0, 0, 0] });
    expect(t.board[6][0]).toBe(1);
    expect(t.legalMoves).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(t.deadlineMs).toBe(3000);
  });

  it('presupuesto de pensamiento deja margen para la red', () => {
    expect(thinkBudget(1800, 3000)).toBe(1800);
    expect(thinkBudget(1800, 2000)).toBe(2000 - NETWORK_MARGIN_MS);
    expect(thinkBudget(1800, 500)).toBe(100);
  });
});

describe('playTurn', () => {
  it('decide con el presupuesto correcto y envía la columna', async () => {
    const client = { move: vi.fn(async () => ({ status: 200, data: { ok: true, state: 'playing' } })) };
    const decide = vi.fn(() => ({ column: 5, depth: 3, ms: 10 }));
    const r = await playTurn(parseTurn(SAMPLE_TURN), { client, decide, thinkMs: 1800 });
    expect(decide).toHaveBeenCalledWith(SAMPLE_TURN.board, 2, SAMPLE_TURN.legal_moves, { timeMs: 1800 });
    expect(client.move).toHaveBeenCalledWith('g_7f3a', 5);
    expect(r.column).toBe(5);
  });

  it('si el motor devolviera algo ilegal, envía una jugada legal', async () => {
    const client = { move: vi.fn(async () => ({ status: 200, data: {} })) };
    const turn = { ...parseTurn(SAMPLE_TURN), legalMoves: [6, 7] };
    await playTurn(turn, { client, decide: () => ({ column: 3 }), thinkMs: 100 });
    expect(client.move).toHaveBeenCalledWith('g_7f3a', 6);
  });
});

describe('runLoop', () => {
  const silent = { info() {}, warn() {}, error() {} };

  it('ignora idle, juega los turnos y maneja 409 sin romperse', async () => {
    const ac = new AbortController();
    const responses = [
      { status: 200, data: { status: 'idle' } },
      { status: 200, data: SAMPLE_TURN },
      { status: 200, data: SAMPLE_TURN },
    ];
    const client = {
      next: vi.fn(async () => {
        const r = responses.shift();
        if (!responses.length) ac.abort();
        return r;
      }),
      move: vi
        .fn()
        .mockResolvedValueOnce({ status: 200, data: { ok: true, state: 'playing' } })
        .mockResolvedValueOnce({ status: 409, data: { ok: false, error: 'not_your_turn' } }),
    };
    await runLoop({ client, decide: () => ({ column: 4, depth: 1, ms: 1 }), log: silent, signal: ac.signal });
    expect(client.next).toHaveBeenCalledTimes(3);
    expect(client.move).toHaveBeenCalledTimes(2);
  });

  it('reintenta con backoff ante errores de red', async () => {
    const ac = new AbortController();
    const sleeps = [];
    let n = 0;
    const client = {
      next: vi.fn(async () => {
        n++;
        if (n >= 3) ac.abort();
        throw new Error('ECONNRESET');
      }),
    };
    await runLoop({ client, decide: chooseMove, log: silent, signal: ac.signal, sleep: async (ms) => sleeps.push(ms) });
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it('espera y reintenta si /api/next responde un estado HTTP inesperado', async () => {
    const ac = new AbortController();
    const sleeps = [];
    const client = { next: vi.fn(async () => (ac.abort(), { status: 503, data: null })) };
    await runLoop({ client, decide: chooseMove, log: silent, signal: ac.signal, sleep: async (ms) => sleeps.push(ms) });
    expect(sleeps).toEqual([1000]);
  });

  it('se detiene con token inválido', async () => {
    const client = { next: vi.fn(async () => { throw new ArbiterAuthError('401'); }) };
    await expect(runLoop({ client, decide: chooseMove, log: silent })).rejects.toBeInstanceOf(ArbiterAuthError);
  });
});

describe('integración: bot vs árbitro simulado por HTTP real', () => {
  let server;
  afterEach(() => server?.close());

  async function startMock(opts) {
    const mock = createMockArbiter({ token: 'tkn', ...opts });
    server = mock.app.listen(0);
    await new Promise((r) => server.once('listening', r));
    return { mock, baseUrl: `http://127.0.0.1:${server.address().port}` };
  }

  it('juega una partida de práctica completa sin jugadas ilegales', async () => {
    const { mock, baseUrl } = await startMock();
    const client = createArbiterClient({ baseUrl, token: 'tkn' });
    const ac = new AbortController();
    const errors = [];
    const log = {
      info() {
        const g = mock.games.get('g_mock_1');
        if (g && g.status !== 'playing') ac.abort();
      },
      warn() {},
      error: (m) => errors.push(m),
    };
    await runLoop({ client, decide: (b, p, l) => chooseMove(b, p, l, { timeMs: 30 }), wait: 1, log, signal: ac.signal });
    const game = mock.games.get('g_mock_1');
    expect(['won', 'draw']).toContain(game.status);
    expect(errors).toEqual([]);
    // contra un bot aleatorio, nuestro bot no debería perder
    if (game.status === 'won') expect(game.winner).toBe(game.you);
  });

  it('el mock rechaza tokens inválidos, jugadas ilegales y fuera de turno', async () => {
    const { mock, baseUrl } = await startMock({ autoPractice: false });
    const bad = createArbiterClient({ baseUrl, token: 'otro' });
    await expect(bad.me()).rejects.toBeInstanceOf(ArbiterAuthError);

    const c = createArbiterClient({ baseUrl, token: 'tkn' });
    expect((await c.next(0)).data).toEqual({ status: 'idle' });
    const practice = await c.practice();
    expect(practice.status).toBe(201);
    const t = (await c.next(1)).data;
    expect(t.status).toBe('turn');
    expect((await c.move('no-existe', 0)).status).toBe(409);

    // Llenar la columna 0 es imposible en un turno; jugar fuera de rango sí es ilegal.
    const ill = await c.move(t.game_id, 9);
    expect(ill).toEqual({ status: 400, data: { ok: false, error: 'illegal_move' } });
    expect(mock.games.get(t.game_id).status).toBe('won');

    const pub = await c.game(t.game_id);
    expect(pub.data.game_id).toBe(t.game_id);
    expect((await c.game('nada')).status).toBe(404);
  });

  it('el mock declara timeout si la jugada llega tarde', async () => {
    let clock = 1_000;
    const { baseUrl } = await startMock({ autoPractice: false, now: () => clock });
    const c = createArbiterClient({ baseUrl, token: 'tkn' });
    await c.practice();
    const t = (await c.next(1)).data;
    clock += 3_500;
    expect((await c.move(t.game_id, t.legal_moves[0])).data.error).toBe('timeout');
  });

  it('el mock registra la entrega y la muestra en /api/me', async () => {
    const { baseUrl } = await startMock({ autoPractice: false });
    const c = createArbiterClient({ baseUrl, token: 'tkn' });
    await c.submit('https://github.com/equipo/repo', 'deadbeef');
    const me = await c.me();
    expect(me.data.submission).toEqual({ repo_url: 'https://github.com/equipo/repo', commit: 'deadbeef' });
  });

  it('el mock anuncia victoria con winning_cells', async () => {
    // Bot de la casa que siempre juega la columna 7: J1 gana en la fila 0.
    const { baseUrl } = await startMock({ autoPractice: false, houseBot: () => 7 });
    const c = createArbiterClient({ baseUrl, token: 'tkn' });
    await c.practice(); // la primera partida: nosotros somos J1
    let last;
    for (const col of [0, 1, 2, 3]) {
      const t = (await c.next(1)).data;
      last = await c.move(t.game_id, col);
    }
    expect(last.data).toEqual({ ok: true, state: 'won', winning_cells: [[0, 0], [0, 1], [0, 2], [0, 3]] });
    expect(createBoard()).toHaveLength(7);
  });
});

describe('config', () => {
  it('lee variables de entorno con valores por defecto', () => {
    expect(loadConfig({})).toEqual({ arbitroUrl: 'http://localhost:4000', teamToken: '', port: 3000, thinkMs: 1800 });
    expect(loadConfig({ ARBITRO_URL: 'https://a.yompi.test/', TEAM_TOKEN: 'x', PORT: '8080', THINK_MS: '1500' })).toEqual({
      arbitroUrl: 'https://a.yompi.test',
      teamToken: 'x',
      port: 8080,
      thinkMs: 1500,
    });
  });
});

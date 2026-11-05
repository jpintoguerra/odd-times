import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api/server.js';

const app = createApp({ thinkMs: 50 });

describe('API para la app web', () => {
  it('GET /api/health', async () => {
    const r = await request(app).get('/api/health');
    expect(r.body).toEqual({ ok: true });
  });

  it('POST /api/state con partida nueva', async () => {
    const r = await request(app).post('/api/state').send({ moves: [] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'playing', turn: 1, legalMoves: [0, 1, 2, 3, 4, 5, 6, 7] });
  });

  it('POST /api/state detecta ganador y línea', async () => {
    const r = await request(app).post('/api/state').send({ moves: [0, 0, 1, 1, 2, 2, 3] });
    expect(r.body).toMatchObject({ status: 'won', winner: 1, winningCells: [[0, 0], [0, 1], [0, 2], [0, 3]] });
  });

  it('POST /api/state rechaza jugadas ilegales y cuerpos inválidos', async () => {
    const ill = await request(app).post('/api/state').send({ moves: [0, 0, 0, 0, 0, 0, 0, 0] });
    expect(ill.status).toBe(400);
    expect(ill.body.error).toBe('illegal_move');
    const bad = await request(app).post('/api/state').send({ moves: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('bad_request');
  });

  it('POST /api/bot-move devuelve una columna legal y el nuevo estado', async () => {
    const r = await request(app).post('/api/bot-move').send({ moves: [3] });
    expect(r.status).toBe(200);
    expect(r.body.column).toBeGreaterThanOrEqual(0);
    expect(r.body.column).toBeLessThan(8);
    expect(r.body.state.moves).toEqual([3, r.body.column]);
    expect(r.body.stats).toHaveProperty('depth');
  });

  it('POST /api/bot-move bloquea una victoria inmediata', async () => {
    const r = await request(app).post('/api/bot-move').send({ moves: [0, 7, 1, 7, 2] });
    expect(r.body.column).toBe(3);
  });

  it('POST /api/bot-move con nivel fácil limita la profundidad', async () => {
    const decide = vi.fn(() => ({ column: 3, depth: 2, nodes: 1, ms: 1, score: 0 }));
    const r = await request(createApp({ decide })).post('/api/bot-move').send({ moves: [], level: 'easy' });
    expect(decide.mock.calls[0][3].maxDepth).toBe(2);
    expect(r.body.column).toBe(3);
  });

  it('POST /api/bot-move rechaza partidas terminadas y entradas inválidas', async () => {
    const over = await request(app).post('/api/bot-move').send({ moves: [0, 0, 1, 1, 2, 2, 3] });
    expect(over.status).toBe(400);
    expect(over.body.error).toBe('game_over');
    expect((await request(app).post('/api/bot-move').send({})).status).toBe(400);
    expect((await request(app).post('/api/bot-move').send({ moves: [9] })).body.error).toBe('illegal_move');
  });
});

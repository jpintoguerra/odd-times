import { describe, it, expect } from 'vitest';
import { createBoard, drop, stateFromMoves, legalMoves, ROWS, COLS } from '../src/rules/board.js';
import { Position } from '../src/engine/position.js';
import { evaluate, WINDOWS } from '../src/engine/evaluate.js';
import { search } from '../src/engine/search.js';
import { chooseMove } from '../src/engine/index.js';

const boardOf = (moves) => stateFromMoves(moves).board;

describe('Position (representación rápida)', () => {
  it('coincide con las reglas al construir desde un tablero', () => {
    const board = boardOf([3, 3, 4, 2, 5]);
    const pos = Position.fromBoard(board);
    expect(pos.moveCount).toBe(5);
    expect(Array.from(pos.heights)).toEqual([0, 0, 1, 2, 1, 1, 0, 0]);
  });

  it('play + undo restaura la posición y el hash', () => {
    const pos = Position.fromBoard(boardOf([3, 4]));
    const key = pos.key();
    pos.play(5, 1);
    expect(pos.key()).not.toBe(key);
    pos.undo(5);
    expect(pos.key()).toBe(key);
    expect(pos.moveCount).toBe(2);
  });

  it('el mismo tablero por distintos órdenes produce la misma clave', () => {
    const a = Position.fromBoard(boardOf([0, 1, 2, 3]));
    const b = Position.fromBoard(boardOf([2, 3, 0, 1]));
    expect(a.key()).toBe(b.key());
  });

  it('isWinningMove coincide con las reglas en las cuatro direcciones', () => {
    // horizontal, vertical, diagonal ↗ y ↖, construidas con las reglas oficiales
    const cases = [
      { moves: [0, 0, 1, 1, 2, 2], col: 3, player: 1 },
      { moves: [4, 5, 4, 5, 4, 5], col: 4, player: 1 },
    ];
    for (const { moves, col, player } of cases) {
      const pos = Position.fromBoard(boardOf(moves));
      expect(pos.isWinningMove(col, player)).toBe(true);
      expect(stateFromMoves([...moves, col]).winner).toBe(player);
    }
    // Diagonal ↗: J2 en (0,0),(1,1),(2,2); la ficha en la columna 3 cae en la fila 3.
    const up = createBoard();
    [[0, 0], [1, 1], [2, 2]].forEach(([r, c]) => (up[r][c] = 2));
    [[0, 1], [0, 2], [1, 2], [0, 3], [1, 3], [2, 3]].forEach(([r, c]) => (up[r][c] = 1));
    expect(Position.fromBoard(up).isWinningMove(3, 2)).toBe(true);

    // Diagonal ↖ (espejo): J2 en (0,7),(1,6),(2,5); la ficha en la columna 4 cae en la fila 3.
    const down = createBoard();
    [[0, 7], [1, 6], [2, 5]].forEach(([r, c]) => (down[r][c] = 2));
    [[0, 6], [0, 5], [1, 5], [0, 4], [1, 4], [2, 4]].forEach(([r, c]) => (down[r][c] = 1));
    expect(Position.fromBoard(down).isWinningMove(4, 2)).toBe(true);
  });

  it('canPlay es falso para columnas llenas o fuera de rango', () => {
    let board = createBoard();
    for (let i = 0; i < ROWS; i++) board = drop(board, 0, (i % 2) + 1);
    const pos = Position.fromBoard(board);
    expect(pos.canPlay(0)).toBe(false);
    expect(pos.canPlay(-1)).toBe(false);
    expect(pos.canPlay(COLS)).toBe(false);
    expect(pos.isWinningMove(0, 1)).toBe(false);
  });
});

describe('heurística', () => {
  it('hay 107 ventanas de 4 en un tablero 8×7', () => {
    expect(WINDOWS).toHaveLength(107);
  });

  it('el tablero vacío vale 0 y es simétrica entre jugadores', () => {
    const empty = Position.fromBoard(createBoard());
    expect(evaluate(empty, 1)).toBe(0);
    const pos = Position.fromBoard(boardOf([3, 0, 4]));
    expect(evaluate(pos, 1)).toBe(-evaluate(pos, 2));
  });

  it('prefiere el centro sobre el borde', () => {
    const center = Position.fromBoard(boardOf([3]));
    const edge = Position.fromBoard(boardOf([0]));
    expect(evaluate(center, 1)).toBeGreaterThan(evaluate(edge, 1));
  });
});

describe('búsqueda', () => {
  const opts = (ms = 500) => ({ deadline: Date.now() + ms });

  it('gana en 1 cuando puede', () => {
    const r = search(Position.fromBoard(boardOf([0, 0, 1, 1, 2, 2])), 1, opts());
    expect(r.column).toBe(3);
  });

  it('bloquea la victoria inmediata del rival', () => {
    // J1 tiene 0,1,2 abajo; le toca a J2 (después de que J1 jugó 6 por medio).
    const r = search(Position.fromBoard(boardOf([0, 7, 1, 7, 2])), 2, opts());
    expect(r.column).toBe(3);
  });

  it('prefiere ganar a bloquear', () => {
    // Ambos tienen 3 en línea; le toca a J1 y debe ganar en vez de bloquear.
    const r = search(Position.fromBoard(boardOf([0, 0, 1, 1, 2, 2])), 1, opts());
    expect(r.column).toBe(3);
  });

  it('encuentra una victoria forzada en 2 (doble amenaza)', () => {
    // J1 con fichas en 2 y 3 abajo y columnas 1 y 4 libres: jugar 4 (o 1) crea doble amenaza.
    const r = search(Position.fromBoard(boardOf([2, 2, 3, 3])), 1, opts(1000));
    expect([1, 4]).toContain(r.column);
    expect(r.score).toBeGreaterThan(900_000);
  });

  it('con una sola columna disponible la devuelve', () => {
    let board = createBoard();
    for (let c = 0; c < COLS; c++) {
      if (c === 5) continue;
      for (let r = 0; r < ROWS; r++) board[r][c] = ((r + Math.floor(c / 2)) % 2) + 1;
    }
    const r = search(Position.fromBoard(board), 1, opts());
    expect(r.column).toBe(5);
  });

  it('lanza error si no hay jugadas', () => {
    const full = boardOf([
      4, 5, 0, 0, 7, 3, 5, 6, 2, 3, 1, 5, 0, 3, 4, 6, 3, 7, 4, 6, 1, 5, 5, 0, 1, 5, 0, 0,
      7, 5, 0, 4, 2, 7, 3, 7, 7, 2, 7, 3, 4, 1, 6, 6, 6, 6, 3, 1, 2, 4, 4, 2, 2, 1, 1, 2,
    ]);
    expect(() => search(Position.fromBoard(full), 1, opts())).toThrow();
  });

  it('respeta maxDepth', () => {
    const r = search(Position.fromBoard(createBoard()), 1, { ...opts(2000), maxDepth: 3 });
    expect(r.depth).toBe(3);
  });

  it('no deja la posición modificada al terminar (incluso con timeout)', () => {
    const pos = Position.fromBoard(boardOf([3, 4, 3]));
    const key = pos.key();
    search(pos, 2, { deadline: Date.now() + 30 });
    expect(pos.key()).toBe(key);
    expect(pos.moveCount).toBe(3);
  });
});

describe('chooseMove (fachada)', () => {
  it('nunca devuelve una jugada ilegal en partidas completas bot vs bot', () => {
    let moves = [];
    let state = stateFromMoves(moves);
    while (state.status === 'playing') {
      const { column } = chooseMove(state.board, state.turn, state.legalMoves, { timeMs: 20 });
      expect(state.legalMoves).toContain(column);
      moves = [...moves, column];
      state = stateFromMoves(moves);
    }
    expect(['won', 'draw']).toContain(state.status);
  });

  it('respeta el presupuesto de tiempo (tablero vacío, 1,800 ms)', () => {
    const t0 = Date.now();
    const r = chooseMove(createBoard(), 1, undefined, { timeMs: 1800 });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(2000);
    expect(r.depth).toBeGreaterThanOrEqual(6);
  });

  it('respeta el presupuesto de tiempo en un tablero a media partida', () => {
    const board = boardOf([3, 4, 3, 3, 2, 5, 4, 1, 6, 2]);
    const t0 = Date.now();
    chooseMove(board, 1, undefined, { timeMs: 1000 });
    expect(Date.now() - t0).toBeLessThan(1200);
  });

  it('responde bien con el tablero a punto de llenarse', () => {
    const moves = [
      4, 5, 0, 0, 7, 3, 5, 6, 2, 3, 1, 5, 0, 3, 4, 6, 3, 7, 4, 6, 1, 5, 5, 0, 1, 5, 0, 0,
      7, 5, 0, 4, 2, 7, 3, 7, 7, 2, 7, 3, 4, 1, 6, 6, 6, 6, 3, 1, 2, 4, 4, 2, 2, 1, 1,
    ]; // falta 1 jugada
    const s = stateFromMoves(moves);
    expect(s.legalMoves).toEqual([2]);
    expect(chooseMove(s.board, s.turn, s.legalMoves).column).toBe(2);
  });

  it('solo elige entre las legal_moves que envía el árbitro', () => {
    const r = chooseMove(createBoard(), 1, [0, 7], { timeMs: 50 });
    expect([0, 7]).toContain(r.column);
  });

  it('ignora legal_moves inválidas del árbitro y usa las del tablero', () => {
    const r = chooseMove(createBoard(), 1, [42], { timeMs: 50 });
    expect(legalMoves(createBoard())).toContain(r.column);
  });

  it('nivel fácil (maxDepth 2) sigue devolviendo jugadas legales', () => {
    const r = chooseMove(createBoard(), 1, undefined, { maxDepth: 2 });
    expect(r.depth).toBeLessThanOrEqual(2);
    expect(r.column).toBeGreaterThanOrEqual(0);
  });

  it('lanza error si el tablero está lleno', () => {
    const s = stateFromMoves([
      4, 5, 0, 0, 7, 3, 5, 6, 2, 3, 1, 5, 0, 3, 4, 6, 3, 7, 4, 6, 1, 5, 5, 0, 1, 5, 0, 0,
      7, 5, 0, 4, 2, 7, 3, 7, 7, 2, 7, 3, 4, 1, 6, 6, 6, 6, 3, 1, 2, 4, 4, 2, 2, 1, 1, 2,
    ]);
    expect(() => chooseMove(s.board, 1)).toThrow();
  });
});

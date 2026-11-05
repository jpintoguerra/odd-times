import { describe, it, expect } from 'vitest';
import {
  ROWS,
  createBoard,
  drop,
  dropRow,
  isLegal,
  legalMoves,
  findWinner,
  winningLineAt,
  isFull,
  currentPlayer,
  stateFromMoves,
} from '../src/rules/board.js';

// Secuencia de 56 jugadas que llena el tablero sin ganador (generada con una
// partida aleatoria que evita completar 4; verificada por esta misma prueba).
const DRAW_MOVES = [
  4, 5, 0, 0, 7, 3, 5, 6, 2, 3, 1, 5, 0, 3, 4, 6, 3, 7, 4, 6, 1, 5, 5, 0, 1, 5, 0, 0,
  7, 5, 0, 4, 2, 7, 3, 7, 7, 2, 7, 3, 4, 1, 6, 6, 6, 6, 3, 1, 2, 4, 4, 2, 2, 1, 1, 2,
];

describe('tablero y caída de fichas', () => {
  it('crea un tablero vacío de 7 filas × 8 columnas', () => {
    const b = createBoard();
    expect(b).toHaveLength(7);
    b.forEach((row) => expect(row).toEqual([0, 0, 0, 0, 0, 0, 0, 0]));
  });

  it('la ficha cae a la fila 0 (abajo) en una columna vacía', () => {
    const b = drop(createBoard(), 3, 1);
    expect(b[0][3]).toBe(1);
  });

  it('las fichas se apilan en la misma columna', () => {
    let b = createBoard();
    b = drop(b, 5, 1);
    b = drop(b, 5, 2);
    b = drop(b, 5, 1);
    expect([b[0][5], b[1][5], b[2][5], b[3][5]]).toEqual([1, 2, 1, 0]);
  });

  it('drop no modifica el tablero original', () => {
    const b = createBoard();
    drop(b, 0, 1);
    expect(b[0][0]).toBe(0);
  });
});

describe('jugadas legales', () => {
  it('en un tablero vacío las 8 columnas son legales', () => {
    expect(legalMoves(createBoard())).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('una columna llena (7 fichas) deja de ser legal', () => {
    let b = createBoard();
    for (let i = 0; i < ROWS; i++) b = drop(b, 2, (i % 2) + 1);
    expect(isLegal(b, 2)).toBe(false);
    expect(legalMoves(b)).not.toContain(2);
    expect(() => drop(b, 2, 1)).toThrow(/illegal_move/);
  });

  it('columnas fuera de rango o no enteras son ilegales', () => {
    const b = createBoard();
    for (const col of [-1, 8, 99, 1.5, '3', null, undefined]) {
      expect(dropRow(b, col)).toBe(-1);
    }
  });
});

describe('victoria en las cuatro direcciones', () => {
  it('horizontal', () => {
    const s = stateFromMoves([0, 0, 1, 1, 2, 2, 3]);
    expect(s.status).toBe('won');
    expect(s.winner).toBe(1);
    expect(s.winningCells).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
  });

  it('horizontal en el borde derecho (columnas 4-7)', () => {
    const s = stateFromMoves([7, 7, 6, 6, 5, 5, 4]);
    expect(s.winner).toBe(1);
  });

  it('vertical', () => {
    const s = stateFromMoves([4, 5, 4, 5, 4, 5, 4]);
    expect(s.status).toBe('won');
    expect(s.winningCells).toEqual([[0, 4], [1, 4], [2, 4], [3, 4]]);
  });

  it('diagonal ↗', () => {
    const b = createBoard();
    [[0, 0], [1, 1], [2, 2], [3, 3]].forEach(([r, c]) => (b[r][c] = 2));
    expect(findWinner(b)).toEqual({ winner: 2, cells: [[0, 0], [1, 1], [2, 2], [3, 3]] });
  });

  it('diagonal ↖', () => {
    const b = createBoard();
    [[0, 7], [1, 6], [2, 5], [3, 4]].forEach(([r, c]) => (b[r][c] = 1));
    expect(findWinner(b).winner).toBe(1);
  });

  it('diagonal en la parte alta del tablero (filas 3-6)', () => {
    const b = createBoard();
    [[3, 4], [4, 5], [5, 6], [6, 7]].forEach(([r, c]) => (b[r][c] = 1));
    expect(winningLineAt(b, 6, 7)).toHaveLength(4);
  });

  it('tres en línea no gana', () => {
    const s = stateFromMoves([0, 0, 1, 1, 2]);
    expect(s.status).toBe('playing');
    expect(findWinner(s.board)).toBeNull();
  });

  it('detecta la línea completa aunque la ficha ganadora quede en medio', () => {
    // J1: 0,1,3 abajo y luego 2 completa la línea.
    const s = stateFromMoves([0, 0, 1, 1, 3, 3, 2]);
    expect(s.winner).toBe(1);
    expect(s.winningCells).toHaveLength(4);
  });

  it('winningLineAt en una casilla vacía devuelve null', () => {
    expect(winningLineAt(createBoard(), 0, 0)).toBeNull();
  });
});

describe('empate y fin de partida', () => {
  it('reporta empate al llenar las 56 casillas sin ganador', () => {
    const s = stateFromMoves(DRAW_MOVES);
    expect(isFull(s.board)).toBe(true);
    expect(findWinner(s.board)).toBeNull();
    expect(s.status).toBe('draw');
    expect(s.winner).toBeNull();
    expect(s.legalMoves).toEqual([]);
    expect(s.turn).toBeNull();
  });

  it('no se puede jugar después de que alguien gana', () => {
    expect(() => stateFromMoves([0, 0, 1, 1, 2, 2, 3, 3])).toThrow(/ya terminó/);
  });

  it('una jugada ilegal en la lista lanza error', () => {
    expect(() => stateFromMoves([0, 0, 0, 0, 0, 0, 0, 0])).toThrow(/illegal_move/);
  });
});

describe('turnos', () => {
  it('el jugador 1 abre y luego alternan', () => {
    let b = createBoard();
    expect(currentPlayer(b)).toBe(1);
    b = drop(b, 3, 1);
    expect(currentPlayer(b)).toBe(2);
    expect(stateFromMoves([3]).turn).toBe(2);
    expect(stateFromMoves([]).turn).toBe(1);
  });
});

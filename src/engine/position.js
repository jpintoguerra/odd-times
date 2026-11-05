// Representación rápida para la búsqueda: arreglo plano mutable con jugar/deshacer
// y hash Zobrist incremental. Las reglas "oficiales" viven en src/rules/board.js;
// las pruebas verifican que ambas coincidan.
import { COLS, ROWS } from '../rules/board.js';

export const SIZE = COLS * ROWS;

// Generador pseudoaleatorio determinista (mulberry32) para las claves Zobrist.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const rand = mulberry32(0xc0ffee);
// ZOBRIST_HI/LO[jugador][celda]: dos claves de 32 bits por celda → clave de ~53 bits.
const ZOBRIST_HI = [null, new Uint32Array(SIZE), new Uint32Array(SIZE)];
const ZOBRIST_LO = [null, new Uint32Array(SIZE), new Uint32Array(SIZE)];
for (const p of [1, 2]) {
  for (let i = 0; i < SIZE; i++) {
    ZOBRIST_HI[p][i] = rand();
    ZOBRIST_LO[p][i] = rand() & 0x1fffff; // 21 bits
  }
}

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export class Position {
  constructor() {
    this.cells = new Int8Array(SIZE); // índice = fila * COLS + columna, fila 0 abajo
    this.heights = new Int8Array(COLS);
    this.moveCount = 0;
    this.hashHi = 0;
    this.hashLo = 0;
  }

  /** Crea una posición a partir de un tablero del formato del árbitro (board[fila][col]). */
  static fromBoard(board) {
    const pos = new Position();
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const v = board[row][col];
        if (v === 0) break; // por gravedad no puede haber fichas encima de un hueco
        pos.#set(row, col, v);
      }
    }
    return pos;
  }

  #set(row, col, player) {
    const idx = row * COLS + col;
    this.cells[idx] = player;
    this.heights[col] = row + 1;
    this.moveCount++;
    this.hashHi = (this.hashHi ^ ZOBRIST_HI[player][idx]) >>> 0;
    this.hashLo = this.hashLo ^ ZOBRIST_LO[player][idx];
  }

  /** Clave numérica segura (< 2^53) para la tabla de transposición. */
  key() {
    return this.hashHi * 2097152 + this.hashLo;
  }

  canPlay(col) {
    return col >= 0 && col < COLS && this.heights[col] < ROWS;
  }

  play(col, player) {
    const row = this.heights[col];
    const idx = row * COLS + col;
    this.cells[idx] = player;
    this.heights[col] = row + 1;
    this.moveCount++;
    this.hashHi = (this.hashHi ^ ZOBRIST_HI[player][idx]) >>> 0;
    this.hashLo = this.hashLo ^ ZOBRIST_LO[player][idx];
  }

  undo(col) {
    const row = this.heights[col] - 1;
    const idx = row * COLS + col;
    const player = this.cells[idx];
    this.cells[idx] = 0;
    this.heights[col] = row;
    this.moveCount--;
    this.hashHi = (this.hashHi ^ ZOBRIST_HI[player][idx]) >>> 0;
    this.hashLo = this.hashLo ^ ZOBRIST_LO[player][idx];
  }

  isFull() {
    return this.moveCount >= SIZE;
  }

  /** ¿Jugar `col` con `player` gana inmediatamente? No modifica la posición. */
  isWinningMove(col, player) {
    const row = this.heights[col];
    if (row >= ROWS) return false;
    const cells = this.cells;
    for (const [dr, dc] of DIRS) {
      let count = 1;
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && cells[r * COLS + c] === player) {
        count++;
        r += dr;
        c += dc;
      }
      r = row - dr;
      c = col - dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && cells[r * COLS + c] === player) {
        count++;
        r -= dr;
        c -= dc;
      }
      if (count >= 4) return true;
    }
    return false;
  }
}

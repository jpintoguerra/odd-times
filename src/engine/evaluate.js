// Heurística estática: puntúa todas las "ventanas" de 4 casillas del tablero.
// Una ventana solo cuenta si NO tiene fichas de ambos jugadores (si las tiene, nadie
// puede completar 4 ahí). Las amenazas de 3 pesan mucho más que las de 2.
import { COLS, ROWS } from '../rules/board.js';

/** Las 107 líneas de 4 casillas del tablero 8×7, como arreglos de índices planos. */
export const WINDOWS = (() => {
  const windows = [];
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      for (const [dr, dc] of dirs) {
        const endR = row + 3 * dr;
        const endC = col + 3 * dc;
        if (endR < 0 || endR >= ROWS || endC < 0 || endC >= COLS) continue;
        windows.push([0, 1, 2, 3].map((k) => (row + k * dr) * COLS + (col + k * dc)));
      }
    }
  }
  return windows;
})();

// Peso por número de fichas propias en una ventana sin fichas rivales.
export const WINDOW_SCORE = [0, 1, 8, 60];
// Bonus por ficha según la columna: el centro participa en más líneas.
export const CENTER_BONUS = [0, 1, 2, 4, 4, 2, 1, 0];

/** Puntaje desde el punto de vista de `player` (positivo = bueno para `player`). */
export function evaluate(pos, player) {
  const cells = pos.cells;
  let score = 0;
  for (let w = 0; w < WINDOWS.length; w++) {
    const win = WINDOWS[w];
    let mine = 0;
    let theirs = 0;
    for (let k = 0; k < 4; k++) {
      const v = cells[win[k]];
      if (v === player) mine++;
      else if (v !== 0) theirs++;
    }
    if (theirs === 0) score += WINDOW_SCORE[mine];
    else if (mine === 0) score -= WINDOW_SCORE[theirs];
  }
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v === 0) continue;
    const bonus = CENTER_BONUS[i % COLS];
    score += v === player ? bonus : -bonus;
  }
  return score;
}

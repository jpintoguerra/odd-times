// Negamax con poda alfa-beta, iterative deepening, tabla de transposición y control
// de tiempo. Referencia: Pascal Pons, "Solving Connect 4" (http://blog.gamesolver.org/),
// adaptado a un tablero de 8×7 y a búsqueda con límite de tiempo + heurística.
import { SIZE } from './position.js';
import { evaluate } from './evaluate.js';

export const WIN_SCORE = 1_000_000;
/** Orden de exploración: del centro hacia los bordes. */
export const CENTER_ORDER = [3, 4, 2, 5, 1, 6, 0, 7];

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
const TT_MAX_ENTRIES = 2_000_000;
const TIME_CHECK_MASK = 1023; // revisar el reloj cada 1024 nodos

class Timeout extends Error {}

const other = (p) => (p === 1 ? 2 : 1);

/**
 * Busca la mejor columna para `player` en `pos`.
 * @param {import('./position.js').Position} pos  posición (se restaura al terminar)
 * @param {1|2} player
 * @param {{deadline:number, maxDepth?:number, now?:()=>number, tt?:Map}} opts
 * @returns {{column:number, score:number, depth:number, nodes:number, complete:boolean}}
 */
export function search(pos, player, { deadline, maxDepth = SIZE, now = Date.now, tt = new Map() }) {
  let nodes = 0;
  const legal = CENTER_ORDER.filter((c) => pos.canPlay(c));
  if (legal.length === 0) throw new Error('No hay jugadas legales');

  // 1) Atajo: ganar ya.
  for (const col of legal) {
    if (pos.isWinningMove(col, player)) {
      return { column: col, score: WIN_SCORE - pos.moveCount - 1, depth: 1, nodes: 1, complete: true };
    }
  }
  // 2) Atajo: si el rival amenaza ganar en una columna, bloquearla es obligatorio.
  const threats = legal.filter((col) => pos.isWinningMove(col, other(player)));
  if (threats.length >= 1) {
    // Con 2+ amenazas ya estamos perdidos; bloquear una al menos alarga la partida.
    return { column: threats[0], score: threats.length > 1 ? -WIN_SCORE : 0, depth: 1, nodes: 1, complete: true };
  }
  if (legal.length === 1) return { column: legal[0], score: 0, depth: 0, nodes: 0, complete: true };

  function negamax(depth, alpha, beta, p) {
    nodes++;
    if ((nodes & TIME_CHECK_MASK) === 0 && now() >= deadline) throw new Timeout();

    const moves = CENTER_ORDER.filter((c) => pos.canPlay(c));
    if (moves.length === 0) return 0; // empate: tablero lleno

    for (const col of moves) {
      if (pos.isWinningMove(col, p)) return WIN_SCORE - pos.moveCount - 1;
    }
    if (depth === 0) return evaluate(pos, p);

    const alphaOrig = alpha;
    const key = pos.key();
    const entry = tt.get(key);
    let bestCol = -1;
    if (entry) {
      bestCol = entry.best;
      if (entry.depth >= depth) {
        if (entry.flag === EXACT) return entry.score;
        if (entry.flag === LOWER && entry.score > alpha) alpha = entry.score;
        else if (entry.flag === UPPER && entry.score < beta) beta = entry.score;
        if (alpha >= beta) return entry.score;
      }
    }

    // Ordenamiento: la mejor jugada conocida primero; luego evitar jugar justo debajo
    // de una casilla donde el rival ganaría (le regalamos la victoria).
    const opp = other(p);
    const ordered = [];
    const bad = [];
    if (bestCol >= 0 && pos.canPlay(bestCol)) ordered.push(bestCol);
    for (const col of moves) {
      if (col === bestCol) continue;
      pos.play(col, p);
      const givesWin = pos.canPlay(col) && pos.isWinningMove(col, opp);
      pos.undo(col);
      (givesWin ? bad : ordered).push(col);
    }

    let best = -Infinity;
    for (const col of ordered.concat(bad)) {
      pos.play(col, p);
      let score;
      try {
        score = -negamax(depth - 1, -beta, -alpha, opp);
      } finally {
        pos.undo(col);
      }
      if (score > best) {
        best = score;
        bestCol = col;
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }

    if (tt.size > TT_MAX_ENTRIES) tt.clear();
    const flag = best <= alphaOrig ? UPPER : best >= beta ? LOWER : EXACT;
    tt.set(key, { depth, score: best, flag, best: bestCol });
    return best;
  }

  // Iterative deepening: profundidad 1, 2, 3… y nos quedamos con la última COMPLETA.
  let result = { column: legal[0], score: 0, depth: 0, nodes: 0, complete: false };
  let rootOrder = legal.slice();
  const limit = Math.min(maxDepth, SIZE - pos.moveCount);

  for (let depth = 1; depth <= limit; depth++) {
    let bestCol = rootOrder[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const scores = new Map();
    try {
      for (const col of rootOrder) {
        pos.play(col, player);
        let score;
        try {
          score = -negamax(depth - 1, -Infinity, -alpha, other(player));
        } finally {
          pos.undo(col);
        }
        scores.set(col, score);
        if (score > bestScore) {
          bestScore = score;
          bestCol = col;
        }
        if (score > alpha) alpha = score;
      }
    } catch (err) {
      if (err instanceof Timeout) break;
      throw err;
    }
    result = { column: bestCol, score: bestScore, depth, nodes, complete: true };
    // La mejor jugada encabeza la siguiente iteración (mejor poda).
    rootOrder = rootOrder.slice().sort((a, b) => scores.get(b) - scores.get(a));
    // Victoria o derrota forzada encontrada: profundizar no cambia la decisión.
    if (Math.abs(bestScore) >= WIN_SCORE - SIZE) break;
    if (now() >= deadline) break;
  }
  result.nodes = nodes;
  return result;
}

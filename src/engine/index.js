// Fachada segura del motor: la usan tanto el cliente del árbitro como la API web.
// Garantía: SIEMPRE devuelve una columna que está en `legalMoves`.
import { legalMoves as computeLegalMoves } from '../rules/board.js';
import { Position } from './position.js';
import { search, CENTER_ORDER } from './search.js';

export const DEFAULT_THINK_MS = 1800;
export const LEVELS = { easy: 2, normal: Infinity };

/**
 * @param {number[][]} board   board[fila][col], fila 0 abajo
 * @param {1|2} player         jugador que mueve
 * @param {number[]} [legalMoves]  jugadas legales según el árbitro (si no, se calculan)
 * @param {{timeMs?:number, maxDepth?:number, now?:()=>number}} [opts]
 */
export function chooseMove(board, player, legalMoves, opts = {}) {
  const started = Date.now();
  const fromBoard = computeLegalMoves(board);
  const allowed =
    Array.isArray(legalMoves) && legalMoves.length > 0
      ? legalMoves.filter((c) => fromBoard.includes(c))
      : fromBoard;
  const candidates = allowed.length > 0 ? allowed : fromBoard;
  if (candidates.length === 0) throw new Error('No hay jugadas legales');

  const fallback = CENTER_ORDER.find((c) => candidates.includes(c));
  const timeMs = opts.timeMs ?? DEFAULT_THINK_MS;
  const now = opts.now ?? Date.now;

  let result;
  try {
    result = search(Position.fromBoard(board), player, {
      deadline: now() + timeMs,
      maxDepth: opts.maxDepth,
      now,
    });
  } catch {
    result = null; // cualquier error inesperado: jugada segura por defecto
  }

  const column = result && candidates.includes(result.column) ? result.column : fallback;
  return {
    column,
    depth: result?.depth ?? 0,
    score: result?.score ?? 0,
    nodes: result?.nodes ?? 0,
    ms: Date.now() - started,
  };
}

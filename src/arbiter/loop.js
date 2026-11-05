// Ciclo del torneo: long polling → decidir → enviar jugada. Tolerante a fallos de red.
import { stateFromMoves, legalMoves as computeLegal } from '../rules/board.js';
import { ArbiterAuthError } from './client.js';

/** Margen que dejamos para red y serialización dentro de los 3,000 ms del árbitro. */
export const NETWORK_MARGIN_MS = 1200;

/**
 * Convierte la respuesta de /api/next en lo que necesita el motor.
 * Si falta `board`, lo reconstruye desde `moves`; si faltan `legal_moves`, los calcula.
 */
export function parseTurn(t) {
  if (!t || t.status !== 'turn' || !t.game_id) return null;
  const board = Array.isArray(t.board) ? t.board : stateFromMoves(t.moves || []).board;
  const legal = Array.isArray(t.legal_moves) && t.legal_moves.length ? t.legal_moves : computeLegal(board);
  const you = t.you === 2 ? 2 : 1;
  return {
    gameId: t.game_id,
    you,
    board,
    legalMoves: legal,
    deadlineMs: Number(t.deadline_ms) || 3000,
    kind: t.kind,
    opponent: t.opponent,
    turn: t.turn,
  };
}

/** Presupuesto de búsqueda: el menor entre THINK_MS y (deadline − margen de red). */
export function thinkBudget(thinkMs, deadlineMs) {
  return Math.max(100, Math.min(thinkMs, deadlineMs - NETWORK_MARGIN_MS));
}

/**
 * Resuelve UN turno: decide la columna y la envía.
 * @returns {Promise<{column:number, status:number, data:any, stats:object}>}
 */
export async function playTurn(turn, { client, decide, thinkMs }) {
  const timeMs = thinkBudget(thinkMs, turn.deadlineMs);
  const stats = decide(turn.board, turn.you, turn.legalMoves, { timeMs });
  let column = stats.column;
  if (!turn.legalMoves.includes(column)) column = turn.legalMoves[0]; // nunca enviar algo ilegal
  const res = await client.move(turn.gameId, column);
  return { column, status: res.status, data: res.data, stats };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ciclo infinito (hasta `signal.aborted`). Errores de red → backoff 1s, 2s… máx 5s.
 * Token inválido → se detiene con error, porque reintentar no lo arregla.
 */
export async function runLoop({ client, decide, thinkMs = 1800, wait = 20, log = console, signal, sleep = defaultSleep }) {
  let backoff = 1000;
  while (!signal?.aborted) {
    try {
      const { status, data } = await client.next(wait);
      backoff = 1000;
      if (status !== 200) {
        log.warn?.(`[arbitro] /api/next respondió ${status}`);
        await sleep(1000);
        continue;
      }
      const turn = parseTurn(data);
      if (!turn) continue; // idle u otro estado: volver a preguntar de inmediato

      const r = await playTurn(turn, { client, decide, thinkMs });
      const result = r.data?.state ?? r.data?.error ?? r.status;
      log.info?.(
        `[${turn.kind ?? 'game'}] ${turn.gameId} vs ${turn.opponent ?? '?'} turno ${turn.turn ?? '?'}: ` +
          `col ${r.column} (prof ${r.stats.depth}, ${r.stats.ms} ms) → ${result}`,
      );
    } catch (err) {
      if (err instanceof ArbiterAuthError) {
        log.error?.(err.message);
        throw err;
      }
      log.error?.(`[arbitro] error: ${err.message}; reintento en ${backoff} ms`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 5000);
    }
  }
}

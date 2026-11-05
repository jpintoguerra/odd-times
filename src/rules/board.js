// Reglas puras de Cuatro en línea 8×7.
// Representación idéntica a la del árbitro: board[fila][columna], fila 0 = abajo,
// 0 = vacío, 1 = jugador 1, 2 = jugador 2.

export const COLS = 8;
export const ROWS = 7;
export const CONNECT = 4;

// Direcciones a revisar: horizontal, vertical, diagonal ↗, diagonal ↖ (como [dFila, dCol]).
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function otherPlayer(player) {
  return player === 1 ? 2 : 1;
}

/** Fila donde caería una ficha en `col`, o -1 si la columna está llena o fuera de rango. */
export function dropRow(board, col) {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return -1;
  for (let row = 0; row < ROWS; row++) {
    if (board[row][col] === 0) return row;
  }
  return -1;
}

export function isLegal(board, col) {
  return dropRow(board, col) !== -1;
}

export function legalMoves(board) {
  const moves = [];
  for (let col = 0; col < COLS; col++) if (board[ROWS - 1][col] === 0) moves.push(col);
  return moves;
}

/** Devuelve un tablero NUEVO con la ficha colocada. Lanza error si la jugada es ilegal. */
export function drop(board, col, player) {
  const row = dropRow(board, col);
  if (row === -1) throw new Error(`illegal_move: columna ${col}`);
  const next = cloneBoard(board);
  next[row][col] = player;
  return next;
}

function inside(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

/**
 * Línea ganadora que pasa por (row, col), o null. Solo revisa alrededor de la última
 * ficha, lo que la hace barata para usar dentro de la búsqueda.
 */
export function winningLineAt(board, row, col) {
  const player = board[row][col];
  if (player === 0) return null;
  for (const [dr, dc] of DIRECTIONS) {
    const cells = [[row, col]];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (inside(r, c) && board[r][c] === player) {
        cells.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (cells.length >= CONNECT) {
      return cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    }
  }
  return null;
}

/** Busca un ganador en todo el tablero: { winner, cells } o null. */
export function findWinner(board) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cells = winningLineAt(board, row, col);
      if (cells) return { winner: board[row][col], cells };
    }
  }
  return null;
}

export function isFull(board) {
  return legalMoves(board).length === 0;
}

/** Cuántas fichas hay en el tablero. */
export function countPieces(board) {
  let n = 0;
  for (const row of board) for (const v of row) if (v !== 0) n++;
  return n;
}

/** Jugador al que le toca, suponiendo que el jugador 1 abre. */
export function currentPlayer(board) {
  return countPieces(board) % 2 === 0 ? 1 : 2;
}

/**
 * Estado completo de una partida a partir de la lista de columnas jugadas.
 * Lanza error si alguna jugada es ilegal o se juega después de terminar.
 */
export function stateFromMoves(moves) {
  let board = createBoard();
  let result = null;
  moves.forEach((col, i) => {
    if (result) throw new Error(`illegal_move: la partida ya terminó antes de la jugada ${i}`);
    const player = i % 2 === 0 ? 1 : 2;
    const row = dropRow(board, col);
    if (row === -1) throw new Error(`illegal_move: columna ${col} en la jugada ${i}`);
    board = drop(board, col, player);
    const cells = winningLineAt(board, row, col);
    if (cells) result = { winner: player, cells };
  });

  const full = isFull(board);
  let status = 'playing';
  if (result) status = 'won';
  else if (full) status = 'draw';

  return {
    board,
    moves: moves.slice(),
    turn: status === 'playing' ? (moves.length % 2 === 0 ? 1 : 2) : null,
    legalMoves: status === 'playing' ? legalMoves(board) : [],
    status,
    winner: result ? result.winner : null,
    winningCells: result ? result.cells : [],
  };
}

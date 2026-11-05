// App web: solo presentación y estado de la UI. Las reglas y el bot viven en el servidor
// (mismo código que juega el torneo); aquí no se duplica lógica de juego.
const COLS = 8;
const ROWS = 7;

const ui = {
  board: document.getElementById('board'),
  arrows: document.getElementById('arrows'),
  status: document.getElementById('status'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  error: document.getElementById('error'),
  errorText: document.getElementById('error-text'),
  retry: document.getElementById('retry'),
  newGame: document.getElementById('new-game'),
  undo: document.getElementById('undo'),
  history: document.getElementById('history'),
  botStats: document.getElementById('bot-stats'),
};

const game = {
  moves: [],
  humanPlayer: 1,
  state: null, // respuesta de /api/state
  busy: false, // el bot está pensando
  started: false,
  lastDropped: null, // índice de jugada para animar
  pendingRetry: null,
};

// ---------- API ----------
async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `HTTP ${res.status}`);
    err.code = data.error;
    throw err;
  }
  return data;
}
const api = {
  state: (moves) => post('/api/state', { moves }),
  botMove: (moves, level) => post('/api/bot-move', { moves, level }),
};

// ---------- Render ----------
function buildBoard() {
  ui.board.innerHTML = '';
  ui.arrows.innerHTML = '';
  for (let col = 0; col < COLS; col++) {
    const a = document.createElement('div');
    a.className = 'arrow';
    a.textContent = '▼';
    a.dataset.col = col;
    ui.arrows.appendChild(a);
  }
  // El DOM se llena de arriba hacia abajo, así que recorremos las filas de 6 a 0
  // (en el modelo la fila 0 es la de abajo).
  for (let row = ROWS - 1; row >= 0; row--) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute('aria-label', `Columna ${col + 1}, fila ${row + 1}`);
      cell.addEventListener('click', () => onColumnClick(col));
      cell.addEventListener('mouseenter', () => highlightColumn(col));
      cell.addEventListener('mouseleave', () => highlightColumn(null));
      ui.board.appendChild(cell);
    }
  }
}

function isHumanTurn() {
  return game.started && !game.busy && game.state?.status === 'playing' && game.state.turn === game.humanPlayer;
}

function highlightColumn(col) {
  for (const a of ui.arrows.children) {
    a.classList.toggle('hover', isHumanTurn() && Number(a.dataset.col) === col && game.state.legalMoves.includes(col));
  }
}

function renderBoard() {
  const s = game.state;
  const winSet = new Set((s?.winningCells || []).map(([r, c]) => `${r},${c}`));
  const lastCol = game.moves[game.moves.length - 1];
  const lastRow = s ? countInColumn(s.board, lastCol) - 1 : -1;

  for (const cell of ui.board.children) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const v = s ? s.board[row][col] : 0;
    cell.className = 'cell';
    if (v) cell.classList.add(v === game.humanPlayer ? 'p-human' : 'p-bot');
    if (winSet.has(`${row},${col}`)) cell.classList.add('win');
    if (s?.legalMoves.includes(col)) cell.classList.add('col-open');
    if (game.lastDropped === game.moves.length && col === lastCol && row === lastRow) cell.classList.add('drop');
  }
  ui.board.classList.toggle('interactive', isHumanTurn());
  ui.board.classList.toggle('finished', !!s && s.status !== 'playing');
  for (const a of ui.arrows.children) {
    a.classList.toggle('visible', isHumanTurn() && s.legalMoves.includes(Number(a.dataset.col)));
    if (!isHumanTurn()) a.classList.remove('hover');
  }
}

function countInColumn(board, col) {
  if (col === undefined) return 0;
  let n = 0;
  for (let r = 0; r < ROWS; r++) if (board[r][col]) n++;
  return n;
}

function setStatus(text, dot) {
  ui.statusText.textContent = text;
  ui.statusDot.className = `dot ${dot || ''}`;
}

function renderStatus() {
  const s = game.state;
  if (!game.started || !s) return setStatus('Elige quién abre y pulsa «Nueva partida».', '');
  if (s.status === 'won') {
    return s.winner === game.humanPlayer
      ? setStatus('¡Ganaste! 🎉 Mira tu línea de cuatro resaltada.', 'won')
      : setStatus('Ganó el bot. Su línea de cuatro está resaltada.', 'lost');
  }
  if (s.status === 'draw') return setStatus('Empate: el tablero se llenó sin ganador.', '');
  if (game.busy) return setStatus('El bot está pensando…', 'bot');
  return setStatus('Tu turno: elige una columna.', 'human');
}

function renderHistory() {
  ui.history.innerHTML = '';
  game.moves.forEach((col, i) => {
    const player = i % 2 === 0 ? 1 : 2;
    const li = document.createElement('li');
    const who = player === game.humanPlayer ? 'human' : 'bot';
    li.className = who;
    li.textContent = `${i + 1}. ${who === 'human' ? 'Tú' : 'Bot'} → col ${col + 1}`;
    ui.history.appendChild(li);
  });
}

function render() {
  renderBoard();
  renderStatus();
  renderHistory();
  ui.undo.disabled = game.busy || !game.started || !game.moves.some((_, i) => (i % 2 === 0 ? 1 : 2) === game.humanPlayer);
}

function showError(message, retryFn) {
  ui.errorText.textContent = message;
  ui.error.hidden = false;
  game.pendingRetry = retryFn;
}
function hideError() {
  ui.error.hidden = true;
  game.pendingRetry = null;
}

function shakeStatus(text) {
  setStatus(text, 'human');
  ui.status.classList.remove('shake');
  void ui.status.offsetWidth; // reinicia la animación
  ui.status.classList.add('shake');
}

// ---------- Flujo de juego ----------
async function applyMoves(moves) {
  const state = await api.state(moves);
  game.moves = moves;
  game.state = state;
  game.lastDropped = moves.length;
}

async function botTurn() {
  game.busy = true;
  render();
  try {
    const level = document.querySelector('input[name="level"]:checked').value;
    const r = await api.botMove(game.moves, level);
    game.moves = [...game.moves, r.column];
    game.state = r.state;
    game.lastDropped = game.moves.length;
    ui.botStats.textContent = `Bot: profundidad ${r.stats.depth}, ${r.stats.nodes.toLocaleString('es')} posiciones en ${r.stats.ms} ms`;
    hideError();
  } catch (err) {
    showError(`No se pudo obtener la jugada del bot (${err.message}).`, botTurn);
  } finally {
    game.busy = false;
    render();
  }
}

async function onColumnClick(col) {
  if (!game.started) return shakeStatus('Primero pulsa «Nueva partida».');
  if (game.state.status !== 'playing') return shakeStatus('La partida terminó. Pulsa «Nueva partida» para jugar otra.');
  if (game.busy) return; // ignorar clics mientras el bot piensa
  if (!game.state.legalMoves.includes(col)) return shakeStatus(`La columna ${col + 1} está llena. Elige otra.`);

  try {
    await applyMoves([...game.moves, col]);
    hideError();
  } catch (err) {
    return showError(`No se pudo registrar tu jugada (${err.message}).`, () => onColumnClick(col));
  }
  render();
  if (game.state.status === 'playing') await botTurn();
}

async function newGame() {
  const opener = document.querySelector('input[name="opener"]:checked').value;
  game.humanPlayer = opener === 'human' ? 1 : 2;
  game.started = true;
  game.lastDropped = null;
  ui.botStats.textContent = '';
  try {
    await applyMoves([]);
    hideError();
  } catch (err) {
    game.started = false;
    return showError(`No se pudo iniciar la partida (${err.message}). ¿Está corriendo el servidor?`, newGame);
  }
  render();
  if (game.humanPlayer === 2) await botTurn();
}

async function undo() {
  if (game.busy) return;
  // Quita jugadas hasta que vuelva a ser turno del humano (normalmente 2: la del bot y la tuya).
  let moves = game.moves.slice(0, -1);
  while (moves.length && (moves.length % 2 === 0 ? 1 : 2) !== game.humanPlayer) moves = moves.slice(0, -1);
  try {
    await applyMoves(moves);
    game.lastDropped = null;
    hideError();
  } catch (err) {
    showError(`No se pudo deshacer (${err.message}).`, undo);
  }
  render();
  // Si el bot abría y se deshizo todo, le vuelve a tocar al bot.
  if (game.state?.status === 'playing' && game.state.turn !== game.humanPlayer) await botTurn();
}

ui.newGame.addEventListener('click', newGame);
ui.undo.addEventListener('click', undo);
ui.retry.addEventListener('click', () => game.pendingRetry?.());

buildBoard();
render();

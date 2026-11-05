// Cliente HTTP del árbitro. Solo transporte: no sabe nada de reglas ni de algoritmo.
// `fetch` es inyectable para poder probarlo con un árbitro simulado.

export class ArbiterAuthError extends Error {}

export function createArbiterClient({ baseUrl, token, fetchImpl = globalThis.fetch }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  async function request(method, path, body) {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) throw new ArbiterAuthError('Token inválido (401). Revisa TEAM_TOKEN.');
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null; // cuerpo vacío o no-JSON
    }
    return { status: res.status, data };
  }

  return {
    /** GET /api/next?wait=N — long polling del turno. */
    next: (wait = 20) => request('GET', `/api/next?wait=${Math.min(Math.max(wait, 0), 25)}`),
    /** POST /api/move — envía la columna de un turno pendiente. */
    move: (gameId, column) => request('POST', '/api/move', { game_id: gameId, column }),
    /** GET /api/me — datos del equipo (sirve para validar el token). */
    me: () => request('GET', '/api/me'),
    /** POST /api/practice — partida contra el bot de la casa. */
    practice: (body = {}) => request('POST', '/api/practice', body),
    /** PUT /api/me/submission — registra repo y commit final. */
    submit: (repoUrl, commit) => request('PUT', '/api/me/submission', { repo_url: repoUrl, commit }),
    /** GET /api/games/{id} — registro público de una partida. */
    game: (gameId) => request('GET', `/api/games/${encodeURIComponent(gameId)}`),
  };
}

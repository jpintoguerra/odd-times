// Configuración desde variables de entorno. El token NUNCA se escribe en el código.
import 'dotenv/config';

export function loadConfig(env = process.env) {
  return {
    arbitroUrl: (env.ARBITRO_URL || 'http://localhost:4000').replace(/\/+$/, ''),
    teamToken: env.TEAM_TOKEN || '',
    port: Number(env.PORT) || 3000,
    thinkMs: Number(env.THINK_MS) || 1800,
  };
}

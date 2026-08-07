export interface ServerConfig {
  port: number;
  databaseUrl: string;
}

/**
 * Configuração via variáveis de ambiente:
 *   PORT           porta do Server (default 4100 — deliberadamente diferente do 4000 do
 *                  @herald/dashboard, pra não colidir se alguém rodar os dois juntos)
 *   DATABASE_URL   connection string do Postgres (obrigatório, sem default — diferente
 *                  do resto da config, que sempre teve fallback local; ver
 *                  docker-compose.yml deste pacote pro valor padrão de desenvolvimento)
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL é obrigatório (ex: postgres://herald:herald@localhost:5432/herald_server — " +
        "ver docker-compose.yml deste pacote)."
    );
  }
  return { port: Number(env.PORT ?? 4100), databaseUrl };
}

export interface ServerConfig {
  port: number;
  databaseUrl: string;
}

/**
 * Configuração via variáveis de ambiente:
 *   PORT           porta do Server (default 4810 — faixa 48xx reservada pros apps ativos
 *                  do Herald, incomum o bastante pra não colidir com outra ferramenta
 *                  rodando na mesma máquina; @herald/dashboard, congelado, fica em 4000)
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
  return { port: Number(env.PORT ?? 4810), databaseUrl };
}

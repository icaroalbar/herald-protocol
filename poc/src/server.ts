import { createPocApp } from "./app.js";

const { app, gateway } = createPocApp();
const port = Number(process.env.PORT ?? 4811);

gateway.startReporting();

app.listen(port, () => {
  console.log(`Herald PoC rodando em http://localhost:${port}`);
  console.log(`Discovery: http://localhost:${port}/.well-known/herald`);
  console.log(`Métricas:  http://localhost:${port}/metrics`);
  if (process.env.HERALD_SERVER_URL) {
    console.log(`Reportando pro Outpost em: ${process.env.HERALD_SERVER_URL}`);
  }
});

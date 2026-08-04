import { createPocApp } from "./app.js";

const { app } = createPocApp();
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Herald PoC rodando em http://localhost:${port}`);
  console.log(`Discovery: http://localhost:${port}/.well-known/herald`);
  console.log(`Métricas:  http://localhost:${port}/metrics`);
});

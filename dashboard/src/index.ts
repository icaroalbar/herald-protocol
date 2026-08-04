import { createDashboardApp } from "./server.js";

const { app, config } = createDashboardApp();

app.listen(config.port, () => {
  const names = config.gateways.map((g) => g.name).join(", ");
  console.log(`Herald Dashboard rodando em http://localhost:${config.port}`);
  console.log(`Consultando gateways: ${names}`);
});

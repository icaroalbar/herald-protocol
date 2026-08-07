import { createServerApp } from "./server.js";

const { app, config } = await createServerApp();

app.listen(config.port, () => {
  console.log(`Herald Server rodando em http://localhost:${config.port}`);
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/** ids de canvas/DOM só podem ter [a-zA-Z0-9_-] — nomes de Gateway são livres. */
function slug(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function counterTableHtml(counter, columns) {
  const entries = Object.entries(counter || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return '<p class="empty">Sem dados ainda.</p>';
  }
  const rows = entries
    .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${value}</td></tr>`)
    .join("");
  return `<table><thead><tr><th>${escapeHtml(columns[0])}</th><th>${escapeHtml(columns[1])}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Filtra um Record<string, number> por substring (case-insensitive) da chave. String
 * vazia = sem filtro (retorna o objeto original). */
function filterCounter(counter, filterText) {
  if (!filterText) return counter;
  const needle = filterText.toLowerCase();
  return Object.fromEntries(Object.entries(counter || {}).filter(([key]) => key.toLowerCase().includes(needle)));
}

/** "unknown:unknown" é a chave que o Gateway usa pra requisições sem nenhuma
 * identificação Herald (agentId null + agentType "unknown") — na prática, tráfego
 * humano/não identificado. Único caminho que produz essa combinação exata (ver
 * gateway.ts), então é seguro relabelar sem risco de esconder um agente de verdade. */
function relabelAgentKeys(counter) {
  return Object.fromEntries(
    Object.entries(counter || {}).map(([key, value]) => [key === "unknown:unknown" ? "Humano / não identificado" : key, value])
  );
}

function renderGateway(gw, filterText, historyByGateway) {
  const section = document.createElement("section");
  section.className = "gateway-card";
  const id = slug(gw.name);

  if (!gw.ok) {
    section.innerHTML = `<h2>${escapeHtml(gw.name)}</h2><p class="error">Indisponível: ${escapeHtml(gw.error)}</p>`;
    return section;
  }

  const d = gw.data;
  const requestsByAgent = relabelAgentKeys(filterCounter(d.requestsByAgent, filterText));
  const errorsByAgent = filterCounter(d.errorsByAgent, filterText);

  const history = (historyByGateway && historyByGateway[gw.name]) || [];
  const latencyLabels = history.map((h) => new Date(h.fetchedAt).toLocaleTimeString());
  const latencyValues = history.map((h) => (h.data ? h.data.averageLatencyMs : null));

  section.innerHTML = `
    <h2>${escapeHtml(gw.name)}</h2>
    <div class="summary">
      <div class="stat"><span class="stat-value">${d.sampleCount}</span><span class="stat-label">Amostras</span></div>
      <div class="stat"><span class="stat-value">${d.averageLatencyMs.toFixed(1)}ms</span><span class="stat-label">Latência média</span></div>
    </div>
    <div class="charts">
      <div class="chart-container">
        <h3>Requisições por agente${filterText ? " (filtrado)" : ""}</h3>
        <canvas id="chart-requests-${id}"></canvas>
      </div>
      <div class="chart-container">
        <h3>Decisões de política</h3>
        <canvas id="chart-decisions-${id}"></canvas>
      </div>
      <div class="chart-container">
        <h3>Latência média (histórico)</h3>
        <canvas id="chart-latency-${id}"></canvas>
      </div>
    </div>
    <div class="grid">
      <div><h3>Requisições por agente${filterText ? " (filtrado)" : ""}</h3>${counterTableHtml(requestsByAgent, ["Agente", "Requisições"])}</div>
      <div><h3>Decisões de política</h3>${counterTableHtml(d.decisionsByResult, ["Resultado", "Contagem"])}</div>
      <div><h3>Formatos servidos</h3>${counterTableHtml(d.formatsServed, ["Formato", "Contagem"])}</div>
      <div><h3>Erros por agente${filterText ? " (filtrado)" : ""}</h3>${counterTableHtml(errorsByAgent, ["Agente:Status", "Contagem"])}</div>
    </div>
  `;

  requestAnimationFrame(() => {
    const requestsEntries = Object.entries(requestsByAgent).sort((a, b) => b[1] - a[1]).slice(0, 12);
    renderBarChart(
      `chart-requests-${id}`,
      requestsEntries.map(([k]) => k),
      requestsEntries.map(([, v]) => v),
      "Requisições"
    );

    const decisionsEntries = Object.entries(d.decisionsByResult || {});
    renderBarChart(
      `chart-decisions-${id}`,
      decisionsEntries.map(([k]) => k),
      decisionsEntries.map(([, v]) => v),
      "Decisões"
    );

    renderLatencyChart(`chart-latency-${id}`, latencyLabels, latencyValues);
  });

  return section;
}

let lastMetrics = null;
let lastHistory = null;

function render() {
  if (!lastMetrics) return;
  const filterText = document.getElementById("agent-filter").value.trim();

  document.getElementById("status").textContent = `Atualizado em ${new Date(lastMetrics.fetchedAt).toLocaleTimeString()}`;
  const container = document.getElementById("gateways");
  container.innerHTML = "";

  const historyByGateway = (lastHistory && lastHistory.gateways) || {};
  const keepChartIds = new Set();
  for (const gw of lastMetrics.gateways) {
    container.appendChild(renderGateway(gw, filterText, historyByGateway));
    const id = slug(gw.name);
    keepChartIds.add(`chart-requests-${id}`);
    keepChartIds.add(`chart-decisions-${id}`);
    keepChartIds.add(`chart-latency-${id}`);
  }
  requestAnimationFrame(() => pruneCharts(keepChartIds));
}

async function fetchMetrics() {
  try {
    const [metricsRes, historyRes] = await Promise.all([fetch("/api/metrics"), fetch("/api/metrics/history")]);
    if (!metricsRes.ok) throw new Error(`HTTP ${metricsRes.status}`);
    lastMetrics = await metricsRes.json();
    lastHistory = historyRes.ok ? await historyRes.json() : null;
    render();
    return lastMetrics.pollIntervalMs;
  } catch (err) {
    document.getElementById("status").textContent = `Erro ao buscar métricas: ${err}`;
    return null;
  }
}

async function start() {
  document.getElementById("agent-filter").addEventListener("input", render);
  const pollIntervalMs = (await fetchMetrics()) ?? 5000;
  setInterval(fetchMetrics, pollIntervalMs);
}

start();

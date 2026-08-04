function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
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

function renderGateway(gw) {
  const section = document.createElement("section");
  section.className = "gateway-card";

  if (!gw.ok) {
    section.innerHTML = `<h2>${escapeHtml(gw.name)}</h2><p class="error">Indisponível: ${escapeHtml(gw.error)}</p>`;
    return section;
  }

  const d = gw.data;
  section.innerHTML = `
    <h2>${escapeHtml(gw.name)}</h2>
    <div class="summary">
      <div class="stat"><span class="stat-value">${d.sampleCount}</span><span class="stat-label">Amostras</span></div>
      <div class="stat"><span class="stat-value">${d.averageLatencyMs.toFixed(1)}ms</span><span class="stat-label">Latência média</span></div>
    </div>
    <div class="grid">
      <div><h3>Requisições por agente</h3>${counterTableHtml(d.requestsByAgent, ["Agente", "Requisições"])}</div>
      <div><h3>Decisões de política</h3>${counterTableHtml(d.decisionsByResult, ["Resultado", "Contagem"])}</div>
      <div><h3>Formatos servidos</h3>${counterTableHtml(d.formatsServed, ["Formato", "Contagem"])}</div>
      <div><h3>Erros por agente</h3>${counterTableHtml(d.errorsByAgent, ["Agente:Status", "Contagem"])}</div>
    </div>
  `;

  return section;
}

function render(json) {
  document.getElementById("status").textContent = `Atualizado em ${new Date(json.fetchedAt).toLocaleTimeString()}`;
  const container = document.getElementById("gateways");
  container.innerHTML = "";
  for (const gw of json.gateways) {
    container.appendChild(renderGateway(gw));
  }
}

async function fetchMetrics() {
  try {
    const res = await fetch("/api/metrics");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    render(json);
    return json.pollIntervalMs;
  } catch (err) {
    document.getElementById("status").textContent = `Erro ao buscar métricas: ${err}`;
    return null;
  }
}

async function start() {
  const pollIntervalMs = (await fetchMetrics()) ?? 5000;
  setInterval(fetchMetrics, pollIntervalMs);
}

start();

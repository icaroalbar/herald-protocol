/** Wrappers finos sobre Chart.js (vendorizado em /vendor/chart.min.js) — cores fixas
 * seguindo as variáveis CSS de styles.css, sem tema dinâmico (dashboard é dark-only). */

const CHART_COLORS = {
  accent: "#6e56cf",
  accentFill: "rgba(110, 86, 207, 0.15)",
  muted: "#9aa2b1",
  grid: "#262b36",
};

const chartInstances = new Map();

function upsertChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return null;

  const existing = chartInstances.get(canvasId);
  if (existing) {
    existing.data = config.data;
    existing.update();
    return existing;
  }

  const chart = new Chart(el, config);
  chartInstances.set(canvasId, chart);
  return chart;
}

/** Destrói charts cujo canvasId não está mais em `keepIds` — evita vazar instâncias
 * quando um Gateway some do JSON (ex: filtro de agente esvazia um card). */
function pruneCharts(keepIds) {
  for (const [id, chart] of chartInstances) {
    if (!keepIds.has(id)) {
      chart.destroy();
      chartInstances.delete(id);
    }
  }
}

function renderBarChart(canvasId, labels, values, label) {
  return upsertChart(canvasId, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label, data: values, backgroundColor: CHART_COLORS.accent, borderRadius: 3 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: CHART_COLORS.muted }, grid: { display: false } },
        y: { ticks: { color: CHART_COLORS.muted }, grid: { color: CHART_COLORS.grid }, beginAtZero: true },
      },
    },
  });
}

function renderLatencyChart(canvasId, labels, values) {
  return upsertChart(canvasId, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Latência média (ms)",
          data: values,
          borderColor: CHART_COLORS.accent,
          backgroundColor: CHART_COLORS.accentFill,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: CHART_COLORS.muted, maxTicksLimit: 6 }, grid: { display: false } },
        y: { ticks: { color: CHART_COLORS.muted }, grid: { color: CHART_COLORS.grid }, beginAtZero: true },
      },
    },
  });
}

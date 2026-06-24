const plateDefs = {
  6: { rows: ["A", "B"], cols: 3, title: "6 孔板" },
  24: { rows: ["A", "B", "C", "D"], cols: 6, title: "24 孔板" },
  48: { rows: ["A", "B", "C", "D", "E", "F"], cols: 8, title: "48 孔板" },
  96: { rows: ["A", "B", "C", "D", "E", "F", "G", "H"], cols: 12, title: "96 孔板" },
};

const palette = ["#397fa7", "#c86a58", "#3a9d86", "#8d77b8", "#c99a48", "#5d95a6", "#b56f8d", "#728091"];

let state = {
  plateType: "6",
  selectedWells: [],
  activeConditionId: "ctrl",
  conditions: [
    { id: "ctrl", name: "Control", color: "#8a96a8", treatment: "Vehicle", timePoint: "", note: "" },
    { id: "drug-a", name: "Drug A 10 µM", color: "#397fa7", treatment: "", timePoint: "24 h", note: "" },
  ],
  plates: {
    6: {},
    24: {},
    48: {},
    96: {},
  },
  projectName: "",
  experimentDate: new Date().toISOString().slice(0, 10),
  globalNotes: "",
  showLabels: true,
  compact: false,
};

const history = [];
const future = [];
let isDraggingWells = false;
let dragStartWell = null;
let dragBaseSelection = [];

const els = {
  plateGrid: document.querySelector("#plateGrid"),
  plateTitle: document.querySelector("#plateTitle"),
  selectedWellText: document.querySelector("#selectedWellText"),
  conditionList: document.querySelector("#conditionList"),
  conditionName: document.querySelector("#conditionName"),
  conditionColor: document.querySelector("#conditionColor"),
  treatmentInput: document.querySelector("#treatmentInput"),
  timePointInput: document.querySelector("#timePointInput"),
  noteInput: document.querySelector("#noteInput"),
  replicateCount: document.querySelector("#replicateCount"),
  projectName: document.querySelector("#projectName"),
  experimentDate: document.querySelector("#experimentDate"),
  globalNotes: document.querySelector("#globalNotes"),
  showLabelsToggle: document.querySelector("#showLabelsToggle"),
  compactToggle: document.querySelector("#compactToggle"),
  compactOption: document.querySelector(".compact-option"),
  summaryBar: document.querySelector("#summaryBar"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveSnapshot() {
  history.push(clone(state));
  if (history.length > 80) history.shift();
  future.length = 0;
}

function restore(nextState) {
  state = nextState;
  normalizeState();
  syncInputs();
  render();
}

function getWells(type = state.plateType) {
  const def = plateDefs[type];
  const wells = [];
  def.rows.forEach((row) => {
    for (let col = 1; col <= def.cols; col += 1) {
      wells.push(`${row}${col}`);
    }
  });
  return wells;
}

function getActiveCondition() {
  return state.conditions.find((item) => item.id === state.activeConditionId) || state.conditions[0];
}

function getWellData(wellId) {
  return state.plates[state.plateType][wellId] || null;
}

function getSelectedWells() {
  return (state.selectedWells || []).filter((wellId) => getWells().includes(wellId));
}

function getLastSelectedWell() {
  const selected = getSelectedWells();
  return selected[selected.length - 1] || null;
}

function getWellPosition(wellId) {
  const match = wellId.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const [, row, col] = match;
  const rowIndex = plateDefs[state.plateType].rows.indexOf(row);
  const colIndex = Number(col) - 1;
  if (rowIndex < 0 || colIndex < 0) return null;
  return { rowIndex, colIndex };
}

function getRectangleWells(startWell, endWell) {
  const start = getWellPosition(startWell);
  const end = getWellPosition(endWell);
  if (!start || !end) return [];
  const rowStart = Math.min(start.rowIndex, end.rowIndex);
  const rowEnd = Math.max(start.rowIndex, end.rowIndex);
  const colStart = Math.min(start.colIndex, end.colIndex);
  const colEnd = Math.max(start.colIndex, end.colIndex);
  const rows = plateDefs[state.plateType].rows;
  const wells = [];
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    for (let colIndex = colStart; colIndex <= colEnd; colIndex += 1) {
      wells.push(`${rows[rowIndex]}${colIndex + 1}`);
    }
  }
  return wells;
}

function selectRectangle(endWell) {
  if (!dragStartWell) return;
  state.selectedWells = [...new Set([...dragBaseSelection, ...getRectangleWells(dragStartWell, endWell)])];
}

function setWell(wellId, condition = getActiveCondition()) {
  if (!condition) return;
  state.plates[state.plateType][wellId] = {
    conditionId: condition.id,
    name: condition.name,
    color: condition.color,
    treatment: condition.treatment,
    timePoint: condition.timePoint,
    note: condition.note,
  };
}

function clearWell(wellId) {
  delete state.plates[state.plateType][wellId];
}

function renderPlate() {
  const def = plateDefs[state.plateType];
  els.plateGrid.className = `plate-grid plate-${state.plateType}`;
  els.plateTitle.textContent = def.title;
  els.plateGrid.innerHTML = "";

  els.plateGrid.appendChild(createPlateLabel("", "corner"));
  for (let col = 1; col <= def.cols; col += 1) {
    els.plateGrid.appendChild(createPlateLabel(col, "column"));
  }

  def.rows.forEach((row) => {
    els.plateGrid.appendChild(createPlateLabel(row, "row"));
    for (let col = 1; col <= def.cols; col += 1) {
      renderWell(`${row}${col}`);
    }
  });
}

function createPlateLabel(text, type) {
  const label = document.createElement("span");
  label.className = `plate-label plate-label-${type}`;
  label.textContent = text;
  return label;
}

function renderWell(wellId) {
  const template = document.querySelector("#wellTemplate").content.cloneNode(true);
  const button = template.querySelector(".well");
  const data = getWellData(wellId);
  button.dataset.well = wellId;
  button.classList.toggle("is-selected", getSelectedWells().includes(wellId));
  button.style.background = data ? data.color : "#ffffff";
  button.querySelector(".well-id").textContent = wellId;
  button.querySelector(".well-name").textContent = data?.name || "";
  button.querySelector(".well-time").textContent = data?.timePoint || "";
  button.querySelector(".well-treatment").textContent = data?.treatment || "";
  button.title = data ? `${wellId}: ${data.name} ${data.treatment || ""} ${data.timePoint || ""}` : wellId;
  els.plateGrid.appendChild(template);
}

function renderConditions() {
  els.conditionList.innerHTML = "";
  state.conditions.forEach((condition) => {
    const item = document.createElement("div");
    item.className = `condition-item${condition.id === state.activeConditionId ? " is-active" : ""}`;
    item.innerHTML = `
      <span class="swatch" style="background:${condition.color}"></span>
      <button class="condition-meta" type="button" data-condition="${condition.id}">
        <strong>${escapeHtml(condition.name)}</strong>
        <span>${escapeHtml([condition.treatment, condition.timePoint].filter(Boolean).join(" · ") || "无处理信息")}</span>
      </button>
      <button class="mini-delete" type="button" data-delete="${condition.id}" title="删除条件" aria-label="删除条件">×</button>
    `;
    els.conditionList.appendChild(item);
  });
}

function renderSummary() {
  const groups = getPlateGroups();
  els.summaryBar.innerHTML = "";
  const filled = Object.keys(state.plates[state.plateType]).length;
  const total = getWells().length;
  addSummaryPill("已填孔", `${filled}/${total}`, "#ffffff");
  groups.forEach((group) => {
    addSummaryPill(group.label, `${group.wells.length} 孔 · ${formatWellRanges(group.wells)}`, group.color);
  });
}

function getPlateGroups() {
  const groups = new Map();
  getWells().forEach((wellId) => {
    const well = getWellData(wellId);
    if (!well) return;
    const label = [well.name, well.treatment, well.timePoint].filter(Boolean).join(" · ");
    const key = `${well.conditionId || label}|${label}`;
    if (!groups.has(key)) {
      groups.set(key, {
        label,
        name: well.name || "",
        treatment: well.treatment || "",
        timePoint: well.timePoint || "",
        note: well.note || "",
        color: well.color,
        wells: [],
      });
    }
    groups.get(key).wells.push(wellId);
  });
  return [...groups.values()];
}

function formatWellRanges(wells) {
  const byRow = new Map();
  wells.forEach((wellId) => {
    const position = getWellPosition(wellId);
    if (!position) return;
    const row = plateDefs[state.plateType].rows[position.rowIndex];
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(position.colIndex + 1);
  });

  const ranges = [];
  byRow.forEach((cols, row) => {
    cols.sort((a, b) => a - b);
    let start = cols[0];
    let previous = cols[0];
    for (let index = 1; index <= cols.length; index += 1) {
      const col = cols[index];
      if (col === previous + 1) {
        previous = col;
        continue;
      }
      ranges.push(start === previous ? `${row}${start}` : `${row}${start}-${row}${previous}`);
      start = col;
      previous = col;
    }
  });
  return ranges.join(", ");
}

function renderPlateCanvas(scale = 2) {
  const def = plateDefs[state.plateType];
  const showAxis = true;
  const cols = def.cols;
  const rows = def.rows.length;
  const cellSizes = { 6: 150, 24: 94, 48: 74, 96: 62 };
  const gapSizes = { 6: 26, 24: 16, 48: 12, 96: 10 };
  const cell = cellSizes[state.plateType] || 74;
  const gap = gapSizes[state.plateType] || 12;
  const axis = showAxis ? 28 : 0;
  const margin = 34;
  const header = 74;
  const legendHeight = 78;
  const width = margin * 2 + axis + cols * cell + (cols - 1) * gap;
  const height = margin * 2 + header + axis + rows * cell + (rows - 1) * gap + legendHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#17202b";
  ctx.font = "700 24px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(state.projectName || "Plate Layout", margin, margin + 4);
  ctx.fillStyle = "#647084";
  ctx.font = "13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(`${def.title} · ${state.experimentDate || dateStamp()}`, margin, margin + 28);

  const gridX = margin + axis;
  const gridY = margin + header + axis;

  if (showAxis) {
    ctx.fillStyle = "#647084";
    ctx.font = "700 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    for (let col = 1; col <= cols; col += 1) {
      const x = gridX + (col - 1) * (cell + gap) + cell / 2;
      ctx.textAlign = "center";
      ctx.fillText(String(col), x, gridY - 12);
    }
    def.rows.forEach((row, index) => {
      const y = gridY + index * (cell + gap) + cell / 2 + 4;
      ctx.textAlign = "center";
      ctx.fillText(row, margin + axis / 2, y);
    });
  }

  def.rows.forEach((row, rowIndex) => {
    for (let col = 1; col <= cols; col += 1) {
      const wellId = `${row}${col}`;
      const data = getWellData(wellId);
      const x = gridX + (col - 1) * (cell + gap);
      const y = gridY + rowIndex * (cell + gap);
      drawCanvasWell(ctx, x, y, cell, wellId, data);
    }
  });

  drawCanvasLegend(ctx, margin, height - legendHeight + 20, width - margin * 2);
  return canvas;
}

function drawCanvasWell(ctx, x, y, size, wellId, data) {
  const radius = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + radius, y + radius, radius - 2, 0, Math.PI * 2);
  ctx.fillStyle = data?.color || "#ffffff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = data ? "#17202b" : "#c8d2df";
  ctx.stroke();

  ctx.fillStyle = "#17202b";
  ctx.textAlign = "center";
  ctx.font = `700 ${size < 70 ? 10 : 14}px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
  ctx.fillText(wellId, x + radius, y + (size < 70 ? 18 : 26));
  if (data && state.showLabels) {
    ctx.font = `700 ${size < 70 ? 8 : 13}px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
    ctx.fillText(truncateText(ctx, data.name, size - 16), x + radius, y + radius + 2);
    if (data.timePoint) {
      ctx.font = `700 ${size < 70 ? 8 : 11}px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
      ctx.fillText(truncateText(ctx, data.timePoint, size - 18), x + radius, y + size - (size < 70 ? 12 : 22));
    }
  }
  ctx.restore();
}

function drawCanvasLegend(ctx, x, y, width) {
  const groups = getPlateGroups();
  ctx.fillStyle = "#647084";
  ctx.textAlign = "left";
  ctx.font = "700 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(`已填孔 ${Object.keys(state.plates[state.plateType]).length}/${getWells().length}`, x, y);
  let cursorX = x;
  let cursorY = y + 28;
  groups.forEach((group) => {
    const text = `${group.label}: ${group.wells.length} 孔 (${formatWellRanges(group.wells)})`;
    ctx.font = "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    const itemWidth = Math.min(ctx.measureText(text).width + 34, width);
    if (cursorX + itemWidth > x + width) {
      cursorX = x;
      cursorY += 24;
    }
    ctx.fillStyle = group.color;
    ctx.fillRect(cursorX, cursorY - 10, 12, 12);
    ctx.strokeStyle = "#c8d2df";
    ctx.strokeRect(cursorX, cursorY - 10, 12, 12);
    ctx.fillStyle = "#17202b";
    ctx.fillText(truncateText(ctx, text, itemWidth - 22), cursorX + 20, cursorY);
    cursorX += itemWidth + 12;
  });
}

function truncateText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && ctx.measureText(`${result}...`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function addSummaryPill(label, value, color) {
  const pill = document.createElement("span");
  pill.className = "summary-pill";
  pill.innerHTML = `<span class="swatch" style="background:${color}"></span><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span>`;
  els.summaryBar.appendChild(pill);
}

function renderSelectedText() {
  const selected = getSelectedWells();
  if (!selected.length) {
    els.selectedWellText.textContent = "未选择孔";
    return;
  }
  if (selected.length === 1) {
    const [wellId] = selected;
    const data = getWellData(wellId);
    els.selectedWellText.textContent = data
      ? `${wellId}: ${[data.name, data.treatment, data.timePoint].filter(Boolean).join(", ")}`
      : `${wellId}: 空孔`;
    return;
  }
  els.selectedWellText.textContent = `已选择 ${selected.length} 个孔: ${selected.join(", ")}`;
}

function render() {
  document.body.classList.toggle("hide-labels", !state.showLabels);
  document.body.classList.toggle("compact", state.compact && ["48", "96"].includes(state.plateType));
  els.compactOption.classList.toggle("is-hidden", !["48", "96"].includes(state.plateType));
  document.querySelectorAll("[data-plate]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.plate === state.plateType);
  });
  renderPlate();
  renderConditions();
  renderSummary();
  renderSelectedText();
}

function syncInputs() {
  const active = getActiveCondition();
  els.conditionName.value = active?.name || "";
  els.conditionColor.value = active?.color || palette[0];
  els.treatmentInput.value = active?.treatment || "";
  els.timePointInput.value = active?.timePoint || "";
  els.noteInput.value = active?.note || "";
  els.projectName.value = state.projectName || "";
  els.experimentDate.value = state.experimentDate || "";
  els.globalNotes.value = state.globalNotes || "";
  els.showLabelsToggle.checked = state.showLabels;
  els.compactToggle.checked = state.compact;
}

function normalizeState() {
  if (!Array.isArray(state.selectedWells)) {
    state.selectedWells = state.selectedWell ? [state.selectedWell] : [];
  }
  delete state.selectedWell;
  state.conditions.forEach((condition) => {
    if (condition.timePoint === undefined) condition.timePoint = "";
  });
  Object.values(state.plates).forEach((plate) => {
    Object.values(plate).forEach((well) => {
      if (well.timePoint === undefined) well.timePoint = "";
    });
  });
}

function updateActiveCondition(patch) {
  const active = getActiveCondition();
  if (!active) return;
  Object.assign(active, patch);
  Object.values(state.plates).forEach((plate) => {
    Object.values(plate).forEach((well) => {
      if (well.conditionId === active.id) Object.assign(well, patch);
    });
  });
}

function fillSelected() {
  const selected = getSelectedWells();
  if (!selected.length) return;
  saveSnapshot();
  selected.forEach((wellId) => setWell(wellId));
  render();
}

function fillRow() {
  const anchor = getLastSelectedWell();
  if (!anchor) return;
  saveSnapshot();
  const row = anchor.match(/[A-Z]+/)[0];
  getWells().filter((well) => well.startsWith(row)).forEach((well) => setWell(well));
  render();
}

function fillColumn() {
  const anchor = getLastSelectedWell();
  if (!anchor) return;
  saveSnapshot();
  const col = anchor.match(/\d+/)[0];
  getWells().filter((well) => well.match(/\d+/)[0] === col).forEach((well) => setWell(well));
  render();
}

function fillReplicates() {
  const anchor = getLastSelectedWell();
  if (!anchor) return;
  saveSnapshot();
  const wells = getWells();
  const start = wells.indexOf(anchor);
  const count = Math.max(1, Number(els.replicateCount.value) || 1);
  wells.slice(start, start + count).forEach((well) => setWell(well));
  render();
}

function clearSelected() {
  const selected = getSelectedWells();
  if (!selected.length) return;
  saveSnapshot();
  selected.forEach((wellId) => clearWell(wellId));
  render();
}

function clearPlate() {
  saveSnapshot();
  state.plates[state.plateType] = {};
  render();
}

function addCondition() {
  saveSnapshot();
  const index = state.conditions.length;
  const condition = {
    id: `condition-${Date.now()}`,
    name: `Condition ${index + 1}`,
    color: palette[index % palette.length],
    treatment: "",
    timePoint: "",
    note: "",
  };
  state.conditions.push(condition);
  state.activeConditionId = condition.id;
  syncInputs();
  render();
}

function copyCondition() {
  const active = getActiveCondition();
  if (!active) return;
  saveSnapshot();
  const condition = {
    ...clone(active),
    id: `condition-${Date.now()}`,
    name: `${active.name} 副本`,
  };
  state.conditions.push(condition);
  state.activeConditionId = condition.id;
  syncInputs();
  render();
}

function deleteCondition(id) {
  if (state.conditions.length === 1) return;
  saveSnapshot();
  state.conditions = state.conditions.filter((item) => item.id !== id);
  Object.values(state.plates).forEach((plate) => {
    Object.keys(plate).forEach((wellId) => {
      if (plate[wellId].conditionId === id) delete plate[wellId];
    });
  });
  if (state.activeConditionId === id) state.activeConditionId = state.conditions[0].id;
  syncInputs();
  render();
}

function exportCsv() {
  const rows = [["Project", state.projectName], ["Date", state.experimentDate], ["Plate", plateDefs[state.plateType].title], []];
  rows.push(["Well", "Condition", "Treatment", "Time point", "Note"]);
  getWells().forEach((wellId) => {
    const data = getWellData(wellId);
    rows.push([wellId, data?.name || "", data?.treatment || "", data?.timePoint || "", data?.note || ""]);
  });
  download(`plate-${state.plateType}-${dateStamp()}.csv`, `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
}

function exportProtocolCsv() {
  const rows = [["Project", state.projectName], ["Date", state.experimentDate], ["Plate", plateDefs[state.plateType].title], []];
  rows.push(["Condition", "Treatment", "Time point", "Replicates", "Wells", "Notes"]);
  getPlateGroups().forEach((group) => {
    rows.push([
      group.name,
      group.treatment,
      group.timePoint,
      group.wells.length,
      formatWellRanges(group.wells),
      group.note,
    ]);
  });
  download(`plate-protocol-${state.plateType}-${dateStamp()}.csv`, `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
}

function exportJson() {
  download(`plate-design-${dateStamp()}.json`, JSON.stringify(state, null, 2), "application/json");
}

function exportImage() {
  const canvas = renderPlateCanvas();
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plate-layout-${state.plateType}-${dateStamp()}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function printPdf() {
  const canvas = renderPlateCanvas(2);
  const imageUrl = canvas.toDataURL("image/png");
  const groups = getPlateGroups();
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("浏览器阻止了打印窗口，请允许弹出窗口后再试。");
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Plate Layout</title>
        <style>
          body { margin: 32px; color: #17202b; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          h1 { margin: 0 0 6px; font-size: 24px; }
          p { margin: 0 0 18px; color: #647084; }
          img { width: 100%; max-width: 920px; border: 1px solid #d7dee8; border-radius: 8px; }
          table { width: 100%; max-width: 920px; margin-top: 22px; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d7dee8; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f7fafc; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(state.projectName || "Plate Layout")}</h1>
        <p>${escapeHtml(plateDefs[state.plateType].title)} · ${escapeHtml(state.experimentDate || dateStamp())}</p>
        <img src="${imageUrl}" alt="Plate layout" />
        <table>
          <thead>
            <tr><th>Condition</th><th>Treatment</th><th>Time point</th><th>Wells</th><th>Notes</th></tr>
          </thead>
          <tbody>
            ${groups.map((group) => `
              <tr>
                <td>${escapeHtml(group.name)}</td>
                <td>${escapeHtml(group.treatment)}</td>
                <td>${escapeHtml(group.timePoint)}</td>
                <td>${escapeHtml(formatWellRanges(group.wells))}</td>
                <td>${escapeHtml(group.note)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      saveSnapshot();
      state = {
        ...state,
        ...imported,
        plates: { 6: {}, 24: {}, 48: {}, 96: {}, ...(imported.plates || {}) },
      };
      normalizeState();
      syncInputs();
      render();
    } catch {
      alert("无法读取这个设计文件。");
    }
  };
  reader.readAsText(file);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

els.plateGrid.addEventListener("pointerdown", (event) => {
  const well = event.target.closest(".well");
  if (!well) return;
  event.preventDefault();
  isDraggingWells = true;
  dragStartWell = well.dataset.well;
  dragBaseSelection = event.shiftKey || event.metaKey || event.ctrlKey ? getSelectedWells() : [];
  els.plateGrid.setPointerCapture(event.pointerId);
  selectRectangle(well.dataset.well);
  render();
});

els.plateGrid.addEventListener("pointerover", (event) => {
  if (!isDraggingWells) return;
  const well = event.target.closest(".well");
  if (!well) return;
  selectRectangle(well.dataset.well);
  render();
});

els.plateGrid.addEventListener("pointermove", (event) => {
  if (!isDraggingWells) return;
  const well = document.elementFromPoint(event.clientX, event.clientY)?.closest(".well");
  if (!well || !els.plateGrid.contains(well)) return;
  selectRectangle(well.dataset.well);
  render();
});

els.plateGrid.addEventListener("pointerup", () => {
  isDraggingWells = false;
  dragStartWell = null;
  dragBaseSelection = [];
});

els.plateGrid.addEventListener("pointercancel", () => {
  isDraggingWells = false;
  dragStartWell = null;
  dragBaseSelection = [];
});

document.querySelectorAll("[data-plate]").forEach((button) => {
  button.addEventListener("click", () => {
    saveSnapshot();
    state.plateType = button.dataset.plate;
    state.selectedWells = [];
    render();
  });
});

document.querySelectorAll("[data-fill]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.fill;
    if (action === "selected") fillSelected();
    if (action === "row") fillRow();
    if (action === "column") fillColumn();
    if (action === "replicates") fillReplicates();
  });
});

document.querySelector("#addConditionBtn").addEventListener("click", addCondition);
document.querySelector("#copyConditionBtn").addEventListener("click", copyCondition);
document.querySelector("#clearSelectedBtn").addEventListener("click", clearSelected);
document.querySelector("#clearPlateBtn").addEventListener("click", clearPlate);
document.querySelector("#exportCsvBtn").addEventListener("click", exportCsv);
document.querySelector("#exportProtocolBtn").addEventListener("click", exportProtocolCsv);
document.querySelector("#exportImageBtn").addEventListener("click", exportImage);
document.querySelector("#printPdfBtn").addEventListener("click", printPdf);
document.querySelector("#exportJsonBtn").addEventListener("click", exportJson);

document.querySelector("#undoBtn").addEventListener("click", () => {
  if (!history.length) return;
  future.push(clone(state));
  restore(history.pop());
});

document.querySelector("#redoBtn").addEventListener("click", () => {
  if (!future.length) return;
  history.push(clone(state));
  restore(future.pop());
});

document.querySelector("#importJsonInput").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importJson(file);
  event.target.value = "";
});

els.conditionList.addEventListener("click", (event) => {
  const conditionButton = event.target.closest("[data-condition]");
  const deleteButton = event.target.closest("[data-delete]");
  if (conditionButton) {
    state.activeConditionId = conditionButton.dataset.condition;
    syncInputs();
    render();
  }
  if (deleteButton) deleteCondition(deleteButton.dataset.delete);
});

[
  [els.conditionName, "name"],
  [els.conditionColor, "color"],
  [els.treatmentInput, "treatment"],
  [els.timePointInput, "timePoint"],
  [els.noteInput, "note"],
].forEach(([input, key]) => {
  input.addEventListener("focus", saveSnapshot);
  input.addEventListener("input", () => {
    updateActiveCondition({ [key]: input.value });
    render();
  });
});

els.projectName.addEventListener("focus", saveSnapshot);
els.projectName.addEventListener("input", () => { state.projectName = els.projectName.value; });
els.experimentDate.addEventListener("focus", saveSnapshot);
els.experimentDate.addEventListener("input", () => { state.experimentDate = els.experimentDate.value; });
els.globalNotes.addEventListener("focus", saveSnapshot);
els.globalNotes.addEventListener("input", () => { state.globalNotes = els.globalNotes.value; });
els.showLabelsToggle.addEventListener("change", () => { state.showLabels = els.showLabelsToggle.checked; render(); });
els.compactToggle.addEventListener("change", () => { state.compact = els.compactToggle.checked; render(); });

normalizeState();
syncInputs();
render();

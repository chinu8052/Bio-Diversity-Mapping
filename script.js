// Biodiversity - Pure JS data and UI logic
// Data is stored in localStorage to keep the app static-only

(function () {
  "use strict";

  const STORAGE_KEY = "biodiversity_sightings";

  /**
   * Utilities
   */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function coerceInteger(value, fallback = 0) {
    const num = Number.parseInt(String(value), 10);
    return Number.isFinite(num) ? num : fallback;
    }

  function formatDate(isoLike) {
    try {
      const d = new Date(isoLike);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch { return "—"; }
  }

  function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  /**
   * Storage
   */
  function loadSightings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data;
    } catch {
      return [];
    }
  }

  function saveSightings(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function seedSampleData() {
    const samples = [
      { id: uid(), species: "Monarch Butterfly", category: "Insect", count: 7, date: new Date().toISOString().slice(0,10), location: "40.7128,-74.0060", photoUrl: "", notes: "Feeding on milkweed" },
      { id: uid(), species: "Blue Jay", category: "Bird", count: 3, date: new Date(Date.now()-86400000*2).toISOString().slice(0,10), location: "40.7829,-73.9654", photoUrl: "", notes: "Vocal flock near oaks" },
      { id: uid(), species: "Eastern Gray Squirrel", category: "Mammal", count: 4, date: new Date(Date.now()-86400000*6).toISOString().slice(0,10), location: "40.7580,-73.9855", photoUrl: "", notes: "" },
      { id: uid(), species: "White Oak", category: "Plant", count: 1, date: new Date(Date.now()-86400000*10).toISOString().slice(0,10), location: "40.7484,-73.9857", photoUrl: "", notes: "Sapling" },
      { id: uid(), species: "Wood Frog", category: "Amphibian", count: 2, date: new Date(Date.now()-86400000*1).toISOString().slice(0,10), location: "40.7420,-73.9895", photoUrl: "", notes: "Edge of vernal pool" },
      { id: uid(), species: "Turkey Tail", category: "Fungi", count: 12, date: new Date(Date.now()-86400000*12).toISOString().slice(0,10), location: "40.7306,-73.9352", photoUrl: "", notes: "Conk clusters" }
    ];
    saveSightings(samples);
    return samples;
  }

  /**
   * State
   */
  let sightings = loadSightings();
  if (sightings.length === 0) {
    // Provide a friendly first-time experience
    sightings = seedSampleData();
  }

  let chartModeIndividuals = false; // false -> count sightings; true -> sum individuals

  /**
   * Derived metrics and analysis
   */
  function computeStats(list) {
    const totalSightings = list.length;
    const speciesSet = new Set(list.map(s => s.species.trim().toLowerCase()).filter(Boolean));
    const distinctSpecies = speciesSet.size;
    const totalIndividuals = list.reduce((sum, s) => sum + coerceInteger(s.count, 0), 0);

    const byCategory = new Map();
    for (const s of list) {
      const key = s.category || "Other";
      const current = byCategory.get(key) || { sightings: 0, individuals: 0 };
      current.sightings += 1;
      current.individuals += coerceInteger(s.count, 0);
      byCategory.set(key, current);
    }

    let topCategory = "—";
    let topVal = -1;
    for (const [cat, agg] of byCategory.entries()) {
      const v = chartModeIndividuals ? agg.individuals : agg.sightings;
      if (v > topVal) { topVal = v; topCategory = cat; }
    }

    return { totalSightings, distinctSpecies, totalIndividuals, byCategory, topCategory };
  }

  /**
   * Rendering - Stats
   */
  function renderStats() {
    const { totalSightings, distinctSpecies, totalIndividuals, topCategory } = computeStats(sightings);
    $("#statTotalSightings").textContent = String(totalSightings);
    $("#statDistinctSpecies").textContent = String(distinctSpecies);
    $("#statTotalIndividuals").textContent = String(totalIndividuals);
    $("#statTopCategory").textContent = topCategory || "—";
  }

  /**
   * Rendering - Chart (lightweight canvas bar chart)
   */
  function drawBarChart(canvas, entries) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const widthCss = canvas.clientWidth || canvas.width;
    const heightCss = canvas.clientHeight || canvas.height;
    canvas.width = Math.floor(widthCss * dpr);
    canvas.height = Math.floor(heightCss * dpr);
    ctx.scale(dpr, dpr);

    // Styles
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--panel') || '#ffffff';
    ctx.fillRect(0, 0, widthCss, heightCss);

    // Add more generous padding to keep text inside the frame
    const padding = { left: 48, right: 20, top: 18, bottom: 48 };
    const plotW = Math.max(10, widthCss - padding.left - padding.right);
    const plotH = Math.max(10, heightCss - padding.top - padding.bottom);

    // Axes
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--border') || '#dbe7e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + plotH);
    ctx.lineTo(padding.left + plotW, padding.top + plotH);
    ctx.stroke();

    // Scale
    const values = entries.map(e => e.value);
    const maxValue = Math.max(1, ...values);
    const barGap = 12;
    const barWidth = Math.max(12, (plotW - barGap * (entries.length - 1)) / Math.max(1, entries.length));

    const total = entries.reduce((s, e) => s + (e.value || 0), 0) || 1;
    // Bars
    entries.forEach((entry, idx) => {
      const x = padding.left + idx * (barWidth + barGap);
      const h = (entry.value / maxValue) * plotH;
      const y = padding.top + (plotH - h);

      const fill = categoryColor(entry.label);
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, fill);
      grad.addColorStop(1, shade(fill, -8));
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth, Math.max(1, h));

      // Value label with percent
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--text') || '#244236';
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      // Ensure the value label doesn't render outside the canvas
      const valueY = Math.max(12, y - 4);
      const pct = Math.round((entry.value / total) * 100);
      ctx.fillText(`${entry.value} (${pct}%)`, x + barWidth / 2, valueY);

      // Category label
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--muted') || '#6a8375';
      ctx.textAlign = "center";
      // Keep category labels within bottom padding
      wrapText(ctx, entry.label, x + barWidth / 2, padding.top + plotH + 14, Math.max(40, barWidth + 6), 12);
    });

    // Y-axis ticks
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--muted') || '#6a8375';
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "right";
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = Math.round((i / ticks) * maxValue);
      const y = padding.top + plotH - (i / ticks) * plotH;
      ctx.fillText(String(v), padding.left - 6, y + 4);
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--border') || '#eef5f1';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotW, y);
      ctx.stroke();
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(/\s+/);
    let line = "";
    const lines = [];
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
  }

  function shade(hex, percent) {
    // Simple hex color shade, percent in [-100, 100]
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    const nr = Math.round((t - r) * p) + r;
    const ng = Math.round((t - g) * p) + g;
    const nb = Math.round((t - b) * p) + b;
    return `#${((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1)}`;
  }

  function categoryColor(label) {
    const map = {
      Mammal: "#f97316", // orange
      Bird: "#60a5fa",   // blue
      Reptile: "#22c55e", // green
      Amphibian: "#14b8a6", // teal
      Fish: "#38bdf8", // sky
      Insect: "#f59e0b", // amber
      Plant: "#84cc16", // lime
      Fungi: "#e879f9", // fuchsia
      Other: "#a78bfa", // violet
    };
    return map[label] || "#9ca3af"; // gray
  }

  function drawHorizontalBarChart(canvas, entries) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const widthCss = canvas.clientWidth || canvas.width;
    const heightCss = canvas.clientHeight || canvas.height;
    canvas.width = Math.floor(widthCss * dpr);
    canvas.height = Math.floor(heightCss * dpr);
    ctx.scale(dpr, dpr);

    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--panel') || '#ffffff';
    ctx.fillRect(0, 0, widthCss, heightCss);

    const padding = { left: 100, right: 20, top: 18, bottom: 18 };
    const plotW = Math.max(10, widthCss - padding.left - padding.right);
    const plotH = Math.max(10, heightCss - padding.top - padding.bottom);

    const values = entries.map(e => e.value);
    const maxValue = Math.max(1, ...values);
    const barGap = 10;
    const barHeight = Math.max(12, (plotH - barGap * (entries.length - 1)) / Math.max(1, entries.length));
    const total = entries.reduce((s, e) => s + (e.value || 0), 0) || 1;

    // y positions
    entries.forEach((entry, idx) => {
      const y = padding.top + idx * (barHeight + barGap);
      const w = (entry.value / maxValue) * plotW;
      const x = padding.left;
      const fill = categoryColor(entry.label);
      const grad = ctx.createLinearGradient(x, y, x + w, y);
      grad.addColorStop(0, fill);
      grad.addColorStop(1, shade(fill, -8));
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, Math.max(1, w), barHeight);

      // value label with percent
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--text') || '#244236';
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "left";
      const pct = Math.round((entry.value / total) * 100);
      ctx.fillText(`${entry.value} (${pct}%)`, x + Math.max(4, Math.min(w + 4, plotW - 16)), y + barHeight / 2 + 4);

      // category label
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--muted') || '#6a8375';
      ctx.textAlign = "right";
      ctx.fillText(entry.label, padding.left - 8, y + barHeight / 2 + 4);
    });
  }

  function drawPieChart(canvas, entries, donut = false) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const widthCss = canvas.clientWidth || canvas.width;
    const heightCss = canvas.clientHeight || canvas.height;
    canvas.width = Math.floor(widthCss * dpr);
    canvas.height = Math.floor(heightCss * dpr);
    ctx.scale(dpr, dpr);

    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--panel') || '#ffffff';
    ctx.fillRect(0, 0, widthCss, heightCss);

    const cx = widthCss / 2;
    const cy = heightCss / 2;
    const radius = Math.min(widthCss, heightCss) * 0.35;
    const total = entries.reduce((s, e) => s + e.value, 0) || 1;
    let start = -Math.PI / 2; // start at top

    entries.forEach((entry) => {
      const slice = (entry.value / total) * Math.PI * 2;
      const end = start + slice;
      const fill = categoryColor(entry.label);
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
      grad.addColorStop(0, fill);
      grad.addColorStop(1, shade(fill, -10));
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      start = end;
    });

    if (donut) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // simple labels around
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--text') || '#244236';
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    let angle = -Math.PI / 2;
    entries.forEach(entry => {
      const slice = (entry.value / total) * Math.PI * 2;
      const mid = angle + slice / 2;
      const rx = cx + Math.cos(mid) * (radius * (donut ? 0.9 : 1.05));
      const ry = cy + Math.sin(mid) * (radius * (donut ? 0.9 : 1.05));
      const pct = Math.round((entry.value / total) * 100);
      ctx.fillText(`${entry.label} (${pct}%)`, rx, ry);
      angle += slice;
    });
  }

  function renderCategoryChart() {
    const { byCategory } = computeStats(sightings);
    const entries = Array.from(byCategory.entries()).map(([label, agg]) => ({
      label,
      value: chartModeIndividuals ? agg.individuals : agg.sightings,
    })).sort((a,b) => b.value - a.value);

    const canvas = $("#categoryChart");
    const typeSel = document.getElementById('chartTypeSelect');
    const type = typeSel ? typeSel.value : 'bar';
    if (type === 'bar') drawBarChart(canvas, entries);
    else if (type === 'hbar') drawHorizontalBarChart(canvas, entries);
    else if (type === 'pie') drawPieChart(canvas, entries, false);
    else if (type === 'donut') drawPieChart(canvas, entries, true);
    else drawBarChart(canvas, entries);
  }

  /**
   * Rendering - Sightings List
   */
  function renderSightingsList() {
    const container = $("#sightingsList");
    container.innerHTML = "";

    const query = $("#searchInput").value.trim().toLowerCase();
    const filterCat = $("#filterCategory").value;

    const filtered = sightings.filter(s => {
      if (filterCat && s.category !== filterCat) return false;
      if (!query) return true;
      const hay = `${s.species} ${s.location} ${s.category}`.toLowerCase();
      return hay.includes(query);
    });

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card";
      empty.textContent = "No sightings match your filters.";
      container.appendChild(empty);
      return;
    }

    filtered
      .slice()
      .sort((a,b) => String(b.date).localeCompare(String(a.date)))
      .forEach(s => container.appendChild(renderSightingCard(s)));
  }

  function renderSightingCard(s) {
    const wrap = document.createElement("article");
    wrap.className = "card sighting";

    const left = document.createElement("div");
    const right = document.createElement("div");
    right.className = "sighting__actions";

    const title = document.createElement("h3");
    title.className = "sighting__title";
    title.textContent = `${s.species} · ${s.category}`;

    const meta = document.createElement("div");
    meta.className = "sighting__meta";
    const parts = [
      `${coerceInteger(s.count, 0)} individual(s)`,
      s.location ? `@ ${s.location}` : null,
      s.date ? formatDate(s.date) : null,
    ].filter(Boolean);
    meta.textContent = parts.join(" · ");

    left.appendChild(title);
    left.appendChild(meta);

    if (s.notes) {
      const notes = document.createElement("div");
      notes.className = "sighting__notes";
      notes.textContent = s.notes;
      left.appendChild(notes);
    }

    if (s.photoUrl) {
      const img = document.createElement("img");
      img.src = s.photoUrl;
      img.alt = `${s.species} photo`;
      img.className = "sighting__thumb";
      right.appendChild(img);
    }

    const editBtn = button("Edit");
    editBtn.addEventListener("click", () => startEditSighting(s.id));
    const delBtn = button("Delete", "button button--danger");
    delBtn.addEventListener("click", () => deleteSighting(s.id));

    right.appendChild(editBtn);
    right.appendChild(delBtn);

    wrap.appendChild(left);
    wrap.appendChild(right);
    return wrap;
  }

  function button(text, className = "button button--secondary") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.className = className;
    return btn;
  }

  /**
   * Form handling
   */
  function collectFormData() {
    const data = {
      species: $("#species").value.trim(),
      category: $("#category").value,
      count: coerceInteger($("#count").value, 1),
      date: $("#date").value,
      location: $("#location").value.trim(),
      photoUrl: $("#photoUrl").value.trim(),
      notes: $("#notes").value.trim(),
    };
    return data;
  }

  function saveDraft() {
    const data = collectFormData();
    sessionStorage.setItem("unsaved_sighting", JSON.stringify(data));
  }

  function loadDraft() {
    const raw = sessionStorage.getItem("unsaved_sighting");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (!data) return;
      $("#species").value = data.species || "";
      $("#category").value = data.category || "";
      $("#count").value = String(coerceInteger(data.count, 1));
      $("#date").value = data.date || "";
      $("#location").value = data.location || "";
      $("#photoUrl").value = data.photoUrl || "";
      $("#notes").value = data.notes || "";
    } catch {
      sessionStorage.removeItem("unsaved_sighting");
    }
  }

  function resetForm() {
    $("#sightingForm").reset();
    $("#editId").value = "";
    sessionStorage.removeItem("unsaved_sighting");
  }

  function startEditSighting(id) {
    const s = sightings.find(x => x.id === id);
    if (!s) return;
    $("#species").value = s.species;
    $("#category").value = s.category;
    $("#count").value = String(coerceInteger(s.count, 1));
    $("#date").value = s.date || "";
    $("#location").value = s.location || "";
    $("#photoUrl").value = s.photoUrl || "";
    $("#notes").value = s.notes || "";
    $("#editId").value = s.id;
    window.location.hash = "#contribute";
    window.scrollTo(0, 0);
  }

  async function deleteSighting(id) {
    const s = sightings.find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Delete "${s.species}" sighting?`)) return;
    try {
      await api(`/api/contributions/${id}`, { method: 'DELETE' });
      sightings = sightings.filter(x => x.id !== id);
      saveSightings(sightings);
      renderAll();
    } catch (err) {
      alert(err.message || 'Failed to delete sighting.');
    }
  }

  async function onFormSubmit(e) {
    e.preventDefault();
    const payload = collectFormData();

    if (!payload.species || !payload.category || !payload.date) {
      alert("Please fill in species, category, and date.");
      return;
    }

    const editId = $("#editId").value;
    
    try {
      if (editId) {
        // Update existing sighting
        await api(`/api/contributions/${editId}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: `${payload.species} - ${payload.category}`,
            content: JSON.stringify(payload)
          })
        });
        sightings = sightings.map(s => s.id === editId ? { ...s, ...payload } : s);
      } else {
        // Create new sighting
        const response = await api('/api/contributions', {
          method: 'POST',
          body: JSON.stringify({
            title: `${payload.species} - ${payload.category}`,
            content: JSON.stringify(payload)
          })
        });
        const newSighting = { id: response.contribution.id, ...payload };
        sightings = [newSighting, ...sightings];
      }

      saveSightings(sightings);
      resetForm();
      renderAll();
    } catch (err) {
      alert(err.message || 'Failed to save sighting.');
    }
  }

  /**
   * Import/Export/Reset
   */
  function exportJson() {
    const blob = new Blob([JSON.stringify(sightings, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "biodiversity_sightings.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data)) throw new Error("Invalid JSON format (expected an array)");
        // Ensure minimal shape
        const normalized = data.map(x => ({
          id: x.id || uid(),
          species: String(x.species || "").trim(),
          category: String(x.category || "Other").trim() || "Other",
          count: coerceInteger(x.count, 1),
          date: String(x.date || "").slice(0,10),
          location: String(x.location || "").trim(),
          photoUrl: String(x.photoUrl || "").trim(),
          notes: String(x.notes || "").trim(),
        }));
        sightings = normalized.filter(x => x.species && x.category && x.date);
        saveSightings(sightings);
        renderAll();
      } catch (err) {
        alert("Failed to import JSON: " + (err && err.message ? err.message : String(err)));
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (!confirm("This will delete all local data. Continue?")) return;
    sightings = [];
    saveSightings(sightings);
    renderAll();
  }

  /**
   * Orchestration
   */
  function renderAll() {
    renderStats();
    renderCategoryChart();
    renderSightingsList();
  }

  function onResizeRedrawChart() { renderCategoryChart(); }

  // Auth client
  async function api(path, options = {}) {
    const res = await fetch(path, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
    return data;
  }

  async function refreshAuthState() {
    const state = await api('/api/me').catch(() => ({ user: null }));
    const el = document.getElementById('authState');
    const logoutBtn = document.getElementById('logoutBtn');
    const isAuthed = !!state.user;

    if (el) {
      el.textContent = state.user ? `Logged in as ${state.user.name || state.user.email}` : 'You are not logged in.';
    }
    if (logoutBtn) {
      logoutBtn.hidden = !isAuthed;
    }

    const navAdmin = document.querySelector('a[href="#admin"]');
    if (navAdmin) {
      navAdmin.hidden = !(state.user && state.user.is_admin);
    }



    // Gate contribute and analysis content for non-auth users
    const mustLoginMsg = 'Please login to access this section.';
    const contribSection = document.querySelector('[data-route="contribute"]');
    const analysisSection = document.querySelector('[data-route="analysis"]');
    if (contribSection) contribSection.querySelectorAll('form, .import-export, .list-header, #sightingsList').forEach(el => el.toggleAttribute('aria-disabled', !isAuthed));
    if (analysisSection) analysisSection.querySelectorAll('.stats-grid, .chart-card').forEach(el => el.toggleAttribute('aria-disabled', !isAuthed));
    // Show simple overlays if not authed
    function ensureBanner(section, id) {
      if (!section) return;
      let banner = section.querySelector(`#${id}`);
      if (!isAuthed) {
        if (!banner) {
          banner = document.createElement('div');
          banner.id = id;
          banner.className = 'card';
          banner.style.marginTop = '12px';
          banner.textContent = mustLoginMsg;
          section.querySelector('.container')?.prepend(banner);
        }
      } else if (banner) {
        banner.remove();
      }
    }
    ensureBanner(contribSection, 'contribLoginBanner');
    ensureBanner(analysisSection, 'analysisLoginBanner');
    return isAuthed;
  }

  async function loadContributions() {
    try {
      const data = await api('/api/contributions');
      sightings = data.contributions.map(c => {
        try {
          const content = JSON.parse(c.content);
          return { ...c, ...content };
        } catch {
          return c;
        }
      });
      saveSightings(sightings);
    } catch (err) {
      console.error('Failed to load contributions from API, using local data instead.', err);
      // If API fails, we proceed with local data. The sightings array is already populated.
    }
    renderAll(); // Always render, even if there are no sightings
  }

  function showAuthTab(tabId) {
    $$('.tab-panel').forEach(panel => {
      panel.hidden = panel.dataset.tab !== tabId;
    });
    $$('.tab-link').forEach(link => {
      if (link.dataset.tab === tabId) {
        link.setAttribute('aria-selected', 'true');
      } else {
        link.removeAttribute('aria-selected');
      }
    });
  }

  function init() {
    loadContributions();
    // Default date to today on first load
    if (!$("#date").value) {
      $("#date").value = new Date().toISOString().slice(0,10);
    }

    loadDraft();

    // Event listeners
    $("#sightingForm").addEventListener("submit", onFormSubmit);
    $("#sightingForm").addEventListener("input", saveDraft);
    $("#resetFormBtn").addEventListener("click", resetForm);
    $("#autoLocationBtn").addEventListener("click", getAutoLocation);
    $("#exportBtn").addEventListener("click", exportJson);
    $("#importFile").addEventListener("change", e => {
      const file = e.target.files && e.target.files[0];
      if (file) importJsonFile(file);
      e.target.value = ""; // allow re-selecting same file
    });
    $("#seedBtn").addEventListener("click", () => { sightings = seedSampleData(); renderAll(); });
    $("#clearBtn").addEventListener("click", clearAllData);

    $("#searchInput").addEventListener("input", renderSightingsList);
    $("#filterCategory").addEventListener("change", renderSightingsList);

    $("#chartModeToggle").addEventListener("change", e => {
      chartModeIndividuals = e.target.checked;
      renderStats();
      renderCategoryChart();
    });

    const addSightingBtn = document.querySelector('a.button[href="#contribute"]');
    if (addSightingBtn) {
      addSightingBtn.addEventListener('click', async (e) => {
        e.preventDefault(); // Prevent default navigation
        const isAuthed = await refreshAuthState(); // Check auth status
        if (isAuthed) {
          location.hash = '#contribute'; // Go to contribute page
        } else {
          location.hash = '#auth'; // Go to login page
          showAuthTab('login'); // Ensure login tab is shown
        }
      });
    }

    const viewAnalysisBtn = document.querySelector('a.button[href="#analysis"]');
    if (viewAnalysisBtn) {
      viewAnalysisBtn.addEventListener('click', async (e) => {
        e.preventDefault(); // Prevent default navigation
        const isAuthed = await refreshAuthState(); // Check auth status
        if (isAuthed) {
          location.hash = '#analysis'; // Go to analysis page
        } else {
          location.hash = '#auth'; // Go to login page
          showAuthTab('login'); // Ensure login tab is shown
        }
      });
    }
    const chartTypeSelect = document.getElementById('chartTypeSelect');
    if (chartTypeSelect) {
      chartTypeSelect.addEventListener('change', () => renderCategoryChart());
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try { await api('/api/logout', { method: 'POST' }); } catch {}
        await refreshAuthState();
        location.hash = '#home';
      });
    }

    // Auth form tabs
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    if (tabLogin) tabLogin.addEventListener('click', () => showAuthTab('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => showAuthTab('register'));

    // Login form submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.loginEmail.value;
        const password = loginForm.loginPassword.value;
        try {
          await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          await refreshAuthState();
          location.hash = '#contribute';
        } catch (err) {
          alert(err.data?.error || err.message || 'Login failed');
        }
      });
    }

    // Register form submission
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = registerForm.regName.value;
        const email = registerForm.regEmail.value;
        const password = registerForm.regPassword.value;
        try {
          await api('/api/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
          });
          alert('Registration successful! Please log in.');
          showAuthTab('login');
          registerForm.reset();
        } catch (err) {
          alert(err.data?.error || err.message || 'Registration failed');
        }
      });
    }

    // Chat UI
    const chatFab = document.getElementById('chatFab');
    const chatPanel = document.getElementById('chatPanel');
    const chatCloseBtn = document.getElementById('chatCloseBtn');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatBody = document.getElementById('chatBody');

    function appendMsg(role, text) {
      const div = document.createElement('div');
      div.className = `chat-msg ${role}`;
      div.textContent = text;
      chatBody.appendChild(div);
      chatBody.scrollTop = chatBody.scrollHeight;
    }
    function toggleChat(open) {
      chatPanel.hidden = !open;
      if (open) setTimeout(() => chatInput?.focus(), 0);
    }
    async function sendChat() {
      const msg = chatInput.value.trim();
      if (!msg) return;
      appendMsg('user', msg);
      chatInput.value = '';
      let placeholder = 'Thinking...';
      const temp = document.createElement('div');
      temp.className = 'chat-msg bot';
      temp.textContent = placeholder;
      chatBody.appendChild(temp);
      chatBody.scrollTop = chatBody.scrollHeight;
      try {
        const res = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
        temp.textContent = res.reply || '(no reply)';
      } catch (err) {
        temp.textContent = err.message || 'Chat service unavailable';
      }
    }
    chatFab?.addEventListener('click', () => toggleChat(chatPanel.hidden));
    chatCloseBtn?.addEventListener('click', () => toggleChat(false));
    chatSendBtn?.addEventListener('click', () => sendChat());
    chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });

    

    // Resize-aware charts
    const canvas = $("#categoryChart");
    const ro = new ResizeObserver(() => onResizeRedrawChart());
    ro.observe(canvas);

    // Simple hash-based router
    function getRouteFromHash() {
      const raw = (location.hash || "#home").slice(1);
      return ["home", "contribute", "analysis", "auth", "admin", "about", "mapping", "education", "trends"].includes(raw) ? raw : "home";
    }
    const routeSections = $$('[data-route]');
    const navLinks = $$('.site-nav a');

    function updateNavActive(route) {
      const onHome = route === 'home';
      navLinks.forEach(a => {
        const target = (a.getAttribute('href') || '').replace('#','');
        if (target === route) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');

        if (target === 'about' || target === 'mapping' || target === 'education' || target === 'trends') {
          a.hidden = !onHome;
        } else if (target === 'home') {
          a.hidden = onHome;
          a.textContent = onHome ? 'Home' : 'Back';
        }
      });
    }

    

    function setRoute(route) {
      routeSections.forEach(sec => { sec.hidden = sec.dataset.route !== route; });
      updateNavActive(route);

      // Render section-specific content when it becomes visible
      if (route === 'analysis') {
        renderStats();
        // Wait a frame to ensure layout after visibility change
        requestAnimationFrame(renderCategoryChart);
      } else if (route === 'contribute') {
        renderSightingsList();
      } else if (route === 'auth') {
        refreshAuthState();
      } else if (route === 'admin') {
        refreshAuthState();
        renderAdmin();
      } else if (route === 'mapping') {
        initMap();
      } else if (route === 'education') {
        console.log("Render education resources");
      } else if (route === 'trends') {
        console.log("Render trend analysis");
      }
      // Scroll to top on route change
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.addEventListener('hashchange', () => setRoute(getRouteFromHash()));

    // Initial paint
    refreshAuthState().then(isAuthed => {
      const initialRoute = getRouteFromHash();
      if (isAuthed && initialRoute === 'auth') {
        location.hash = '#contribute'; // Redirect to contribute page
        setRoute('contribute'); // Set the route directly to avoid re-evaluating hash
      } else {
        setRoute(initialRoute);
      }
    });

    // Theme toggle
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = themeToggleBtn?.querySelector('i');
    function applyTheme(theme) {
      document.body.classList.toggle('dark-theme', theme === 'dark');
      if (themeIcon) {
        themeIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
      }
      localStorage.setItem('biodiversity_theme', theme);
    }
    themeToggleBtn?.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark-theme');
      applyTheme(isDark ? 'light' : 'dark');
    });
    const savedTheme = localStorage.getItem('biodiversity_theme') || 'light';
    applyTheme(savedTheme);
    createFallingLeaves();
  }

  // Admin UI
  async function renderAdmin() {
    const guard = document.getElementById('adminGuard');
    const tbody = document.getElementById('usersTbody');
    const refreshBtn = document.getElementById('refreshUsersBtn');
    const refreshIcon = refreshBtn ? refreshBtn.querySelector('i') : null; // Get the icon element

    if (!tbody) return;
    tbody.innerHTML = '';
    let me = await api('/api/me').catch(() => ({ user: null }));
    if (!me.user || !me.user.is_admin) {
      if (guard) guard.textContent = 'Admin-only area. Please login as an admin.';
      return;
    }
    if (guard) guard.textContent = 'You are logged in as admin.';

    // Add animation class when refresh starts
    if (refreshIcon) {
      refreshIcon.classList.add('spin-animation');
    }

    try {
      const data = await api('/api/admin/users').catch(err => ({ users: [], error: err.message }));
      (data.users || []).forEach(u => {
        const tr = document.createElement('tr');
        function td(text) {
          const cell = document.createElement('td');
          cell.style.padding = '8px';
          cell.style.borderBottom = '1px solid var(--border)';
          cell.textContent = text;
          return cell;
        }
        tr.appendChild(td(u.email || ''));
        tr.appendChild(td(u.name || ''));
        tr.appendChild(td(u.is_admin ? 'Yes' : 'No'));
        tr.appendChild(td(u.created_at || ''));
        tr.appendChild(td(u.contribution_count || '0'));
        const actions = document.createElement('td');
        actions.style.padding = '8px';
        actions.style.borderBottom = '1px solid var(--border)';
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'button button--secondary button--icon-only';
        toggleBtn.innerHTML = u.is_admin ? '<i class="fa-solid fa-user-slash" aria-hidden="true"></i>' : '<i class="fa-solid fa-user-plus" aria-hidden="true"></i>';
        toggleBtn.addEventListener('click', async () => {
          try {
            await api(`/api/admin/users/${u.id}/set_admin`, { method: 'POST', body: JSON.stringify({ is_admin: !u.is_admin }) });
            await renderAdmin();
          } catch (err) { alert(err.message || 'Failed to update'); }
        });
        const delBtn = document.createElement('button');
        delBtn.className = 'button button--danger';
        delBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
        delBtn.style.marginLeft = '8px';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this user?')) return;
          try {
            await api(`/api/admin/users/${u.id}/delete`, { method: 'POST' });
            await renderAdmin();
          } catch (err) { alert(err.message || 'Failed to delete'); }
        });
        actions.appendChild(toggleBtn);
        actions.appendChild(delBtn);
        tr.appendChild(actions);
        tbody.appendChild(tr);
      });
    } finally {
      // Remove animation class when refresh finishes (even if there's an error)
      if (refreshIcon) {
        refreshIcon.classList.remove('spin-animation');
      }
    }

    if (refreshBtn) {
      refreshBtn.onclick = () => renderAdmin();
    }

    const addUserBtn = document.getElementById('addUserBtn');
    const addUserFormWrap = document.getElementById('addUserFormWrap');
    const addUserForm = document.getElementById('addUserForm');
    const cancelAddUserBtn = document.getElementById('cancelAddUserBtn');
    const addUserName = document.getElementById('addUserName');
    const addUserEmail = document.getElementById('addUserEmail');
    const addUserPassword = document.getElementById('addUserPassword');
    const addUserIsAdmin = document.getElementById('addUserIsAdmin');

    if (addUserBtn) {
      addUserBtn.onclick = () => {
        if (addUserFormWrap) addUserFormWrap.hidden = false;
        if (addUserForm) addUserForm.reset();
      };
    }

    if (cancelAddUserBtn) {
      cancelAddUserBtn.onclick = () => {
        if (addUserFormWrap) addUserFormWrap.hidden = true;
        if (addUserForm) addUserForm.reset();
      };
    }

    if (addUserForm) {
      addUserForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = addUserName ? addUserName.value.trim() : '';
        const email = addUserEmail ? addUserEmail.value.trim() : '';
        const password = addUserPassword ? addUserPassword.value : '';
        const is_admin = addUserIsAdmin ? addUserIsAdmin.checked : false;

        if (!email || !password) {
          alert('Email and password are required.');
          return;
        }

        try {
          await api('/api/admin/users', { 
            method: 'POST',
            body: JSON.stringify({ name, email, password, is_admin }),
          });
          alert('User added successfully!');
          if (addUserFormWrap) addUserFormWrap.hidden = true;
          if (addUserForm) addUserForm.reset();
          await renderAdmin(); // Refresh the user list
        } catch (err) {
          alert(err.message || 'Failed to add user.');
        }
      };
    }
  }

      // Scroll-based header styling
    const siteHeader = $(".site-header");
    function handleScroll() {
      if (window.scrollY > 50) {
        siteHeader.classList.add("site-header--scrolled");
      } else {
        siteHeader.classList.remove("site-header--scrolled");
      }
    }
    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Initial check

      // Kickoff
  function createFallingLeaves() {
    const container = document.getElementById('leaf-container');
    if (!container) return;
    const numberOfLeaves = 15;
    for (let i = 0; i < numberOfLeaves; i++) {
      const leaf = document.createElement('i');
      leaf.className = 'fa-solid fa-leaf leaf';
      leaf.style.left = `${Math.random() * 100}vw`;
      leaf.style.animationDuration = `${Math.random() * 5 + 5}s`;
      leaf.style.animationDelay = `${Math.random() * 5}s`;
      leaf.style.fontSize = `${Math.random() * 10 + 10}px`;
      container.appendChild(leaf);
    }
  }

  let map;
  async function initMap() {
    if (map) {
      map.remove();
    }
    map = L.map('map').setView([20, 0], 2);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    }).addTo(map);

    const loadingText = document.getElementById("loading");
    const gbifApi = "https://api.gbif.org/v1/occurrence/search?limit=50&hasCoordinate=true";

    try {
      const response = await fetch(gbifApi);
      const data = await response.json();
      const species = data.results;

      if (!species.length) {
        if (loadingText) loadingText.innerHTML = "No data found from GBIF.";
        return;
      }

      species.forEach((sp) => {
        if (sp.decimalLatitude && sp.decimalLongitude) {
          const lat = sp.decimalLatitude;
          const lng = sp.decimalLongitude;
          const name = sp.species || sp.scientificName || "Unknown species";
          const kingdom = sp.kingdom || "Unknown";
          const family = sp.family || "Unknown";
          const country = sp.country || "Unknown";

          const popupContent = `
            <div class="info-box">
              <strong>${name}</strong><br>
              <b>Kingdom:</b> ${kingdom}<br>
              <b>Family:</b> ${family}<br>
              <b>Country:</b> ${country}<br>
              <small>Source: GBIF</small>
            </div>
          `;

          const marker = L.circleMarker([lat, lng], {
            radius: 6,
            color: "#2b5d34",
            fillColor: "#4caf50",
            fillOpacity: 0.8,
          }).addTo(map);

          marker.bindPopup(popupContent);
        }
      });

      if (loadingText) loadingText.innerHTML = `Loaded ${species.length} live species points from GBIF.`;

    } catch (error) {
      console.error("Error fetching GBIF data:", error);
      if (loadingText) loadingText.innerHTML = "Failed to load data from GBIF.";
    }
  }

  /**
   * Auto Location
   */
  function getAutoLocation() {
    const locationInput = $("#location");
    const autoBtn = $("#autoLocationBtn");
    
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }

    autoBtn.textContent = "Getting...";
    autoBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        locationInput.value = `${lat},${lng}`;
        autoBtn.textContent = "Auto";
        autoBtn.disabled = false;
      },
      (error) => {
        alert("Unable to get location: " + error.message);
        autoBtn.textContent = "Auto";
        autoBtn.disabled = false;
      }
    );
  }

  /**
   * Password Toggle
   */
  function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
      input.type = 'text';
      button.textContent = '🙈';
    } else {
      input.type = 'password';
      button.textContent = '👁️';
    }
  }

  // Make togglePassword globally available
  window.togglePassword = togglePassword;

  document.addEventListener("DOMContentLoaded", init);
})();

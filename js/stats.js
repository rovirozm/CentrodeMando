/* ================================================================
   STATS — Estadísticas y gráficas con canvas (sin librerías).
   Soporta gráfica de barras, donut y métricas.
   ================================================================ */

const Stats = (() => {

  // Lee color computado del tema actual
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderAll(container) {
    const data = compute();
    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Completadas hoy</div>
          <div class="stat-value">${data.doneToday}</div>
          <div class="stat-sub">de ${data.totalToday} programadas</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Racha actual</div>
          <div class="stat-value">${data.streak}🔥</div>
          <div class="stat-sub">Mejor: ${data.bestStreak} días</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pomodoros hoy</div>
          <div class="stat-value">${data.pomsToday}🍅</div>
          <div class="stat-sub">${data.pomsWeek} esta semana</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Promedio diario</div>
          <div class="stat-value">${data.avgPerDay.toFixed(1)}</div>
          <div class="stat-sub">tareas/día (30 días)</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Tiempo trabajado hoy</div>
          <div class="stat-value">${formatMinutes(data.timeTodayMin)}</div>
          <div class="stat-sub">${formatMinutes(data.timeWeekMin)} esta semana</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Precisión estimando</div>
          <div class="stat-value">${data.estimateAccuracy != null ? data.estimateAccuracy + '%' : '—'}</div>
          <div class="stat-sub">Estimado vs real</div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Tareas completadas — últimos 14 días</div>
        <div class="chart-canvas-wrap">
          <canvas id="chart-bars" height="220"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Tiempo trabajado por etiqueta</div>
        <div class="chart-canvas-wrap" style="display:flex; align-items:center; justify-content:center;">
          <canvas id="chart-donut" width="280" height="220"></canvas>
        </div>
        <div id="donut-legend" class="chart-legend"></div>
      </div>
    `;

    // Esperar al layout para tener anchos correctos
    requestAnimationFrame(() => {
      drawBars(document.getElementById('chart-bars'), data.last14);
      drawDonut(document.getElementById('chart-donut'),
                document.getElementById('donut-legend'),
                data.timeByTag);
    });
  }

  function compute() {
    const tasks = Tasks.all();
    const stats = Storage.getStats();
    const today = Tasks.todayKey();

    const doneToday = stats.daily[today]?.done || 0;
    const totalToday = tasks.filter(t => {
      if (!t.due) return false;
      return Tasks.dateKey(new Date(t.due)) === today;
    }).length;

    const pomsToday = stats.daily[today]?.poms || 0;
    const timeTodaySec = stats.daily[today]?.timeSec || 0;

    // Semana actual (lunes a domingo)
    const weekKeys = lastNDays(7);
    const pomsWeek = weekKeys.reduce((s, k) => s + (stats.daily[k]?.poms || 0), 0);
    const timeWeekSec = weekKeys.reduce((s, k) => s + (stats.daily[k]?.timeSec || 0), 0);

    // 30 días promedio
    const monthKeys = lastNDays(30);
    const monthDone = monthKeys.reduce((s, k) => s + (stats.daily[k]?.done || 0), 0);
    const avgPerDay = monthDone / 30;

    // Últimos 14 días para gráfica
    const last14 = lastNDays(14).map(k => ({
      label: shortLabel(k),
      key: k,
      value: stats.daily[k]?.done || 0
    }));

    // Tiempo por etiqueta (de timeSpentSec en tareas)
    const tagMap = {};
    for (const t of tasks) {
      const sec = t.timeSpentSec || 0;
      if (!sec) continue;
      const tagName = (t.tag || 'sin etiqueta').toLowerCase();
      tagMap[tagName] = (tagMap[tagName] || 0) + sec;
    }
    const timeByTag = Object.entries(tagMap)
      .map(([name, sec]) => ({ name, sec }))
      .sort((a, b) => b.sec - a.sec);

    // Precisión estimando
    const completedWithEst = tasks.filter(t => t.completed && t.estimateMin && t.timeSpentSec);
    let estimateAccuracy = null;
    if (completedWithEst.length > 0) {
      const ratios = completedWithEst.map(t => {
        const real = t.timeSpentSec / 60;
        return Math.min(real, t.estimateMin) / Math.max(real, t.estimateMin);
      });
      const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      estimateAccuracy = Math.round(avg * 100);
    }

    return {
      doneToday, totalToday,
      streak: stats.streak || 0,
      bestStreak: stats.bestStreak || 0,
      pomsToday, pomsWeek,
      avgPerDay,
      timeTodayMin: Math.round(timeTodaySec / 60),
      timeWeekMin: Math.round(timeWeekSec / 60),
      last14,
      timeByTag,
      estimateAccuracy
    };
  }

  function lastNDays(n) {
    const keys = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      keys.push(Tasks.dateKey(d));
    }
    return keys;
  }

  function shortLabel(key) {
    // key: YYYY-MM-DD → "DD/MM" o nombre día
    const [_, m, d] = key.split('-');
    return `${d}/${m}`;
  }

  function formatMinutes(min) {
    if (!min || min < 1) return '0 min';
    const h = Math.floor(min / 60);
    const r = min % 60;
    if (h > 0) return `${h}h ${r}m`;
    return `${r} min`;
  }

  // ---------- Gráfica de barras ----------
  function drawBars(canvas, data) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = parseInt(canvas.getAttribute('height') || '220', 10);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padX = 24, padBottom = 32, padTop = 16;
    const chartW = w - padX * 2;
    const chartH = h - padBottom - padTop;
    const max = Math.max(2, ...data.map(d => d.value));

    const accent = cssVar('--accent') || '#6366f1';
    const accent2 = cssVar('--accent-2') || '#8b5cf6';
    const text2 = cssVar('--text-2') || '#aaa';
    const border = cssVar('--panel-border') || 'rgba(255,255,255,0.1)';

    // Ejes y grid
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    const steps = 4;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = text2;
    ctx.textAlign = 'right';
    for (let i = 0; i <= steps; i++) {
      const y = padTop + chartH - (chartH * i / steps);
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(w - padX, y);
      ctx.stroke();
      const val = Math.round(max * i / steps);
      ctx.fillText(String(val), padX - 6, y + 3);
    }

    const barGap = 6;
    const barW = Math.max(8, chartW / data.length - barGap);

    data.forEach((d, i) => {
      const x = padX + i * (barW + barGap) + barGap / 2;
      const ratio = d.value / max;
      const barH = ratio * chartH;
      const y = padTop + chartH - barH;

      // Gradiente
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, accent2);
      grad.addColorStop(1, accent);
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW, barH, Math.min(6, barW / 2));
      ctx.fill();

      // Etiqueta X
      ctx.fillStyle = text2;
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + barW / 2, h - 10);

      // Valor encima
      if (d.value > 0) {
        ctx.fillStyle = cssVar('--text-0') || '#fff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(String(d.value), x + barW / 2, y - 4);
        ctx.font = '11px Inter, sans-serif';
      }
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h < r) r = Math.max(0, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---------- Gráfica de donut ----------
  function drawDonut(canvas, legendEl, data) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    if (!data || data.length === 0) {
      ctx.fillStyle = cssVar('--text-2');
      ctx.textAlign = 'center';
      ctx.font = '13px Inter';
      ctx.fillText('Aún no hay tiempo registrado', size / 2, size / 2);
      legendEl.innerHTML = '';
      return;
    }

    const total = data.reduce((s, d) => s + d.sec, 0);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;
    const inner = r * 0.62;

    const palette = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#38bdf8', '#ec4899', '#a3e635'];
    let start = -Math.PI / 2;
    data.forEach((d, i) => {
      const angle = (d.sec / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
      start += angle;
    });

    // Círculo central (donut)
    ctx.fillStyle = cssVar('--bg-1') || '#111';
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fill();

    // Texto central
    ctx.fillStyle = cssVar('--text-0') || '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Inter';
    ctx.fillText(formatHours(total), cx, cy - 2);
    ctx.fillStyle = cssVar('--text-2') || '#aaa';
    ctx.font = '11px Inter';
    ctx.fillText('total', cx, cy + 16);

    // Leyenda
    if (legendEl) {
      legendEl.innerHTML = data.map((d, i) => {
        const pct = ((d.sec / total) * 100).toFixed(0);
        const c = palette[i % palette.length];
        return `<div><span class="legend-dot" style="background:${c}"></span>${escapeHtml(d.name)} · ${formatHours(d.sec)} (${pct}%)</div>`;
      }).join('');
    }
  }

  function formatHours(sec) {
    const total = Math.round(sec / 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  return { renderAll, compute };
})();

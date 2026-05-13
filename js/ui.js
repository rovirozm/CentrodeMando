/* ================================================================
   UI — Renderizado, eventos, modales, calendario, drag&drop.
   Punto único donde el DOM se actualiza.
   ================================================================ */

const UI = (() => {
  // ---------- Estado de UI ----------
  let currentView = 'today';
  let filters = {
    search: '',
    priorities: [],
    tags: [],
    quick: null,
    dateFrom: null,
    dateTo: null
  };
  let calMonth = { year: new Date().getFullYear(), month: new Date().getMonth() };
  let editingTaskId = null;
  let toastTimer = null;
  let voiceTimer = null;
  let selectedTaskId = null; // para atajos de teclado (1/2/3/4, espacio)

  const VIEW_TITLES = {
    today: '📅 Hoy',
    week: '🗓️ Semana',
    all: '📋 Todas',
    calendar: '📆 Calendario',
    done: '✅ Completadas',
    stats: '📊 Estadísticas'
  };

  const QUOTES = [
    'La acción es la clave fundamental de todo éxito. — Picasso',
    'Las grandes cosas no se hacen por impulso, sino por una serie de pequeñas cosas. — Van Gogh',
    'No cuentes los días, haz que los días cuenten. — Ali',
    'La mejor manera de predecir el futuro es crearlo. — Drucker',
    'Un viaje de mil millas comienza con un solo paso. — Lao Tzu',
    'Hecho es mejor que perfecto.',
    'La constancia vence lo que la dicha no alcanza.',
    'Si quieres resultados distintos, no hagas siempre lo mismo. — Einstein',
    'Empieza donde estás. Usa lo que tienes. Haz lo que puedas. — A. Ashe',
    'La disciplina es el puente entre las metas y los logros.'
  ];

  // ---------- Init ----------

  function init() {
    bindTabs();
    bindHeader();
    bindFilters();
    bindModals();
    bindTaskForm();
    bindTimerUI();
    bindTagsUI();
    bindKeyboardShortcuts();
    bindFocusMode();
    bindDragAndDrop();

    refresh();
  }

  // ---------- Toast / Voice feedback ----------

  function showToast(message, type = '') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast show ' + type;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 300);
    }, 2800);
  }

  function showVoiceFeedback(text) {
    const el = document.getElementById('voice-feedback');
    document.getElementById('voice-text').textContent = text;
    el.classList.remove('hidden');
    clearTimeout(voiceTimer);
    voiceTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }
  function hideVoiceFeedback() {
    document.getElementById('voice-feedback').classList.add('hidden');
  }

  // ---------- Header ----------

  function bindHeader() {
    document.getElementById('btn-new-task').addEventListener('click', () => openTaskModal());
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-help').addEventListener('click', () => openModal('help-modal'));
    document.getElementById('btn-mute').addEventListener('click', toggleMute);
    document.getElementById('btn-voice').addEventListener('click', () => {
      if (!Voice.supported()) {
        showToast('Tu navegador no soporta reconocimiento de voz', 'error');
        return;
      }
      Voice.start();
    });

    const search = document.getElementById('search-input');
    search.addEventListener('input', () => {
      filters.search = search.value;
      refresh();
    });

    document.getElementById('btn-enable-notif').addEventListener('click', async () => {
      const result = await Notifications.ask();
      Storage.setSetting('notifAsked', true);
      document.getElementById('notif-bar').classList.add('hidden');
      if (result === 'granted') showToast('🔔 Notificaciones activadas');
      else showToast('Notificaciones bloqueadas', 'error');
    });
    document.getElementById('btn-dismiss-notif').addEventListener('click', () => {
      Storage.setSetting('notifAsked', true);
      document.getElementById('notif-bar').classList.add('hidden');
    });
    document.getElementById('btn-view-overdue').addEventListener('click', () => {
      filters.quick = 'overdue';
      switchView('all');
      refresh();
    });

    // Export / import
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', importData);
    document.getElementById('btn-clean-old').addEventListener('click', cleanOld);

    // Focus mode
    document.getElementById('btn-focus').addEventListener('click', openFocusMode);
  }

  function exportData() {
    const json = Storage.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0, 10);
    a.download = `centro-de-mando-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('💾 Datos exportados', 'success');
  }

  async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('¿Reemplazar los datos actuales con el archivo importado? Esta acción no se puede deshacer.')) {
      e.target.value = '';
      return;
    }
    const text = await file.text();
    const ok = Storage.importJSON(text);
    e.target.value = '';
    if (ok) {
      showToast('💾 Datos importados', 'success');
      applyTheme();
      refresh();
    } else {
      showToast('Archivo inválido', 'error');
    }
  }

  function cleanOld() {
    const ans = prompt('Eliminar tareas completadas anteriores a cuántos días?', '30');
    const n = parseInt(ans, 10);
    if (!ans || isNaN(n) || n <= 0) return;
    const removed = Storage.cleanCompletedOlderThan(n);
    showToast(`🧹 ${removed} tareas eliminadas`);
    refresh();
  }

  function toggleTheme() {
    const settings = Storage.getSettings();
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    Storage.setSetting('theme', next);
    applyTheme();
    Audio.click();
  }

  function applyTheme() {
    const theme = Storage.getSettings().theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('btn-theme').textContent = theme === 'dark' ? '🌙' : '☀️';
    // Si estamos en stats, redibujar gráficas para tomar colores nuevos
    if (currentView === 'stats') renderView();
  }

  function toggleMute() {
    const s = Storage.getSettings();
    const muted = !s.muted;
    Storage.setSetting('muted', muted);
    Audio.setMuted(muted);
    document.getElementById('btn-mute').textContent = muted ? '🔇' : '🔊';
    showToast(muted ? '🔇 Sonidos silenciados' : '🔊 Sonidos activados');
  }

  // ---------- Tabs ----------

  function bindTabs() {
    document.querySelectorAll('#tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => switchView(tab.dataset.view));
    });
  }

  function switchView(view) {
    if (currentView === view) return;
    currentView = view;
    document.querySelectorAll('#tabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === view);
    });
    Audio.click();
    refresh();
  }

  // ---------- Filtros ----------

  function bindFilters() {
    document.querySelectorAll('.quick-filters .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const value = chip.dataset.quick;
        filters.quick = filters.quick === value ? null : value;
        document.querySelectorAll('.quick-filters .chip').forEach(c => {
          c.classList.toggle('active', c.dataset.quick === filters.quick);
        });
        refresh();
      });
    });
    document.querySelectorAll('.f-prio').forEach(cb => {
      cb.addEventListener('change', () => {
        filters.priorities = Array.from(document.querySelectorAll('.f-prio:checked')).map(c => c.value);
        refresh();
      });
    });
    document.getElementById('btn-manage-tags').addEventListener('click', () => {
      renderTagEditor();
      openModal('tags-modal');
    });
  }

  function renderTagFilter() {
    const wrap = document.getElementById('tag-list');
    const tags = Storage.getTags();
    wrap.innerHTML = tags.map(t => `
      <span class="tag-pill ${filters.tags.includes(t.name.toLowerCase()) ? '' : 'dim'}"
            style="background:${t.color}" data-tag="${escapeAttr(t.name.toLowerCase())}">
        ${escapeHtml(t.name)}
      </span>
    `).join('');
    wrap.querySelectorAll('.tag-pill').forEach(el => {
      el.addEventListener('click', () => {
        const tag = el.dataset.tag;
        if (filters.tags.includes(tag)) filters.tags = filters.tags.filter(x => x !== tag);
        else filters.tags = [...filters.tags, tag];
        renderTagFilter();
        refresh();
      });
    });
    // Datalist en formulario
    const dl = document.getElementById('tag-options');
    dl.innerHTML = tags.map(t => `<option value="${escapeAttr(t.name)}">`).join('');
  }

  // ---------- Modales ----------

  function bindModals() {
    document.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => closeModal(b.dataset.close));
    });
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal.id);
      });
    });
  }

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }
  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }
  function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  }

  // ---------- Formulario de tarea ----------

  function bindTaskForm() {
    document.getElementById('task-form').addEventListener('submit', onSaveTask);
    document.getElementById('btn-delete-task').addEventListener('click', onDeleteTask);
    document.getElementById('task-recurrence').addEventListener('change', updateRecurrenceExtras);
    document.getElementById('add-subtask').addEventListener('click', () => addSubtaskRow('', false));
  }

  function openTaskModal(taskId = null) {
    editingTaskId = taskId;
    const t = taskId ? Storage.getTask(taskId) : null;
    document.getElementById('task-modal-title').textContent = t ? 'Editar tarea' : 'Nueva tarea';
    document.getElementById('task-id').value = t?.id || '';
    document.getElementById('task-title').value = t?.title || '';
    document.getElementById('task-priority').value = t?.priority || 'med';
    document.getElementById('task-tag').value = t?.tag || '';
    document.getElementById('task-due').value = t?.due ? toLocalDatetime(t.due) : '';
    document.getElementById('task-remind').value = t?.remind || '';
    document.getElementById('task-est').value = t?.estimateMin || '';
    document.getElementById('task-url').value = t?.url || '';
    document.getElementById('task-notes').value = t?.notes || '';
    document.getElementById('task-recurrence').value = t?.recurrence?.type || '';

    // Recurrencia extra
    document.querySelectorAll('#rec-week input[type="checkbox"]').forEach(cb => {
      cb.checked = !!(t?.recurrence?.weekdays || []).map(String).includes(cb.value);
    });
    document.getElementById('rec-days-n').value = t?.recurrence?.everyN || 2;
    updateRecurrenceExtras();

    // Subtareas
    const list = document.getElementById('subtasks-list');
    list.innerHTML = '';
    (t?.subtasks || []).forEach(s => addSubtaskRow(s.text, s.done, s.id));

    document.getElementById('btn-delete-task').classList.toggle('hidden', !t);
    openModal('task-modal');
    setTimeout(() => document.getElementById('task-title').focus(), 50);
  }

  function updateRecurrenceExtras() {
    const v = document.getElementById('task-recurrence').value;
    const extra = document.getElementById('rec-extra');
    const week = document.getElementById('rec-week');
    const days = document.getElementById('rec-days');
    const showExtra = v === 'custom-week' || v === 'custom-days';
    extra.classList.toggle('hidden', !showExtra);
    week.classList.toggle('hidden', v !== 'custom-week');
    days.classList.toggle('hidden', v !== 'custom-days');
  }

  function addSubtaskRow(text = '', done = false, id = null) {
    const ul = document.getElementById('subtasks-list');
    const li = document.createElement('li');
    li.className = 'subtask-item';
    li.dataset.id = id || ('new_' + Math.random().toString(36).slice(2, 8));
    li.innerHTML = `
      <input type="checkbox" ${done ? 'checked' : ''} />
      <input type="text" value="${escapeAttr(text)}" placeholder="Subtarea…" class="${done ? 'done' : ''}" />
      <button type="button" class="subtask-del" aria-label="Eliminar">✕</button>
    `;
    const cb = li.querySelector('input[type="checkbox"]');
    const tx = li.querySelector('input[type="text"]');
    cb.addEventListener('change', () => tx.classList.toggle('done', cb.checked));
    li.querySelector('.subtask-del').addEventListener('click', () => li.remove());
    ul.appendChild(li);
    if (!text) tx.focus();
  }

  function gatherSubtasks() {
    return Array.from(document.querySelectorAll('#subtasks-list .subtask-item')).map(li => {
      const text = li.querySelector('input[type="text"]').value.trim();
      const done = li.querySelector('input[type="checkbox"]').checked;
      const id = li.dataset.id.startsWith('new_') ? null : li.dataset.id;
      return text ? { id: id || ('st_' + Math.random().toString(36).slice(2, 9)), text, done } : null;
    }).filter(Boolean);
  }

  function gatherRecurrence() {
    const type = document.getElementById('task-recurrence').value;
    if (!type) return null;
    const rule = { type };
    if (type === 'custom-week') {
      rule.weekdays = Array.from(document.querySelectorAll('#rec-week input:checked')).map(c => c.value);
      if (!rule.weekdays.length) return null;
    }
    if (type === 'custom-days') {
      rule.everyN = parseInt(document.getElementById('rec-days-n').value, 10) || 1;
    }
    return rule;
  }

  function onSaveTask(e) {
    e.preventDefault();
    const id = document.getElementById('task-id').value;
    const title = document.getElementById('task-title').value.trim();
    if (!title) return;

    const dueVal = document.getElementById('task-due').value;
    const due = dueVal ? new Date(dueVal).toISOString() : null;
    const tag = document.getElementById('task-tag').value.trim();
    // Si la etiqueta es nueva, registrarla
    if (tag && !Storage.findTagByName(tag)) {
      const colors = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#38bdf8', '#ec4899'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      Storage.addTag({ id: 't_' + Math.random().toString(36).slice(2, 8), name: tag.toLowerCase(), color });
    }

    const patch = {
      title,
      priority: document.getElementById('task-priority').value,
      tag: tag.toLowerCase(),
      due,
      remind: document.getElementById('task-remind').value,
      estimateMin: parseInt(document.getElementById('task-est').value, 10) || null,
      url: document.getElementById('task-url').value.trim(),
      notes: document.getElementById('task-notes').value.trim(),
      subtasks: gatherSubtasks(),
      recurrence: gatherRecurrence()
    };

    if (id) {
      Tasks.update(id, patch);
      showToast('✓ Tarea actualizada');
    } else {
      Tasks.create(patch);
      showToast('＋ Tarea creada');
      Audio.pop();
    }
    closeModal('task-modal');
    refresh();
  }

  function onDeleteTask() {
    const id = document.getElementById('task-id').value;
    if (!id) return;
    if (!confirm('¿Eliminar esta tarea permanentemente?')) return;
    Tasks.remove(id);
    closeModal('task-modal');
    showToast('🗑 Tarea eliminada');
    refresh();
  }

  function openTask(id) { openTaskModal(id); }

  function toLocalDatetime(iso) {
    // Convierte ISO a "YYYY-MM-DDTHH:MM" en hora local
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ---------- Timer UI ----------

  function bindTimerUI() {
    document.getElementById('t-start').addEventListener('click', () => Timer.start());
    document.getElementById('t-pause').addEventListener('click', () => Timer.pause());
    document.getElementById('t-reset').addEventListener('click', () => Timer.reset());
    document.querySelectorAll('.timer-mode').forEach(b => {
      b.addEventListener('click', () => {
        Timer.setMode(b.dataset.mode);
        document.querySelectorAll('.timer-mode').forEach(x => x.classList.toggle('active', x === b));
      });
    });
    document.getElementById('btn-timer-settings').addEventListener('click', () => {
      const s = Storage.getSettings().pomodoro;
      document.getElementById('pom-work').value  = s.work;
      document.getElementById('pom-break').value = s.breakShort;
      document.getElementById('pom-long').value  = s.breakLong;
      document.getElementById('pom-cycle').value = s.cycle;
      openModal('timer-modal');
    });
    document.getElementById('save-pom').addEventListener('click', () => {
      Storage.setNestedSetting('pomodoro', 'work',       parseInt(document.getElementById('pom-work').value, 10) || 25);
      Storage.setNestedSetting('pomodoro', 'breakShort', parseInt(document.getElementById('pom-break').value, 10) || 5);
      Storage.setNestedSetting('pomodoro', 'breakLong',  parseInt(document.getElementById('pom-long').value, 10) || 15);
      Storage.setNestedSetting('pomodoro', 'cycle',      parseInt(document.getElementById('pom-cycle').value, 10) || 4);
      Timer.setMode(Timer.getState().mode); // reaplicar
      closeModal('timer-modal');
      showToast('⚙ Ajustes guardados');
    });

    Timer.onTick(state => updateTimerDisplay(state));
    Timer.onFinish(() => {
      updatePomCount();
      // Si terminó pomodoro y hay tarea haciendo, parpadeo del foco
      if (document.getElementById('focus-modal') && !document.getElementById('focus-modal').classList.contains('hidden')) {
        // mantener focus mode
      }
    });

    // Inicializa display
    updateTimerDisplay(Timer.getState());
    updatePomCount();
  }

  function updateTimerDisplay({ mode, state, remainingMs }) {
    document.getElementById('timer-display').textContent = Timer.format(remainingMs);
    document.getElementById('focus-timer').textContent = Timer.format(remainingMs);
    document.getElementById('timer-state').textContent =
      mode === 'pomodoro' ? (state === 'running' ? 'Trabajando' : 'Pomodoro')
      : mode === 'break'  ? (state === 'running' ? 'Descansando' : 'Descanso')
      : (state === 'running' ? 'Libre — corriendo' : 'Libre');
    const doing = Tasks.getDoing();
    document.getElementById('timer-task').textContent = doing ? `· ${doing.title}` : '';
  }

  function updatePomCount() {
    document.getElementById('poms-today').textContent = Timer.pomsToday();
  }

  // ---------- Tags manager ----------

  function bindTagsUI() {
    document.getElementById('add-tag-btn').addEventListener('click', () => {
      const name = document.getElementById('new-tag-name').value.trim();
      const color = document.getElementById('new-tag-color').value;
      if (!name) return;
      Storage.addTag({
        id: 't_' + Math.random().toString(36).slice(2, 8),
        name: name.toLowerCase(),
        color
      });
      document.getElementById('new-tag-name').value = '';
      renderTagEditor();
      renderTagFilter();
    });
  }

  function renderTagEditor() {
    const ul = document.getElementById('tag-edit-list');
    const tags = Storage.getTags();
    ul.innerHTML = tags.map(t => `
      <li class="tag-edit-item" data-id="${t.id}">
        <span class="swatch" style="background:${t.color}"></span>
        <span class="tag-name">${escapeHtml(t.name)}</span>
        <button data-action="del" title="Eliminar">🗑</button>
      </li>
    `).join('');
    ul.querySelectorAll('button[data-action="del"]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.closest('li').dataset.id;
        if (confirm('¿Eliminar etiqueta? Las tareas la perderán.')) {
          Storage.removeTag(id);
          renderTagEditor();
          renderTagFilter();
          refresh();
        }
      });
    });
  }

  // ---------- Atajos de teclado ----------

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
      // Ctrl+N
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openTaskModal();
        return;
      }
      // Ctrl+F
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('search-input').focus();
        return;
      }
      // Ctrl+/
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        openModal('help-modal');
        return;
      }
      // Esc
      if (e.key === 'Escape') {
        closeAllModals();
        return;
      }
      if (inField) return;
      // Espacio: completar tarea seleccionada
      if (e.key === ' ' && selectedTaskId) {
        e.preventDefault();
        const t = Storage.getTask(selectedTaskId);
        if (t) toggleComplete(selectedTaskId);
      }
      // 1/2/3/4: prioridad
      if (['1','2','3','4'].includes(e.key) && selectedTaskId) {
        const map = { '1': 'urgent', '2': 'high', '3': 'med', '4': 'low' };
        Tasks.update(selectedTaskId, { priority: map[e.key] });
        refresh();
        showToast(`Prioridad: ${e.key === '1' ? 'urgente' : e.key === '2' ? 'alta' : e.key === '3' ? 'media' : 'baja'}`);
      }
    });
  }

  // ---------- Drag & drop ----------

  let draggedId = null;

  function bindDragAndDrop() {
    document.addEventListener('dragstart', e => {
      const task = e.target.closest('.task');
      if (!task) return;
      draggedId = task.dataset.id;
      task.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragend', () => {
      document.querySelectorAll('.task').forEach(t => t.classList.remove('dragging', 'drop-target'));
      draggedId = null;
    });
    document.addEventListener('dragover', e => {
      const target = e.target.closest('.task');
      if (!target || target.dataset.id === draggedId) return;
      e.preventDefault();
      document.querySelectorAll('.task').forEach(t => t.classList.remove('drop-target'));
      target.classList.add('drop-target');
    });
    document.addEventListener('drop', e => {
      const target = e.target.closest('.task');
      if (!target || !draggedId || target.dataset.id === draggedId) return;
      e.preventDefault();
      const list = Array.from(target.closest('.task-list').querySelectorAll('.task')).map(el => el.dataset.id);
      const fromIdx = list.indexOf(draggedId);
      const toIdx   = list.indexOf(target.dataset.id);
      if (fromIdx < 0 || toIdx < 0) return;
      list.splice(toIdx, 0, list.splice(fromIdx, 1)[0]);
      Tasks.reorder(list);
      refresh();
    });
  }

  // ---------- Focus mode ----------

  function bindFocusMode() {
    document.getElementById('focus-start').addEventListener('click', () => {
      Timer.setMode('pomodoro');
      Timer.start();
    });
    document.getElementById('focus-done').addEventListener('click', () => {
      const doing = Tasks.getDoing();
      if (doing) {
        toggleComplete(doing.id);
      }
      closeModal('focus-modal');
    });
  }

  function openFocusMode() {
    const doing = Tasks.getDoing() || Tasks.today()[0];
    if (!doing) {
      showToast('No hay tarea "haciendo ahora". Marca una primero.', 'error');
      return;
    }
    if (!doing.doing) Tasks.toggleDoing(doing.id);
    document.getElementById('focus-task-title').textContent = doing.title;
    openModal('focus-modal');
    refresh();
  }

  // ---------- Acciones de tarea ----------

  function toggleComplete(id) {
    const t = Storage.getTask(id);
    if (!t) return;
    const willComplete = !t.completed;
    Tasks.setCompleted(id, willComplete);
    if (willComplete) Audio.tick();
    refresh();
  }

  function toggleDoing(id) {
    Tasks.toggleDoing(id);
    refresh();
  }

  // ---------- Renderizado de vistas ----------

  function refresh() {
    // Update title
    document.getElementById('view-title').textContent = VIEW_TITLES[currentView] || '';

    // Update saludo
    updateGreeting();

    // Render filters
    renderTagFilter();

    // Banner de notificaciones
    const settings = Storage.getSettings();
    const supports = Notifications.supported();
    const bar = document.getElementById('notif-bar');
    if (supports && Notifications.permission() === 'default' && !settings.notifAsked) {
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }

    // Banner de vencidas
    const overdue = Tasks.overdue();
    const ob = document.getElementById('overdue-banner');
    if (overdue.length > 0 && currentView !== 'done' && currentView !== 'stats') {
      ob.classList.remove('hidden');
      document.getElementById('overdue-text').textContent =
        `⚠ Tienes ${overdue.length} tarea${overdue.length === 1 ? '' : 's'} vencida${overdue.length === 1 ? '' : 's'}`;
    } else {
      ob.classList.add('hidden');
    }

    renderView();
    updateTimerDisplay(Timer.getState());
    updatePomCount();
  }

  function renderView() {
    const container = document.getElementById('view-container');
    const countEl = document.getElementById('view-count');
    let count = 0;

    switch (currentView) {
      case 'today':  count = renderToday(container); break;
      case 'week':   count = renderWeek(container); break;
      case 'all':    count = renderAll(container); break;
      case 'calendar': renderCalendar(container); count = ''; break;
      case 'done':   count = renderDone(container); break;
      case 'stats':  Stats.renderAll(container); countEl.textContent = ''; return;
    }
    countEl.textContent = count !== '' ? `${count} ${count === 1 ? 'tarea' : 'tareas'}` : '';
  }

  function applyAllFilters(tasks) {
    return Tasks.sortDefault(Tasks.applyFilters(tasks, filters));
  }

  function renderToday(container) {
    const all = Tasks.all().filter(t => !t.completed);
    const overdueList = applyAllFilters(all.filter(t => t.due && Tasks.isOverdue(t)));
    const todayList   = applyAllFilters(all.filter(t => {
      if (!t.due) return false;
      const k = Tasks.dateKey(new Date(t.due));
      return k === Tasks.todayKey() && !Tasks.isOverdue(t);
    }));
    const noDate = applyAllFilters(all.filter(t => !t.due));

    if (!overdueList.length && !todayList.length && !noDate.length) {
      container.innerHTML = emptyState('🌅', '¡Tu cabina está limpia!', 'Crea una tarea con + Nueva o usa el micrófono.');
      return 0;
    }

    let html = '';
    if (overdueList.length) {
      html += groupBlock('Vencidas', overdueList, 'amber');
    }
    if (todayList.length) {
      html += groupBlock('Para hoy', todayList);
    }
    if (noDate.length) {
      html += groupBlock('Sin fecha', noDate);
    }
    container.innerHTML = html;
    bindTaskCardEvents(container);
    return overdueList.length + todayList.length + noDate.length;
  }

  function renderWeek(container) {
    const days = Tasks.forWeek();
    const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const todayK = Tasks.todayKey();
    container.innerHTML = '<div class="week-grid"></div>';
    const grid = container.firstElementChild;
    let total = 0;
    days.forEach(({ date, tasks }) => {
      const filtered = applyAllFilters(tasks);
      total += filtered.length;
      const k = Tasks.dateKey(date);
      const isToday = k === todayK;
      const card = document.createElement('div');
      card.className = 'day-card' + (isToday ? ' is-today' : '');
      card.innerHTML = `
        <div class="day-card-header">
          <span class="day-name">${dayNames[date.getDay()]} ${isToday ? '· hoy' : ''}</span>
          <span class="day-date">${date.getDate()} ${shortMonth(date.getMonth())}</span>
        </div>
        ${filtered.length ?
          `<div class="task-list">${filtered.map(taskCard).join('')}</div>` :
          `<div style="color:var(--text-3); font-size:13px;">— sin tareas —</div>`}
      `;
      grid.appendChild(card);
    });
    bindTaskCardEvents(container);
    return total;
  }

  function renderAll(container) {
    let tasks = Tasks.all().filter(t => !t.completed);
    tasks = applyAllFilters(tasks);
    if (!tasks.length) {
      container.innerHTML = emptyState('📋', 'Sin tareas en esta vista', 'Ajusta los filtros o crea una nueva.');
      return 0;
    }
    container.innerHTML = `<div class="task-list">${tasks.map(taskCard).join('')}</div>`;
    bindTaskCardEvents(container);
    return tasks.length;
  }

  function renderDone(container) {
    let tasks = Tasks.completed();
    tasks = Tasks.applyFilters(tasks, filters);
    if (!tasks.length) {
      container.innerHTML = emptyState('🏁', 'Aún no has completado nada', 'Las tareas terminadas aparecerán aquí.');
      return 0;
    }
    container.innerHTML = `<div class="task-list">${tasks.map(taskCard).join('')}</div>`;
    bindTaskCardEvents(container);
    return tasks.length;
  }

  function renderCalendar(container) {
    const { year, month } = calMonth;
    const monthName = new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const first = new Date(year, month, 1);
    const startDay = first.getDay(); // 0=domingo
    const lastDay = new Date(year, month + 1, 0).getDate();
    const prevLast = new Date(year, month, 0).getDate();

    const monthTasks = Tasks.forMonth(year, month);
    const todayK = Tasks.todayKey();

    let cells = '';
    // Días del mes anterior (relleno)
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevLast - i;
      cells += `<div class="cal-cell other"><div class="cal-day-num">${day}</div></div>`;
    }
    // Días del mes
    for (let day = 1; day <= lastDay; day++) {
      const date = new Date(year, month, day);
      const k = Tasks.dateKey(date);
      const dayTasks = monthTasks.filter(t => Tasks.dateKey(new Date(t.due)) === k);
      const isToday = k === todayK;
      const dots = dayTasks.slice(0, 4).map(t => `<span class="cal-dot" style="background:${prioColor(t.priority)}"></span>`).join('');
      const more = dayTasks.length > 4 ? `<div class="cal-more">+${dayTasks.length - 4}</div>` : '';
      cells += `
        <div class="cal-cell ${isToday ? 'today' : ''}" data-date="${k}">
          <div class="cal-day-num">${day}</div>
          <div>${dots}</div>
          ${more}
        </div>
      `;
    }
    // Días del mes siguiente para completar grid (filas de 7)
    const totalCells = startDay + lastDay;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= trailing; i++) {
      cells += `<div class="cal-cell other"><div class="cal-day-num">${i}</div></div>`;
    }

    container.innerHTML = `
      <div class="cal-controls">
        <button class="icon-btn" id="cal-prev">◀</button>
        <h3 style="text-transform:capitalize;">${monthName}</h3>
        <button class="icon-btn" id="cal-today">Hoy</button>
        <button class="icon-btn" id="cal-next">▶</button>
      </div>
      <div class="cal-grid">
        <div class="cal-head">Dom</div><div class="cal-head">Lun</div><div class="cal-head">Mar</div>
        <div class="cal-head">Mié</div><div class="cal-head">Jue</div><div class="cal-head">Vie</div><div class="cal-head">Sáb</div>
        ${cells}
      </div>
      <div id="cal-day-tasks" style="margin-top:18px"></div>
    `;
    document.getElementById('cal-prev').addEventListener('click', () => {
      calMonth.month--; if (calMonth.month < 0) { calMonth.month = 11; calMonth.year--; }
      renderView();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      calMonth.month++; if (calMonth.month > 11) { calMonth.month = 0; calMonth.year++; }
      renderView();
    });
    document.getElementById('cal-today').addEventListener('click', () => {
      calMonth.year = new Date().getFullYear();
      calMonth.month = new Date().getMonth();
      renderView();
    });
    container.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        const k = cell.dataset.date;
        const list = Tasks.all().filter(t => t.due && Tasks.dateKey(new Date(t.due)) === k);
        const wrap = document.getElementById('cal-day-tasks');
        if (!list.length) {
          wrap.innerHTML = `<div class="empty-state" style="padding:24px"><div class="title">Sin tareas para ${k}</div></div>`;
          return;
        }
        wrap.innerHTML = `<h3 style="margin:0 0 10px;">Tareas del ${k}</h3><div class="task-list">${list.map(taskCard).join('')}</div>`;
        bindTaskCardEvents(wrap);
      });
    });
  }

  // ---------- Componente: tarjeta de tarea ----------

  function groupBlock(title, tasks, accent = '') {
    return `
      <div class="task-group">
        <h3 class="task-group-title">${escapeHtml(title)}<span class="count">${tasks.length}</span></h3>
        <div class="task-list">
          ${tasks.map(taskCard).join('')}
        </div>
      </div>
    `;
  }

  function taskCard(t) {
    const overdue = Tasks.isOverdue(t);
    const cls = [
      'task',
      `prio-${t.priority || 'low'}`,
      t.completed ? 'done' : '',
      t.doing ? 'doing' : '',
      overdue ? 'overdue' : ''
    ].filter(Boolean).join(' ');

    const tag = t.tag ? Storage.getTags().find(x => x.name.toLowerCase() === t.tag) : null;
    const subDone = (t.subtasks || []).filter(s => s.done).length;
    const subTotal = (t.subtasks || []).length;
    const subBar = subTotal > 0 ? `
      <div class="subtask-progress">
        <div class="subtask-bar"><div style="width:${(subDone / subTotal) * 100}%"></div></div>
        <span class="subtask-progress-text">${subDone}/${subTotal}</span>
      </div>` : '';

    const dueText = t.due ? formatDue(t.due) : '';
    const recText = t.recurrence ? Recurring.describe(t.recurrence) : '';
    const time = t.timeSpentSec > 0 ? formatSec(t.timeSpentSec) : '';

    return `
      <div class="${cls}" data-id="${t.id}" draggable="true" tabindex="0">
        <button class="task-check ${t.completed ? 'checked' : ''}" data-action="toggle" aria-label="Completar"></button>
        <div class="task-body">
          <div class="task-title" data-action="edit">${escapeHtml(t.title)}</div>
          ${t.notes ? `<div class="task-notes-preview">${escapeHtml(t.notes)}</div>` : ''}
          <div class="task-meta">
            ${dueText ? `<span class="meta-pill due ${overdue ? 'overdue' : ''}">📅 ${dueText}</span>` : ''}
            ${tag ? `<span class="meta-pill tag" style="background:${tag.color}">${escapeHtml(tag.name)}</span>` : (t.tag ? `<span class="meta-pill">${escapeHtml(t.tag)}</span>` : '')}
            ${t.estimateMin ? `<span class="meta-pill">⏱ ${t.estimateMin} min</span>` : ''}
            ${time ? `<span class="meta-pill">⏲ ${time}</span>` : ''}
            ${t.url ? `<span class="meta-pill url">🔗 <a href="${escapeAttr(t.url)}" target="_blank" rel="noopener">link</a></span>` : ''}
            ${recText ? `<span class="meta-pill">${recText}</span>` : ''}
            ${t.doing ? `<span class="meta-pill" style="background:var(--accent);color:white">⚡ haciendo</span>` : ''}
          </div>
          ${subBar}
        </div>
        <div class="task-actions">
          <button class="icon-btn" data-action="doing" title="Haciendo ahora">⚡</button>
          <button class="icon-btn" data-action="edit" title="Editar">✎</button>
        </div>
      </div>
    `;
  }

  function bindTaskCardEvents(scope) {
    scope.querySelectorAll('.task').forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) {
          // Selección para atajos de teclado
          selectedTaskId = id;
          scope.querySelectorAll('.task').forEach(c => c.style.outline = '');
          card.style.outline = '2px solid var(--accent)';
          card.style.outlineOffset = '2px';
          return;
        }
        if (action === 'toggle') {
          card.classList.add('completing');
          toggleComplete(id);
        } else if (action === 'edit') {
          openTaskModal(id);
        } else if (action === 'doing') {
          toggleDoing(id);
        }
      });
      card.addEventListener('focus', () => { selectedTaskId = id; });
    });
  }

  // ---------- Saludo ----------

  function updateGreeting() {
    const el = document.getElementById('greeting');
    if (!el) return;
    const hour = new Date().getHours();
    let greet;
    if (hour < 6)      greet = '🌙 Buenas madrugadas';
    else if (hour < 12) greet = '☀️ Buenos días';
    else if (hour < 19) greet = '🌤️ Buenas tardes';
    else                greet = '🌙 Buenas noches';
    const quote = QUOTES[new Date().getDate() % QUOTES.length];
    el.innerHTML = `${greet} · <span style="opacity:.7">${quote}</span>`;
  }

  // ---------- Helpers ----------

  function emptyState(emoji, title, desc) {
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    return `
      <div class="empty-state">
        <span class="emoji">${emoji}</span>
        <div class="title">${escapeHtml(title)}</div>
        <div>${escapeHtml(desc)}</div>
        <div class="quote">“${escapeHtml(quote)}”</div>
      </div>
    `;
  }

  function formatDue(iso) {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Hoy ${time}`;
    if (isTomorrow) return `Mañana ${time}`;
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' }) + ' ' + time;
  }

  function formatSec(sec) {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  }

  function prioColor(p) {
    return {
      urgent: '#ef4444',
      high:   '#f97316',
      med:    '#eab308',
      low:    '#64748b'
    }[p] || '#64748b';
  }

  function shortMonth(m) {
    return ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m];
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  return {
    init,
    refresh,
    switchView,
    showToast,
    showVoiceFeedback,
    hideVoiceFeedback,
    openTask,
    openTaskModal,
    applyTheme,
    openFocusMode
  };
})();

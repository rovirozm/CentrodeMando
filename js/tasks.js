/* ================================================================
   TASKS — Modelo de tareas, CRUD, búsqueda, filtros, ordenamiento.
   El estado vive en Storage. Este módulo expone operaciones.
   ================================================================ */

const Tasks = (() => {

  const PRIO_ORDER = { urgent: 0, high: 1, med: 2, low: 3 };

  function uid() {
    return 'task_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
  }
  function suid() {
    return 'st_' + Math.random().toString(36).slice(2, 9);
  }

  function blank() {
    return {
      id: uid(),
      title: '',
      notes: '',
      priority: 'med',
      tag: '',
      due: null,            // ISO con hora, o null
      remind: '',           // '', '0', '10', '30', '60', 'day'
      url: '',
      estimateMin: null,
      timeSpentSec: 0,
      doing: false,
      startedAt: null,
      subtasks: [],         // [{ id, text, done }]
      recurrence: null,     // { type, weekdays?, everyN? }
      completed: false,
      completedAt: null,
      order: 0,             // para drag&drop
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function create(patch = {}) {
    const t = { ...blank(), ...patch };
    if (!t.title) t.title = 'Sin título';
    // Asigna order al final
    const all = Storage.getTasks();
    const maxOrder = all.reduce((m, x) => Math.max(m, x.order || 0), 0);
    t.order = maxOrder + 1;
    Storage.addTask(t);
    return t;
  }

  function update(id, patch) {
    return Storage.updateTask(id, patch);
  }

  function remove(id) {
    Storage.removeTask(id);
  }

  function get(id) {
    return Storage.getTask(id);
  }

  function all() {
    return Storage.getTasks();
  }

  /**
   * Marca una tarea como completada/no completada.
   * Si era recurrente y se completó, genera la siguiente ocurrencia.
   */
  function setCompleted(id, completed) {
    const t = Storage.getTask(id);
    if (!t) return null;
    const wasCompleted = !!t.completed;

    const patch = {
      completed: !!completed,
      completedAt: completed ? Date.now() : null,
      doing: completed ? false : t.doing
    };

    // Si la tarea estaba en "haciendo ahora" y se completa, suma tiempo restante
    if (completed && t.doing && t.startedAt) {
      const seconds = Math.max(0, Math.floor((Date.now() - t.startedAt) / 1000));
      patch.timeSpentSec = (t.timeSpentSec || 0) + seconds;
      patch.startedAt = null;
    }

    const updated = Storage.updateTask(id, patch);

    // Si pasa de no-completada a completada: stats + recurrencia
    if (completed && !wasCompleted) {
      const today = todayKey();
      Storage.bumpStat(today, 'done', 1);
      updateStreak(today);

      // Si tiene recurrencia, generar siguiente instancia
      if (t.recurrence && t.recurrence.type) {
        const next = Recurring.spawnNext(t);
        if (next) {
          // La nueva instancia queda activa, la actual queda como completada del histórico
          Storage.addTask(next);
        }
      }
    }
    return updated;
  }

  function toggleDoing(id) {
    const all = Storage.getTasks();
    const target = all.find(t => t.id === id);
    if (!target) return;
    // Solo una tarea puede estar "haciendo ahora" — cerrar las demás
    for (const t of all) {
      if (t.id === id) continue;
      if (t.doing) {
        const seconds = t.startedAt ? Math.max(0, Math.floor((Date.now() - t.startedAt) / 1000)) : 0;
        Storage.updateTask(t.id, {
          doing: false,
          startedAt: null,
          timeSpentSec: (t.timeSpentSec || 0) + seconds
        });
      }
    }
    if (target.doing) {
      // Apagar
      const seconds = target.startedAt ? Math.max(0, Math.floor((Date.now() - target.startedAt) / 1000)) : 0;
      Storage.updateTask(id, {
        doing: false,
        startedAt: null,
        timeSpentSec: (target.timeSpentSec || 0) + seconds
      });
    } else {
      // Encender
      Storage.updateTask(id, { doing: true, startedAt: Date.now() });
    }
  }

  function getDoing() {
    return Storage.getTasks().find(t => t.doing) || null;
  }

  function addSubtask(taskId, text) {
    const t = Storage.getTask(taskId);
    if (!t) return;
    const list = [...(t.subtasks || []), { id: suid(), text: text || '', done: false }];
    Storage.updateTask(taskId, { subtasks: list });
  }
  function updateSubtask(taskId, subId, patch) {
    const t = Storage.getTask(taskId);
    if (!t) return;
    const list = (t.subtasks || []).map(s => s.id === subId ? { ...s, ...patch } : s);
    Storage.updateTask(taskId, { subtasks: list });
  }
  function removeSubtask(taskId, subId) {
    const t = Storage.getTask(taskId);
    if (!t) return;
    Storage.updateTask(taskId, { subtasks: (t.subtasks || []).filter(s => s.id !== subId) });
  }

  // ---------- Búsqueda y filtros ----------

  function search(text) {
    const q = (text || '').trim().toLowerCase();
    if (!q) return Storage.getTasks();
    return Storage.getTasks().filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.notes || '').toLowerCase().includes(q) ||
      (t.tag   || '').toLowerCase().includes(q) ||
      (t.subtasks || []).some(s => (s.text || '').toLowerCase().includes(q))
    );
  }

  function applyFilters(tasks, filters) {
    let out = tasks;
    if (filters.priorities && filters.priorities.length) {
      out = out.filter(t => filters.priorities.includes(t.priority));
    }
    if (filters.tags && filters.tags.length) {
      out = out.filter(t => filters.tags.includes((t.tag || '').toLowerCase()));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      out = out.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q) ||
        (t.tag   || '').toLowerCase().includes(q)
      );
    }
    if (filters.quick === 'overdue')   out = out.filter(isOverdue);
    if (filters.quick === 'nodate')    out = out.filter(t => !t.completed && !t.due);
    if (filters.quick === 'doing')     out = out.filter(t => t.doing);
    if (filters.dateFrom) {
      const f = new Date(filters.dateFrom).getTime();
      out = out.filter(t => t.due && new Date(t.due).getTime() >= f);
    }
    if (filters.dateTo) {
      const f = new Date(filters.dateTo).getTime();
      out = out.filter(t => t.due && new Date(t.due).getTime() <= f);
    }
    return out;
  }

  // ---------- Ordenamiento ----------

  function sortDefault(list) {
    // 1. Doing primero
    // 2. No completadas con due hoy/vencidas primero
    // 3. Por prioridad
    // 4. Por order/createdAt
    return [...list].sort((a, b) => {
      if (a.doing !== b.doing) return a.doing ? -1 : 1;
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const ap = PRIO_ORDER[a.priority] ?? 9;
      const bp = PRIO_ORDER[b.priority] ?? 9;
      if (ap !== bp) return ap - bp;
      const ad = a.due ? new Date(a.due).getTime() : Infinity;
      const bd = b.due ? new Date(b.due).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return (a.order || 0) - (b.order || 0);
    });
  }

  function reorder(idList) {
    // Asigna order según el array de IDs recibido (drag & drop)
    const tasks = Storage.getTasks();
    idList.forEach((id, i) => {
      const t = tasks.find(x => x.id === id);
      if (t) t.order = i + 1;
    });
    Storage.setTasks(tasks);
  }

  // ---------- Selectores de vista ----------

  function today() {
    const start = startOfDay(new Date());
    const end = endOfDay(new Date());
    return Storage.getTasks().filter(t => {
      if (t.completed) return false;
      if (!t.due) return false;
      const due = new Date(t.due).getTime();
      return due >= start && due <= end;
    });
  }

  function overdue() {
    return Storage.getTasks().filter(isOverdue);
  }

  function isOverdue(t) {
    if (t.completed) return false;
    if (!t.due) return false;
    return new Date(t.due).getTime() < Date.now();
  }

  function forWeek() {
    // Próximos 7 días desde hoy
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const list = Storage.getTasks().filter(t => {
        if (t.completed) return false;
        if (!t.due) return false;
        const due = new Date(t.due).getTime();
        return due >= d.getTime() && due < next.getTime();
      });
      days.push({ date: d, tasks: list });
    }
    return days;
  }

  function forMonth(year, month /* 0-based */) {
    const start = new Date(year, month, 1).getTime();
    const end = new Date(year, month + 1, 1).getTime();
    return Storage.getTasks().filter(t => {
      if (!t.due) return false;
      const due = new Date(t.due).getTime();
      return due >= start && due < end;
    });
  }

  function completed() {
    return Storage.getTasks()
      .filter(t => t.completed)
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  }

  // ---------- Stats / racha ----------

  function todayKey() {
    return dateKey(new Date());
  }
  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function startOfDay(d) {
    const x = new Date(d); x.setHours(0,0,0,0); return x.getTime();
  }
  function endOfDay(d) {
    const x = new Date(d); x.setHours(23,59,59,999); return x.getTime();
  }
  function updateStreak(today) {
    const stats = Storage.getStats();
    const last = stats.lastActiveDate;
    if (last === today) return; // ya contaba
    if (!last) {
      Storage.setStreak(1, Math.max(1, stats.bestStreak || 0), today);
      return;
    }
    const lastD = new Date(last + 'T00:00:00');
    const todayD = new Date(today + 'T00:00:00');
    const diffDays = Math.round((todayD - lastD) / 86400000);
    let streak = stats.streak || 0;
    if (diffDays === 1) streak += 1;
    else if (diffDays > 1) streak = 1;
    const best = Math.max(stats.bestStreak || 0, streak);
    Storage.setStreak(streak, best, today);
  }

  // ---------- Util ----------

  function findByKeyword(text) {
    // Para comando de voz "completar X" — devuelve la mejor coincidencia
    const q = (text || '').trim().toLowerCase();
    if (!q) return null;
    const list = Storage.getTasks().filter(t => !t.completed);
    // Exacta primero
    let best = list.find(t => (t.title || '').toLowerCase() === q);
    if (best) return best;
    // Includes
    best = list.find(t => (t.title || '').toLowerCase().includes(q));
    if (best) return best;
    // Por palabras
    const words = q.split(/\s+/);
    return list.find(t => words.every(w => (t.title || '').toLowerCase().includes(w))) || null;
  }

  function addTime(id, seconds) {
    const t = Storage.getTask(id);
    if (!t) return;
    Storage.updateTask(id, { timeSpentSec: (t.timeSpentSec || 0) + seconds });
  }

  return {
    PRIO_ORDER,
    create, update, remove, get, all,
    setCompleted, toggleDoing, getDoing,
    addSubtask, updateSubtask, removeSubtask,
    search, applyFilters, sortDefault, reorder,
    today, overdue, forWeek, forMonth, completed,
    isOverdue,
    todayKey, dateKey, startOfDay, endOfDay,
    findByKeyword, addTime, blank
  };
})();

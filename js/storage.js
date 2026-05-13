/* ================================================================
   STORAGE — Persistencia en localStorage con estructura versionada.
   Toda la app pasa por aquí para leer/escribir datos.
   ================================================================ */

const Storage = (() => {
  const KEY = 'centro-de-mando-v1';
  const VERSION = 1;

  // Estado inicial cuando no hay datos previos
  const initialState = () => ({
    version: VERSION,
    createdAt: new Date().toISOString(),
    tasks: [],
    tags: [
      { id: 't_work',     name: 'trabajo',  color: '#6366f1' },
      { id: 't_personal', name: 'personal', color: '#10b981' },
      { id: 't_house',    name: 'casa',     color: '#f59e0b' },
      { id: 't_health',   name: 'salud',    color: '#ef4444' }
    ],
    settings: {
      theme: 'dark',
      muted: false,
      notifAsked: false,
      welcomeSeen: false,
      pomodoro: {
        work: 25,
        breakShort: 5,
        breakLong: 15,
        cycle: 4
      }
    },
    stats: {
      // Pomodoros y tareas completadas por día: { 'YYYY-MM-DD': { poms, done, timeSec } }
      daily: {},
      // Última fecha con al menos 1 tarea completada (para racha)
      lastActiveDate: null,
      streak: 0,
      bestStreak: 0
    }
  });

  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        state = initialState();
        save();
        return state;
      }
      const parsed = JSON.parse(raw);
      // Migraciones futuras se podrían encadenar aquí según parsed.version
      state = mergeDefaults(parsed, initialState());
      return state;
    } catch (err) {
      console.warn('[Storage] error leyendo, reseteando:', err);
      state = initialState();
      save();
      return state;
    }
  }

  // Une defaults a un objeto existente para no perder claves nuevas
  function mergeDefaults(obj, defaults) {
    if (Array.isArray(defaults)) return obj ?? defaults;
    if (typeof defaults !== 'object' || defaults === null) {
      return obj === undefined ? defaults : obj;
    }
    const out = { ...defaults, ...(obj || {}) };
    for (const k of Object.keys(defaults)) {
      if (typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) && defaults[k] !== null) {
        out[k] = mergeDefaults(obj?.[k], defaults[k]);
      }
    }
    return out;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.error('[Storage] error guardando:', err);
    }
  }

  // ---------- Tareas ----------
  function getTasks() { return state.tasks; }
  function setTasks(tasks) { state.tasks = tasks; save(); }
  function addTask(task) { state.tasks.push(task); save(); }
  function updateTask(id, patch) {
    const i = state.tasks.findIndex(t => t.id === id);
    if (i >= 0) {
      state.tasks[i] = { ...state.tasks[i], ...patch, updatedAt: Date.now() };
      save();
      return state.tasks[i];
    }
    return null;
  }
  function removeTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    save();
  }
  function getTask(id) {
    return state.tasks.find(t => t.id === id) || null;
  }

  // ---------- Etiquetas ----------
  function getTags() { return state.tags; }
  function addTag(tag) {
    if (!state.tags.find(t => t.name.toLowerCase() === tag.name.toLowerCase())) {
      state.tags.push(tag);
      save();
    }
  }
  function removeTag(id) {
    state.tags = state.tags.filter(t => t.id !== id);
    save();
  }
  function findTagByName(name) {
    if (!name) return null;
    return state.tags.find(t => t.name.toLowerCase() === name.toLowerCase()) || null;
  }

  // ---------- Settings ----------
  function getSettings() { return state.settings; }
  function setSetting(key, value) {
    state.settings[key] = value;
    save();
  }
  function setNestedSetting(parent, key, value) {
    state.settings[parent] = state.settings[parent] || {};
    state.settings[parent][key] = value;
    save();
  }

  // ---------- Stats ----------
  function getStats() { return state.stats; }
  function bumpStat(date, field, by = 1) {
    state.stats.daily[date] = state.stats.daily[date] || { poms: 0, done: 0, timeSec: 0 };
    state.stats.daily[date][field] = (state.stats.daily[date][field] || 0) + by;
    save();
  }
  function setStreak(streak, bestStreak, lastActiveDate) {
    state.stats.streak = streak;
    state.stats.bestStreak = bestStreak;
    state.stats.lastActiveDate = lastActiveDate;
    save();
  }

  // ---------- Importar / exportar ----------
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }
  function importJSON(json) {
    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      if (!parsed || typeof parsed !== 'object') throw new Error('JSON inválido');
      state = mergeDefaults(parsed, initialState());
      save();
      return true;
    } catch (err) {
      console.error('[Storage] importJSON error:', err);
      return false;
    }
  }

  function cleanCompletedOlderThan(days) {
    const cutoff = Date.now() - days * 86400000;
    const before = state.tasks.length;
    state.tasks = state.tasks.filter(t => {
      if (!t.completed) return true;
      const at = t.completedAt || 0;
      return at >= cutoff;
    });
    save();
    return before - state.tasks.length;
  }

  return {
    load, save,
    getTasks, setTasks, addTask, updateTask, removeTask, getTask,
    getTags, addTag, removeTag, findTagByName,
    getSettings, setSetting, setNestedSetting,
    getStats, bumpStat, setStreak,
    exportJSON, importJSON,
    cleanCompletedOlderThan
  };
})();

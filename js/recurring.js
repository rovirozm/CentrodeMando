/* ================================================================
   RECURRING — Lógica de recurrencia de tareas.
   Cuando una tarea recurrente se completa, se calcula la próxima
   fecha y se devuelve una nueva tarea para añadir al store.
   ================================================================ */

const Recurring = (() => {

  /**
   * Dado el ISO de la fecha actual y la regla de recurrencia,
   * devuelve la próxima ocurrencia como objeto Date, o null.
   * @param {string} currentDueIso  Fecha de vencimiento actual (ISO)
   * @param {object} rule           { type, weekdays?, everyN? }
   */
  function nextOccurrence(currentDueIso, rule) {
    if (!rule || !rule.type) return null;
    const base = currentDueIso ? new Date(currentDueIso) : new Date();
    if (Number.isNaN(base.getTime())) return null;

    switch (rule.type) {
      case 'daily':
        return addDays(base, 1);

      case 'weekdays': {
        // Próximo lunes-viernes
        let d = addDays(base, 1);
        while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
        return d;
      }

      case 'weekly':
        return addDays(base, 7);

      case 'custom-week': {
        const days = (rule.weekdays || []).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        if (days.length === 0) return addDays(base, 7);
        // Busca el próximo día de la semana en la lista, dentro de los 7 siguientes
        for (let i = 1; i <= 7; i++) {
          const cand = addDays(base, i);
          if (days.includes(cand.getDay())) return cand;
        }
        return addDays(base, 7);
      }

      case 'monthly': {
        const d = new Date(base);
        const day = d.getDate();
        d.setMonth(d.getMonth() + 1);
        // Ajusta si el día no existe (p.ej. 31 → último día del mes)
        if (d.getDate() !== day) d.setDate(0);
        return d;
      }

      case 'yearly': {
        const d = new Date(base);
        d.setFullYear(d.getFullYear() + 1);
        return d;
      }

      case 'custom-days': {
        const n = Math.max(1, parseInt(rule.everyN, 10) || 1);
        return addDays(base, n);
      }

      default:
        return null;
    }
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  /**
   * Crea la próxima instancia de una tarea recurrente recién completada.
   * Devuelve el objeto de nueva tarea o null si no hay siguiente fecha.
   * El llamador es responsable de añadirla al storage.
   */
  function spawnNext(task) {
    if (!task.recurrence || !task.recurrence.type) return null;
    const next = nextOccurrence(task.due, task.recurrence);
    if (!next) return null;
    const newDueIso = task.due
      ? combineDateWithTimeFrom(next, task.due)
      : next.toISOString();
    return {
      ...task,
      id: 'task_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36),
      due: newDueIso,
      completed: false,
      completedAt: null,
      doing: false,
      startedAt: null,
      timeSpentSec: 0,
      subtasks: (task.subtasks || []).map(s => ({ ...s, done: false })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      origin: task.origin || task.id  // mantiene rastro de la tarea original
    };
  }

  // Mantiene la hora original al cambiar la fecha
  function combineDateWithTimeFrom(newDate, originalIso) {
    const orig = new Date(originalIso);
    const d = new Date(newDate);
    d.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
    return d.toISOString();
  }

  /**
   * Devuelve texto descriptivo de la regla (para mostrar en la tarjeta).
   */
  function describe(rule) {
    if (!rule || !rule.type) return '';
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    switch (rule.type) {
      case 'daily':     return '🔁 Diaria';
      case 'weekdays':  return '🔁 L–V';
      case 'weekly':    return '🔁 Semanal';
      case 'custom-week': {
        const days = (rule.weekdays || []).map(n => dayNames[parseInt(n, 10)]).filter(Boolean);
        return `🔁 ${days.join(', ') || 'Semanal'}`;
      }
      case 'monthly':   return '🔁 Mensual';
      case 'yearly':    return '🔁 Anual';
      case 'custom-days': return `🔁 Cada ${rule.everyN} días`;
      default: return '🔁';
    }
  }

  return { nextOccurrence, spawnNext, describe };
})();

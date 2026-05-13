/* ================================================================
   NOTIFICATIONS — Wrapper sobre la Notification API del navegador.
   También dispara sonido y guarda qué se ha notificado para no
   repetir avisos hasta que cambie la tarea o la fecha.
   ================================================================ */

const Notifications = (() => {
  // Identificadores de notificaciones ya emitidas (id+ts) en esta sesión.
  const fired = new Set();

  function supported() {
    return 'Notification' in window;
  }

  function permission() {
    return supported() ? Notification.permission : 'denied';
  }

  async function ask() {
    if (!supported()) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch {
      return 'denied';
    }
  }

  function notify(title, body, { silent = false, tag = null, onClick = null } = {}) {
    if (!supported() || Notification.permission !== 'granted') {
      // Fallback visual: el sonido / toast lo maneja la UI
      return null;
    }
    try {
      const n = new Notification(title, {
        body,
        tag: tag || undefined,
        icon: 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 viewBox%3D%220 0 64 64%22%3E%3Crect width%3D%2264%22 height%3D%2264%22 rx%3D%2214%22 fill%3D%22%236366f1%22%2F%3E%3Cpath d%3D%22M18 34 L28 44 L46 22%22 fill%3D%22none%22 stroke%3D%22white%22 stroke-width%3D%226%22 stroke-linecap%3D%22round%22 stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E',
        silent
      });
      if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
      return n;
    } catch (err) {
      console.warn('[Notifications] error:', err);
      return null;
    }
  }

  // Calcula el momento exacto del recordatorio según el offset configurado
  function reminderMoment(task) {
    if (!task.due) return null;
    const due = new Date(task.due).getTime();
    if (Number.isNaN(due)) return null;
    switch (task.remind) {
      case '0':   return due;
      case '10':  return due - 10 * 60000;
      case '30':  return due - 30 * 60000;
      case '60':  return due - 60 * 60000;
      case 'day': {
        const d = new Date(task.due);
        d.setHours(8, 0, 0, 0);
        return d.getTime();
      }
      default: return null;
    }
  }

  // Revisa todas las tareas y dispara recordatorios cuyo momento haya llegado
  function pollDue(tasks) {
    const now = Date.now();
    let firedCount = 0;
    for (const t of tasks) {
      if (t.completed) continue;
      if (!t.remind || !t.due) continue;
      const moment = reminderMoment(t);
      if (moment == null) continue;
      if (moment > now) continue;
      const key = `${t.id}|${moment}`;
      if (fired.has(key)) continue;
      fired.add(key);
      const dueStr = formatDueShort(t.due);
      notify(`⏰ ${t.title}`, `Recordatorio · ${dueStr}`, {
        tag: `task-${t.id}`,
        onClick: () => UI?.openTask?.(t.id)
      });
      Audio.alert();
      UI?.showToast?.(`🔔 Recordatorio: ${t.title}`);
      firedCount++;
    }
    return firedCount;
  }

  function formatDueShort(iso) {
    try {
      const d = new Date(iso);
      const opts = { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
      return d.toLocaleString('es-ES', opts);
    } catch { return ''; }
  }

  return { supported, permission, ask, notify, pollDue };
})();

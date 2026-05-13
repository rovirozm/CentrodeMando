/* ================================================================
   APP — Bootstrap del Centro de Mando.
   Orquesta la carga inicial, pega los módulos y arranca timers
   de fondo (poll de recordatorios).
   ================================================================ */

(function () {
  'use strict';

  function init() {
    // 1. Cargar estado desde localStorage
    Storage.load();
    const settings = Storage.getSettings();

    // 2. Configurar audio (mute) y tema
    Audio.setMuted(!!settings.muted);
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');

    // 3. Init UI (binds + render)
    UI.init();
    UI.applyTheme();

    // 4. Voz
    if (Voice.supported()) Voice.init();

    // 5. Bienvenida primera vez
    if (!settings.welcomeSeen) {
      document.getElementById('welcome-modal').classList.remove('hidden');
      document.getElementById('welcome-ok').addEventListener('click', () => {
        Storage.setSetting('welcomeSeen', true);
        document.getElementById('welcome-modal').classList.add('hidden');
        if (Notifications.supported() && Notifications.permission() === 'default') {
          // Pide permiso poco después
          setTimeout(() => Notifications.ask().then(() => {
            Storage.setSetting('notifAsked', true);
            UI.refresh();
          }), 500);
        }
      });
    }

    // Activar mute icon coherente
    document.getElementById('btn-mute').textContent = settings.muted ? '🔇' : '🔊';

    // 6. Poll de recordatorios cada 30 segundos
    function pollReminders() {
      Notifications.pollDue(Storage.getTasks());
    }
    pollReminders();
    setInterval(pollReminders, 30000);

    // 7. Cada minuto refrescar la UI para que las fechas "Hoy/vencida" se actualicen,
    //    pero solo si no hay modal abierto que sea formulario
    setInterval(() => {
      const modalOpen = !document.getElementById('task-modal').classList.contains('hidden');
      if (!modalOpen) UI.refresh();
    }, 60000);

    // 8. Click global desbloquea AudioContext (algunos navegadores)
    document.addEventListener('click', () => Audio.ensure(), { once: true });
    document.addEventListener('keydown', () => Audio.ensure(), { once: true });

    // 9. Registrar service worker (PWA)
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
          console.info('[App] SW no registrado:', err && err.message);
        });
      });
    }

    // 10. Cambio de visibilidad: cuando vuelve el foco, refrescar
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        UI.refresh();
        Notifications.pollDue(Storage.getTasks());
      }
    });

    console.log('🎯 Centro de Mando — iniciado.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

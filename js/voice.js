/* ================================================================
   VOICE — Reconocimiento de voz con Web Speech API (es-ES/es-MX).
   Reconoce comandos en español para crear y manejar tareas.
   ================================================================ */

const Voice = (() => {
  let recognition = null;
  let active = false;
  let interim = '';

  function supported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  function init() {
    if (!supported()) return false;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      active = true;
      UI?.showVoiceFeedback?.('Escuchando…');
    };

    recognition.onresult = (event) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      interim = text;
      UI?.showVoiceFeedback?.(`“${text}”`);
      if (event.results[event.results.length - 1].isFinal) {
        handleCommand(text.trim());
      }
    };

    recognition.onerror = (e) => {
      active = false;
      UI?.hideVoiceFeedback?.();
      const msg = {
        'no-speech':       'No te escuché. Intenta de nuevo.',
        'audio-capture':   'No se detectó micrófono.',
        'not-allowed':     'Permite el acceso al micrófono.',
        'service-not-allowed': 'Servicio de voz no permitido.',
        'network':         'Error de red en el reconocimiento.'
      }[e.error] || ('Error de voz: ' + e.error);
      UI?.showToast?.(msg, 'error');
      Audio.error();
    };

    recognition.onend = () => {
      active = false;
      setTimeout(() => UI?.hideVoiceFeedback?.(), 600);
    };

    return true;
  }

  function start() {
    if (!recognition && !init()) {
      UI?.showToast?.('Tu navegador no soporta voz (prueba Chrome/Edge).', 'error');
      return;
    }
    if (active) {
      try { recognition.stop(); } catch {}
      return;
    }
    try {
      Audio.ensure(); // desbloquea audio en el mismo gesto
      recognition.start();
    } catch (err) {
      console.warn('[Voice] start error', err);
    }
  }

  function stop() {
    if (recognition && active) {
      try { recognition.stop(); } catch {}
    }
  }

  // ---------- Parser de comandos ----------

  function handleCommand(text) {
    const lower = normalize(text);
    if (!lower) return;
    console.log('[Voice] comando:', lower);

    // Frases comodín: ir a hoy / semana / etc.
    if (matches(lower, ['que tengo hoy', 'mostrar hoy', 'ir a hoy', 'hoy'])) {
      UI.switchView('today');
      UI.showToast('📅 Vista: Hoy');
      return;
    }
    if (matches(lower, ['que tengo esta semana', 'mostrar semana', 'ir a semana', 'semana'])) {
      UI.switchView('week');
      UI.showToast('🗓️ Vista: Semana');
      return;
    }
    if (matches(lower, ['mostrar todas', 'ver todas', 'todas las tareas'])) {
      UI.switchView('all');
      return;
    }
    if (matches(lower, ['estadisticas', 'ver estadisticas'])) {
      UI.switchView('stats');
      return;
    }

    // Pomodoro
    if (matches(lower, ['iniciar pomodoro', 'empezar pomodoro', 'arranca pomodoro', 'comenzar pomodoro', 'pomodoro'])) {
      Timer.setMode('pomodoro');
      Timer.start();
      UI.showToast('🍅 Pomodoro iniciado');
      Audio.pop();
      return;
    }
    if (matches(lower, ['pausar pomodoro', 'pausa', 'pausa el pomodoro'])) {
      Timer.pause();
      UI.showToast('⏸ Pomodoro en pausa');
      return;
    }

    // Completar
    const completar = lower.match(/^(?:completar|terminar|marcar) (?:la tarea )?(.+)$/);
    if (completar) {
      const found = Tasks.findByKeyword(completar[1]);
      if (found) {
        Tasks.setCompleted(found.id, true);
        UI.refresh();
        UI.showToast(`✓ Completada: ${found.title}`);
        Audio.tick();
      } else {
        UI.showToast(`No encontré "${completar[1]}"`, 'error');
        Audio.error();
      }
      return;
    }

    // Crear tarea recordatorio
    // "recordarme X mañana a las 3"
    const recordar = lower.match(/^(?:recuerdame|recordarme|recuerda|recordar) (.+)$/);
    if (recordar) {
      const { title, due } = parseTimePhrase(recordar[1]);
      const task = Tasks.create({ title, due, remind: '0' });
      UI.refresh();
      UI.showToast(`🔔 Recordatorio: ${title}`);
      Audio.pop();
      return;
    }

    // "tarea urgente X"
    const urgente = lower.match(/^(?:tarea urgente|urgente) (.+)$/);
    if (urgente) {
      const { title, due } = parseTimePhrase(urgente[1]);
      const task = Tasks.create({ title, due, priority: 'urgent' });
      UI.refresh();
      UI.showToast(`🔴 Tarea urgente: ${title}`);
      Audio.pop();
      return;
    }

    // "agregar tarea X" / "nueva tarea X" / "anota X"
    const agregar = lower.match(/^(?:agregar tarea|añadir tarea|anadir tarea|nueva tarea|crear tarea|anota|anotar) (.+)$/);
    if (agregar) {
      const { title, due } = parseTimePhrase(agregar[1]);
      const task = Tasks.create({ title, due });
      UI.refresh();
      UI.showToast(`＋ Tarea: ${title}`);
      Audio.pop();
      return;
    }

    UI.showToast(`No entendí: "${text}"`, 'error');
    Audio.error();
  }

  // Normaliza: minúsculas, sin acentos, sin signos al inicio/fin
  // Usa escape Unicode explícito (combining diacritical marks U+0300-U+036F).
  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[¿?¡!.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matches(text, options) {
    return options.some(o => text === o || text.startsWith(o + ' ') || text.endsWith(' ' + o));
  }

  /**
   * Extrae una frase temporal al final del texto (mañana, hoy, lunes, "a las 3")
   * y devuelve { title, due }.
   */
  function parseTimePhrase(text) {
    let title = text.trim();
    let due = null;

    // Capturar "a las HH(:MM)?" o "a las N de la tarde/mañana"
    let hour = null, minute = 0;
    const horaMatch = title.match(/\s+a la(?:s)?\s+(\d{1,2})(?::(\d{2}))?(?:\s+(de la )?(manana|tarde|noche|am|pm))?/i);
    if (horaMatch) {
      hour = parseInt(horaMatch[1], 10);
      minute = parseInt(horaMatch[2] || '0', 10);
      const period = (horaMatch[4] || '').toLowerCase();
      if ((period === 'tarde' || period === 'noche' || period === 'pm') && hour < 12) hour += 12;
      if ((period === 'manana' || period === 'am') && hour === 12) hour = 0;
      title = title.replace(horaMatch[0], '').trim();
    }

    // Capturar fecha relativa
    const date = new Date();
    let dateChanged = false;

    const days = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    for (let i = 0; i < days.length; i++) {
      const re = new RegExp(`(?:\\s|^)(el\\s+)?${days[i]}(\\s|$)`, 'i');
      if (re.test(title)) {
        const target = i;
        const diff = ((target - date.getDay()) + 7) % 7 || 7;
        date.setDate(date.getDate() + diff);
        title = title.replace(re, ' ').trim();
        dateChanged = true;
        break;
      }
    }

    if (/\bmanana\b/i.test(title) && !dateChanged) {
      date.setDate(date.getDate() + 1);
      title = title.replace(/\bmanana\b/i, '').trim();
      dateChanged = true;
    }
    if (/\bhoy\b/i.test(title) && !dateChanged) {
      title = title.replace(/\bhoy\b/i, '').trim();
      dateChanged = true;
    }
    if (/\bpasado manana\b/i.test(title)) {
      date.setDate(date.getDate() + 2);
      title = title.replace(/\bpasado manana\b/i, '').trim();
      dateChanged = true;
    }

    if (hour != null) {
      date.setHours(hour, minute, 0, 0);
      dateChanged = true;
    } else if (dateChanged) {
      // Si fijó día pero no hora, default 9:00
      date.setHours(9, 0, 0, 0);
    }

    if (dateChanged) due = date.toISOString();

    title = title.replace(/^\s*(de|que|para)\s+/i, '').trim();
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return { title, due };
  }

  return { supported, init, start, stop };
})();

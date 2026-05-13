/* ================================================================
   TIMER — Pomodoro y cronómetro libre.
   Estados: 'idle' | 'running' | 'paused'
   Modos:   'pomodoro' | 'break' | 'free'
   El tiempo se acredita a la tarea "haciendo ahora" al terminar.
   ================================================================ */

const Timer = (() => {
  let mode = 'pomodoro';          // 'pomodoro' | 'break' | 'free'
  let state = 'idle';             // 'idle' | 'running' | 'paused'
  let remainingMs = 25 * 60000;
  let totalMs = 25 * 60000;       // Para porcentaje (no usado todavía)
  let lastTick = null;
  let raf = null;
  let pomCompletedInCycle = 0;    // Para descanso largo cada N pomodoros
  let onTickCb = () => {};
  let onFinishCb = () => {};

  function settings() {
    return Storage.getSettings().pomodoro || { work: 25, breakShort: 5, breakLong: 15, cycle: 4 };
  }

  function setMode(m) {
    mode = m;
    state = 'idle';
    const s = settings();
    if (m === 'pomodoro')  remainingMs = s.work * 60000;
    else if (m === 'break') remainingMs = s.breakShort * 60000;
    else                    remainingMs = 0;
    totalMs = remainingMs;
    stopLoop();
    onTickCb({ mode, state, remainingMs, totalMs });
  }

  function setWorkMinutes(min) {
    if (mode === 'pomodoro' && state === 'idle') {
      remainingMs = totalMs = min * 60000;
      onTickCb({ mode, state, remainingMs, totalMs });
    }
  }

  function start() {
    if (state === 'running') return;
    state = 'running';
    lastTick = performance.now();
    loop();
  }

  function pause() {
    if (state !== 'running') return;
    state = 'paused';
    stopLoop();
    onTickCb({ mode, state, remainingMs, totalMs });
  }

  function reset() {
    state = 'idle';
    setMode(mode); // reinicia remainingMs según el modo actual
  }

  function loop() {
    if (state !== 'running') return;
    raf = requestAnimationFrame((now) => {
      const dt = now - lastTick;
      lastTick = now;
      if (mode === 'free') {
        // Cuenta hacia arriba
        remainingMs += dt;
      } else {
        remainingMs -= dt;
        if (remainingMs <= 0) {
          remainingMs = 0;
          finish();
          return;
        }
      }
      // Acreditar tiempo a la tarea "haciendo ahora" cada ~5s
      accrueDoing(dt);
      onTickCb({ mode, state, remainingMs, totalMs });
      loop();
    });
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  // Acumula segundos en la tarea activa (haciendo ahora) si el timer corre en pomodoro o libre
  let accrueAcc = 0;
  function accrueDoing(dt) {
    if (mode === 'break') return;
    accrueAcc += dt;
    if (accrueAcc < 5000) return; // cada 5 segundos
    const secs = Math.floor(accrueAcc / 1000);
    accrueAcc -= secs * 1000;
    const doing = Tasks.getDoing();
    if (doing) {
      Tasks.addTime(doing.id, secs);
      Storage.bumpStat(Tasks.todayKey(), 'timeSec', secs);
    }
  }

  function finish() {
    stopLoop();
    state = 'idle';
    Audio.ding();
    Notifications.notify(
      mode === 'pomodoro' ? '🍅 Pomodoro completado' : '☕ Descanso terminado',
      mode === 'pomodoro' ? '¡Buen trabajo! Hora de un descanso.' : 'A volver a la carga.',
      { tag: 'pomodoro' }
    );

    if (mode === 'pomodoro') {
      // Stats: +1 pomodoro hoy
      Storage.bumpStat(Tasks.todayKey(), 'poms', 1);
      pomCompletedInCycle++;
      // Pasar a descanso largo o corto
      const s = settings();
      if (pomCompletedInCycle >= s.cycle) {
        pomCompletedInCycle = 0;
        mode = 'break';
        remainingMs = totalMs = s.breakLong * 60000;
      } else {
        mode = 'break';
        remainingMs = totalMs = s.breakShort * 60000;
      }
    } else if (mode === 'break') {
      // Vuelve a pomodoro
      const s = settings();
      mode = 'pomodoro';
      remainingMs = totalMs = s.work * 60000;
    }

    onTickCb({ mode, state, remainingMs, totalMs });
    onFinishCb({ mode });
  }

  function getState() { return { mode, state, remainingMs, totalMs }; }

  function format(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function onTick(cb) { onTickCb = cb; }
  function onFinish(cb) { onFinishCb = cb; }

  function pomsToday() {
    const stats = Storage.getStats();
    const today = stats.daily[Tasks.todayKey()];
    return today?.poms || 0;
  }

  return {
    setMode, setWorkMinutes,
    start, pause, reset, finish,
    getState, format,
    onTick, onFinish,
    pomsToday
  };
})();

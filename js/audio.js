/* ================================================================
   AUDIO — Tonos generados con Web Audio API (sin archivos).
   Sonidos sutiles para microinteracciones.
   ================================================================ */

const Audio = (() => {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // Algunos navegadores bloquean hasta una interacción del usuario
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function setMuted(value) { muted = !!value; }
  function isMuted() { return muted; }

  // Genera un tono simple con envolvente ADSR sencilla
  function tone({ freq = 440, type = 'sine', dur = 0.15, gain = 0.05, attack = 0.01, release = 0.08 }) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + attack);
    g.gain.linearRampToValueAtTime(0, now + attack + dur + release);
    osc.connect(g).connect(ac.destination);
    osc.start(now);
    osc.stop(now + attack + dur + release + 0.02);
  }

  // Secuencia melódica corta
  function chord(notes, gap = 0.05) {
    if (muted) return;
    notes.forEach((n, i) => {
      setTimeout(() => tone(n), i * gap * 1000);
    });
  }

  // --- Sonidos públicos ---
  return {
    ensure,
    setMuted,
    isMuted,
    /** "Tic" sutil al completar tarea */
    tick() {
      tone({ freq: 880, type: 'triangle', dur: 0.07, gain: 0.05 });
      setTimeout(() => tone({ freq: 1320, type: 'triangle', dur: 0.06, gain: 0.04 }), 60);
    },
    /** "Ding" agradable al terminar pomodoro */
    ding() {
      chord([
        { freq: 523.25, type: 'sine', dur: 0.18, gain: 0.07 },
        { freq: 659.25, type: 'sine', dur: 0.18, gain: 0.07 },
        { freq: 783.99, type: 'sine', dur: 0.30, gain: 0.07 }
      ], 0.12);
    },
    /** Alerta para recordatorios */
    alert() {
      chord([
        { freq: 587.33, type: 'triangle', dur: 0.10, gain: 0.06 },
        { freq: 783.99, type: 'triangle', dur: 0.10, gain: 0.06 },
        { freq: 587.33, type: 'triangle', dur: 0.10, gain: 0.06 },
        { freq: 783.99, type: 'triangle', dur: 0.16, gain: 0.06 }
      ], 0.13);
    },
    /** Pop al agregar tarea */
    pop() {
      const ac = ensure();
      if (!ac || muted) return;
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);
      g.gain.setValueAtTime(0.0, now);
      g.gain.linearRampToValueAtTime(0.07, now + 0.02);
      g.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.connect(g).connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    },
    /** Click ligero al cambiar de vista */
    click() {
      tone({ freq: 660, type: 'square', dur: 0.03, gain: 0.025 });
    },
    /** Error suave */
    error() {
      tone({ freq: 220, type: 'sawtooth', dur: 0.14, gain: 0.05 });
    }
  };
})();

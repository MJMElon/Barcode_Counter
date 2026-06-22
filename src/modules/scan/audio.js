// Web-Audio beeps for the scan counter. Ported from the original index.html.
let audioCtx = null;

export function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, duration, type = 'sine', volume = 0.6, when = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0;
  osc.connect(gain).connect(ctx.destination);
  const start = ctx.currentTime + when;
  gain.gain.linearRampToValueAtTime(volume, start + 0.005);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function beepSuccess() {
  tone(1320, 0.06, 'square', 0.7, 0);
  tone(1760, 0.1, 'square', 0.7, 0.06);
}
export function beepDuplicate() {
  tone(220, 0.13, 'sawtooth', 0.85, 0);
  tone(180, 0.19, 'sawtooth', 0.85, 0.14);
}
export function beepComplete() {
  tone(900, 0.1, 'square', 0.7, 0);
  tone(1300, 0.1, 'square', 0.7, 0.11);
  tone(1760, 0.2, 'square', 0.75, 0.23);
}
export function beepAlarm() {
  tone(1700, 0.13, 'sawtooth', 0.9, 0);
  tone(700, 0.2, 'sawtooth', 0.9, 0.14);
  tone(1700, 0.13, 'sawtooth', 0.9, 0.34);
  tone(700, 0.24, 'sawtooth', 0.9, 0.48);
}

export function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

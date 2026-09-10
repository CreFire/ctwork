/** 极简 WebAudio 合成音效 —— 无外部音频资源 */
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.05, slide = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur);
}

export const sfx = {
  setMuted(m: boolean) {
    muted = m;
  },
  click() {
    blip(880 + Math.random() * 220, 0.07, "triangle", 0.035, -300);
  },
  crit() {
    blip(1320, 0.12, "square", 0.045, 400);
  },
  buy() {
    blip(520, 0.09, "sine", 0.05, 260);
    setTimeout(() => blip(760, 0.1, "sine", 0.04), 70);
  },
  research() {
    blip(440, 0.15, "sine", 0.05, 440);
    setTimeout(() => blip(880, 0.2, "sine", 0.045), 120);
  },
  error() {
    blip(160, 0.18, "sawtooth", 0.04, -60);
  },
  event() {
    blip(660, 0.1, "triangle", 0.04);
    setTimeout(() => blip(990, 0.14, "triangle", 0.04), 90);
  },
  alarm() {
    blip(340, 0.3, "sawtooth", 0.035, -120);
  },
  launch() {
    blip(80, 1.4, "sawtooth", 0.06, 700);
  },
};

/**
 * Sound for the hero eye.
 *
 * Synthesised rather than shipped as files: two short cues do not justify a
 * network request, and generating them means the tone can be tuned in one place
 * instead of re-encoding an asset.
 *
 * ── why it is written this way ────────────────────────────────────────────────
 * Browsers refuse to start an AudioContext until the page has had a genuine user
 * gesture. Hover is not one — a `pointerenter` alone will not unlock audio, and
 * waiting on it silently does nothing. So the context is only created and resumed
 * from a real interaction (pointer down, click, key press), and every cue checks
 * that it is actually running before making a sound. Until then the eye animates
 * silently, which is the correct outcome: no sound before the visitor has done
 * anything.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

/** Called from a genuine user gesture; safe to call repeatedly. */
export function unlockEyeAudio() {
  if (typeof window === "undefined") return;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;
  if (!ctx) ctx = new Ctor();
  void ctx.resume().then(() => {
    unlocked = ctx?.state === "running";
  }).catch(() => {});
  unlocked = ctx.state === "running";
}

/** Register the one-shot unlock on the first real interaction, then remove it. */
export function armEyeAudio() {
  if (typeof window === "undefined") return () => {};
  const events = ["pointerdown", "keydown", "click", "touchstart"] as const;
  const handler = () => {
    unlockEyeAudio();
    events.forEach((e) => window.removeEventListener(e, handler));
  };
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
  return () => events.forEach((e) => window.removeEventListener(e, handler));
}

const ready = () => unlocked && ctx !== null && ctx.state === "running";

/**
 * The pop. A soft, quick body — the sound of something arriving, not of a
 * machine beeping. Two partials a fifth apart, both decaying fast, with a gentle
 * upward pitch bend so the ear reads it as a rise.
 */
export function playPop() {
  if (!ready() || !ctx) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  /*
     Kept quiet on purpose. This plays on every hover over the headline, so it has
     to survive repetition — anything louder than a breath becomes an irritation by
     the third pass.
  */
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.075, t + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2600, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + 0.32);
  lp.Q.value = 0.6;

  const partials: Array<[number, number, OscillatorType]> = [
    [420, 1, "sine"],
    [630, 0.42, "triangle"],
  ];
  for (const [freq, gain, type] of partials) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    // A two-semitone lift over the cue: the "rising out of the page" gesture.
    osc.frequency.exponentialRampToValueAtTime(freq * 1.13, t + 0.16);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(lp);
    osc.start(t);
    osc.stop(t + 0.36);
  }
  lp.connect(out).connect(ctx.destination);
}

/**
 * The blink. Barely there on purpose — a tick of air rather than a tone, so it
 * reads as the eye closing instead of as a second notification.
 */
export function playBlink() {
  if (!ready() || !ctx) return;
  const t = ctx.currentTime;
  const dur = 0.075;
  const frames = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // White noise under a fast decay envelope.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1900;
  bp.Q.value = 1.1;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.032, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t);
}

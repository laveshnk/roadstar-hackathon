/**
 * Audio Engine: Local neural TTS + operational "Ding" sound effects.
 *
 * TTS strategy (in priority order):
 *   1. Local neural TTS microservice at http://localhost:5050/synthesize
 *      (Python server, voice "af_heart", returns audio/wav blob).
 *   2. Pre-rendered static MP3 files at /audio/tour/step{N}.mp3.
 *   3. Web Speech API — picks the most natural local voice available
 *      (Google US English, Samantha, Daniel) with adjusted prosody
 *      (rate 0.95, pitch 1.0) for a warm, human-like delivery.
 *
 * Audio playback is completely fire-and-forget — it NEVER triggers tour
 * progression. The user must click [Next Step] to advance.
 *
 * No external/third-party services (Puter.js, ElevenLabs cloud, etc.) are used.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** Resume AudioContext on first user interaction (required by Brave/Chrome). */
export function initAudioOnInteraction(): void {
  if (typeof window === "undefined") return;
  const resume = () => { getAudioContext(); };
  window.addEventListener("click", resume, { once: true });
  window.addEventListener("touchstart", resume, { once: true });
  window.addEventListener("keydown", resume, { once: true });
}

/**
 * Play a clean two-tone operational chime (587Hz -> 880Hz).
 * Uses Web Audio API oscillators with smooth gain envelopes so the chime
 * sounds clean and professional with no clicks or pops.
 */
export function playDing(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.value = 587;
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.3, now + 0.01);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc1.connect(gain1);
  gain1.connect(master);
  osc1.start(now);
  osc1.stop(now + 0.5);
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.value = 880;
  gain2.gain.setValueAtTime(0, now + 0.12);
  gain2.gain.linearRampToValueAtTime(0.25, now + 0.13);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  osc2.connect(gain2);
  gain2.connect(master);
  osc2.start(now + 0.12);
  osc2.stop(now + 0.8);
}

// --------------------------------------------------------------------------- //
// Local neural TTS engine
// --------------------------------------------------------------------------- //

const LOCAL_TTS_URL = "http://localhost:5050/synthesize";
const LOCAL_TTS_VOICE = "af_heart";

interface TTSOptions {
  muted: boolean;
  /** Tour step number (1-based) for static MP3 fallback. */
  step?: number;
  // NOTE: No onEnded callback. Audio is fire-and-forget — tour progression
  // is strictly user-driven via the [Next Step] button.
}

let currentAudio: HTMLAudioElement | null = null;
// Tracks pause state for the pause/resume API. No longer used to guard
// onEnded callbacks (which have been removed), but still set by pause/resume.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let isPaused = false;

/**
 * Speak text using a high-quality natural neural voice.
 * Audio playback is completely fire-and-forget — it NEVER triggers tour
 * progression. The user must click [Next Step] to advance.
 *
 * Fallback chain:
 *  1. Local neural TTS microservice (http://localhost:5050/synthesize).
 *  2. Pre-rendered static MP3 at /audio/tour/step{N}.mp3.
 *  3. Web Speech API with natural voice + adjusted prosody.
 */
export function speakNatural(text: string, opts: TTSOptions): void {
  if (typeof window === "undefined") return;
  cancelSpeech();
  if (opts.muted) return; // No speech, no advancement — just wait.

  // Strategy 1: Local neural TTS microservice.
  // If it fails (server offline, network error, etc.), fall through.
  speakLocalTTS(text, opts).catch(() => {
    // Strategy 2: Static pre-rendered MP3 (tour steps only).
    // If MP3 doesn't exist, fall through to Web Speech with the ORIGINAL text.
    if (opts.step != null) {
      tryStaticMP3(opts.step, text);
    } else {
      speakFallback(text);
    }
  });
}

/** Attempt synthesis via the local Python neural TTS microservice. */
async function speakLocalTTS(text: string, opts: TTSOptions): Promise<void> {
  if (typeof fetch === "undefined") throw new Error("no fetch");
  const res = await fetch(LOCAL_TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 1000), voice: LOCAL_TTS_VOICE }),
  });
  if (!res.ok) throw new Error(`TTS server ${res.status}`);
  const blob = await res.blob();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  currentAudio = audio;
  audio.onended = () => {
    currentAudio = null;
    URL.revokeObjectURL(audioUrl);
    // Deliberately do NOT call onEnded — fire-and-forget.
  };
  audio.onerror = () => {
    currentAudio = null;
    URL.revokeObjectURL(audioUrl);
    // Fall through to static MP3 or Web Speech with the ORIGINAL text.
    if (opts.step != null) tryStaticMP3(opts.step, text);
    else speakFallback(text);
  };
  await audio.play();
}

/** Attempt to play a pre-rendered static MP3 file for a tour step. */
function tryStaticMP3(step: number, text: string): void {
  const url = `/audio/tour/step${step}.mp3`;
  const audio = new Audio(url);
  currentAudio = audio;
  audio.onended = () => {
    currentAudio = null;
    // Deliberately do NOT call onEnded — fire-and-forget.
  };
  audio.onerror = () => {
    currentAudio = null;
    // Final fallback: Web Speech API with the ORIGINAL text.
    speakFallback(text);
  };
  audio.play().catch(() => {
    currentAudio = null;
    // Final fallback: Web Speech API with the ORIGINAL text.
    speakFallback(text);
  });
}

/** Fallback: Web Speech API with the most natural local voice. */
function speakFallback(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return; // No speech, no advancement.
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 500));
  u.rate = 0.95;
  u.pitch = 1.0;
  u.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferredNames = [
    "Google US English", "Google UK English Male", "Samantha",
    "Daniel", "Karen", "Moira", "Tessa", "Alex", "Natural",
  ];
  let chosen: SpeechSynthesisVoice | undefined;
  for (const name of preferredNames) {
    chosen = voices.find((v) => v.name.includes(name) && v.lang.startsWith("en"));
    if (chosen) break;
  }
  if (!chosen) chosen = voices.find((v) => v.lang.startsWith("en"));
  if (chosen) u.voice = chosen;
  // Deliberately do NOT set onend/onerror to trigger anything — fire-and-forget.
  window.speechSynthesis.speak(u);
}

export function cancelSpeech(): void {
  isPaused = false;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}

export function pauseSpeech(): void {
  isPaused = true;
  if (currentAudio) currentAudio.pause();
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.pause();
}

export function resumeSpeech(): void {
  isPaused = false;
  if (currentAudio) currentAudio.play().catch(() => {});
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.resume();
}

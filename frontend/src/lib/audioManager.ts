let currentAudio: HTMLAudioElement | null = null;

export const playDing = (): Promise<void> => {
  return new Promise((resolve) => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();

      const playTone = (freq: number, start: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + start);
        osc.stop(audioCtx.currentTime + start + duration);
      };

      playTone(587.33, 0, 0.12);
      playTone(880.0, 0.1, 0.18);

      setTimeout(() => {
        audioCtx.close();
        resolve();
      }, 300);
    } catch {
      resolve();
    }
  });
};

export const cancelSpeech = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
};

export const speakNeural = async (text: string, voice: string = 'af_heart'): Promise<void> => {
  cancelSpeech();
  await playDing();

  try {
    const res = await fetch('http://127.0.0.1:5050/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed: 1.0 }),
    });

    if (!res.ok) throw new Error(`Local TTS returned status ${res.status}`);

    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(audioUrl);

    return new Promise((resolve) => {
      if (!currentAudio) return resolve();
      currentAudio.onended = () => {
        currentAudio = null;
        resolve();
      };
      currentAudio.onerror = () => {
        currentAudio = null;
        resolve();
      };
      currentAudio.play().catch(() => resolve());
    });
  } catch (err) {
    console.warn('Local neural TTS service unreachable, bypassing speech safely:', err);
  }
};

// Read aloud with the browser's built-in voices (free, nothing is sent anywhere).
// Long text is cut into sentences because some browsers stop reading long passages.

export const speechSupported = (): boolean => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

export function getVoices(): SpeechSynthesisVoice[] {
  return speechSupported() ? window.speechSynthesis.getVoices() : [];
}

/** Voices load a moment after the page opens, so listen for the change. Returns a cleanup function. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

export function splitForSpeech(text: string, max = 190): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [clean];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > max) { out.push(cur.trim()); cur = ""; }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

export function speak(text: string, opts: { voice?: string; rate?: number; onEnd?: () => void }) {
  if (!speechSupported()) return opts.onEnd?.();
  window.speechSynthesis.cancel();
  const parts = splitForSpeech(text);
  if (!parts.length) return opts.onEnd?.();
  const voice = opts.voice ? getVoices().find((v) => v.name === opts.voice) : undefined;
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = opts.rate ?? 1;
    if (i === parts.length - 1) { u.onend = () => opts.onEnd?.(); u.onerror = () => opts.onEnd?.(); }
    else u.onerror = () => opts.onEnd?.();
    window.speechSynthesis.speak(u);
  });
}

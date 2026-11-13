"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSpeechPrefs, setSpeechPrefs } from "@/lib/prefs";
import { getVoices, onVoicesChanged, speak, speechSupported, stopSpeaking } from "@/lib/speech";

// Only one thing reads at a time: starting a new one stops the old one.
let stopCurrent: (() => void) | null = null;

export function ReadAloud({ text, label = "Read aloud", small = true }: { text: string; label?: string; small?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [playing, setPlaying] = useState(false);
  const mine = useRef(false);

  useEffect(() => { setSupported(speechSupported()); return () => { if (mine.current) stopSpeaking(); }; }, []);

  const toggle = useCallback(() => {
    if (playing) { stopSpeaking(); setPlaying(false); mine.current = false; return; }
    stopCurrent?.();
    const prefs = getSpeechPrefs();
    mine.current = true;
    setPlaying(true);
    stopCurrent = () => { setPlaying(false); mine.current = false; };
    speak(text, { voice: prefs.voice, rate: prefs.rate, onEnd: () => { setPlaying(false); mine.current = false; } });
  }, [playing, text]);

  if (!supported) return null; // this browser has no speech: hide the button instead of showing a broken one
  return (
    <button className={`btn ghost${small ? " small" : ""} no-print`} onClick={toggle} aria-pressed={playing}>
      {playing ? "Stop reading" : label}
    </button>
  );
}

/** Pick a voice and speed. Saved in this browser. */
export function SpeechSettings({ startOpen = false }: { startOpen?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState("");
  const [rate, setRate] = useState(1);

  useEffect(() => {
    setSupported(speechSupported());
    const p = getSpeechPrefs();
    setVoice(p.voice);
    setRate(p.rate);
    const load = () => setVoices(getVoices());
    load();
    return onVoicesChanged(load);
  }, []);

  if (!supported) return <p className="small muted">Your browser cannot read aloud. Chrome, Edge, and Safari can.</p>;
  return (
    <details className="no-print" open={startOpen || undefined}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Reading voice and speed</summary>
      <div className="grid2" style={{ marginTop: ".75rem" }}>
        <div>
          <label htmlFor="voice">Voice</label>
          <select id="voice" value={voice} onChange={(e) => { setVoice(e.target.value); setSpeechPrefs({ voice: e.target.value }); }}>
            <option value="">Browser default</option>
            {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rate">Speed: {rate.toFixed(1)}x</label>
          <input id="rate" type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => { const r = Number(e.target.value); setRate(r); setSpeechPrefs({ rate: r }); }} />
        </div>
      </div>
    </details>
  );
}

import { useCallback, useRef, useState } from "react";

// How many amplitude samples make up the live scrolling waveform while
// recording — same count the sent bubble renders, so what you see while
// recording is exactly what gets sent (no surprise re-shape on stop).
const BAR_COUNT = 40;
// Sampling cadence for the live meter — dense enough to feel responsive,
// sparse enough not to burn CPU on a rAF loop running getByteTimeDomainData.
const SAMPLE_INTERVAL_MS = 90;

function downsample(samples: number[], targetCount: number): number[] {
  if (samples.length === 0) return new Array(targetCount).fill(0);
  if (samples.length <= targetCount) {
    return [...new Array(targetCount - samples.length).fill(0), ...samples];
  }
  const bucketSize = samples.length / targetCount;
  const result: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    const slice = samples.slice(start, end);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

export interface VoiceRecording {
  file: File;
  waveform: number[];
  durationSec: number;
}

interface UseVoiceRecorderResult {
  recording: boolean;
  /** Last BAR_COUNT loudness samples (0..1), most recent last — for the
   * live in-progress waveform. */
  liveBars: number[];
  elapsedSec: number;
  start: () => Promise<void>;
  /** Stops and resolves with the recorded file + its waveform, or null if
   * nothing was recorded (e.g. mic access failed). */
  stop: () => Promise<VoiceRecording | null>;
  /** Stops and discards — no callback, no upload. */
  cancel: () => void;
}

export function useVoiceRecorder(onError: (message: string) => void): UseVoiceRecorderResult {
  const [recording, setRecording] = useState(false);
  const [liveBars, setLiveBars] = useState<number[]>(new Array(BAR_COUNT).fill(0));
  const [elapsedSec, setElapsedSec] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const allSamplesRef = useRef<number[]>([]);
  const lastSampleAtRef = useRef(0);
  const startedAtRef = useRef(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopResolveRef = useRef<((r: VoiceRecording | null) => void) | null>(null);
  const cancelledRef = useRef(false);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    recorderRef.current = null;
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;

      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const timeDomain = new Uint8Array(analyser.frequencyBinCount);

      allSamplesRef.current = [];
      lastSampleAtRef.current = 0;
      startedAtRef.current = Date.now();
      setElapsedSec(0);
      setLiveBars(new Array(BAR_COUNT).fill(0));

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        const now = performance.now();
        if (now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) return;
        lastSampleAtRef.current = now;

        analyser.getByteTimeDomainData(timeDomain);
        let sumSquares = 0;
        for (let i = 0; i < timeDomain.length; i++) {
          const centered = (timeDomain[i] - 128) / 128;
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / timeDomain.length);
        // A little gain + curve so quiet speech still reads as visible bars
        // rather than a flat line, matching the "reads as alive" feel of
        // WhatsApp's meter rather than a strictly linear RMS plot.
        const level = Math.min(1, Math.sqrt(rms) * 1.6);

        allSamplesRef.current.push(level);
        setLiveBars(downsample(allSamplesRef.current, BAR_COUNT));
      };
      rafRef.current = requestAnimationFrame(tick);

      elapsedTimerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) chunksRef.current.push(evt.data);
      };
      recorder.onstop = () => {
        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const waveform = downsample(allSamplesRef.current, BAR_COUNT);
        teardown();
        if (cancelledRef.current || !resolve) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], "voice-note.webm", { type: blob.type });
        resolve({ file, waveform, durationSec });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      teardown();
      setRecording(false);
      onError("Couldn't access your microphone");
    }
  }, [onError, teardown]);

  const stop = useCallback((): Promise<VoiceRecording | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      stopResolveRef.current = resolve;
      setRecording(false);
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setRecording(false);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      teardown();
    }
  }, [teardown]);

  return { recording, liveBars, elapsedSec, start, stop, cancel };
}

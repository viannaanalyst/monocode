import { useCallback, useEffect, useRef, useState } from "react";
import { DictationController, type DictationState } from "../lib/dictation";
import { pickRecordingMime, transcribeBlob, type VoiceModel } from "../lib/transcribe";

type Options = {
  enabled: boolean;
  getOptions(): { model: VoiceModel; language?: string; prompt?: string };
  onText(text: string): void;
  onError(message: string): void;
};

type Meter = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  data: Uint8Array;
  raf: number;
};

export function useDictation({ enabled, getOptions, onText, onError }: Options) {
  const [state, setState] = useState<DictationState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const optionsRef = useRef({ getOptions, onText, onError });
  optionsRef.current = { getOptions, onText, onError };
  const meterRef = useRef<Meter | null>(null);
  const prewarmTimer = useRef<number | null>(null);

  const stopMeter = useCallback(() => {
    const meter = meterRef.current;
    if (!meter) return;
    cancelAnimationFrame(meter.raf);
    void meter.ctx.close().catch(() => {});
    meterRef.current = null;
    setLevel(0);
  }, []);

  const startMeter = useCallback(
    (stream: MediaStream) => {
      stopMeter();
      if (typeof AudioContext === "undefined") return;
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const meter: Meter = {
          ctx,
          analyser,
          data: new Uint8Array(analyser.fftSize),
          raf: 0,
        };
        meterRef.current = meter;
        void ctx.resume().catch(() => {});
        const tick = () => {
          const current = meterRef.current;
          if (!current) return;
          current.analyser.getByteTimeDomainData(current.data);
          let sum = 0;
          for (let i = 0; i < current.data.length; i += 1) {
            const value = (current.data[i] - 128) / 128;
            sum += value * value;
          }
          const rms = Math.sqrt(sum / current.data.length);
          setLevel((prev) => prev + (Math.min(1, rms * 4) - prev) * 0.5);
          current.raf = requestAnimationFrame(tick);
        };
        meter.raf = requestAnimationFrame(tick);
      } catch {
        // Metering is best-effort; dictation still works without it.
      }
    },
    [stopMeter],
  );

  const controllerRef = useRef<DictationController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new DictationController({
      getUserMedia: (constraints) => {
        const media = navigator.mediaDevices;
        if (!media?.getUserMedia) {
          throw new Error(
            "Microphone is not available in this window. Restart the app and check System Settings > Privacy & Security > Microphone.",
          );
        }
        return media.getUserMedia(constraints).catch((error: unknown) => {
          const name = (error as { name?: string })?.name;
          if (name === "NotAllowedError" || name === "SecurityError") {
            throw new Error(
              "Microphone permission denied. Allow MonoCode in System Settings > Privacy & Security > Microphone, then try again.",
            );
          }
          throw error;
        });
      },
      createRecorder: (stream, mime) =>
        new MediaRecorder(stream, {
          ...(mime ? { mimeType: mime } : {}),
          audioBitsPerSecond: 128_000,
        }),
      transcribe: (blob, mime) => {
        const { model, language, prompt } = optionsRef.current.getOptions();
        return transcribeBlob(blob, mime, { model, language, prompt });
      },
      getMime: () => pickRecordingMime(),
      now: () => Date.now(),
      onText: (text) => optionsRef.current.onText(text),
      onError: (message) => optionsRef.current.onError(message),
      onStream: (stream) => {
        if (stream) startMeter(stream);
        else stopMeter();
      },
      onChange: () => {
        setState(controllerRef.current?.state ?? "idle");
        setElapsedMs(controllerRef.current?.elapsedMs ?? 0);
      },
    });
  }

  useEffect(() => {
    const controller = controllerRef.current;
    return () => {
      controller?.cancel();
      stopMeter();
      if (prewarmTimer.current !== null) {
        window.clearTimeout(prewarmTimer.current);
        prewarmTimer.current = null;
      }
    };
  }, [stopMeter]);

  useEffect(() => {
    if (state === "recording" && prewarmTimer.current !== null) {
      window.clearTimeout(prewarmTimer.current);
      prewarmTimer.current = null;
    }
  }, [state]);

  useEffect(() => {
    if (!enabled) controllerRef.current?.cancel();
  }, [enabled]);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(
      () => setElapsedMs(controllerRef.current?.elapsedMs ?? 0),
      200,
    );
    return () => window.clearInterval(timer);
  }, [state]);

  const toggle = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (controller.state === "recording") void controller.stop();
    else if (controller.state === "idle") void controller.start();
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.cancel();
  }, []);

  const prewarm = useCallback(() => {
    controllerRef.current?.prewarm();
    if (prewarmTimer.current !== null) {
      window.clearTimeout(prewarmTimer.current);
    }
    prewarmTimer.current = window.setTimeout(() => {
      prewarmTimer.current = null;
      controllerRef.current?.releasePrewarm();
    }, 10_000);
  }, []);

  return { state, elapsedMs, level, toggle, cancel, prewarm };
}

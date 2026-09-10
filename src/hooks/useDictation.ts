import { useCallback, useEffect, useRef, useState } from "react";
import { DictationController, type DictationState } from "../lib/dictation";
import { pickRecordingMime, transcribeBlob, type VoiceModel } from "../lib/transcribe";

type Options = {
  enabled: boolean;
  getOptions(): { model: VoiceModel; language?: string; prompt?: string };
  onText(text: string): void;
  onError(message: string): void;
};

export function useDictation({ enabled, getOptions, onText, onError }: Options) {
  const [state, setState] = useState<DictationState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const optionsRef = useRef({ getOptions, onText, onError });
  optionsRef.current = { getOptions, onText, onError };

  const controllerRef = useRef<DictationController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new DictationController({
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      createRecorder: (stream, mime) =>
        mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream),
      transcribe: (blob, mime) => {
        const { model, language, prompt } = optionsRef.current.getOptions();
        return transcribeBlob(blob, mime, { model, language, prompt });
      },
      getMime: () => pickRecordingMime(),
      now: () => Date.now(),
      onText: (text) => optionsRef.current.onText(text),
      onError: (message) => optionsRef.current.onError(message),
      onChange: () => {
        setState(controllerRef.current?.state ?? "idle");
        setElapsedMs(controllerRef.current?.elapsedMs ?? 0);
      },
    });
  }

  useEffect(() => {
    return () => controllerRef.current?.dispose();
  }, []);

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

  return { state, elapsedMs, toggle };
}

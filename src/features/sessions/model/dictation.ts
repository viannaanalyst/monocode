const STOP_TIMEOUT_MS = 5000;
/** Flush encoded audio every second so the tail is never stranded in the
 *  encoder buffer when the recorder stops (WebKit can drop the final chunk). */
const TIMESLICE_MS = 1000;
/** Mono + gain control keeps dictation clean and consistent for the model. */
const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: { channelCount: 1, autoGainControl: true },
};

export type DictationState = "idle" | "recording" | "transcribing";

export interface MediaRecorderLike {
  mimeType: string;
  start(timeslice?: number): void;
  stop(): void;
  addEventListener(type: string, callback: (event: unknown) => void): void;
}

export type DictationDeps = {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createRecorder(stream: MediaStream, mime: string | null): MediaRecorderLike;
  transcribe(blob: Blob, mime: string): Promise<string>;
  now(): number;
  onText(text: string): void;
  onError(message: string): void;
  getMime?: () => string | null;
  onChange?(): void;
  /** Called with the live stream while recording, and null once released. */
  onStream?(stream: MediaStream | null): void;
};

export class DictationController {
  private currentState: DictationState = "idle";
  private recorder: MediaRecorderLike | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private cancelled = false;
  private disposed = false;
  private startToken = 0;
  private pendingStream: MediaStream | null = null;
  private pendingPromise: Promise<MediaStream> | null = null;
  /** The meter was started from a prewarm, so start() must not restart it. */
  private meterFromPrewarm = false;

  constructor(private deps: DictationDeps) {}

  get state(): DictationState {
    return this.currentState;
  }

  get elapsedMs(): number {
    if (this.currentState !== "recording") return 0;
    return Math.max(0, this.deps.now() - this.startedAt);
  }

  private setState(next: DictationState) {
    this.currentState = next;
    this.deps.onChange?.();
  }

  private releaseStream() {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.deps.onStream?.(null);
  }

  /**
   * Ask for the microphone before the user commits, so the OS/hardware warm-up
   * happens during the click instead of eating the first words. Safe to call
   * repeatedly; call `releasePrewarm` if the recording never starts.
   */
  async prewarm(): Promise<void> {
    if (this.currentState !== "idle" || this.disposed || this.pendingPromise) {
      return;
    }
    const promise = this.deps.getUserMedia(AUDIO_CONSTRAINTS);
    this.pendingPromise = promise;
    try {
      const stream = await promise;
      if (this.pendingPromise !== promise || this.disposed) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      this.pendingStream = stream;
      this.deps.onStream?.(stream);
      this.meterFromPrewarm = true;
    } catch {
      if (this.pendingPromise === promise) this.pendingPromise = null;
    }
  }

  releasePrewarm(): void {
    this.pendingPromise = null;
    const stream = this.pendingStream;
    this.pendingStream = null;
    if (this.meterFromPrewarm && this.currentState === "idle") {
      this.meterFromPrewarm = false;
      this.deps.onStream?.(null);
    }
    for (const track of stream?.getTracks() ?? []) track.stop();
  }

  async start(): Promise<void> {
    if (this.currentState !== "idle" || this.disposed) return;
    const token = ++this.startToken;
    try {
      const prewarmed = this.pendingPromise;
      const stream = prewarmed
        ? await prewarmed
        : await this.deps.getUserMedia(AUDIO_CONSTRAINTS);
      this.pendingPromise = null;
      this.pendingStream = null;
      if (this.disposed || token !== this.startToken) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      this.stream = stream;
      this.cancelled = false;
      this.chunks = [];
      const recorder = this.deps.createRecorder(
        stream,
        this.deps.getMime?.() ?? null,
      );
      this.recorder = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        const data = (event as { data?: Blob }).data;
        if (data && data.size > 0) this.chunks.push(data);
      });
      // Start capturing before wiring up the meter: on WebKit, building the
      // AudioContext can lag, and we do not want that delay to drop audio.
      recorder.start(TIMESLICE_MS);
      this.startedAt = this.deps.now();
      if (this.meterFromPrewarm) this.meterFromPrewarm = false;
      else this.deps.onStream?.(stream);
      this.setState("recording");
    } catch (cause) {
      if (this.disposed || token !== this.startToken) return;
      this.releaseStream();
      this.setState("idle");
      this.deps.onError(
        cause instanceof Error ? cause.message : "Could not start recording.",
      );
    }
  }

  private finishRecording(recorder: MediaRecorderLike): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        resolve();
      };
      recorder.addEventListener("stop", settle);
      recorder.addEventListener("error", settle);
      try {
        recorder.stop();
      } catch (cause) {
        reject(cause);
        return;
      }
      if (!settled) timer = setTimeout(settle, STOP_TIMEOUT_MS);
    });
  }

  async stop(): Promise<void> {
    if (this.currentState !== "recording" || !this.recorder) return;
    const token = this.startToken;
    const recorder = this.recorder;
    this.setState("transcribing");

    let failed = false;
    try {
      await this.finishRecording(recorder);
    } catch (cause) {
      failed = true;
      this.deps.onError(
        cause instanceof Error ? cause.message : String(cause),
      );
    }

    // A cancel/start that happened while we awaited `finishRecording` owns the
    // current stream and state now; releasing or transcribing here would kill
    // the new recording.
    if (failed) {
      if (this.cancelled || token !== this.startToken) return;
      this.releaseStream();
      this.setState("idle");
      return;
    }

    if (this.cancelled || token !== this.startToken) return;

    const mime = recorder.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type: mime });
    this.releaseStream();

    try {
      const text = await this.deps.transcribe(blob, mime);
      if (token !== this.startToken) return;
      if (text.trim()) this.deps.onText(text.trim());
      else this.deps.onError("The transcription was empty.");
    } catch (cause) {
      if (token !== this.startToken) return;
      this.deps.onError(
        cause instanceof Error ? cause.message : String(cause),
      );
    } finally {
      if (token === this.startToken) this.setState("idle");
    }
  }

  cancel(): void {
    this.startToken++;
    this.releasePrewarm();
    if (this.currentState === "idle") return;
    this.cancelled = true;
    if (this.currentState === "recording") this.recorder?.stop();
    this.releaseStream();
    this.setState("idle");
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}

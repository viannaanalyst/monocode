export type DictationState = "idle" | "recording" | "transcribing";

export interface MediaRecorderLike {
  mimeType: string;
  start(): void;
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
};

export class DictationController {
  private currentState: DictationState = "idle";
  private recorder: MediaRecorderLike | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private cancelled = false;

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
  }

  async start(): Promise<void> {
    if (this.currentState !== "idle") return;
    try {
      const stream = await this.deps.getUserMedia({ audio: true });
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
      recorder.start();
      this.startedAt = this.deps.now();
      this.setState("recording");
    } catch (cause) {
      this.releaseStream();
      this.setState("idle");
      this.deps.onError(
        cause instanceof Error ? cause.message : "Could not start recording.",
      );
    }
  }

  async stop(): Promise<void> {
    if (this.currentState !== "recording" || !this.recorder) return;
    const recorder = this.recorder;
    this.setState("transcribing");
    const finished = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve());
    });
    recorder.stop();
    await finished;

    const mime = recorder.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type: mime });
    this.releaseStream();

    if (this.cancelled) {
      this.setState("idle");
      return;
    }
    try {
      const text = await this.deps.transcribe(blob, mime);
      if (text.trim()) this.deps.onText(text.trim());
      else this.deps.onError("The transcription was empty.");
    } catch (cause) {
      this.deps.onError(
        cause instanceof Error ? cause.message : String(cause),
      );
    } finally {
      this.setState("idle");
    }
  }

  cancel(): void {
    if (this.currentState === "idle") return;
    this.cancelled = true;
    if (this.currentState === "recording") this.recorder?.stop();
    this.releaseStream();
    this.setState("idle");
  }

  dispose(): void {
    this.cancel();
  }
}

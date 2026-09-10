import { describe, expect, it, vi } from "vitest";
import { DictationController, type MediaRecorderLike } from "./dictation";

function fakeRecorder() {
  const listeners = new Map<string, (event: unknown) => void>();
  const recorder: MediaRecorderLike & { emit(type: string, event?: unknown): void } = {
    mimeType: "audio/mp4",
    start: vi.fn(),
    stop: vi.fn(() => recorder.emit("stop")),
    addEventListener: (type, cb) => listeners.set(type, cb),
    emit: (type, event) => listeners.get(type)?.(event),
  };
  return recorder;
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track] } as unknown as MediaStream;
}

function setup(overrides: Partial<Parameters<typeof DictationController.prototype.constructor>[0]> = {}) {
  const recorder = fakeRecorder();
  const text = vi.fn();
  const error = vi.fn();
  const deps = {
    getUserMedia: vi.fn(async () => fakeStream()),
    createRecorder: vi.fn(() => recorder),
    transcribe: vi.fn(async () => "olá mundo"),
    now: () => 1000,
    onText: text,
    onError: error,
    ...overrides,
  };
  const controller = new DictationController(deps as never);
  return { controller, recorder, deps, text, error };
}

describe("DictationController", () => {
  it("records then transcribes and reports text", async () => {
    const { controller, recorder, text } = setup();
    await controller.start();
    expect(controller.state).toBe("recording");
    expect(recorder.start).toHaveBeenCalledOnce();

    recorder.emit("dataavailable", { data: new Blob(["x"]) });
    await controller.stop();

    expect(controller.state).toBe("idle");
    expect(text).toHaveBeenCalledWith("olá mundo");
  });

  it("reports a microphone failure", async () => {
    const { controller, error } = setup({
      getUserMedia: vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    });
    await controller.start();
    expect(controller.state).toBe("idle");
    expect(error).toHaveBeenCalled();
  });

  it("reports a transcription failure", async () => {
    const { controller, recorder, error } = setup({
      transcribe: vi.fn(async () => {
        throw new Error("MISSING_KEY");
      }),
    });
    await controller.start();
    recorder.emit("dataavailable", { data: new Blob(["x"]) });
    await controller.stop();
    expect(error).toHaveBeenCalledWith("MISSING_KEY");
    expect(controller.state).toBe("idle");
  });

  it("cancel discards the recording without transcribing", async () => {
    const { controller, recorder, deps } = setup();
    await controller.start();
    recorder.emit("dataavailable", { data: new Blob(["x"]) });
    controller.cancel();
    expect(controller.state).toBe("idle");
    expect(deps.transcribe).not.toHaveBeenCalled();
  });

  it("cancel during transcribing, then a new start, does not let the stale stop release the new stream or emit text", async () => {
    const firstTrack = { stop: vi.fn() };
    const firstStream = { getTracks: () => [firstTrack] } as unknown as MediaStream;
    const secondTrack = { stop: vi.fn() };
    const secondStream = { getTracks: () => [secondTrack] } as unknown as MediaStream;
    const firstRecorder = fakeRecorder();
    firstRecorder.stop = vi.fn();
    const secondRecorder = fakeRecorder();
    const createRecorder = vi
      .fn()
      .mockImplementationOnce(() => firstRecorder)
      .mockImplementationOnce(() => secondRecorder);
    const getUserMedia = vi
      .fn()
      .mockImplementationOnce(async () => firstStream)
      .mockImplementationOnce(async () => secondStream);
    const { controller, deps, text } = setup({ createRecorder, getUserMedia });

    await controller.start();
    expect(controller.state).toBe("recording");

    const stopping = controller.stop();
    expect(controller.state).toBe("transcribing");

    controller.cancel();
    await controller.start();
    expect(controller.state).toBe("recording");

    firstRecorder.emit("stop");
    await stopping;

    expect(controller.state).toBe("recording");
    expect(firstTrack.stop).toHaveBeenCalled();
    expect(secondTrack.stop).not.toHaveBeenCalled();
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it("passes the resolved mime type to createRecorder", async () => {
    const { controller, deps } = setup({ getMime: () => "audio/mp4" });
    await controller.start();
    expect(deps.createRecorder).toHaveBeenCalledWith(expect.anything(), "audio/mp4");
  });

  it("cancel during a pending getUserMedia stops the late stream", async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    let resolveStream!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const { controller, recorder, deps } = setup({
      getUserMedia: vi.fn(() => pending),
    });

    const started = controller.start();
    controller.cancel();
    resolveStream(stream);
    await started;

    expect(controller.state).toBe("idle");
    expect(track.stop).toHaveBeenCalled();
    expect(recorder.start).not.toHaveBeenCalled();
    expect(deps.createRecorder).not.toHaveBeenCalled();
  });

  it("dispose during a pending getUserMedia stops the late stream and blocks restart", async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    let resolveStream!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const { controller, deps } = setup({
      getUserMedia: vi.fn(() => pending),
    });

    const started = controller.start();
    controller.dispose();
    resolveStream(stream);
    await started;

    expect(controller.state).toBe("idle");
    expect(track.stop).toHaveBeenCalled();

    await controller.start();
    expect(controller.state).toBe("idle");
    expect(deps.createRecorder).not.toHaveBeenCalled();
  });

  it("can start again after cancelling a pending start", async () => {
    const firstTrack = { stop: vi.fn() };
    const firstStream = { getTracks: () => [firstTrack] } as unknown as MediaStream;
    const secondTrack = { stop: vi.fn() };
    const secondStream = { getTracks: () => [secondTrack] } as unknown as MediaStream;
    let resolveFirst!: (stream: MediaStream) => void;
    const firstPending = new Promise<MediaStream>((resolve) => {
      resolveFirst = resolve;
    });
    const getUserMedia = vi
      .fn()
      .mockImplementationOnce(() => firstPending)
      .mockImplementationOnce(async () => secondStream);
    const { controller, recorder } = setup({ getUserMedia });

    const first = controller.start();
    controller.cancel();
    resolveFirst(firstStream);
    await first;

    await controller.start();
    expect(controller.state).toBe("recording");
    expect(firstTrack.stop).toHaveBeenCalled();
    expect(recorder.start).toHaveBeenCalledOnce();
  });

  it("stop releases tracks even when the recorder never emits stop", async () => {
    vi.useFakeTimers();
    try {
      const track = { stop: vi.fn() };
      const stream = { getTracks: () => [track] } as unknown as MediaStream;
      const recorder: MediaRecorderLike = {
        mimeType: "audio/mp4",
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
      };
      const controller = new DictationController({
        getUserMedia: vi.fn(async () => stream),
        createRecorder: vi.fn(() => recorder),
        transcribe: vi.fn(async () => "olá mundo"),
        now: () => 1000,
        onText: vi.fn(),
        onError: vi.fn(),
      } as never);

      await controller.start();
      const stopping = controller.stop();
      await vi.advanceTimersByTimeAsync(10_000);
      await stopping;

      expect(track.stop).toHaveBeenCalled();
      expect(controller.state).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("prewarm then start reuses one getUserMedia stream", async () => {
    const { controller, deps } = setup();
    await controller.prewarm();
    await controller.start();
    expect(deps.getUserMedia).toHaveBeenCalledOnce();
    expect(controller.state).toBe("recording");
  });

  it("releasePrewarm stops the prewarmed tracks and clears the meter", async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const onStream = vi.fn();
    const controller = new DictationController({
      getUserMedia: vi.fn(async () => stream),
      createRecorder: vi.fn(),
      transcribe: vi.fn(),
      now: () => 1000,
      onText: vi.fn(),
      onError: vi.fn(),
      onStream,
    } as never);

    await controller.prewarm();
    expect(onStream).toHaveBeenCalledWith(stream);
    controller.releasePrewarm();
    expect(track.stop).toHaveBeenCalled();
    expect(onStream).toHaveBeenLastCalledWith(null);
    expect(controller.state).toBe("idle");
  });
});

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

  it("passes the resolved mime type to createRecorder", async () => {
    const { controller, deps } = setup({ getMime: () => "audio/mp4" });
    await controller.start();
    expect(deps.createRecorder).toHaveBeenCalledWith(expect.anything(), "audio/mp4");
  });
});

import { pickRecordingMimeType } from "@/data/recordings";

export interface FinishedRecording {
  bytes: Uint8Array;
  mimeType: string;
  durationMs: number;
}

const CHUNK_MS = 1000;

export class AudioRecorder {
  #stream: MediaStream | null = null;
  #recorder: MediaRecorder | null = null;
  #chunks: Blob[] = [];
  #startedAt = 0;

  get isRecording(): boolean {
    return this.#recorder?.state === "recording";
  }

  async start(deviceId: string | null): Promise<void> {
    this.cancel();
    if (typeof MediaRecorder === "undefined") throw new Error("Este navegador não grava áudio.");
    const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Este navegador não grava áudio em nenhum formato que o app conheça.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    const recorder = new MediaRecorder(stream, { mimeType });
    this.#stream = stream;
    this.#recorder = recorder;
    this.#chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.#chunks.push(event.data);
    };
    recorder.start(CHUNK_MS);
    this.#startedAt = performance.now();
  }

  async stop(): Promise<FinishedRecording | null> {
    const recorder = this.#recorder;
    if (!recorder || recorder.state === "inactive") return null;
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await stopped;
    const durationMs = performance.now() - this.#startedAt;
    const blob = new Blob(this.#chunks, { type: recorder.mimeType });
    this.#release();
    if (blob.size === 0) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type, durationMs };
  }

  cancel(): void {
    if (this.#recorder && this.#recorder.state !== "inactive") this.#recorder.stop();
    this.#release();
  }

  #release(): void {
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
    this.#recorder = null;
    this.#chunks = [];
  }
}

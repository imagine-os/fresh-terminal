/**
 * Microphone level meter built on the Web Audio API. Optional: if anything
 * fails the meter reports 0 and the session carries on.
 */
export class LevelMeter {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frame = 0;
  private data: Uint8Array<ArrayBuffer> | null = null;

  start(stream: MediaStream, onLevel: (level: number) => void): void {
    try {
      this.context = new AudioContext();
      const source = this.context.createMediaStreamSource(stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      const tick = () => {
        if (!this.analyser || !this.data) {
          return;
        }
        this.analyser.getByteTimeDomainData(this.data);
        let sum = 0;
        for (const sample of this.data) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        onLevel(Math.min(1, Math.sqrt(sum / this.data.length) * 3));
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    } catch {
      onLevel(0);
    }
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
    this.data = null;
  }
}

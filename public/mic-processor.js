// Runs on the audio thread. Converts mic audio to 16 kHz, 16-bit PCM
// chunks of about 40 ms and posts them to the main thread.
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.out = new Int16Array(640);
    this.n = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    // Simple decimation with averaging; good enough for speech recognition.
    while (this.pos < ch.length) {
      const start = Math.floor(this.pos);
      const end = Math.min(ch.length, Math.floor(this.pos + this.ratio));
      let sum = 0;
      let count = 0;
      for (let i = start; i < Math.max(end, start + 1); i++) {
        sum += ch[i];
        count++;
      }
      const s = Math.max(-1, Math.min(1, sum / count));
      this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.out.length) {
        this.port.postMessage(this.out.buffer.slice(0));
        this.n = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);

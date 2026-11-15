// Toca o PCM recebido do app desktop (16 bits, 48 kHz, estéreo) com um buffer curto para manter baixa latência.
// Arquivo próprio (e não um blob: montado no app) porque a CSP só deixa carregar worklets do próprio site.
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 48000 * 2;            // 0,5 s estéreo
    this.buf = new Float32Array(this.size);
    this.r = 0; this.w = 0; this.n = 0;
    this.max = 48000 * 2 * 0.12;      // acima de 120 ms acumulados, descarta o excesso
    this.port.onmessage = (e) => this.push(new Int16Array(e.data));
  }
  push(s) {
    for (let i = 0; i < s.length; i++) {
      this.buf[this.w] = s[i] / 32768;
      this.w = (this.w + 1) % this.size;
      if (this.n < this.size) this.n++; else this.r = (this.r + 1) % this.size;
    }
    if (this.n > this.max) {
      const drop = (this.n - 48000 * 2 * 0.04) & ~1;
      this.r = (this.r + drop) % this.size;
      this.n -= drop;
    }
  }
  process(_inputs, outputs) {
    const l = outputs[0][0], r = outputs[0][1] || outputs[0][0];
    for (let i = 0; i < l.length; i++) {
      if (this.n >= 2) {
        l[i] = this.buf[this.r]; r[i] = this.buf[(this.r + 1) % this.size];
        this.r = (this.r + 2) % this.size; this.n -= 2;
      } else { l[i] = 0; r[i] = 0; }
    }
    return true;
  }
}
registerProcessor('concord-pcm-player', PcmPlayer);

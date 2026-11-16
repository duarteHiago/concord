// Portão de ruído (ver voiceEffects.ts): fecha o microfone quando a pessoa não está falando.
// Arquivo próprio (e não um blob:/data: montado no app) porque a CSP só deixa carregar worklets do próprio site.
class ConcordGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mode = 'auto'; this.threshold = -50; this.dead = false;
    this.floor = -60; this.open = false; this.hold = 0; this.gain = 0;
    this.delay = new Float32Array(Math.round(sampleRate * 0.025)); this.w = 0;
    this.above = 0; this.needAbove = Math.round(sampleRate * 0.02 / 128);
    this.energies = new Float32Array(8); this.ei = 0;
    this.attack = 1 - Math.exp(-1 / (sampleRate * 0.002));
    this.release = 1 - Math.exp(-1 / (sampleRate * 0.25));
    // segura aberto 450 ms: cobre a pausa entre palavras (antes cortava no meio da frase)
    this.holdSamples = Math.round(sampleRate * 0.45);
    // fechado = -40 dB, não silêncio absoluto: soa como "abaixar", não como corte
    this.closedGain = 0.01;
    this.report = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'destroy') { this.dead = true; return; }
      if (e.data.mode) this.mode = e.data.mode;
      if (typeof e.data.threshold === 'number') this.threshold = e.data.threshold;
    };
  }
  process(inputs, outputs) {
    if (this.dead) return false;
    const input = inputs[0] && inputs[0][0];
    const out = outputs[0];
    if (!input) return true;
    let e = 0;
    for (let i = 0; i < input.length; i++) e += input[i] * input[i];
    const block = 10 * Math.log10(e / input.length + 1e-12);
    this.energies[this.ei] = e / input.length;
    this.ei = (this.ei + 1) % this.energies.length;
    let avg = 0;
    for (let i = 0; i < this.energies.length; i++) avg += this.energies[i];
    const level = 10 * Math.log10(avg / this.energies.length + 1e-12);
    // ruído de fundo: desce rápido, sobe devagar (~5 dB/s)
    if (level < this.floor) this.floor += (level - this.floor) * 0.1;
    else this.floor += 0.015;
    this.floor = Math.min(-25, Math.max(-90, this.floor));
    const thr = this.mode === 'manual' ? this.threshold : Math.max(this.floor + 14, -62);
    // conta blocos seguidos acima do limite (som que dura); estalo curto zera a contagem
    this.above = block > thr ? this.above + 1 : 0;
    const voice = this.open ? level > thr : this.above >= this.needAbove;
    if (this.mode === 'off' || voice) {
      this.open = true;
      this.hold = this.holdSamples;
    } else if (this.hold > 0) this.hold -= input.length;
    else this.open = false;
    const target = this.open ? 1 : this.closedGain;
    for (let i = 0; i < input.length; i++) {
      const delayed = this.delay[this.w];
      this.delay[this.w] = input[i];
      this.w = (this.w + 1) % this.delay.length;
      this.gain += (target - this.gain) * (target > this.gain ? this.attack : this.release);
      const v = delayed * this.gain;
      for (let c = 0; c < out.length; c++) out[c][i] = v;
    }
    this.report += input.length;
    if (this.report >= sampleRate * 0.05) {
      this.report = 0;
      this.port.postMessage({ level, threshold: thr, open: this.open });
    }
    return true;
  }
}
registerProcessor('concord-gate', ConcordGate);

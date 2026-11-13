// Medidor de nível (dBFS, média de ~200 ms) de um ponto da cadeia do microfone. Dois deles, um na entrada crua
// e um na saída processada, são o que deixa o vigia perceber "entra som, não sai nada" e remontar a cadeia.
// Manda a leitura a cada 100 ms, e passa o som adiante sem mexer (dá para ligar no meio da cadeia).
// Sem import/export e sem TypeScript: vai como está para o navegador. Testado em Node (client/test).
class ConcordMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.alpha = 1 - Math.exp(-128 / (sampleRate * 0.2));
    this.energy = 0;
    this.peak = 0;
    this.since = 0;
    this.every = Math.round(sampleRate * 0.1);
    this.dead = false;
    this.port.onmessage = (e) => {
      if (e.data === 'destroy') this.dead = true;
    };
  }

  process(inputs, outputs) {
    if (this.dead) return false;
    const input = inputs[0] && inputs[0][0];
    const out = outputs[0];
    if (!input) {
      // nó sem entrada ligada (ex.: faixa parou): é silêncio na hora, para o vigia ver
      this.energy = 0;
      this.since += 128;
    } else {
      let e = 0;
      let peak = this.peak;
      for (let i = 0; i < input.length; i++) {
        const v = input[i];
        e += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      this.peak = peak;
      this.energy += (e / input.length - this.energy) * this.alpha;
      for (let c = 0; c < out.length; c++) out[c].set(input);
      this.since += input.length;
    }
    if (this.since >= this.every) {
      this.since = 0;
      this.port.postMessage({ db: 10 * Math.log10(this.energy + 1e-12), peak: this.peak });
      this.peak = 0;
    }
    return true;
  }
}
registerProcessor('concord-meter', ConcordMeter);

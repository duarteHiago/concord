// Mono sem cancelar a voz. Antes o microfone estéreo virava mono somando esquerdo + direito: com um canal em
// oposição de fase (acontece em fones e placas USB com fiação trocada) a soma cancela e a voz some; com um canal
// morto, a voz chega pela metade. Aqui o processador mede os dois canais e escolhe: parecidos → média; em
// oposição de fase → soma com o segundo canal invertido; um canal vazio → só o outro. A decisão é suavizada
// (meia vida de ~100 ms) para não "piscar" entre modos. Quem chega em mono passa direto.
// Sem import/export e sem TypeScript: vai como está para o navegador. Testado em Node (client/test).
class ConcordMono extends AudioWorkletProcessor {
  constructor() {
    super();
    // correlação e energias com memória curta (coeficiente para blocos de 128 amostras)
    this.alpha = 1 - Math.exp(-128 / (sampleRate * 0.1));
    this.ll = 0;
    this.rr = 0;
    this.lr = 0;
    this.sign = 1; // +1 soma, -1 soma com o direito invertido
    this.mode = 'avg'; // 'avg' | 'left' | 'right' | 'inv'
    this.report = 0;
  }

  decide() {
    const ll = this.ll;
    const rr = this.rr;
    const floor = 1e-10; // -100 dBFS: abaixo disso o canal está vazio
    if (ll < floor && rr < floor) return 'avg';
    // um canal 30 dB abaixo do outro: usa só o mais forte
    if (rr < ll * 1e-3) return 'left';
    if (ll < rr * 1e-3) return 'right';
    const corr = this.lr / Math.sqrt(ll * rr + 1e-20);
    if (corr < -0.5) return 'inv';
    if (corr > -0.2) return 'avg';
    return this.mode; // zona morta: mantém o que estava
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const out = outputs[0] && outputs[0][0];
    if (!input || !input.length || !out) return true;
    const L = input[0];
    const R = input[1];
    if (!R) {
      out.set(L);
      return true;
    }
    let ll = 0;
    let rr = 0;
    let lr = 0;
    for (let i = 0; i < L.length; i++) {
      ll += L[i] * L[i];
      rr += R[i] * R[i];
      lr += L[i] * R[i];
    }
    const n = L.length;
    this.ll += (ll / n - this.ll) * this.alpha;
    this.rr += (rr / n - this.rr) * this.alpha;
    this.lr += (lr / n - this.lr) * this.alpha;
    const next = this.decide();
    if (next !== this.mode) {
      this.mode = next;
      this.port.postMessage({ mode: next });
    }
    switch (this.mode) {
      case 'left':
        out.set(L);
        break;
      case 'right':
        out.set(R);
        break;
      case 'inv':
        for (let i = 0; i < n; i++) out[i] = (L[i] - R[i]) * 0.5;
        break;
      default:
        for (let i = 0; i < n; i++) out[i] = (L[i] + R[i]) * 0.5;
    }
    return true;
  }
}
registerProcessor('concord-mono', ConcordMono);

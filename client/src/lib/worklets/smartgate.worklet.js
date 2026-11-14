// Portão guiado pela IA. O portão comum decide por volume; este decide pelo que a supressão de ruído fez com o
// som: entrada 0 é o som já limpo (o que passa adiante), entrada 1 é o som cru de antes da IA. Quando a IA
// deixou passar quase tudo (saída perto da entrada), é voz; quando ela tirou quase tudo, é ruído e o portão
// fecha. Isso usa a rede neural como detector de voz, sem outro modelo. Mesmos cuidados do portão comum:
// atraso de 25 ms para não comer o começo das palavras, segura aberto 450 ms, fechado = -40 dB (não corte seco).
// Manda nível/limiar/aberto como o portão comum, para o medidor das Configurações continuar funcionando.
// Sem import/export e sem TypeScript: vai como está para o navegador. Testado em Node (client/test).
class ConcordSmartGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.dead = false;
    this.open = false;
    this.hold = 0;
    this.gain = 0;
    this.delay = new Float32Array(Math.round(sampleRate * 0.025));
    this.w = 0;
    this.attack = 1 - Math.exp(-1 / (sampleRate * 0.002));
    this.release = 1 - Math.exp(-1 / (sampleRate * 0.25));
    this.holdSamples = Math.round(sampleRate * 0.45);
    this.closedGain = 0.01;
    // quanto a IA pode ter tirado e ainda ser voz (dB); abaixo do piso absoluto nunca abre
    this.keepDb = -8;
    this.minDb = -65;
    this.above = 0;
    this.needAbove = Math.round((sampleRate * 0.02) / 128);
    this.alpha = 1 - Math.exp(-128 / (sampleRate * 0.03));
    this.cleanE = 0;
    this.rawE = 0;
    this.report = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'destroy') this.dead = true;
      else if (e.data && typeof e.data.keepDb === 'number') this.keepDb = e.data.keepDb;
    };
  }

  process(inputs, outputs) {
    if (this.dead) return false;
    const clean = inputs[0] && inputs[0][0];
    const raw = inputs[1] && inputs[1][0];
    const out = outputs[0];
    if (!clean) return true;
    let ce = 0;
    let re = 0;
    for (let i = 0; i < clean.length; i++) ce += clean[i] * clean[i];
    if (raw) for (let i = 0; i < raw.length; i++) re += raw[i] * raw[i];
    this.cleanE += (ce / clean.length - this.cleanE) * this.alpha;
    this.rawE += ((raw ? re / raw.length : ce / clean.length) - this.rawE) * this.alpha;
    const level = 10 * Math.log10(this.cleanE + 1e-12);
    const kept = 10 * Math.log10((this.cleanE + 1e-12) / (this.rawE + 1e-12)); // 0 = IA não tirou nada
    const voiceNow = kept > this.keepDb && level > this.minDb;
    this.above = voiceNow ? this.above + 1 : 0;
    const voice = this.open ? voiceNow : this.above >= this.needAbove;
    if (voice) {
      this.open = true;
      this.hold = this.holdSamples;
    } else if (this.hold > 0) this.hold -= clean.length;
    else this.open = false;
    const target = this.open ? 1 : this.closedGain;
    for (let i = 0; i < clean.length; i++) {
      const delayed = this.delay[this.w];
      this.delay[this.w] = clean[i];
      this.w = (this.w + 1) % this.delay.length;
      this.gain += (target - this.gain) * (target > this.gain ? this.attack : this.release);
      const v = delayed * this.gain;
      for (let c = 0; c < out.length; c++) out[c][i] = v;
    }
    this.report += clean.length;
    if (this.report >= sampleRate * 0.05) {
      this.report = 0;
      this.port.postMessage({ level, threshold: this.minDb, open: this.open, kept });
    }
    return true;
  }
}
registerProcessor('concord-smartgate', ConcordSmartGate);

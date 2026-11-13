# Bancada da supressão de ruído

Mede os modelos que o Concord usa no microfone (DeepFilterNet3, GTCRN, RNNoise) sobre voz + ruído conhecidos, com
a voz limpa como referência. Roda **o mesmo código do app**: os arquivos de worklet e wasm de `client/`, sem
reimplementação. Nada daqui vai para o bundle do app nem para o servidor.

```sh
cd tools/denoise-bench
npm install          # @sapphi-red/web-noise-suppressor (GTCRN/RNNoise); playwright é opcional (modo browser)
npm run data         # monta data/: voz limpa, ruídos sintéticos, misturas em 0/5/10/20 dB
npm run bench        # roda off, rnnoise, gtcrn, dfn em Node e imprime a tabela
node bench.mjs --modes dfn --strength 60 --filter teclado
node bench.mjs --long 600 --modes dfn      # 10 min contínuos procurando buracos (saída muda)
```

## Material

- **Voz limpa** (`data/clean/*.wav`): o ideal são gravações reais em pt-BR, com consentimento de quem gravou, em
  silêncio, qualquer taxa (é reamostrado para 48 kHz). Sem nada lá, `npm run data` gera frases com a voz do
  Windows (TTS): serve para regressão e para comparar modelos, **não** para julgar qualidade final.
  Datasets públicos possíveis: Multilingual LibriSpeech português (OpenSLR 94, CC BY 4.0, ~2,8 GB em opus),
  Common Voice pt (precisa de conta Mozilla). Não suba áudio no git.
- **Ruídos** (`data/noise/*.wav`): gravações reais de teclado, ventilador, TV, rua, outras vozes. Os sintéticos
  de `lib/synth.mjs` (rosa = ventilador, zumbido 60 Hz, teclado por estalos, branco) entram sempre.

## Métricas (`lib/metrics.mjs`)

Com a referência limpa dá para medir o que dói de verdade, melhor do que uma nota cega:

| coluna | o que é | bom |
|---|---|---|
| SI-SDR entra→sai | relação sinal-distorção invariante a escala, só nos quadros de fala, antes e depois | subir |
| ruído tirado | energia nas pausas antes ÷ depois (dB) | alto |
| resto nas pausas | energia que sobra nas pausas (dBFS) | baixo (−70 ou menos) |
| fala cortada | % dos quadros de fala em que a saída caiu mais de 10 dB do esperado | < 1 % |
| ganho na fala | ganho mediano aplicado à fala (dB); muito negativo = abafou | perto de 0 |
| atraso | atraso do processamento, por correlação de envelopes | < 30 ms |
| buracos | trechos de mais de 300 ms de silêncio absoluto com som entrando | 0 |
| RTF | tempo de processamento ÷ duração do áudio (numa thread livre) | < 0,3 |

Pendente: DNSMOS P.835 (modelo ONNX do DNS-Challenge, MIT) para notas sem referência; WER com Whisper local.

## Modos

- **node** (padrão): processadores de worklet rodando em Node com os wasm de produção. Rápido, roda no CI. Sem
  portão de voz e sem nivelador.
- **browser** (`--engine browser`, precisa de `playwright`): abre o Chromium headless, sobe o Vite do cliente e
  renderiza a **cadeia inteira** do app (`Chain` de `voiceEffects.ts`) num `OfflineAudioContext`. É o modo para
  medir o que a pessoa de fato ouve e para testar o portão e o nivelador.

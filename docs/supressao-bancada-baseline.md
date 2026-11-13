# Supressão de ruído: linha de base da bancada (Etapa 1)

Primeira rodada de `tools/denoise-bench` em 2026-11-13, modo Node (worklets e wasm de produção, sem portão nem
nivelador), força do DFN3 = 45 dB (padrão do app). **Voz: TTS do Windows em inglês** (não havia voz pt-BR
instalada), 8 frases, 4 ruídos sintéticos, SNR 0/5/10/20 dB, 128 misturas. Serve para comparar modelos entre si e
pegar regressões; **não** é a palavra final sobre qualidade (voz sintética, ruídos sintéticos). Média por ruído:

| modelo | ruído | SI-SDR entra→sai (dB) | ruído tirado (dB) | resto nas pausas (dBFS) | fala cortada (%) | ganho na fala (dB) | atraso (ms) | buracos | RTF |
|---|---|---|---|---|---|---|---|---|---|
| off | ventilador | 8,7 → 8,7 | 0,0 | −29,2 | 0,0 | 1,5 | 0 | 0 | 0,000 |
| rnnoise | ventilador | 8,7 → 8,1 | 26,5 | −55,6 | 4,4 | −0,7 | 20 | 0 | 0,010 |
| rnnoise | zumbido | 8,7 → 7,5 | 12,3 | −41,5 | 0,5 | 0,2 | 20 | **2** | 0,010 |
| rnnoise | teclado | 9,6 → 8,9 | 8,0 | −37,4 | 0,1 | −0,2 | 20 | 0 | 0,010 |
| rnnoise | branco | 8,8 → 9,3 | 23,4 | −52,6 | 4,5 | −0,4 | 20 | 0 | 0,010 |
| gtcrn | ventilador | 8,7 → 12,9 | 17,6 | −46,8 | 1,5 | −1,2 | 31 | 0 | 0,028 |
| gtcrn | zumbido | 8,7 → 17,0 | 25,6 | −54,7 | 0,2 | −0,5 | 31 | 0 | 0,028 |
| gtcrn | teclado | 9,6 → 23,0 | 32,2 | −61,6 | 1,7 | −0,0 | 31 | 0 | 0,028 |
| gtcrn | branco | 8,8 → 19,7 | 28,2 | −57,4 | 3,4 | −0,1 | 31 | 0 | 0,028 |
| dfn | ventilador | 8,7 → 11,2 | 19,6 | −48,8 | 4,9 | −1,3 | 40 | 0 | 0,039 |
| dfn | zumbido | 8,7 → 10,4 | 27,2 | −56,4 | 4,5 | −1,3 | 40 | 0 | 0,039 |
| dfn | teclado | 9,6 → 8,2 | 34,1 | −63,5 | 8,9 | −0,5 | 40 | 0 | 0,039 |
| dfn | branco | 8,8 → 16,4 | 42,5 | −71,7 | 12,9 | −0,9 | 40 | 0 | 0,039 |

Estabilidade: 300 s contínuos de ruído rosa no DFN3 em Node, 0 buracos, 0 erros do worklet, RTF 0,027.

## O que a primeira rodada diz

- **GTCRN é o melhor em qualidade de voz neste material** (SI-SDR mais alto e menos fala cortada), o que bate
  com a decisão de outubro de torná-lo padrão. **DFN3 tira mais ruído** (até 42 dB no branco, −72 dBFS nas
  pausas), mas **corta mais fala** em SNR baixo (8,9 % no teclado, 12,9 % no branco, média de 0 a 20 dB). É o
  "som seco" que as pessoas descrevem. Candidato óbvio para a Etapa 4: força automática pelo SNR.
- **RNNoise mal mexe no teclado** (8 dB) e **produziu 2 buracos** (> 300 ms de silêncio absoluto com som
  entrando) no zumbido de 60 Hz. É a "IA básica"; pouco usada, mas o buraco é um dado a mais para o vigia.
- Atrasos: 20 / 31 / 40 ms (RNNoise / GTCRN / DFN3), antes do portão (que soma 25 ms) e do codec.
- Custo numa thread livre: todos abaixo de 0,04 do tempo real. O que falta medir é a thread de áudio do
  navegador com jogo aberto (modo browser da bancada + `--long`, no PC do usuário).

## Próximas rodadas

1. Voz real em pt-BR (gravações do usuário ou MLS português) e ruídos gravados (teclado mecânico de verdade,
   ventilador, TV com fala) em `data/clean` e `data/noise`.
2. Modo browser (`--engine browser`) para incluir portão e nivelador, e comparar portão por energia vs VAD.
3. Varrer a força do DFN3 (20, 30, 45, 60, 100) por SNR para desenhar o modo automático.
4. Candidatos da Etapa 3 (TEN VAD no portão, CoFi-Lite/UL-UNAS, ai-coustics WASM) pelo mesmo roteiro.

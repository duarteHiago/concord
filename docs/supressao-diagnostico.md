# Supressão de ruído: diagnóstico (Etapa 0 do plano)

Resultado da primeira etapa de [plano-supressao-de-ruido.md](plano-supressao-de-ruido.md), em 2026-11-13.
Cada hipótese do plano recebeu um veredito a partir do código da `main`, do código dos pacotes usados e de testes
em Node com o modelo de produção. **Nada foi reproduzido ainda com microfone de verdade**: isso fica para o
Concord de testes e para o PC do usuário.

## Vereditos

| # | Hipótese | Veredito | Como se viu |
|---|----------|----------|-------------|
| A1 | DFN cai para GTCRN em silêncio e a tela continua dizendo "IA máxima" | **Confirmada** | `noiseNode()` trocava para GTCRN com um toast passageiro e `dfnCooldownUntil` só em memória; `audioSettings.noiseMode` não mudava e nada mostrava o modelo ativo. |
| A1b | O worklet do DFN pode "ligar" sem o modelo e passar o som cru | **Confirmada (nova)** | No pacote `deepfilternet3-noise-filter` 1.3.0, se `df_create` falha o construtor só faz `console.error` e `process()` entra em *passthrough*: a pessoa acha que está com supressão e não está. Nenhuma mensagem chegava à thread principal. |
| A1c | O modelo pode chegar "aberto" e o DFN falhar na carga | **Confirmada (nova, vista na bancada em Chromium)** | Servidores que mandam o `.tar.gz` com `Content-Encoding: gzip` (o Vite em desenvolvimento; proxies podem fazer o mesmo) entregam o tar já descomprimido; o wasm falha com `unreachable` e o app cai para o GTCRN. O carregador agora confere o cabeçalho gzip e recomprime no navegador se precisar. |
| A2 | Os 24 MB do DFN não ficam em cache | **Confirmada** | `globPatterns` e `runtimeCaching` do PWA não cobriam `/vendor/`; o Express manda `immutable, 365d`, mas o commit `41c0713` registrou `cf-cache-status: DYNAMIC` no `.wasm` na Cloudflare. |
| A3 | Processamento fora do Concord (Realtek, VoiceMeeter, Bluetooth) | Não verificável no código | Precisa do PC do usuário. O diagnóstico novo (`health`) vai mostrar o estado do contexto e os níveis. |
| A4 | CPU com jogo aberto | Não medida | O DFN em Node processa 3 s em 0,15 s (fator de tempo real 0,05) numa thread livre; o que interessa é a thread de áudio disputada, que só a bancada no navegador mede. |
| A5 | Migrações de configuração trocaram o modo de quem tinha o antigo | Confirmada e intencional | `loadAudioSettings` v2 (2026-10) moveu DFN/RNNoise para GTCRN uma vez. Não é recorrente. |
| B1 | `AudioContext` suspenso sem ninguém saber | **Confirmada** | `sharedContext` sem `statechange`; `init` tentava `resume()` uma vez e engolia o erro. |
| B2 | Nada vigia a faixa nem a saída | **Confirmada** | Nenhum ouvinte de `ended`/`mute`; nenhuma comparação entrada/saída. O LiveKit reinicia a faixa quando ela acaba, mas se a cadeia estiver quebrada o reinício remonta a mesma cadeia quebrada. |
| B2b | Erro dentro do worklet deixa o microfone mudo até sair da sala | **Confirmada (nova, a mais grave)** | `process()` do worklet do DFN chama `df_process_frame` sem `try/catch`. Um erro dentro de `process()` de um AudioWorkletProcessor dispara `processorerror` e o nó passa a emitir **silêncio para sempre**. Não havia `onprocessorerror` em nenhum nó. Casos que disparam: memória do wasm esgotada, frame inválido depois de um reinício do dispositivo. |
| B3 | Mono por soma cancela canal em oposição de fase | **Confirmada** | `channelInterpretation = 'speakers'` com `channelCount = 1` = (L+R)/2. Além disso `enableMic` pedia `channelCount: 1` ao navegador, que já somava os canais antes de chegar ao processador. Teste em Node: fase invertida → -∞ dB na soma; com o worklet novo, nível cheio. |
| B4 | Corridas entre montagens | **Confirmada** | `restart()` fazia `destroy()`+`init()` sem fila; `setAudioSettings` fazia `enableMic(false)`/`enableMic(true)` concorrendo com `toggleMic`; `currentGate` global apontava para o último criado. O teste de microfone chamava `rebuild()` a cada mudança de slider sem esperar o anterior. |
| B5 | DTX engole voz baixa | Não verificada | Fica para a bancada no navegador (precisa do Opus de verdade). |
| B6 | AEC do navegador engole voz na dupla fala | Não verificada | Idem; depende de hardware. |
| B7 | Vazamento de nós do DFN | **Confirmada** | O worklet do pacote não tratava `destroy` e `process()` devolvia `true` sempre: cada reinício do microfone e cada mexida no slider do teste deixava um modelo de 16 MB vivo. Em Node, o processador novo devolve `false` depois de `destroy`. |

## O que mudou no código (PR desta etapa, só no Concord de testes)

- **Worklet do DeepFilterNet3 vendido para dentro do projeto** (`client/src/lib/worklets/deepfilter.worklet.js`,
  MIT/Apache-2.0): avisa `ready`/`error`, aceita `destroy`, e um erro no processamento vira *passthrough* + aviso
  em vez de silêncio permanente. O pacote npm `deepfilternet3-noise-filter` saiu das dependências; o wasm e o
  modelo continuam em `public/vendor/deepfilternet3`.
- **Mono seguro contra fase** (`mono.worklet.js`): mede correlação e energia dos canais; fase invertida soma
  com o canal invertido, canal morto é ignorado. `enableMic` não pede mais `channelCount: 1` ao navegador.
- **Vigia**: dois medidores (`meter.worklet.js`) na entrada e na saída; voz entrando por 4 s sem nada saindo (50 dB
  abaixo, com o portão aberto) remonta a cadeia; `onprocessorerror` em todo worklet; `statechange` do contexto
  com retomada no próximo clique; no máximo 3 remontagens por minuto, depois pede para religar o microfone.
- **Fila única** (`Queue`) para montar/desmontar/remontar; `enableMic` também em fila; o destino
  (`MediaStreamAudioDestinationNode`) é um só por processador, então remontar por dentro não troca a faixa publicada.
- **Estado honesto**: `activeNoise` no store, evento `active` com `{ wanted, active, reason }`; Configurações, o
  menu do microfone e o teste de microfone mostram "valendo agora: ..." quando difere do escolhido. O modo
  desenvolvedor e a gravação de diagnóstico levam `getVoiceHealth()` (modelo ativo, estado do contexto, nível
  entrada→saída, modo mono, remontagens, último erro).
- **Cache**: `runtimeCaching` CacheFirst para `/vendor/*` no service worker; download do wasm/modelo com 3
  tentativas. A regra de cache da Cloudflare continua pendente (painel).
- **Testes em Node** (`client/test`, `npm test`, no CI): mono (igual, fase invertida, canal morto, já mono),
  medidor (nível, destroy, sem entrada), DeepFilterNet3 com o wasm e o modelo de produção (ready, processa sem
  emudecer, ruído branco cai mais de 20 dB, destroy, modelo inválido avisa erro).

## Ainda não verificado (precisa de gente e hardware)

- A3, A4, B5, B6 (acima).
- Se a captura em estéreo sem `channelCount: 1` muda algo no AEC/AGC do Chrome com fones Bluetooth.
- O comportamento real do vigia numa chamada longa (falsos positivos: por exemplo, efeito "robô" com o
  oscilador a 55 Hz tem saída, mas um efeito futuro que silencie de propósito precisaria avisar o vigia).
- Leitura dos diagnósticos já enviados à produção (`/admin`): o acesso à VPS de produção foi barrado pela
  política de permissões desta sessão; fica para o usuário rodar ou liberar.

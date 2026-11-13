# Plano: supressão de ruído de primeira linha no Concord

> **Andamento (2026-11-13):** Etapas 0 a 3 executadas no PR #145 (branch `feat/noise-robustness`, no ar só no
> Concord de testes). Resultados: [supressao-diagnostico.md](supressao-diagnostico.md) (vereditos),
> [supressao-bancada-baseline.md](supressao-bancada-baseline.md) (primeira medição) e
> [supressao-estado-da-arte.md](supressao-estado-da-arte.md) (concorrentes e candidatos). Bancada em
> `tools/denoise-bench`. Faltam as Etapas 4 e 5 e os pontos que dependem do usuário (abaixo).

Para quem for executar (Fable): este plano parte do código como está em 2026-11-13 na `main`. As hipóteses
abaixo vêm da leitura do código, **nenhuma foi reproduzida ainda**. A primeira etapa é provar ou derrubar cada uma.
Regras do projeto em `CLAUDE.md` valem para tudo (nota de Novidades ou rótulo `sem-novidade`, Conventional Commits
em inglês, commits assinados, squash merge, atualizar `client/public/privacidade/` se guardar dado novo).

## Objetivo

1. **Consistência:** a supressão soa igual todo dia, e o que a pessoa escolheu nas Configurações é o que está
   valendo, ou a tela diz o que está valendo de fato.
2. **Áudio nunca some:** se a voz parar de sair com o microfone ligado, o app percebe e se conserta sozinho.
3. **Qualidade:** separar bem voz de ruído (teclado, ventilador, TV, outras vozes, música, respiração) sem
   abafar nem cortar a fala. Meta: igualar ou passar Krisp, NVIDIA Broadcast, Discord e Meet nos mesmos testes.

## Como está hoje (resumo)

- Cadeia em [voiceEffects.ts](../client/src/lib/voiceEffects.ts), como processador do LiveKit:
  mono → IA (`gtcrn` padrão, `dfn` DeepFilterNet3, `rnnoise`, `browser`, `off`) → portão de voz (desligado por padrão)
  → nivelador (compressor) → efeito de voz. `AudioContext` compartilhado a 48 kHz.
- Escolha e migrações em [voice.ts](../client/src/store/voice.ts) (`audioSettings`, `loadAudioSettings`,
  `enableMic`, `applyCurrentEffect`). Teste de microfone em `startMicTest` e em `SettingsSections.tsx`.
- LiveKit publica com `dtx: true, red: true`. Echo cancellation do navegador fica sempre ligado por padrão.
- Os pesos do DeepFilterNet3 (24 MB, wasm de 16 MB) ficam em `client/public/vendor/deepfilternet3`.
- Já existem: medidor de nível, `devStats` (inclui `noiseFallback`), gravação de diagnóstico para o `/admin`.
- **Não existe** nenhum benchmark no repositório. Os números citados nos comentários ("-77 dB", "1,3% da fala
  cortada") foram medidos à mão e não dá para repetir.

## Hipóteses a verificar

### A. "A supressão muda de um dia para o outro"
1. **Queda silenciosa DFN → GTCRN.** O wasm do DFN3 sai do servidor sem cache de borda (commit `41c0713`). Se falha,
   cai para o GTCRN por 5 min (`dfnCooldownUntil`, só em memória), com um toast que passa. A Configuração continua
   dizendo "IA máxima". Dia de rede boa = DFN, dia ruim = GTCRN.
2. **Cache.** `globPatterns` do PWA não inclui `.wasm`/modelos, então nada disso fica em cache do service worker.
   Conferir os cabeçalhos de `/vendor/*` no Caddy e no Cloudflare.
3. **Processamento fora do Concord:** Realtek/Nahimic "melhorias de áudio", VoiceMeeter, fone Bluetooth trocando
   entre A2DP e HFP (a taxa muda quando o microfone abre), AEC do navegador reagindo a fone vs caixa de som.
4. **CPU.** Com jogo aberto, o worklet pode perder prazo (picotar). Nunca foi medido.
5. As migrações em `loadAudioSettings` (versão 2) trocaram modo e intensidade de quem tinha as configurações antigas.

### B. "O áudio some"
1. **`AudioContext` suspenso.** `sharedContext` nasce fora de um clique; `init` tenta `resume()` uma vez e engole o erro.
   Não há ouvinte de `statechange`.
2. **Sem vigia.** Nada observa `ended`/`mute` da faixa de entrada nem da `processedTrack`, nem `devicechange`.
   Trocou de dispositivo ou o driver reiniciou: o app publica silêncio e ninguém percebe.
3. **Mono por soma (L+R).** `channelInterpretation = 'speakers'` soma os canais. Microfone estéreo com um canal
   invertido em fase some inteiro. Fones/placas USB estéreo são justamente os casos que a nota do código cita.
4. **Corridas.** `setAudioSettings` faz `enableMic(false)`/`enableMic(true)` e `restart()` faz `destroy()`+`init()`
   sem fila; `currentGate` é global. Duas trocas rápidas podem deixar um grafo meio montado.
5. **DTX.** `dtx: true` pode tratar voz baixa pós-IA como silêncio. Testar com dtx desligado.
6. **AEC** do navegador engolindo a voz quando outra pessoa fala alto na caixa de som (dupla fala).
7. Possível vazamento: o nó do DFN não tem `destroy` em `VoiceProcessor.destroy()` (o GTCRN tem). Conferir.

### C. Qualidade de separar voz e ruído
- GTCRN e RNNoise são pequenos e tratam bem ruído estacionário, mas vão mal em ruído não estacionário, TV/outras
  vozes e teclado junto com a fala. DFN3 é melhor, mas deixa a voz "seca".
- O portão é por energia (sem VAD de verdade): por isso cortava fala e foi desligado.
- Nada identifica **quem** está falando (outras pessoas no cômodo passam).
- Tudo roda no navegador (WASM). Modelos maiores pedem Worker/WebGPU, ou o caminho nativo no app desktop.

## Etapas

Cada etapa vira um ou mais PRs pequenos. **Tudo só no Concord de testes (teste.yaatoro.com) até o usuário pedir merge
na `main`.** Merge na `main` faz deploy em produção; perguntar antes.

### Etapa 0: Reproduzir e medir o que já acontece (sem mudar comportamento)
- Ler os diagnósticos já enviados ao `/admin` (`server/src/diagnostics.ts`) procurando `noiseFallback` e nível de
  microfone zerado com `micOn`. Quantificar a hipótese A1.
- Adicionar telemetria local mínima ao `devStats`: modo **efetivo** da IA, estado do `AudioContext`, nível de
  entrada vs nível de saída do processador, contagem de reinícios do processador. Só números, nunca áudio.
- Reproduzir B1 a B6 em Chrome e no app (Electron 44), com microfone estéreo invertido simulado e dispositivo
  trocado no meio da chamada. Registrar o que de fato some.
- Saída: `docs/supressao-diagnostico.md` com cada hipótese como confirmada, derrubada ou "precisa do PC do usuário".

### Etapa 1: Bancada de testes repetível
Pasta nova `tools/denoise-bench/` (fora do bundle do app), rodável localmente e no CI.
- **Rodar o mesmo código do app**: página de teste em Chrome headless (Playwright) alimentando o `VoiceProcessor`
  real com arquivos de áudio (`--use-file-for-fake-audio-capture`), gravando a saída. Nada de reimplementar em Python.
- **Material:** fala limpa em pt-BR (gravações do próprio usuário, com consentimento; ou datasets públicos com a
  licença conferida) + ruídos públicos (DNS Challenge, MUSAN, FSD50K/ESC-50: teclado, mouse, ventilador, TV, música,
  tosse, respiração) misturados de -5 a 20 dB de SNR, com e sem reverberação. Guardar só o roteiro de geração e os
  nomes dos datasets, não os arquivos pesados no git.
- **Métricas:**
  - qualidade: DNSMOS P.835 (SIG/BAK/OVRL), SI-SDR, PESQ/STOI, ViSQOL;
  - o que dói de verdade: % de fala cortada (VAD de referência sobre a fala limpa), nível residual nas pausas em
    dBFS, rejeição de teclado, vazamento de outra voz e de música;
  - inteligibilidade: taxa de erro de palavras de um Whisper local em pt-BR (limpo vs processado);
  - custo: latência total, fator de tempo real e CPU de um núcleo numa máquina fraca e com jogo aberto, memória;
  - estabilidade: 1 h de áudio contínuo sem buracos (detector de silêncio inesperado).
- **Linha de base:** `off`, `browser`, `rnnoise`, `gtcrn`, `dfn` (várias intensidades) com portão ligado/desligado.
  Resultado em tabela versionada (`tools/denoise-bench/results/`).
- Teste automático de regressão no CI: saída nunca silenciosa quando a entrada tem voz.

### Etapa 2: Robustez (consistência e áudio que não some)
Independente de trocar de modelo. Fazer primeiro, é o que o usuário sente.
- **Fila única** para montar/desmontar o processador (sem `restart()` concorrente). Tirar o `currentGate` global.
- **Vigia:** `statechange` do `AudioContext` (retoma no próximo gesto), `ended`/`mute` da entrada e da saída,
  `devicechange`. Se a saída fica em silêncio enquanto a entrada tem energia por N segundos, remonta a cadeia.
  Se remontar não resolver, avisa a pessoa (toast com ação), em vez de publicar silêncio calada.
- **Mono sem cancelar fase:** detectar canais em oposição de fase / canal vazio e escolher o canal com mais
  energia ou somar com alinhamento. Teste com sinal sintético invertido.
- **Estado honesto:** mostrar na UI o modo em uso agora ("IA máxima" ou "IA natural, a máxima indisponível"),
  e nunca gravar uma troca silenciosa como preferência.
- **Assets do modelo:** pré-cache no service worker, `Cache-Control: immutable` para `/vendor/*` no Caddy, regra
  de cache na Cloudflare (precisa do dashboard, pedir ao usuário), carga antecipada ao entrar na sala, checagem de
  integridade, retentativa com espera crescente.
- Avaliar `dtx` e AEC com a bancada. Só mudar o padrão se a medida mostrar ganho.
- `destroy` do nó do DFN, se a verificação confirmar o vazamento.
- Teste e2e (Playwright) cobrindo: trocar de dispositivo, suspender o contexto, microfone estéreo invertido.

### Etapa 3: Pesquisa do estado da arte e candidatos
Pesquisa na web (fontes primárias: documentação, artigos, blogs de engenharia, repositórios; **não mandar nenhum áudio
nem dado do projeto para serviço externo**). Entregável: `docs/supressao-estado-da-arte.md` com matriz de
licença, custo, plataforma, latência, tamanho, onde roda e resultado na bancada.
- **Com terceiros, para entender e comparar:** Krisp (usado por Discord/Daily/Twilio; o plugin do LiveKit é
  da nuvem deles, conferir se serve para LiveKit auto-hospedado e qual a licença do SDK), NVIDIA Broadcast / Maxine,
  ai-coustics, Picovoice Koala, Agora/Dolby/Vonage, Google Meet, Zoom (níveis auto/baixo/médio/alto e "som original"),
  Teams, Slack, Apple Voice Isolation e a restrição `voiceIsolation` do Chrome, se existir.
- **Código aberto:** RNNoise, DeepFilterNet (conferir versão mais nova), GTCRN e variantes, FRCRN, MP-SENet, DTLN,
  NSNet2, modelos do DNS Challenge mais recentes, Demucs-denoiser. Rodar via ONNX Runtime Web (WASM SIMD/threads,
  WebGPU) ou no processo principal do Electron (DirectML/CPU nativo).
- **VAD melhor para o portão:** Silero VAD, TEN VAD, WebRTC VAD, no lugar do detector por energia. Trocar o
  "corta tudo" por um expansor suave guiado pelo VAD.
- **Voz da própria pessoa (target speaker):** perfil de voz curto gravado pela pessoa, para deixar passar só ela e
  tirar outras vozes (o que o "BVC" do Krisp faz). Avaliar modelos abertos e custo de CPU.
- **Como estudar o que os concorrentes fazem:** reamplificação. Tocar o mesmo arquivo ruidoso por um cabo de áudio
  virtual para dentro de cada app (Discord, Meet, Zoom, Teams, NVIDIA Broadcast, Krisp), gravar a saída do outro
  lado e passar pela mesma bancada. **Precisa do PC e das contas do usuário**: deixar o roteiro pronto e pedir.

### Etapa 4: Protótipos e escolha
- Colocar os 2 a 3 melhores candidatos atrás de flag, **só no teste de microfone** das Configurações (já existe a
  tela), com botão de comparação A/B cego (a pessoa ouve A e B sem saber qual é qual e vota; guardar o voto só
  localmente).
- Cadeia de referência a testar: filtro passa-alta 80 Hz → IA → VAD + expansor suave → nivelador.
  Modo "Automático" que escolhe a intensidade pelo SNR estimado, e presets (baixo, médio, alto) como no Zoom.
- Escolher pela bancada (números) e pelo A/B (ouvido). Registrar a decisão e os números no documento da etapa 3.

### Etapa 5: Integração e saída
- Padrão novo + cadeia de recuo (melhor → GTCRN → RNNoise → navegador), sempre com o estado honesto na UI.
- Teste no Concord de testes com a lista de dispositivos problemáticos que o usuário e quem testa tiverem.
- Se algum candidato for pago ou nativo, decidir com o usuário (ver abaixo) antes de integrar.
- Nota de Novidades (skill `novidades`), privacidade atualizada se algum dado novo for guardado, e só então
  perguntar sobre o merge.

## Pontos que dependem do usuário
- **Orçamento e licença:** aceita SDK pago (Krisp, ai-coustics) ou só aberto? Plano pago para a melhor qualidade?
- **Caminho nativo só no app desktop** (modelos maiores/NVIDIA fora do navegador) é aceitável?
- **Cloudflare:** regra de cache para `/vendor/*` (dashboard, fora do que o Claude acessa).
- **Reamplificação:** rodar o roteiro de comparação com os apps de terceiros no PC dele.
- **Casos reais:** qual fone/microfone e sistema estavam em uso nos dias em que "mudou" e quando "sumiu o áudio".
- **Material de teste:** gravações próprias de voz e de ruídos reais, com consentimento (LGPD).

## Critérios de pronto
- Bancada roda com um comando e reproduz a tabela de linha de base.
- Nenhuma das hipóteses A/B fica "não investigada": cada uma tem veredito e, se confirmada, correção com teste.
- Em 1 h de teste contínuo e nas trocas de dispositivo, zero silêncio inesperado.
- O modo efetivo da IA sempre aparece na UI e nunca muda sem a pessoa saber.
- O novo padrão não perde para o atual em nenhuma métrica da bancada, tem menos de 1% de fala cortada e usa CPU
  aceitável na máquina fraca. A comparação com os concorrentes está documentada.

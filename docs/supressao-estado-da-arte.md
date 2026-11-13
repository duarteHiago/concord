# Supressão de ruído: estado da arte e candidatos (Etapa 3)

Levantamento de 2026-11-13 para [plano-supressao-de-ruido.md](plano-supressao-de-ruido.md). Fontes primárias
quando havia; onde só existia relato de terceiros, está dito. Nenhum áudio do projeto foi enviado a serviço externo.
Preços e licenças mudam: confirmar nas páginas oficiais antes de decidir.

## Como os grandes fazem

| Produto | Onde roda | O que se sabe | Fonte |
|---|---|---|---|
| **Discord** | No aparelho (Krisp, SDK licenciado) | Filtra "tudo que não é voz humana"; não manda áudio à Krisp; separado do portão de voz ("sensibilidade"). | [FAQ Discord/Krisp](https://support.discord.com/hc/en-us/articles/360040843952), [blog Discord](https://discord.com/blog/tune-into-discord-with-krisp-noise-suppression-on-ios-and-android) |
| **Google Meet** | Na nuvem do Google | Modelo supervisionado; tira porta, latido, aspirador, teclado; deixa passar risada, corta música e canto; ligado por padrão. Cobertura de 2020, pode ter mudado. | [VentureBeat](https://venturebeat.com/ai/google-meet-noise-cancellation-ai-cloud-denoiser-g-suite), [BGR](https://www.bgr.com/tech/google-meet-noise-cancelation-feature-demo-roll-out/) |
| **Zoom** | No aparelho | Quatro níveis (Auto, Baixo, Médio, Alto) + "Isolamento de áudio personalizado" (perfil de voz; sem perfil ou sem headset cai para o padrão) + "Som original" (desliga tudo, para música). | [guia Zapier](https://zapier.com/blog/zoom-noise-cancellation.md), [comunidade Zoom](https://community.zoom.com/meetings-2/zoom-optimized-audio-overwrites-both-original-sound-for-musicians-and-live-performance-audio-45122) |
| **NVIDIA Broadcast / Maxine AFX** | GPU RTX local | Remoção de ruído, de reverberação e o modo combinado; preserva entonação; SDK pelos canais de desenvolvedor NVIDIA (licença a confirmar). Só em quem tem RTX. | [docs Maxine AFX](https://docs.nvidia.com/maxine/afx/latest/), [GitHub MAXINE-AFX-SDK](https://github.com/NVIDIA/MAXINE-AFX-SDK), [model card BNR](https://build.nvidia.com/nvidia/bnr/modelcard) |
| **LiveKit Cloud** | Nuvem LiveKit (Krisp / ai-coustics) | Os plugins de supressão autenticam e medem uso pela LiveKit Cloud; com servidor LiveKit próprio (nosso caso) a escolha de modelo é "mais limitada" e a Krisp exige licença à parte. | [docs LiveKit](https://docs.livekit.io/transport/media/noise-cancellation.md), [blog LiveKit](https://livekit.com/blog/noise-cancellation), [comunidade](https://community.livekit.io/t/noise-cancelling-features-with-self-hosted-agents/1227) |

## SDKs pagos (para comparar e, se o usuário quiser, usar)

| SDK | Roda no navegador? | Licença / preço | Observações |
|---|---|---|---|
| **Krisp VIVA** | SDK proprietário, fora do npm público; não achei build WASM público | Licença anual por contato comercial (jambonz: "chave à parte, preço por uso previsto") | Referência de mercado; inclui BVC (só a voz da pessoa). [README plugin](https://cdn.jsdelivr.net/gh/livekit/agents@main/livekit-plugins/livekit-plugins-krisp/README.md), [jambonz](https://docs.jambonz.org/self-hosting/krisp) |
| **ai-coustics (Quail)** | **Sim**: `@ai-coustics/aic-sdk-wasm` | Por minuto; VAD + modelo contam em dobro; Pro/Business/Enterprise; terceiros citam ~60 min grátis | Mais fácil de testar no nosso stack. [docs](https://docs.ai-coustics.com/index.md), [preços](https://docs.ai-coustics.com/models/get-started/pricing), [npm](https://cdn.jsdelivr.net/npm/@ai-coustics/aic-sdk-wasm@0.21.0/README.md) |
| **Picovoice Koala** | Sim (Web SDK) | Grátis não comercial (~100 min/mês de Koala, segundo terceiros); Foundation US$ 6.000/ano | Simples de integrar. [Koala](https://picovoice.ai/docs/koala/), [preços](https://picovoice.ai/pricing), [blog web](https://picovoice.ai/blog/noise-suppression-web-browsers) |
| **NVIDIA Maxine AFX** | Não (nativo, RTX) | A confirmar na NVIDIA | Só faria sentido no app desktop, para quem tem RTX. |

## Código aberto

| Modelo | Tamanho / custo | Licença | Estado | Para nós |
|---|---|---|---|---|
| **DeepFilterNet3** (em uso) | ~2 M parâmetros; wasm 16 MB + modelo 8 MB | MIT/Apache-2.0 | Última tag v0.5.6; sem DFN4 à vista | Melhor supressão que temos; voz "seca" em força alta. [repo](https://github.com/rikorose/deepfilternet) |
| **GTCRN** (padrão atual) | 24–48 k parâmetros, ~40 MFLOPs | MIT | ICASSP 2024; portes ONNX/sherpa-onnx; variante 48 kHz no pacote que usamos | Leve e natural; fraco em ruído não estacionário. [repo](https://github.com/Xiaobin-Rong/gtcrn), [CoFi-Lite (2026)](https://arxiv.org/pdf/2607.10142) é o sucessor ultraleve a avaliar |
| **RNNoise** | ~90 k parâmetros | BSD | Estável | Só ruído estacionário. |
| **UL-UNAS**, **CoFi-Lite** | ultraleves | ver repos | 2025–2026 | Candidatos a substituir o GTCRN como "IA natural". [UL-UNAS](https://arxiv.org/html/2503.00340v2) |
| **DNS Challenge** (Microsoft) | vários | MIT (código) | Última edição encontrada: ICASSP 2023 (faixas headset/viva-voz, modelos personalizados ganharam as duas) | Fonte de datasets e do **DNSMOS P.835** (`sig_bak_ovr.onnx`) para a bancada. [DNS 2023](https://arxiv.org/pdf/2303.11510), [repo](https://github.com/microsoft/DNS-Challenge) |

## Detector de voz (para o portão)

O portão atual decide por energia. Um VAD de verdade deixa trocar "corta tudo" por um expansor suave guiado:

| VAD | Tamanho | Licença | Notas |
|---|---|---|---|
| **Silero VAD v6** | ~2 MB ONNX | **CC BY-NC 4.0 no PyPI** (uso comercial restrito; confirmar no repo) | Padrão de mercado; `ricky0123/vad` roda no navegador com onnxruntime-web (16 kHz, 512 amostras). Melhor em áudio só-ruído. [PyPI](https://pypi.org/project/silero-vad/6.2.0/), [ricky0123/vad](https://docsearch.algolia.com/mcp/docs/repo/ricky0123/vad) |
| **TEN VAD** | 306 kB | Apache-2.0 | Mais rápido a fechar ao fim da fala; build WASM; pior em ruído puro segundo um terceiro. [repo](https://github.com/TEN-framework/ten-vad), [Cekura](https://www.cekura.ai/blogs/what-is-silero-vad) |
| **WebRTC VAD** | mínimo | BSD | Binário, fraco em ruído. |

## Só a voz da pessoa (target speaker)

O que o Krisp BVC e o Zoom "personalizado" fazem. Em aberto, hoje:
- **OpenSpeakerBeam-SS**: reimplementação independente, ONNX, mas 7,6 M parâmetros e 21,6 GFLOPs/s a 16 kHz, pesado para o navegador. [projeto](https://awesome.ecosyste.ms/projects/github.com%2Fhelloooideeeeea%2Fopenspeakerbeam-ss)
- **DeepFilterNet2 personalizado** (Serre et al. 2024, ECAPA-TDNN como codificador de voz): sem release pronto. [artigo](https://arxiv.org/html/2404.08022v1)
- **Pallala et al., Interspeech 2025**: bloco de extração de 12 MB + codificador de 10 MB; código não confirmado. [artigo](https://www.isca-archive.org/interspeech_2025/pallala25_interspeech.pdf)
- Conclusão: não há pacote maduro e leve em aberto. Fica como fase posterior, ou via SDK pago.

## Navegador

- Chrome tem a restrição `voiceIsolation` em `getUserMedia` (intent de 2024, ChromeOS M123; desktop sem confirmação). Vale checar `getSupportedConstraints()` e, se existir, oferecer como modo extra. [intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/hPMvCu-3iPA)
- ONNX Runtime Web (WASM SIMD/threads, WebGPU) é o caminho para modelos que não têm port wasm próprio (CoFi-Lite, UL-UNAS, VADs). Precisa de cross-origin isolation para threads.

## Recomendação para a Etapa 4

1. **Manter DFN3 + GTCRN** como base; trocar o portão por **TEN VAD** (Apache-2.0, 306 kB) com expansor suave, e medir na bancada.
2. **Protótipo "Automático"**: intensidade do DFN3 pelo SNR estimado (pausas vs fala), presets Baixo/Médio/Alto como no Zoom.
3. **Avaliar CoFi-Lite/UL-UNAS** como substitutos do GTCRN, via ONNX Runtime Web, se houver pesos públicos.
4. **Testar ai-coustics WASM** no tier gratuito só para calibrar a bancada (o que "primeira linha" significa em número), sem compromisso de uso.
5. Target speaker: só com SDK pago ou numa fase futura.

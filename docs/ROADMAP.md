# Roadmap

Ideias e projetos maiores planejados para o Concord, com o contexto de por que existem.

## Captura de tela nativa com NVENC (transmissão a 60 fps com jogo pesado)

**Status:** planejado · **Tamanho:** grande · **Onde:** app desktop + VPS

### Problema

Transmitindo um jogo pesado, a live fica em ~40 fps mesmo com a codificação já na placa de vídeo.

O que já foi medido e resolvido até aqui:

- A codificação estava no processador (OpenH264), porque o LiveKit só aceitava o perfil H.264 `42e01f`. Ligando os perfis `42001f`/`4d001f` em `deploy/livekit.yaml`, o Chromium passou a usar o NVENC. Isso foi testado de ponta a ponta numa RTX 4060 Ti.
- A queda ao trocar o foco da janela vinha do "segundo plano" do Chromium e do modo de eficiência do Windows. Foi desligada no app desktop.
- O gargalo que sobra é a **captura**: o painel de estatísticas mostra "captura ≈ envio ≈ 40 fps" com o jogo aberto. Limitar o fps do jogo e usar janela sem borda deixou a live mais estável, mas não subiu esse teto.

A causa é a captura do navegador. Cada quadro sai da placa de vídeo para a memória, é convertido no processador e volta para a placa para ser codificado. Com o jogo usando a placa, essas cópias esperam a vez. O OBS e o Discord chegam a 60 fps porque capturam e codificam tudo dentro da placa (zero-copy).

### Proposta

Uma transmissão "nativa" no app desktop, por fora do Chromium:

1. **Captura e codificação dentro da placa:** um processo auxiliar com FFmpeg (`ddagrab` para a tela, ou Windows Graphics Capture para uma janela), codificando com `h264_nvenc`. Com placas AMD seria `h264_amf`, com Intel `h264_qsv`.
2. **Envio para a sala:** o vídeo já codificado vai por **WHIP** para o **LiveKit Ingress**, sem recodificar. O Ingress coloca a transmissão na sala como uma faixa normal, e quem assiste não percebe diferença.
3. **Áudio da transmissão:** continua vindo do capturador por processo que já existe (`desktop/native/audio-capture.cpp`), sem as vozes da call.
4. **O mesmo seletor de tela/janela, qualidade e fps de hoje.** A transmissão nativa entra como o modo padrão no app desktop, e a captura atual fica como alternativa e para o navegador.

### O que precisa

- **VPS:** os serviços `livekit/ingress` e Redis no `docker-compose.yml`, configurados no `livekit.yaml`. Um endpoint WHIP atrás do Caddy e do túnel.
- **Servidor do Concord:** uma rota que cria o ingress (WHIP) para a pessoa que vai transmitir, com as permissões da sala, e o remove ao parar.
- **App desktop:** distribuir o FFmpeg (~80 MB a mais no instalador), escolher o codificador conforme a placa (NVIDIA/AMD/Intel) e controlar o processo: iniciar, parar, trocar de fonte e reconectar.
- **Cliente:** reconhecer a transmissão vinda do Ingress como a "tela" daquela pessoa, com o mesmo botão de assistir, o painel de estatísticas e a janela separada.

### Riscos e pontos em aberto

- **Latência:** sem recodificar, deve ficar próxima da atual. Precisa ser medida.
- **Simulcast:** com uma camada só via WHIP, quem tem internet fraca perde a versão 720p. Avaliar se vale mandar duas camadas pelo FFmpeg ou deixar o Ingress gerar a camada baixa (o que significa recodificar).
- **Tela cheia exclusiva:** alguns jogos nesse modo não podem ser capturados por nenhum método. A orientação continua sendo usar janela sem borda.
- **Antivírus:** podem implicar com o executável do FFmpeg, então distribuir assinado ou com hash conhecido.

### Critério de pronto

- 1080p a 60 fps estáveis (captura ≥ 58 fps no painel) com um jogo pesado aberto numa RTX série 40/50.
- Uso de processador da live abaixo de 5% de um núcleo.
- Quem assiste vê tudo igual a hoje: assistir, janela separada, estatísticas, volume da transmissão.
- Se o nativo falhar, o app volta sozinho para a captura do navegador, com aviso.

## Testes de carga e resistência

**Status:** planejado · **Tamanho:** médio · **Onde:** ambiente de teste + VPS

### Objetivo

Descobrir o limite de cada parte do Concord (API, tempo real, voz e vídeo, app) e o que quebra primeiro, antes que a comunidade cresça.

### Decisões em aberto

1. **Meta de uso:** quantas pessoas online ao mesmo tempo, quantas numa mesma call e quantas lives simultâneas. Sem meta definida, testar em degraus (100, 500, 1.000, 5.000) até quebrar.
2. **Ambiente:** usar a VPS antiga (72.60.150.220, parada desde a mudança para concord-community.com) como ambiente de teste, com banco próprio e um subdomínio como `teste.concord-community.com`. Antes, salvar uma cópia dos dados originais dela. Os números só valem direto se ela tiver a mesma configuração da VPS de produção.

### Onde testar

- **Não fazer teste pesado em produção:** derruba a call de quem está usando, e a Cloudflare pode tratar como ataque.
- **A carga sai de fora,** não do PC de desenvolvimento: máquinas temporárias do GitHub Actions ou uma VPS alugada por hora.
- **Em produção, só uma checagem leve e curta,** num horário vazio, para confirmar os números do ambiente de teste.

### O que testar

| Parte | O que simular | Ferramenta |
|---|---|---|
| API (HTTP) | login, abrir servidor, listar e enviar mensagens, fórum, uploads | k6 |
| Tempo real (Socket.io) | milhares de conexões, presença, "digitando", entrega de mensagens para muita gente | Artillery (fala Socket.io nativamente) |
| Voz e vídeo (LiveKit) | salas com dezenas falando, várias lives 1080p60 com muitos espectadores | `lk load-test` (ferramenta oficial do LiveKit) |
| App no navegador | servidor com 2.000 membros, canal com 10 mil mensagens, 30 pessoas na call: trava? vaza memória? | Playwright medindo memória e FPS |
| Rede ruim | perda de pacote, 300 ms de atraso, queda no meio da call | `tc netem` |
| Falhas | reiniciar app ou LiveKit com gente em call: todo mundo reconecta sozinho? | scripts de caos |

Tipos de teste:

- **Carga:** uso esperado por 30 minutos.
- **Estresse:** aumentar até quebrar, para achar o limite.
- **Pico:** mil pessoas entrando de uma vez, como depois de um anúncio.
- **Resistência:** carga média por 6 a 12 horas, para pegar vazamento de memória.

### Suspeitos (pela leitura do código)

1. **Presença:** cada pessoa que entra ou sai avisa todos os conectados (`io.emit` em `realtime.ts`). Cresce ao quadrado com muita gente entrando junto.
2. **Entrega de mensagem:** `emitToChannel` percorre todas as conexões do servidor e checa permissões a cada mensagem e a cada "digitando".
3. **Abrir um servidor:** `GET /servers/:id` devolve todos os membros de uma vez. Pesa na resposta e na lista do app em comunidades grandes.
4. **Login:** o bcrypt é caro de propósito; um pico de logins ocupa o processador.
5. **Banda das lives:** cada espectador 1080p60 consome de 6 a 9 Mbps saindo da VPS. Provavelmente é o limite real, antes da CPU.
6. **SQLite:** um único escritor. Medir quantas mensagens por segundo ele aguenta.

### Entregáveis

- `tests/load/` com os cenários e um script que cria milhares de contas e servidores de teste.
- Métricas novas no Grafana: atraso do event loop do Node, conexões abertas, mensagens por segundo.
- Relatório com o limite de cada parte e a lista do que corrigir primeiro.

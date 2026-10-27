# Política de Segurança

## Versões cobertas

O Concord é atualizado continuamente: o que está na `main` é o que roda em [concord-community.com](https://concord-community.com), e o app desktop se atualiza sozinho. Só a versão mais recente recebe correções de segurança. Quem hospeda o próprio Concord deve manter a instalação atualizada (`git pull && docker compose up -d --build`).

## Como reportar uma falha

**Não abra uma issue pública** para falhas de segurança: qualquer pessoa conseguiria usar a falha antes da correção.

Use o relato privado do GitHub:

1. Abra a aba **[Security](https://github.com/duarteHiago/concord/security)** do repositório.
2. Clique em **Report a vulnerability**.
3. Descreva:
   - o que a falha permite fazer (ex.: entrar na conta de outra pessoa, ler DMs alheias, derrubar o servidor);
   - como reproduzir, passo a passo;
   - onde está, se souber (arquivo, rota, versão do app desktop);
   - o impacto que você imagina.

Só os mantenedores veem o relato.

## O que acontece depois

- **Em até 3 dias:** confirmamos que recebemos e começamos a investigar.
- **Em até 7 dias:** dizemos se a falha foi confirmada e qual a gravidade.
- **Correção:** falhas graves são corrigidas e publicadas o mais rápido possível (o deploy é automático). Avisamos quando a correção estiver no ar.
- **Crédito:** se quiser, seu nome ou usuário entra no aviso da correção.

Pedimos que você não divulgue a falha até a correção estar publicada, ou até 90 dias depois do relato, o que acontecer primeiro.

## O que está no escopo

- O servidor (`server/`), o cliente web (`client/`) e o app desktop (`desktop/`).
- A configuração de deploy (`deploy/`, `docker-compose*.yml`).
- O serviço oficial em concord-community.com.

## Varredura automática

Todo PR passa pelo [Trivy](https://trivy.dev) (vulnerabilidades na imagem Docker e nas dependências, segredos no código, configuração do Docker) e pelo [CodeQL](https://codeql.github.com) (falhas no nosso código). Os dois rodam também toda semana, e o Dependabot mantém as dependências atualizadas. Detalhes no [README](README.md#cicd-github-actions).

## Fora do escopo

- Ataques de negação de serviço (DDoS) e testes de carga contra concord-community.com.
- Engenharia social com usuários ou mantenedores.
- Falhas em serviços de terceiros (Cloudflare, Google, Brevo, LiveKit): reporte direto a eles.
- Relatos automáticos de scanners sem uma prova de que a falha existe de verdade.

## Boa fé

Quem pesquisa de boa fé, segue esta política, não acessa dados de outras pessoas além do mínimo para provar a falha e não prejudica o serviço não vai sofrer nenhuma ação nossa por isso. Use contas de teste suas sempre que possível.

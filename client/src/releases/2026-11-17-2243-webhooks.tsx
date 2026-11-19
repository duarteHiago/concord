import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function WebhookArt() {
  return (
    <Frame className="flex h-[170px] items-center justify-center px-4">
      <div className="flex w-full max-w-[300px] items-start gap-2.5">
        <div className="h-8 w-8 shrink-0 rounded-full bg-accent-2/60" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            Grafana
            <span className="rounded bg-accent-2/20 px-1 text-[8px] leading-4 text-accent-2">APP</span>
          </div>
          {/* o mesmo desenho do cartão de verdade (WebhookEmbeds), em miniatura */}
          <div className="flex gap-2 rounded-2xl bg-surface-2 p-2.5 ring-1 ring-line">
            <span className="w-0.5 shrink-0 rounded-full bg-[#e01e5a]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[8px] font-bold text-fg-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-[#e01e5a]" /> Alerting
              </div>
              <div className="font-display text-[11px] leading-tight font-bold">API de pagamentos com 40% de erro</div>
              <div className="mt-0.5 text-[9px] text-fg-muted">Desde 14:02 · limite 5%</div>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                <div className="rounded-lg bg-surface-3 px-1.5 py-1 text-[9px] font-semibold">
                  <div className="text-[7px] font-bold text-fg-subtle">Serviço</div>
                  pagamentos
                </div>
                <div className="rounded-lg bg-surface-3 px-1.5 py-1 text-[9px] font-semibold">
                  <div className="text-[7px] font-bold text-fg-subtle">Região</div>
                  sa-east
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Tag className="right-3 bottom-3">Mandado por outro app</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-17-2243',
  title: 'Webhooks',
  highlights: [
    {
      kicker: 'Canais',
      title: 'Receba alertas e avisos de outros apps num canal',
      text: 'Crie um webhook em Configurações do canal → Integrações e cole o endereço no Grafana, no Uptime Kuma ou num script seu. As mensagens chegam com cartão colorido, campos e imagens. Quem já manda alertas para o Discord ou o Slack só troca o endereço.',
      art: WebhookArt,
    },
  ],
} satisfies Release;

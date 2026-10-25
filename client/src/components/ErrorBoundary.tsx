import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from './ui';

type Area = 'app' | 'painel';

/** Manda o erro para o log do servidor: só o técnico, sem usuário (ver server/src/clientErrors.ts). */
function report(area: Area, error: Error, componentStack?: string | null) {
  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      area,
      message: String(error?.message ?? error),
      stack: error?.stack ?? '',
      componentStack: componentStack ?? '',
      path: location.pathname,
      commit: __COMMIT__,
    }),
  }).catch(() => {});
}

const details = (error: Error) => `${error.message}\n\nVersão: ${__COMMIT__}\nPágina: ${location.pathname}\n\n${error.stack ?? ''}`;

interface Props {
  /** "app": a tela inteira; "painel": só a área do meio, com a barra lateral (e a chamada) de pé. */
  area: Area;
  /** Mudou (outro canal, outra página): tenta mostrar de novo em vez de ficar na tela de erro. */
  resetKey?: string;
  children: ReactNode;
}

/**
 * Um erro num componente derrubava o React inteiro e deixava a tela branca. Com isto, aparece um aviso no
 * lugar de quem quebrou, com "Tentar de novo" e "Recarregar", e o erro vai para o log do servidor.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null; copied: boolean }> {
  state = { error: null as Error | null, copied: false };

  static getDerivedStateFromError(error: Error) {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    report(this.props.area, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  copy = () => {
    if (!this.state.error) return;
    navigator.clipboard?.writeText(details(this.state.error)).then(
      () => this.setState({ copied: true }),
      () => {},
    );
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    const whole = this.props.area === 'app';
    return (
      <div
        role="alert"
        className={
          whole
            ? 'flex h-full flex-col items-center justify-center gap-4 bg-surface-1 p-6 text-center'
            : 'panel flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center'
        }
      >
        <TriangleAlert size={40} className="text-danger" />
        <div className="max-w-md space-y-2">
          <h1 className="font-display text-xl font-bold text-fg">{whole ? 'O Concord encontrou um erro' : 'Esta parte do app deu erro'}</h1>
          <p className="text-sm text-fg-muted">
            {whole
              ? 'Recarregar costuma resolver. O erro já foi enviado para a equipe.'
              : 'O resto do app continua funcionando. O erro já foi enviado para a equipe.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {!whole && (
            <Button onClick={() => this.setState({ error: null })}>
              <RotateCcw size={16} /> Tentar de novo
            </Button>
          )}
          <Button variant={whole ? 'primary' : 'secondary'} onClick={() => location.reload()}>
            <RefreshCw size={16} /> Recarregar{whole ? '' : ' o app'}
          </Button>
          <Button variant="ghost" onClick={this.copy}>
            {copied ? 'Copiado!' : 'Copiar detalhes'}
          </Button>
        </div>
      </div>
    );
  }
}

import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { desktop } from '../../lib/desktop';
import { comboFromEvent, currentShortcuts, DEFAULT_SHORTCUTS, SHORTCUTS, syncGlobalShortcuts, type ShortcutAction } from '../../lib/shortcuts';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { Button, Toggle, cx } from '../ui';

/** Aba "Atalhos": clique num atalho e pressione as teclas novas. */
export function ShortcutsTab() {
  const saveSettings = useApp((s) => s.saveSettings);
  const globalOn = useApp((s) => s.me?.settings.globalShortcuts !== false);
  const [map, setMap] = useState(currentShortcuts);
  const [recording, setRecording] = useState<ShortcutAction | null>(null);

  async function save(next: Record<ShortcutAction, string>) {
    setMap(next);
    await saveSettings({ shortcuts: next });
    syncGlobalShortcuts();
  }

  useEffect(() => {
    if (!recording) return;
    document.body.dataset.recordingShortcut = '1';
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setRecording(null);
      if (e.key === 'Backspace' || e.key === 'Delete') {
        void save({ ...map, [recording]: '' });
        return setRecording(null);
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // só um modificador por enquanto
      if (!combo.includes('+') && !/^F\d{1,2}$/.test(combo)) {
        toast.info('Use pelo menos um modificador (Ctrl, Alt ou Shift), ou uma tecla F1–F12.');
        return;
      }
      const clash = (Object.keys(map) as ShortcutAction[]).find((a) => a !== recording && map[a] === combo);
      if (clash) toast.info(`"${combo}" estava em "${SHORTCUTS.find((s) => s.id === clash)?.label}" e foi removido de lá.`);
      void save({ ...map, ...(clash ? { [clash]: '' } : {}), [recording]: combo });
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      delete document.body.dataset.recordingShortcut;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, map]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-muted">Clique num atalho e pressione as teclas novas. Backspace remove o atalho, Esc cancela.</p>
      <div className="divide-y divide-line rounded-2xl bg-surface-0">
        {SHORTCUTS.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">{s.label}</div>
              {s.global && desktop && <div className="text-xs text-fg-muted">Funciona com o app em segundo plano</div>}
            </div>
            <button
              onClick={() => setRecording(recording === s.id ? null : s.id)}
              className={cx(
                'h-9 min-w-36 rounded-full px-4 font-mono text-xs font-bold transition-colors',
                recording === s.id ? 'animate-pulse bg-accent text-on-accent' : 'bg-surface-3 hover:bg-surface-4',
              )}
            >
              {recording === s.id ? 'Pressione as teclas…' : map[s.id] || 'Nenhum'}
            </button>
          </div>
        ))}
      </div>
      {desktop?.setGlobalShortcuts && (
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-0 p-4">
          <div>
            <div className="text-sm font-semibold">Atalhos globais</div>
            <div className="text-xs text-fg-muted">Silenciar e ensurdecer funcionam mesmo jogando, com o Concord em segundo plano.</div>
          </div>
          <Toggle
            checked={globalOn}
            onChange={(v) => {
              void saveSettings({ globalShortcuts: v }).then(syncGlobalShortcuts);
            }}
          />
        </div>
      )}
      <Button variant="ghost" onClick={() => void save({ ...DEFAULT_SHORTCUTS })}>
        <RotateCcw size={16} /> Restaurar atalhos padrão
      </Button>
    </div>
  );
}

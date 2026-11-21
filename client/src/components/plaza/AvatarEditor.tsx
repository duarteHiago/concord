// Monta o boneco da Praça: pele, cabelo, roupa, chapéu e máscara. Fica salvo nas preferências da conta
// (settings.plazaAvatar) e o servidor relê de lá, validado, para mostrar aos outros.
import { Dices, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  ACCESSORIES,
  CLOTH_COLORS,
  FACES,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  TOP_STYLES,
  sanitizeAvatar,
  type Facing,
  type PlazaAvatar,
} from '../../../../shared/plaza.ts';
import { useApp } from '../../store/app';
import { usePlaza } from '../../store/plaza';
import { hud, primarySm, soft } from './hud';
import { cx } from '../ui';
import { SPRITE_H, SPRITE_W, avatarSprite, type Pose } from './pixels';

export function AvatarPreview({ avatar, size = 6, spin = true }: { avatar: PlazaAvatar; size?: number; spin?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [facing, setFacing] = useState<Facing>(0);
  const [pose, setPose] = useState<Pose>('stand');
  useEffect(() => {
    if (!spin) return;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setPose(i % 2 ? 'walk1' : 'walk2');
      if (i % 8 === 0) setFacing((f) => ((f + 1) % 4) as Facing);
    }, 260);
    return () => clearInterval(t);
  }, [spin]);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(20,12,40,0.35)';
    ctx.beginPath();
    ctx.ellipse(c.width / 2, c.height - size * 2, size * 7, size * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(avatarSprite(avatar, facing, pose), 0, 0, SPRITE_W * size, SPRITE_H * size);
  }, [avatar, facing, pose, size]);
  return (
    <canvas
      ref={ref}
      width={SPRITE_W * size}
      height={(SPRITE_H + 1) * size}
      className="plaza-canvas cursor-pointer"
      title="Girar"
      onClick={() => setFacing((f) => ((f + 1) % 4) as Facing)}
    />
  );
}

function Swatches({ colors, value, onChange, label }: { colors: string[]; value: number; onChange: (i: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {colors.map((c, i) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === i}
          aria-label={`${label} ${i + 1}`}
          onClick={() => onChange(i)}
          className={cx('h-8 w-8 rounded-full border-2 transition active:scale-90', value === i ? 'scale-110 border-fg' : 'border-line-strong hover:border-fg-subtle')}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function Chips({ options, value, onChange, label }: { options: string[]; value: number; onChange: (i: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o, i) => (
        <button
          key={o}
          role="radio"
          aria-checked={value === i}
          onClick={() => onChange(i)}
          className={cx('rounded-full px-3 py-1.5 text-[13px] font-bold transition active:scale-95', value === i ? 'bg-accent text-on-accent' : 'bg-surface-2 text-fg hover:bg-surface-4')}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function AvatarEditor({ onClose }: { onClose: () => void }) {
  const me = useApp((s) => s.me)!;
  const [av, setAv] = useState<PlazaAvatar>(() => sanitizeAvatar(me.settings.plazaAvatar, me.id));
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<PlazaAvatar>) => setAv((a) => ({ ...a, ...patch }));
  const random = () => {
    const r = (n: number) => Math.floor(Math.random() * n);
    setAv({
      skin: r(SKIN_TONES.length),
      hair: r(HAIR_STYLES.length),
      hairColor: r(HAIR_COLORS.length),
      top: r(TOP_STYLES.length),
      topColor: r(CLOTH_COLORS.length),
      bottomColor: r(CLOTH_COLORS.length),
      accessory: Math.random() < 0.5 ? 0 : r(ACCESSORIES.length),
      face: Math.random() < 0.6 ? 0 : r(FACES.length),
    });
  };
  const save = async () => {
    setSaving(true);
    await useApp.getState().saveSettings({ plazaAvatar: av });
    usePlaza.getState().avatarChanged();
    setSaving(false);
    onClose();
  };

  const row = (title: string, body: React.ReactNode) => (
    <div>
      <div className={cx(hud.label, 'mb-1.5')}>{title}</div>
      {body}
    </div>
  );

  return (
    // celular: sobe de baixo na largura toda (antes passava da borda direita); o boneco fica menor para sobrar lista
    <div className="absolute inset-0 z-[70] grid items-end bg-black/50 backdrop-blur-sm sm:place-items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-label="Meu boneco"
        className={cx(hud.panel, 'flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-[28px] max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)] sm:w-[min(96vw,640px)] sm:animate-pop-in sm:flex-row')}
      >
        <div className="flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_70%,#3b3166,#231a3a)] p-5 max-sm:py-3 sm:w-[220px]">
          <AvatarPreview avatar={av} />
          <div className="flex gap-1.5">
            <button onClick={random} className={soft()}>
              <Dices size={13} /> Sortear
            </button>
            <span className="flex items-center gap-1 px-1 text-[11px] text-fg-subtle">
              <RotateCw size={11} /> {matchMedia('(hover: none)').matches ? 'toque' : 'clique'} para girar
            </span>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={cx(hud.title, 'px-5 pt-5 text-lg')}>Meu boneco</div>
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-3">
            {row('Pele', <Swatches label="Pele" colors={SKIN_TONES} value={av.skin} onChange={(skin) => set({ skin })} />)}
            {row('Cabelo', <Chips label="Cabelo" options={HAIR_STYLES} value={av.hair} onChange={(hair) => set({ hair })} />)}
            {row('Cor do cabelo', <Swatches label="Cor do cabelo" colors={HAIR_COLORS} value={av.hairColor} onChange={(hairColor) => set({ hairColor })} />)}
            {row('Roupa', <Chips label="Roupa" options={TOP_STYLES} value={av.top} onChange={(top) => set({ top })} />)}
            {row('Cor da roupa', <Swatches label="Cor da roupa" colors={CLOTH_COLORS} value={av.topColor} onChange={(topColor) => set({ topColor })} />)}
            {row('Calça', <Swatches label="Calça" colors={CLOTH_COLORS} value={av.bottomColor} onChange={(bottomColor) => set({ bottomColor })} />)}
            {row('Na cabeça', <Chips label="Na cabeça" options={ACCESSORIES} value={av.accessory} onChange={(accessory) => set({ accessory })} />)}
            {row('No rosto', <Chips label="No rosto" options={FACES} value={av.face} onChange={(face) => set({ face })} />)}
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <button onClick={onClose} className={soft('md', 'raised')}>
              Cancelar
            </button>
            <button onClick={() => void save()} disabled={saving} className={primarySm('md')}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

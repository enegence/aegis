// Dev-only Tweaks panel. Ported from the original tweaks-panel.jsx + the
// index.html control list. The original iframe host postMessage protocol is
// dropped (no host harness in this SPA); the FAB toggles a local open state and
// setTweak drives the ThemeProvider context (persisted to localStorage in dev).
import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useTweaks, useTheme, useTweaksPanelEnabled } from '../../lib/theme';

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-field{appearance:none;width:100%;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}
  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}
  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}
`;

function TweakSection({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <div className="twk-sect">{title}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }: { label: string; value?: ReactNode; children: ReactNode; inline?: boolean }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input type="range" className="twk-slider" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'} role="switch" aria-checked={!!value} onClick={() => onChange(!value)}>
        <i />
      </button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const opts = options;
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const valueRef = useRef(value);
  valueRef.current = value;

  const segAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev: PointerEvent) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown} className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb" style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`, width: `calc((100% - 4px) / ${n})` }} />
        {opts.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakColor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <input type="color" className="twk-swatch" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function TweaksPanel({ title = 'Tweaks', open, onClose, children }: { title?: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const dragRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  const onDragStart = (e: React.MouseEvent) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev: MouseEvent) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel" style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks" onMouseDown={e => e.stopPropagation()} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="twk-body">{children}</div>
      </div>
    </>
  );
}

function TweaksToggle({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title="Open Tweaks"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 2147483645,
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'rgba(11,28,44,0.75)',
        color: '#DDE8F4',
        border: '1.5px solid rgba(138,170,200,0.4)',
        cursor: 'pointer',
        fontSize: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        transition: 'opacity 0.15s',
      }}
    >
      ⚙
    </button>
  );
}

export default function DevTweaks() {
  const enabled = useTweaksPanelEnabled();
  const [open, setOpen] = useState(false);
  const [tweaks, setTweak] = useTweaks();
  const theme = useTheme();
  if (!enabled) return null;
  return (
    <>
      {!open && <TweaksToggle onToggle={() => setOpen(true)} />}
      <TweaksPanel open={open} onClose={() => setOpen(false)}>
        <TweakSection title="Color Theme">
          <TweakRadio
            label="Theme"
            options={[
              { value: 'blueprint', label: 'Blueprint' },
              { value: 'cream', label: 'Cream' },
              { value: 'midnight', label: 'Midnight' },
            ]}
            value={tweaks.theme as string}
            onChange={v => setTweak('theme', v)}
          />
        </TweakSection>
        <TweakSection title="Accent Color">
          <TweakColor label="Accent" value={(tweaks.accentColor as string) || theme.accent} onChange={v => setTweak('accentColor', v)} />
        </TweakSection>
        <TweakSection title="Card Style">
          <TweakRadio
            label="Card"
            options={[
              { value: 'sketchy', label: 'Sketchy' },
              { value: 'sharp', label: 'Sharp' },
              { value: 'pill', label: 'Pill' },
            ]}
            value={tweaks.cardStyle as string}
            onChange={v => setTweak('cardStyle', v)}
          />
        </TweakSection>
        <TweakSection title="Button Shape">
          <TweakRadio
            label="Button"
            options={[
              { value: 'sketchy', label: 'Sketchy' },
              { value: 'pill', label: 'Pill' },
              { value: 'sharp', label: 'Sharp' },
            ]}
            value={tweaks.buttonShape as string}
            onChange={v => setTweak('buttonShape', v)}
          />
        </TweakSection>
        <TweakSection title="Density">
          <TweakRadio
            label="Density"
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
            value={tweaks.density as string}
            onChange={v => setTweak('density', v)}
          />
        </TweakSection>
        <TweakSection title="Card Tilt">
          <TweakSlider label="Tilt" min={0} max={3} step={0.25} value={tweaks.tiltAmount as number} onChange={v => setTweak('tiltAmount', v)} />
        </TweakSection>
        <TweakSection title="Heading Scale">
          <TweakSlider label="Scale" min={0.7} max={1.5} step={0.05} value={tweaks.headingScale as number} onChange={v => setTweak('headingScale', v)} />
        </TweakSection>
        <TweakSection title="Sidebar Width">
          <TweakSlider label="Width" min={160} max={300} step={10} value={tweaks.sidebarWidth as number} onChange={v => setTweak('sidebarWidth', v)} />
        </TweakSection>
        <TweakSection title="Logo Size">
          <TweakRadio
            label="Logo"
            options={[
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Medium' },
              { value: 'lg', label: 'Large' },
            ]}
            value={tweaks.logoSize as string}
            onChange={v => setTweak('logoSize', v)}
          />
        </TweakSection>
        <TweakSection title="Corner Doodles">
          <TweakToggle label="Show on landing page" value={tweaks.showDoodles as boolean} onChange={v => setTweak('showDoodles', v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

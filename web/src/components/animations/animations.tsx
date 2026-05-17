// Mortality scenes — stick figure mortality vignettes with watercolor washes.
// Ported from the original aegis-animations.jsx (geometry/math byte-identical).
import { useState, useEffect, type CSSProperties } from 'react';
import { useTheme } from '../../lib/theme';

interface SceneProps {
  ink: string;
  accent: string;
}

// ─── SHARED HELPERS ───────────────────────────────────────────────────────

function useCycleTime(duration: number, offset?: number): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    let startTime: number | null = null;
    let rafId: number;
    const off = (offset || 0) * duration;
    function tick(ts: number) {
      if (startTime === null) startTime = ts - off;
      setT(((ts - startTime) % duration) / duration);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [duration]);
  return t;
}

function eO(t: number) { return 1 - (1 - t) * (1 - t); }
function eI(t: number) { return t * t; }
function eI3(t: number) { return t * t * t; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function c01(t: number) { return Math.max(0, Math.min(1, t)); }
function ph(t: number, s: number, e: number) { return c01((t - s) / (e - s)); }

function wavePath(ys: number[], x0: number, dx: number) {
  let d = `M${x0},${ys[0]}`;
  for (let i = 0; i < ys.length - 1; i++) {
    const cx = x0 + dx * i + dx * 0.5;
    d += ` Q${cx},${ys[i]} ${x0 + dx * (i + 1)},${ys[i + 1]}`;
  }
  return d;
}

// ─── WATERCOLOR BACKGROUND ────────────────────────────────────────────────

function WcDefs({ id, seed = 5, scale = 12 }: { id: string; seed?: number; scale?: number }) {
  return (
    <defs>
      <filter id={`wc_blur_${id}`} x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <filter id={`wc_edge_${id}`} x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence type="fractalNoise" baseFrequency="0.032 0.024" numOctaves="4" seed={seed} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  );
}

function WcBlob({ id, cx, cy, rx, ry, fill, opacity = 0.28, edge = false }: { id: string; cx: number; cy: number; rx: number; ry: number; fill: string; opacity?: number; edge?: boolean }) {
  const filterId = edge ? `wc_edge_${id}` : `wc_blur_${id}`;
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} opacity={opacity} filter={`url(#${filterId})`} />;
}

function OutdoorWash({ id, groundY = 108, skyColor = '#9EC8E8', groundColor = '#7ABF7A', skyOp = 0.32, groundOp = 0.38 }: { id: string; w?: number; h?: number; groundY?: number; skyColor?: string; groundColor?: string; skyOp?: number; groundOp?: number }) {
  return (
    <>
      <WcDefs id={id} seed={parseInt(id, 36) % 20 + 2} scale={14} />
      <WcBlob id={id} cx={140} cy={groundY * 0.38} rx={170} ry={groundY * 0.46} fill={skyColor} opacity={skyOp} />
      <WcBlob id={id} cx={100} cy={groundY * 0.28} rx={90} ry={groundY * 0.22} fill={skyColor} opacity={skyOp * 0.5} edge />
      <WcBlob id={id} cx={200} cy={groundY * 0.3} rx={70} ry={groundY * 0.18} fill={skyColor} opacity={skyOp * 0.4} edge />
      <WcBlob id={id} cx={140} cy={groundY + 12} rx={160} ry={20} fill={groundColor} opacity={groundOp} />
      <WcBlob id={id} cx={80} cy={groundY + 8} rx={90} ry={14} fill={groundColor} opacity={groundOp * 0.55} edge />
      <WcBlob id={id} cx={210} cy={groundY + 10} rx={80} ry={13} fill={groundColor} opacity={groundOp * 0.5} edge />
    </>
  );
}

function InteriorWash({ id, floorY = 108, wallColor = '#C8D8E8', floorColor = '#D4C8A0' }: { id: string; w?: number; h?: number; floorY?: number; wallColor?: string; floorColor?: string }) {
  return (
    <>
      <WcDefs id={id} seed={7} scale={10} />
      <WcBlob id={id} cx={140} cy={floorY * 0.45} rx={165} ry={floorY * 0.5} fill={wallColor} opacity={0.3} />
      <WcBlob id={id} cx={60} cy={floorY * 0.3} rx={80} ry={floorY * 0.25} fill={wallColor} opacity={0.14} edge />
      <WcBlob id={id} cx={140} cy={floorY + 14} rx={155} ry={22} fill={floorColor} opacity={0.34} />
    </>
  );
}

function WaterWash({ id, waterY = 72, waterColor = '#5A9EC8', skyColor = '#A8D4EC' }: { id: string; w?: number; h?: number; waterY?: number; waterColor?: string; skyColor?: string }) {
  return (
    <>
      <WcDefs id={id} seed={11} scale={12} />
      <WcBlob id={id} cx={140} cy={waterY * 0.4} rx={170} ry={waterY * 0.5} fill={skyColor} opacity={0.26} />
      <WcBlob id={id} cx={140} cy={waterY + 34} rx={165} ry={40} fill={waterColor} opacity={0.22} />
      <WcBlob id={id} cx={90} cy={waterY + 20} rx={90} ry={20} fill={waterColor} opacity={0.16} edge />
      <WcBlob id={id} cx={200} cy={waterY + 22} rx={75} ry={18} fill={waterColor} opacity={0.14} edge />
    </>
  );
}

// ─── SCENE 1: GRAND PIANO DROP ────────────────────────────────────────────

function PianoScene({ ink, accent }: SceneProps) {
  const t = useCycleTime(6200);
  const resetP = ph(t, 0.92, 1.0);
  const opacity = resetP > 0 ? lerp(1, 0, resetP) : 1;

  const walkP = eO(ph(t, 0, 0.40));
  const pianoP = eI3(ph(t, 0.35, 0.56));
  const squishP = eO(ph(t, 0.54, 0.61));
  const scatP = eO(ph(t, 0.56, 0.88));
  const inScatter = t > 0.56 && t < 0.92;

  const figX = lerp(24, 138, walkP);
  const swing = t < 0.40 ? Math.sin(t * 54) * 13 : 0;
  const scaleY = lerp(1, 0.09, squishP);
  const scaleX = lerp(1, 3.2, squishP);
  const pianoY = lerp(-50, 108, pianoP);

  const PIECES = [
    { vx: -115, vy: -145, rot: 220, w: 26, h: 7 },
    { vx: 95, vy: -130, rot: -190, w: 20, h: 6 },
    { vx: -50, vy: -165, rot: 130, w: 7, h: 26 },
    { vx: 75, vy: -158, rot: -120, w: 7, h: 24 },
    { vx: -15, vy: -175, rot: 80, w: 6, h: 22 },
    { vx: -82, vy: -110, rot: 100, w: 28, h: 10 },
    { vx: 55, vy: -118, rot: -75, w: 24, h: 9 },
    { vx: 12, vy: -168, rot: 55, w: 14, h: 5 },
    { vx: -38, vy: -142, rot: -40, w: 11, h: 4 },
    { vx: 125, vy: -88, rot: 165, w: 10, h: 2 },
    { vx: -132, vy: -78, rot: -155, w: 9, h: 2 },
    { vx: 30, vy: -140, rot: 90, w: 5, h: 5 },
  ];
  const g = 260;

  return (
    <svg viewBox="0 0 280 140" width="100%" height="140" style={{ opacity, display: 'block', overflow: 'visible' }}>
      <InteriorWash id="piano" floorY={108} wallColor="#C2D4E8" floorColor="#D4C8A8" />
      <defs>
        <filter id="sk1">
          <feTurbulence type="fractalNoise" baseFrequency="0.07 0.05" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <clipPath id="gc1"><rect x="0" y="0" width="280" height="112" /></clipPath>
      </defs>
      <path d="M6,108 Q70,107 140,108 Q210,109 274,108" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {[68, 142, 214].map(x => (
        <path key={x} d={`M${x},108 L${x},115`} stroke={ink} strokeWidth="1.2" fill="none" opacity="0.22" />
      ))}
      <g clipPath="url(#gc1)" filter="url(#sk1)">
        <g transform={`translate(${figX},108) scale(${scaleX},${scaleY})`}>
          <circle cx="0" cy="-55" r="9" stroke={ink} strokeWidth="2.5" fill="none" />
          <path d={`M0,-46 Q1,-32 0,-18`} stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d={`M0,-38 Q${-7 + swing * 0.3},-32 ${-13 + swing * 0.45},-24`} stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d={`M0,-38 Q${7 - swing * 0.3},-32 ${13 - swing * 0.45},-24`} stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d={`M0,-18 Q${-5 + swing * 0.4},-9 ${-9 + swing * 0.55},0`} stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d={`M0,-18 Q${5 - swing * 0.4},-9 ${9 - swing * 0.55},0`} stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      </g>
      {t > 0.22 && !inScatter && (
        <g transform={`translate(${figX},${pianoY})`} filter="url(#sk1)">
          {pianoP < 0.75 && [-28, -6, 18].map((x, i) => (
            <line key={i} x1={x} y1="-52" x2={x - 2} y2={-64 - i * 4} stroke={ink} strokeWidth="1" opacity="0.28" />
          ))}
          <path d="M-36,-46 Q-40,-22 -36,0 L34,0 Q40,-12 38,-30 Q32,-46 -36,-46 Z" stroke={ink} strokeWidth="2.5" fill="none" strokeLinejoin="round" />
          <path d="M-36,-46 Q-8,-70 38,-30" stroke={ink} strokeWidth="2.5" fill="none" />
          <line x1="-2" y1="-46" x2="6" y2="-60" stroke={ink} strokeWidth="1.8" />
          <path d="M-24,0 L-24,-14 Q-4,-16 20,-14 L20,0" stroke={ink} strokeWidth="2" fill="none" />
          {[-18, -11, -4, 3, 10, 16].map((kx, i) => (
            <line key={i} x1={kx} y1="-14" x2={kx} y2="0" stroke={ink} strokeWidth="1.1" opacity="0.5" />
          ))}
          {[-15, -1, 13].map((kx, i) => (
            <rect key={i} x={kx} y="-14" width="5" height="8" fill={ink} opacity="0.75" />
          ))}
          <path d="M-28,0 Q-27,6 -26,18" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M10,0 Q11,6 13,18" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M-10,0 Q-9,5 -8,15" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      )}
      {inScatter && PIECES.map((p, i) => {
        const px = figX + p.vx * scatP;
        const py = 108 + p.vy * scatP + 0.5 * g * scatP * scatP;
        const ang = p.rot * scatP;
        return (
          <g key={i} transform={`translate(${px},${py}) rotate(${ang})`} opacity={Math.max(0, 1 - scatP * 1.05)} filter="url(#sk1)">
            <rect x={-p.w / 2} y={-p.h / 2} width={p.w} height={p.h} stroke={ink} strokeWidth="1.5" fill="none" rx="1" />
          </g>
        );
      })}
      {inScatter && (
        <g transform={`translate(${figX},108)`} opacity={Math.max(0, 1 - scatP * 1.3)}>
          {[-28, -12, 0, 14, 28].map((x, i) => (
            <ellipse key={i} cx={x} cy={-scatP * 10} rx={7 + i * 3} ry="3" stroke={ink} strokeWidth="1" fill="none" opacity="0.3" />
          ))}
        </g>
      )}
    </svg>
  );
}

// ─── SCENE 2: SWIMMER DISAPPEARS ──────────────────────────────────────────

function OceanScene({ ink }: SceneProps) {
  const t = useCycleTime(6800);
  const resetP = ph(t, 0.93, 1.0);
  const opacity = resetP > 0 ? lerp(1, 0, resetP) : 1;

  const waterY = 72;
  const swimP = ph(t, 0, 0.48);
  const bigWaveP = eI3(ph(t, 0.46, 0.68));
  const sinkP = eI3(ph(t, 0.58, 0.76));
  const calmP = ph(t, 0.74, 0.88);

  const figX = lerp(38, 168, swimP);
  const strokeCycle = t * Math.PI * 2 * 4.2;

  const wt = t * Math.PI * 2;
  const NUM = 21;
  const waveYs = Array.from({ length: NUM }, (_, i) => {
    const x = i * 14;
    return (
      waterY +
      Math.sin(x * 0.030 - wt * 0.9) * 4.5 +
      Math.sin(x * 0.055 + wt * 1.4) * 2.5 +
      Math.sin(x * 0.082 - wt * 1.8) * 1.5
    );
  });
  const waterPath = wavePath(waveYs, 0, 14);

  const bigWaveX = lerp(310, -40, bigWaveP);
  const bigWaveH = 32;
  const figSurfaceY = waveYs[Math.round(figX / 14)] || waterY;
  const figY = figSurfaceY - 10 + sinkP * 38;
  const figBodyOp = sinkP > 0 ? Math.max(0, 1 - sinkP * 2.0) : 1;

  return (
    <svg viewBox="0 0 280 140" width="100%" height="140" style={{ opacity, display: 'block', overflow: 'visible' }}>
      <WaterWash id="ocean" waterY={waterY} waterColor="#4A8EC4" skyColor="#A8D0EC" />
      <defs>
        <filter id="sk2">
          <feTurbulence type="fractalNoise" baseFrequency="0.07 0.05" numOctaves="2" seed="8" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <clipPath id="gc2above">
          <rect x="0" y="0" width="280" height={waterY + 6} />
        </clipPath>
      </defs>
      <rect x="0" y={waterY} width="280" height="72" fill={ink} opacity="0.06" />
      {[8, 16, 24].map((dy, i) => {
        const uy = Array.from({ length: NUM }, (_, j) => {
          const x = j * 14;
          return waterY + dy + Math.sin(x * 0.04 - wt * 0.7 + i) * 3;
        });
        return <path key={i} d={wavePath(uy, 0, 14)} stroke={ink} strokeWidth="1" fill="none" opacity={0.08 - i * 0.02} />;
      })}
      <g clipPath="url(#gc2above)" filter="url(#sk2)" opacity={figBodyOp}>
        <g transform={`translate(${figX},${figY})`}>
          <path d="M-20,0 Q0,3 20,0" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <circle cx="24" cy="-2" r="8" stroke={ink} strokeWidth="2.5" fill="none" />
          <path d={`M16,0 Q28,${-10 + Math.sin(strokeCycle) * 5} ${40 + Math.cos(strokeCycle) * 8},${-4 + Math.sin(strokeCycle) * 10}`} stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d={`M4,0 Q${-8 + Math.cos(strokeCycle + Math.PI) * 10},${4 + Math.sin(strokeCycle + Math.PI) * 5} ${-18},${6}`} stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d={`M-20,0 Q-24,${3 + Math.sin(strokeCycle * 2) * 7} -30,${7 + Math.sin(strokeCycle * 2) * 8}`} stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M-20,0 Q-24,${-2 + Math.sin(strokeCycle * 2 + 1.2) * 7} -30,${-5 + Math.sin(strokeCycle * 2 + 1.2) * 8}`} stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          {[0, 1, 2].map(i => (
            <circle key={i} cx={28 + i * 5} cy={-14 - i * 3} r="1.8" fill={ink} opacity={0.28 + Math.sin(strokeCycle + i) * 0.15} />
          ))}
        </g>
      </g>
      <path d={waterPath} stroke={ink} strokeWidth="2.2" fill="none" />
      {t > 0.44 && (
        <g transform={`translate(${bigWaveX},0)`} filter="url(#sk2)">
          <path d={`M0,${waterY} Q22,${waterY - bigWaveH} 55,${waterY - bigWaveH * 0.5} Q85,${waterY - 10} 110,${waterY}`} stroke={ink} strokeWidth="2.5" fill="none" />
          <path d={`M0,${waterY} Q22,${waterY - bigWaveH} 55,${waterY - bigWaveH * 0.5} Q85,${waterY - 10} 110,${waterY} L110,140 L0,140 Z`} fill={ink} opacity="0.07" />
          {[4, 14, 26, 40].map((x, i) => (
            <path key={i} d={`M${x + 3},${waterY - bigWaveH * 0.7 + i * 5} Q${x + 8},${waterY - bigWaveH * 0.85 + i * 5} ${x + 16},${waterY - bigWaveH * 0.7 + i * 5}`} stroke={ink} strokeWidth="1.3" fill="none" opacity="0.32" />
          ))}
        </g>
      )}
      {calmP > 0 && [0, 1, 2].map(i => (
        <ellipse key={i} cx={lerp(38, 168, 0.5)} cy={waterY + 4} rx={6 + i * 16 + calmP * 12} ry={3 + i * 1.5} stroke={ink} strokeWidth="1" fill="none" opacity={Math.max(0, 0.38 - i * 0.1 - calmP * 0.32)} />
      ))}
    </svg>
  );
}

// ─── SCENE 3: BRIDGE OUT ──────────────────────────────────────────────────

function BridgeScene({ ink }: SceneProps) {
  const t = useCycleTime(6400);
  const resetP = ph(t, 0.92, 1.0);
  const opacity = resetP > 0 ? lerp(1, 0, resetP) : 1;

  const deckY = 74;
  const gapL = 162;
  const gapR = 204;
  const gorgeB = 136;

  const wt = t * Math.PI * 2;
  const driveP = eO(ph(t, 0, 0.50));
  const wobbleP = ph(t, 0.50, 0.54);
  const fallP = eI3(ph(t, 0.54, 0.82));
  const splashP = ph(t, 0.82, 0.93);

  const edgeX = gapL - 26;
  const carBaseX = lerp(-20, edgeX, driveP);
  const wobbleX = carBaseX + wobbleP * 6;
  const wobbleAng = wobbleP * 8;
  const fallX = (t > 0.54 ? edgeX + 6 : wobbleX) + fallP * 38;
  const fallY = deckY + (t > 0.54 ? eI(fallP) * (gorgeB - deckY + 10) : 0);
  const fallAng = (t > 0.54 ? wobbleAng + fallP * 100 : wobbleAng);
  const carX = t > 0.54 ? fallX : wobbleX;
  const carY = t > 0.54 ? fallY : deckY;
  const carAng = t > 0.54 ? fallAng : wobbleAng;
  const showCar = t < 0.93;

  const NUM_W = 19;
  const gorgeWaveYs = Array.from({ length: NUM_W }, (_, i) => {
    const x = gapL + (i / (NUM_W - 1)) * (gapR - gapL);
    return gorgeB + Math.sin(x * 0.12 - wt * 1.2) * 2.2 + Math.sin(x * 0.22 + wt * 0.9) * 1.2;
  });

  return (
    <svg viewBox="0 0 280 140" width="100%" height="140" style={{ opacity, display: 'block', overflow: 'visible' }}>
      <OutdoorWash id="bridge" groundY={deckY} skyColor="#A8C8E4" groundColor="#8AB880" skyOp={0.28} groundOp={0.3} />
      <WcDefs id="bridgegorge" seed={13} scale={10} />
      <WcBlob id="bridgegorge" cx={(gapL + gapR) / 2} cy={gorgeB + 8} rx={30} ry={12} fill="#4A8EC4" opacity={0.3} />
      <defs>
        <filter id="sk3">
          <feTurbulence type="fractalNoise" baseFrequency="0.065 0.05" numOctaves="2" seed="13" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.1" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <clipPath id="gc3full"><rect x="0" y="0" width="280" height="140" /></clipPath>
      </defs>
      <path d={`M${gapL},${deckY} L${gapL - 4},${gorgeB + 4} L${gapL},${gorgeB + 4}`} stroke={ink} strokeWidth="1.5" fill={ink} opacity="0.06" strokeLinejoin="round" />
      <path d={`M${gapR},${deckY} L${gapR + 4},${gorgeB + 4} L${gapR},${gorgeB + 4}`} stroke={ink} strokeWidth="1.5" fill={ink} opacity="0.06" strokeLinejoin="round" />
      {[6, 14, 22].map(dy => (
        <line key={dy} x1={gapL - 3} y1={deckY + dy} x2={gapL - 1} y2={deckY + dy + 4} stroke={ink} strokeWidth="0.8" opacity="0.12" />
      ))}
      <rect x={gapL} y={gorgeB} width={gapR - gapL} height={10} fill={ink} opacity="0.06" />
      <path d={wavePath(gorgeWaveYs, gapL, (gapR - gapL) / (NUM_W - 1))} stroke={ink} strokeWidth="1.4" fill="none" opacity="0.3" />
      <g filter="url(#sk3)">
        <line x1="2" y1={deckY} x2={gapL} y2={deckY} stroke={ink} strokeWidth="3" strokeLinecap="round" />
        <line x1="2" y1={deckY + 12} x2={gapL} y2={deckY + 12} stroke={ink} strokeWidth="1.8" opacity="0.4" strokeLinecap="round" />
        <line x1="60" y1={deckY - 22} x2={gapL - 2} y2={deckY - 22} stroke={ink} strokeWidth="1.8" />
        {[60, 85, 110, 135, 157].map(x => (
          <line key={x} x1={x} y1={deckY} x2={x} y2={deckY - 22} stroke={ink} strokeWidth="1.5" />
        ))}
        {[60, 85, 110, 135].map((x) => (
          <line key={x} x1={x} y1={deckY - 22} x2={x + 25} y2={deckY} stroke={ink} strokeWidth="1.2" opacity="0.6" />
        ))}
        {[20, 52, 84, 118].map(x => (
          <line key={x} x1={x} y1={deckY + 6} x2={x + 20} y2={deckY + 6} stroke={ink} strokeWidth="1.5" opacity="0.2" />
        ))}
        <path d={`M${gapL},${deckY} L${gapL + 6},${deckY + 9} L${gapL + 11},${deckY + 4} L${gapL + 14},${deckY + 12}`} stroke={ink} strokeWidth="2" fill="none" />
        <path d={`M${gapL},${deckY + 12} L${gapL + 8},${deckY + 18} L${gapL + 13},${deckY + 14}`} stroke={ink} strokeWidth="1.5" fill="none" opacity="0.5" />
        <line x1={gapR} y1={deckY} x2="278" y2={deckY} stroke={ink} strokeWidth="3" strokeLinecap="round" />
        <line x1={gapR} y1={deckY + 12} x2="278" y2={deckY + 12} stroke={ink} strokeWidth="1.8" opacity="0.4" strokeLinecap="round" />
        <line x1={gapR + 2} y1={deckY - 22} x2="270" y2={deckY - 22} stroke={ink} strokeWidth="1.8" />
        {[gapR + 2, gapR + 24, gapR + 46].map(x => (
          <line key={x} x1={x} y1={deckY} x2={x} y2={deckY - 22} stroke={ink} strokeWidth="1.5" />
        ))}
        <path d={`M${gapR},${deckY} L${gapR - 6},${deckY + 9} L${gapR - 10},${deckY + 4} L${gapR - 14},${deckY + 12}`} stroke={ink} strokeWidth="2" fill="none" />
        <line x1={gapL - 28} y1={deckY - 16} x2={gapL - 6} y2={deckY} stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
        <line x1={gapL - 28} y1={deckY} x2={gapL - 6} y2={deckY - 16} stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
        <line x1={gapL - 17} y1={deckY - 18} x2={gapL - 17} y2={deckY + 2} stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        <rect x={gapL - 28} y={deckY - 38} width="22" height="14" rx="1" stroke={ink} strokeWidth="1.8" fill="none" />
        <line x1={gapL - 24} y1={deckY - 30} x2={gapL - 10} y2={deckY - 30} stroke={ink} strokeWidth="2" strokeLinecap="round" />
        <line x1={gapL - 17} y1={deckY - 24} x2={gapL - 17} y2={deckY - 18} stroke={ink} strokeWidth="1.8" />
      </g>
      {showCar && (
        <g transform={`translate(${carX},${carY}) rotate(${carAng})`} filter="url(#sk3)" clipPath="url(#gc3full)">
          <path d="M-28,0 L-28,-13 L28,-13 L28,0 Z" stroke={ink} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
          <path d="M-14,-13 Q-10,-26 12,-26 Q20,-26 22,-13" stroke={ink} strokeWidth="2.2" fill="none" />
          <line x1="-1" y1="-26" x2="-1" y2="-13" stroke={ink} strokeWidth="1.2" opacity="0.4" />
          <circle cx="8" cy="-20" r="4.5" stroke={ink} strokeWidth="1.8" fill="none" />
          <line x1="8" y1="-15.5" x2="8" y2="-13" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="5" y1="-16" x2="1" y2="-14" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="-16" x2="15" y2="-14" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="-16" cy="0" r="8" stroke={ink} strokeWidth="2.2" fill="none" />
          <circle cx="16" cy="0" r="8" stroke={ink} strokeWidth="2.2" fill="none" />
          <circle cx="-16" cy="0" r="3" stroke={ink} strokeWidth="1.2" fill="none" opacity="0.4" />
          <circle cx="16" cy="0" r="3" stroke={ink} strokeWidth="1.2" fill="none" opacity="0.4" />
          <line x1="28" y1="-9" x2="36" y2="-8" stroke={ink} strokeWidth="1.8" strokeLinecap="round" opacity="0.4" />
          <line x1="28" y1="-6" x2="36" y2="-6" stroke={ink} strokeWidth="1.8" strokeLinecap="round" opacity="0.4" />
        </g>
      )}
      {t < 0.50 && driveP > 0.08 && [0, 1, 2].map(i => (
        <line key={i} x1={carX - 32 - i * 14} y1={deckY - 5 + i * 7} x2={carX - 46 - i * 14} y2={deckY - 5 + i * 7} stroke={ink} strokeWidth="1" opacity={0.22 - i * 0.05} />
      ))}
      {splashP > 0 && [0, 36, 72, 108, 145, 182, 218, 252, 290, 324].map((deg, i) => {
        const rad = deg * Math.PI / 180;
        const r = 4 + splashP * 30;
        return (
          <line key={i} x1={(gapL + gapR) / 2 + Math.cos(rad) * 4} y1={gorgeB + 3 + Math.sin(rad) * 2} x2={(gapL + gapR) / 2 + Math.cos(rad) * r} y2={gorgeB + 3 + Math.sin(rad) * r * 0.38} stroke={ink} strokeWidth="1.5" opacity={Math.max(0, 1 - splashP * 1.1)} />
        );
      })}
      {splashP > 0.4 && [0, 1].map(i => (
        <ellipse key={i} cx={(gapL + gapR) / 2} cy={gorgeB + 3} rx={4 + (splashP - 0.4) * 30 + i * 10} ry={2 + (splashP - 0.4) * 5} stroke={ink} strokeWidth="1" fill="none" opacity={Math.max(0, 0.4 - (splashP - 0.4) * 1.2 - i * 0.1)} />
      ))}
    </svg>
  );
}

// ─── SCENE 4: PASSENGER JET ───────────────────────────────────────────────

function PlaneScene({ ink, accent }: SceneProps) {
  const t = useCycleTime(6800);
  const resetP = ph(t, 0.93, 1.0);
  const opacity = resetP > 0 ? lerp(1, 0, resetP) : 1;

  const flyP = ph(t, 0, 0.35);
  const diveP = eI3(ph(t, 0.42, 0.84));
  const impactP = eO(ph(t, 0.84, 0.93));
  const showFire = t > 0.30 && t < 0.84;
  const showImpact = t > 0.84 && t < 0.94;

  const baseX = lerp(18, 210, flyP);
  const swoopX = diveP > 0 ? baseX + Math.sin(diveP * Math.PI * 1.6) * 52 * diveP : baseX;
  const planeY = 40 + diveP * 62;
  const ang = diveP * 88;

  const engOffX = Math.cos((ang - 25) * Math.PI / 180) * 22;
  const engOffY = Math.sin((ang - 25) * Math.PI / 180) * 22 + 16;
  const engX = swoopX + engOffX;
  const engY = planeY + engOffY;
  const tailDirRad = (ang + 180) * Math.PI / 180;

  function Jet({ x, y, angle }: { x: number; y: number; angle: number }) {
    return (
      <g transform={`translate(${x},${y}) rotate(${angle})`} filter="url(#sk4)">
        <path d="M-40,0 Q-40,-7 -16,-9 Q10,-10 36,-5 Q46,0 36,5 Q10,10 -16,9 Q-40,7 -40,0 Z" stroke={ink} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
        <path d="M36,-5 Q50,0 36,5" stroke={ink} strokeWidth="2" fill="none" />
        <path d="M28,-9 Q32,-14 38,-8" stroke={ink} strokeWidth="1.2" fill="none" opacity="0.5" />
        {[18, 8, -2, -12, -22].map((wx, i) => (
          <ellipse key={i} cx={wx} cy="-4" rx="3.5" ry="3" stroke={ink} strokeWidth="1.1" fill="none" opacity="0.55" />
        ))}
        <path d="M10,-9 Q2,-22 -12,-32 L-24,-30 Q-18,-16 -20,-9" stroke={ink} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
        <path d="M10,9 Q2,22 -12,32 L-24,30 Q-18,16 -20,9" stroke={ink} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
        <path d="M-8,-28 Q-14,-34 -20,-28 Q-14,-22 -8,-28" stroke={ink} strokeWidth="1.8" fill="none" />
        <path d="M-8,28 Q-14,34 -20,28 Q-14,22 -8,28" stroke={ink} strokeWidth="1.8" fill="none" />
        <line x1="-8" y1="-28" x2="-5" y2="-28" stroke={ink} strokeWidth="2" strokeLinecap="round" />
        <line x1="-8" y1="28" x2="-5" y2="28" stroke={ink} strokeWidth="2" strokeLinecap="round" />
        <path d="M-40,0 L-46,-22 Q-44,-24 -38,-18 L-36,-9" stroke={ink} strokeWidth="2" fill="none" strokeLinejoin="round" />
        <path d="M-36,-9 L-46,-18 L-40,-18 L-34,-9" stroke={ink} strokeWidth="1.6" fill="none" strokeLinejoin="round" />
        <path d="M-36,9 L-46,18 L-40,18 L-34,9" stroke={ink} strokeWidth="1.6" fill="none" strokeLinejoin="round" />
        <rect x="-30" y="-9" width="7" height="9" stroke={ink} strokeWidth="0.9" fill="none" rx="1" opacity="0.32" />
      </g>
    );
  }

  return (
    <svg viewBox="0 0 280 140" width="100%" height="140" style={{ opacity, display: 'block', overflow: 'visible' }}>
      <OutdoorWash id="plane" groundY={108} skyColor="#A0C8E8" groundColor="#88B878" skyOp={0.34} groundOp={0.32} />
      <defs>
        <filter id="sk4">
          <feTurbulence type="fractalNoise" baseFrequency="0.065 0.05" numOctaves="2" seed="17" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      {[[32, 22], [194, 16], [112, 36]].map(([cx, cy], i) => (
        <g key={i} opacity="0.18" filter="url(#sk4)">
          <ellipse cx={cx} cy={cy} rx="28" ry="11" stroke={ink} strokeWidth="1.8" fill="none" />
          <ellipse cx={cx + 18} cy={cy - 6} rx="22" ry="10" stroke={ink} strokeWidth="1.8" fill="none" />
          <ellipse cx={cx - 15} cy={cy - 4} rx="18" ry="9" stroke={ink} strokeWidth="1.8" fill="none" />
        </g>
      ))}
      <path d="M0,108 Q80,107 140,108 Q200,109 280,108" stroke={ink} strokeWidth="2" fill="none" opacity="0.28" />
      {[12, 44, 80, 222, 252].map((x, i) => (
        <g key={i} opacity="0.14" filter="url(#sk4)">
          <line x1={x} y1="108" x2={x} y2={98} stroke={ink} strokeWidth="2.2" />
          <path d={`M${x - 7},98 Q${x},87 ${x + 7},98 Z`} stroke={ink} strokeWidth="1.6" fill="none" />
        </g>
      ))}
      {t > 0.06 && t < 0.38 && (
        <path d={`M${Math.max(8, baseX - 60)},${planeY} L${baseX - 8},${planeY}`} stroke={ink} strokeWidth="1.2" fill="none" opacity="0.14" strokeDasharray="5 8" />
      )}
      {diveP > 0 && !showImpact && (
        <path d={`M${baseX},40 Q${swoopX - 18},${planeY - 12} ${swoopX},${planeY}`} stroke={ink} strokeWidth="1" fill="none" opacity="0.11" strokeDasharray="3 5" />
      )}
      {!showImpact && <Jet x={swoopX} y={planeY} angle={ang} />}
      {showFire && [0, 1, 2, 3].map(i => {
        const fx = engX + Math.cos(tailDirRad) * (6 + i * 8);
        const fy = engY + Math.sin(tailDirRad) * (6 + i * 8) + Math.sin(i * 2.1 + t * 50) * 3.5;
        return (
          <ellipse key={i} cx={fx} cy={fy} rx={Math.max(0.5, 5.5 - i * 1.1)} ry={Math.max(0.5, 3.2 - i * 0.65)} stroke={accent} strokeWidth="2" fill="none" opacity={0.95 - i * 0.22} transform={`rotate(${ang}, ${fx}, ${fy})`} />
        );
      })}
      {showImpact && [0, 24, 48, 72, 96, 120, 148, 174, 200, 228, 255, 282, 310, 338].map((deg, i) => {
        const rad = deg * Math.PI / 180;
        const r = 4 + impactP * 72;
        return (
          <line key={i} x1={swoopX + Math.cos(rad) * 3} y1={108 + Math.sin(rad) * 2} x2={swoopX + Math.cos(rad) * r} y2={108 + Math.sin(rad) * r * 0.4} stroke={accent} strokeWidth="2" opacity={Math.max(0, 1 - impactP * 1.05)} />
        );
      })}
    </svg>
  );
}

// ─── MORTALITY ROW ────────────────────────────────────────────────────────

export function MortalityRow() {
  const th = useTheme();
  const ink = th.ink;
  const accent = th.accent;
  const border = th.border;
  const muted = th.muted;

  const SCENES = [PianoScene, OceanScene, BridgeScene, PlaneScene];
  const TILTS = [-0.5, 0.4, -0.3, 0.5];

  return (
    <section style={{ padding: '8px 24px 60px', maxWidth: 980, margin: '0 auto' }}>
      <p
        style={{
          textAlign: 'center',
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          color: muted,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 20,
          opacity: 0.7,
        }}
      >
        any of these could happen on a perfectly ordinary tuesday
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        {SCENES.map((Comp, i) => (
          <div
            key={i}
            style={{
              background: '#FAFBFC',
              border: `2px solid ${border}`,
              borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
              overflow: 'hidden',
              padding: '8px 6px 2px',
              transform: `rotate(${TILTS[i]}deg)`,
            }}
          >
            <Comp ink={ink} accent={accent} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SceneCard({ scene, style }: { scene: 'piano' | 'ocean' | 'bridge' | 'plane'; style?: CSSProperties }) {
  const th = useTheme();
  const ink = th.ink;
  const accent = th.accent;
  const border = th.border;
  const MAP = { piano: PianoScene, ocean: OceanScene, bridge: BridgeScene, plane: PlaneScene };
  const Comp = MAP[scene] || PianoScene;
  return (
    <div
      style={{
        background: '#FAFBFC',
        border: `2px solid ${border}`,
        borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
        overflow: 'hidden',
        padding: '8px 6px 2px',
        ...style,
      }}
    >
      <Comp ink={ink} accent={accent} />
    </div>
  );
}

export { PianoScene, OceanScene, BridgeScene, PlaneScene, WcDefs, WcBlob, OutdoorWash, InteriorWash, WaterWash };

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import type { Rarity } from '../player-card/types';
import type { PackData } from './types';
import { SPARKS, TEAR_Y, createOpeningTimeline } from './opening';
import './Pack.css';

gsap.registerPlugin(useGSAP);

const LABELS = {
  pack: 'Pack',
  cards: 'Cards',
  unopened: 'Unopened',
  open: 'Open',
  tier: {
    common: 'Standard series',
    rare: 'Rare series',
    epic: 'Epic series',
    legendary: 'Legendary series',
  } satisfies Record<Rarity, string>,
};

const STARS: Record<Rarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

/*
 * La apertura es una sola timeline de GSAP (ver opening.ts); acá sólo cambiamos
 * de fase y avisamos. `onReveal` se dispara en el pico del destello final: en
 * ese instante el sobre ya no se ve y el padre puede montar lo que sale de adentro.
 */
const TEAR_CLIPS = tearClips(22);

type Phase = 'sealed' | 'opening' | 'opened';

interface PackProps {
  pack: PackData;
  /** Tilt 3D + brillo que sigue al puntero */
  interactive?: boolean;
  /** Click / Enter / Espacio abren el sobre */
  openable?: boolean;
  /**
   * Se llama al pedir la apertura; la apertura arranca recién cuando la promesa se resuelve
   * (ej: confirmar, llevar el sobre al centro). Si resuelve `false` o falla, no se abre.
   */
  onOpenRequest?: () => Promise<boolean | void>;
  onOpenStart?: () => void;
  /** Se llama en el pico del destello: el sobre ya no se ve, es el momento de mostrar el contenido */
  onOpened?: () => void;
  /**
   * Arranca la apertura sola al montarse, sin esperar un click: para un escenario que ya
   * confirmó la compra y solo tiene que mostrar el sobre abriéndose. Requiere `openable`.
   */
  autoOpen?: boolean;
}

export function Pack({
  pack,
  interactive = true,
  openable = true,
  onOpenRequest,
  onOpenStart,
  onOpened,
  autoOpen = false,
}: PackProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);
  const frame = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const onOpenedRef = useRef(onOpened);
  const [phase, setPhase] = useState<Phase>('sealed');

  useEffect(() => {
    onOpenedRef.current = onOpened;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = mq.matches;
    const update = (e: MediaQueryListEvent) => (reducedMotion.current = e.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Corre cuando pasamos a 'opening', ya con las dos copias del frente y los efectos
  // montados. Sin revertOnUpdate: pasar a 'opened' en el pico del destello no tiene que
  // deshacer la timeline (que sigue hasta apagar el destello); se limpia al desmontar.
  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || phase !== 'opening') return;
      createOpeningTimeline(
        root,
        () => {
          setPhase('opened');
          onOpenedRef.current?.();
        },
        reducedMotion.current,
      );
    },
    { scope: rootRef, dependencies: [phase] },
  );

  // Mismo esquema que PlayerCard: custom properties en el nodo y un solo write por frame.
  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = packRef.current;
    if (!el || !interactive || reducedMotion.current || phase !== 'sealed' || pending.current) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = clamp01((clientX - r.left) / r.width);
      const py = clamp01((clientY - r.top) / r.height);
      el.style.setProperty('--rx', `${(0.5 - py) * 14}deg`);
      el.style.setProperty('--ry', `${(px - 0.5) * 18}deg`);
      el.style.setProperty('--mx', `${(px * 100).toFixed(2)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(2)}%`);
      el.style.setProperty('--hyp', Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 2).toFixed(3));
      el.dataset.active = 'true';
    });
  };

  const handleLeave = () => {
    const el = packRef.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    ['--rx', '--ry', '--mx', '--my', '--hyp'].forEach((p) => el.style.removeProperty(p));
    delete el.dataset.active;
  };

  const open = async () => {
    if (!openable || phase !== 'sealed' || pending.current) return;
    pending.current = true;
    // el sobre vuelve a quedar derecho antes de moverse y sacudirse
    handleLeave();
    try {
      const proceed = await onOpenRequest?.();
      if (proceed === false) {
        pending.current = false;
        return;
      }
    } catch {
      pending.current = false;
      return;
    }
    if (!mounted.current) return;
    setPhase('opening');
    onOpenStart?.();
  };

  // Una sola vez al montar: `pending` evita la segunda llamada del doble montaje de StrictMode.
  useEffect(() => {
    if (autoOpen) void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { name, tier, series, cardCount } = pack;
  const label = `${name} ${LABELS.pack}, ${LABELS.tier[tier]}, ${cardCount} ${LABELS.cards}, ${series}`;

  const style = {
    '--name-scale': Math.min(1, 7 / name.length),
    '--tear-y': `${TEAR_Y}cqw`,
    '--clip-top': TEAR_CLIPS.top,
    '--clip-bottom': TEAR_CLIPS.bottom,
  } as CSSProperties;

  const face = (
    <PackFace name={name} tier={tier} series={series} banner={`${cardCount} ${LABELS.cards}`} />
  );

  return (
    <div ref={rootRef} className="pk-root" data-phase={phase}>
      <div className="pk-float">
        {/* el temblor va en este envoltorio: .pk ya usa transform para el tilt */}
        <div className="pk__shake">
          <div
            ref={packRef}
            className="pk"
            data-tier={tier}
            style={style}
            onPointerMove={handleMove}
            onPointerLeave={handleLeave}
            onClick={openable ? open : undefined}
            role={openable ? 'button' : 'img'}
            tabIndex={openable && phase === 'sealed' ? 0 : undefined}
            aria-disabled={openable && phase !== 'sealed' ? true : undefined}
            onKeyDown={
              openable
                ? (e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    void open();
                  }
                : undefined
            }
            aria-label={openable ? `${LABELS.open} ${label}` : label}
          >
            <div className="pk__aura" aria-hidden="true" />

            {phase !== 'sealed' && (
              <div className="pk__fx" aria-hidden="true">
                <div className="pk__rays" />
                <div className="pk__beam" />
                <div className="pk__cards">
                  {Array.from({ length: Math.min(cardCount, 3) }, (_, i) => (
                    <span key={i} className="pk__card" />
                  ))}
                </div>
              </div>
            )}

            {/* El frente se dibuja dos veces mientras se abre: cada copia recortada a un
             * lado del corte en zigzag, así la tira de arriba puede salir volando. */}
            <div className="pk__piece pk__piece--main" aria-hidden="true">
              {face}
            </div>
            {phase !== 'sealed' && (
              <div className="pk__piece pk__piece--top" aria-hidden="true">
                {face}
              </div>
            )}

            {phase !== 'sealed' && (
              <div className="pk__fx pk__fx--front" aria-hidden="true">
                <div className="pk__cut" />
                {SPARKS.map((s, i) => (
                  <span
                    key={i}
                    className="pk__spark"
                    style={{ '--x': `${s.x}%`, '--w': `${s.w}cqw` } as CSSProperties}
                  />
                ))}
                <div className="pk__flash" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- frente del sobre ---------- */

function PackFace({ name, tier, series, banner }: { name: string; tier: Rarity; series: string; banner: string }) {
  return (
    <>
      <div className="pk__glow">
        <div className="pk__frame" />
      </div>
      <span className="pk__notch pk__notch--l" />
      <span className="pk__notch pk__notch--r" />

      <div className="pk__body">
        <div className="pk__seal">
          <span className="pk__corner pk__corner--neon">
            <BallIcon />
          </span>
          <span className="pk__stars">
            {Array.from({ length: STARS[tier] }, (_, i) => (
              <StarIcon key={i} />
            ))}
          </span>
          <span className="pk__corner pk__corner--accent">
            <CrownIcon />
          </span>
        </div>

        <Emblem banner={banner} />

        <h2 className="pk__title">
          <span className="pk__title-name">{name}</span>
          <span className="pk__title-pack">{LABELS.pack}</span>
        </h2>

        <p className="pk__ribbon">
          {LABELS.tier[tier]} <span>/</span> {LABELS.unopened}
        </p>

        <p className="pk__series">{series}</p>

        <div className="pk__holo" />
        <div className="pk__sheen" />
        <div className="pk__glare" />
        <div className="pk__tear-glow" />
      </div>

      <div className="pk__lock">
        <div className="pk__lock-ring">
          <div className="pk__lock-accent">
            <div className="pk__lock-core">
              <LockIcon />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Polígonos complementarios para partir el sobre en la línea de corte.
 * Los dientes tienen alturas irregulares (pero deterministas) para que se lea
 * como un rasgado y no como una sierra. Se extienden fuera de la caja para no
 * recortar el glow de los costados.
 */
function tearClips(teeth: number) {
  const pts = Array.from({ length: teeth + 1 }, (_, i) => {
    const x = (i / teeth) * 100;
    const amp = 0.45 + ((i * 7) % 5) * 0.2;
    const y = TEAR_Y + (i % 2 ? amp : -amp);
    return `${x.toFixed(2)}% ${y.toFixed(2)}cqw`;
  });
  const edge = `${TEAR_Y}cqw`;
  return {
    top: `polygon(-40% -40%, 140% -40%, 140% ${edge}, ${[...pts].reverse().join(', ')}, -40% ${edge})`,
    bottom: `polygon(-40% ${edge}, ${pts.join(', ')}, 140% ${edge}, 140% 140%, -40% 140%)`,
  };
}


/* ---------- piezas chicas ---------- */

/** Escudo central. Los gradientes usan ids únicos: con varios sobres en pantalla
 * un id repetido haría que todos tomen los colores de rareza del primero. */
function Emblem({ banner }: { banner: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gold = `pk-gold-${uid}`;
  const core = `pk-core-${uid}`;
  const fig = `pk-fig-${uid}`;

  return (
    <svg className="pk__emblem" viewBox="0 0 200 236">
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--accent-1)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--accent-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent-1)' }} />
        </linearGradient>
        <radialGradient id={core} cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor="#2a8fe0" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#0d2a5c" />
          <stop offset="1" stopColor="#050d24" />
        </radialGradient>
        <linearGradient id={fig} x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#9deeff" />
          <stop offset="1" stopColor="#2a9dff" />
        </linearGradient>
      </defs>

      <path d="M100 6 L186 35 V110 C186 167 149 206 100 228 C51 206 14 167 14 110 V35 Z" fill={`url(#${gold})`} />
      <path
        d="M100 17 L175 42 V110 C175 160 142 195 100 215 C58 195 25 160 25 110 V42 Z"
        fill={`url(#${core})`}
        stroke="#5fdcff"
        strokeWidth="2.5"
      />
      <path
        d="M100 29 L163 50 V110 C163 152 135 182 100 199 C65 182 37 152 37 110 V50 Z"
        fill="none"
        stroke="#5fdcff"
        strokeOpacity="0.28"
        strokeWidth="1"
      />

      {/* jugador rematando */}
      <g
        className="pk__figure"
        transform="translate(46 40) scale(1.06)"
        stroke={`url(#${fig})`}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <circle cx="58" cy="15" r="8.5" fill={`url(#${fig})`} stroke="none" />
        <polyline points="56,28 49,52" strokeWidth="13" />
        <polyline points="54,31 40,39 33,51" strokeWidth="7" />
        <polyline points="58,31 71,37 81,30" strokeWidth="7" />
        <polyline points="49,52 43,71 46,91" strokeWidth="9" />
        <polyline points="49,52 64,62 78,57" strokeWidth="9" />
        <circle cx="89" cy="64" r="8.5" fill="#eafaff" stroke="#5fdcff" strokeWidth="1.5" />
        <path d="M89 60 L92.6 62.6 L91.2 66.8 H86.8 L85.4 62.6 Z" fill="#0b2a5a" stroke="none" />
      </g>

      {/* cinta inferior */}
      <path d="M26 162 H174 L163 179 L174 196 H26 L37 179 Z" fill={`url(#${gold})`} />
      <path d="M33 166.5 H165 L157 179 L165 191.5 H33 L41 179 Z" fill="#081633" />
      <text className="pk__banner-text" x="100" y="184.5" textAnchor="middle">
        {banner}
      </text>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="pk__star" viewBox="0 0 24 24">
      <path d="M12 2.4l2.95 6.05 6.65.85-4.88 4.6 1.25 6.6L12 17.3l-5.97 3.2 1.25-6.6-4.88-4.6 6.65-.85z" />
    </svg>
  );
}

function BallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" fill="currentColor" />
      <path d="M12 8.2V3.2M15.6 10.8l4.6-1.6M14.2 15l2.9 4.1M9.8 15l-2.9 4.1M8.4 10.8L3.8 9.2" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 17.5L4.6 7.2l4.6 4.3L12 4.8l2.8 6.7 4.6-4.3L21 17.5z" />
      <rect x="3.4" y="18.8" width="17.2" height="2.2" rx="0.6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="pk__lock-icon" viewBox="0 0 24 24">
      <path className="pk__shackle" d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="5" y="10.5" width="14" height="10.5" rx="2.2" fill="currentColor" />
      <circle cx="12" cy="15" r="1.6" fill="#0a1530" />
      <path d="M12 15.5v2.6" stroke="#0a1530" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

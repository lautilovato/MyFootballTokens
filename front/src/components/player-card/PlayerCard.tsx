import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import type { PlayerCardData, Rarity } from './types';
import './PlayerCard.css';

const LABELS = {
  scarcity: 'Token scarcity',
  price: 'Current price',
  minted: 'Minted',
  club: 'Club',
  ovr: 'OVR',
  footer: 'NFT collectible',
  rarity: {
    common: 'Common',
    rare: 'Rare',
    epic: 'Epic',
    legendary: 'Legendary',
  } satisfies Record<Rarity, string>,
};

interface PlayerCardProps {
  player: PlayerCardData;
  /** Tilt 3D + brillo holográfico que sigue al puntero */
  interactive?: boolean;
  footerLabel?: string;
  onClick?: () => void;
}

export function PlayerCard({
  player,
  interactive = true,
  footerLabel = LABELS.footer,
  onClick,
}: PlayerCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);
  const frame = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = mq.matches;
    const update = (e: MediaQueryListEvent) => (reducedMotion.current = e.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Se escriben CSS custom properties directo en el nodo: cero re-renders por movimiento.
  // El pointermove puede disparar más rápido que el refresco, así que colapsamos
  // en un rAF: una sola escritura por frame y el foil no se entrecorta.
  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el || !interactive || reducedMotion.current) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = clamp01((clientX - r.left) / r.width);
      const py = clamp01((clientY - r.top) / r.height);
      el.style.setProperty('--rx', `${(0.5 - py) * 12}deg`);
      el.style.setProperty('--ry', `${(px - 0.5) * 16}deg`);
      el.style.setProperty('--mx', `${(px * 100).toFixed(2)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(2)}%`);
      // 0 en el centro, 1 en las esquinas: satura el foil al alejarse del centro
      el.style.setProperty('--hyp', Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 2).toFixed(3));
      el.dataset.active = 'true';
    });
  };

  const handleLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    ['--rx', '--ry', '--mx', '--my', '--hyp'].forEach((p) => el.style.removeProperty(p));
    delete el.dataset.active;
  };

  const { name, position, overall, club, nationality, photoUrl, token, price, stats } = player;
  const trend = price.changePct >= 0 ? 'up' : 'down';
  const formattedPrice = formatPrice(price.current, price.currency);

  const style = {
    '--name-scale': Math.min(1, 10 / name.length),
    '--price-scale': Math.min(1, 4.5 / formattedPrice.length),
  } as CSSProperties;

  return (
    <div className="pc-root">
      <div
        ref={cardRef}
        className="pc"
        data-rarity={token.rarity}
        data-trend={trend}
        style={style}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onClick={onClick}
        role={onClick ? 'button' : 'article'}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
        aria-label={`${name}, ${position}, ${club.name}, ${overall} ${LABELS.ovr}`}
      >
        <div className="pc__glow" aria-hidden="true">
          <div className="pc__frame" />
        </div>

        <div className="pc__panel">
          <div className="pc__art">
            {photoUrl ? (
              <img className="pc__photo" src={photoUrl} alt="" draggable={false} />
            ) : (
              <PlayerSilhouette />
            )}

            <aside className="pc__side">
              <div className="pc__side-inner">
                <img
                  className="pc__flag"
                  src={`https://flagcdn.com/w160/${nationality.code.toLowerCase()}.png`}
                  alt={nationality.name}
                  title={nationality.name}
                  loading="lazy"
                />
                <span className="pc__position">{position}</span>
                {club.crestUrl ? (
                  <img className="pc__crest" src={club.crestUrl} alt={club.name} loading="lazy" />
                ) : (
                  <CrestFallback name={club.name} />
                )}
              </div>
            </aside>
          </div>

          <header className="pc__identity">
            <h2 className="pc__name">{name}</h2>
            <p className="pc__club">
              {LABELS.club}: {club.name}
            </p>
          </header>

          <div className="pc__rule" aria-hidden="true" />

          <section className="pc__market">
            <div className="pc__scarcity">
              <h3 className="pc__label">{LABELS.scarcity}</h3>
              <span className="pc__rarity">
                {LABELS.rarity[token.rarity]}
                {token.serial != null && ` ${token.serial}/${token.supply}`}
              </span>
              <p className="pc__minted">
                {LABELS.minted}: {token.minted}/{token.supply}
              </p>
              {price.history.length > 1 && <Sparkline data={price.history} />}
            </div>

            <div className="pc__price">
              <h3 className="pc__label">{LABELS.price}</h3>
              <data className="pc__amount" value={price.current}>
                {formattedPrice}
              </data>
              <span className="pc__change">
                <span aria-hidden="true">{trend === 'up' ? '▲' : '▼'}</span>
                {' '}
                {price.changePct > 0 ? '+' : ''}
                {price.changePct.toFixed(1)}%
              </span>
              <span className="pc__currency">{price.currency}</span>
            </div>
          </section>

          <dl className="pc__stats">
            {stats.map((s) => (
              <div className="pc__stat" key={s.label} title={s.title}>
                <dt>{s.label}:</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="pc__holo" aria-hidden="true" />
          <div className="pc__sparkle" aria-hidden="true" />
          <div className="pc__glare" aria-hidden="true" />
        </div>

        <div className="pc__ovr">
          <div className="pc__ovr-ring">
            <div className="pc__ovr-gold">
              <div className="pc__ovr-core">
                <span className="pc__ovr-value">{overall}</span>
                <span className="pc__ovr-label">{LABELS.ovr}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pc__plaque">
          <span>{footerLabel}</span>
          <ChainIcon />
        </div>
      </div>
    </div>
  );
}

/* ---------- piezas chicas ---------- */

function Sparkline({ data }: { data: number[] }) {
  const w = 100;
  const h = 32;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => [pad + i * step, h - pad - ((v - min) / range) * (h - pad * 2)]);
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const last = pts[pts.length - 1];
  const area = `M${pts[0][0]},${h} L${line.replaceAll(' ', ' L')} L${last[0]},${h} Z`;

  return (
    <svg className="pc__spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id="pc-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#pc-spark-fill)" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 2.1 : 1.6} fill="currentColor" />
      ))}
    </svg>
  );
}

function PlayerSilhouette() {
  return (
    <svg className="pc__photo pc__photo--empty" viewBox="0 0 200 220" aria-hidden="true">
      <defs>
        <linearGradient id="pc-sil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf4ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#eaf4ff" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="72" r="34" fill="url(#pc-sil)" />
      <path d="M30 220 C34 150 62 122 100 122 C138 122 166 150 170 220 Z" fill="url(#pc-sil)" />
    </svg>
  );
}

function CrestFallback({ name }: { name: string }) {
  const initials = name
    .replace(/\b(FC|CF|SC|AC|CA|Club)\b/gi, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <svg className="pc__crest" viewBox="0 0 60 70" role="img" aria-label={name}>
      <path d="M30 3 L56 12 V34 C56 52 44 63 30 67 C16 63 4 52 4 34 V12 Z" fill="#12213f" stroke="#7fd3ff" strokeWidth="2.5" />
      <text x="30" y="43" textAnchor="middle" fontSize="20" fontWeight="800" fill="#eaf4ff" fontFamily="inherit">
        {initials}
      </text>
    </svg>
  );
}

function ChainIcon() {
  return (
    <svg className="pc__chain" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

/** Altura de la línea de corte: borde del cuerpo (3cqw) + tira superior (16cqw) */
export const TEAR_Y = 19;

/* chispas que salen por la boca del sobre: valores fijos, no random, para que
 * el render sea estable */
export const SPARKS = Array.from({ length: 16 }, (_, i) => ({
  /** posición horizontal sobre la línea de corte, en % */
  x: 14 + ((i * 53) % 72),
  /** largo de la chispa, en cqw */
  w: 2.4 + ((i * 13) % 5) * 0.6,
  /** dirección de salida, en grados */
  angle: -90 + ((i * 47) % 120) - 60,
  /** distancia que recorre, en cqw */
  dist: 26 + ((i * 29) % 34),
  /** segundo en que arranca, dentro de la timeline */
  at: 1 + ((i * 31) % 9) * 0.022,
}));

/* momentos clave (segundos desde el click) */
const TEAR = 1;
/** Pico del destello: el sobre ya no se ve y el padre puede montar lo que sale de adentro */
const REVEAL = 3;
const REDUCED_REVEAL = 0.35;

/* mismas curvas que tenía la versión en CSS */
const EASE = {
  out: CustomEase.create('pkOut', '0,0,.58,1'),
  in: CustomEase.create('pkIn', '.42,0,1,1'),
  unlock: CustomEase.create('pkUnlock', '.3,.7,.4,1'),
  cut: CustomEase.create('pkCut', '.5,0,.75,0'),
  tear: CustomEase.create('pkTear', '.25,.6,.35,1'),
  sink: CustomEase.create('pkSink', '.5,0,.8,.4'),
  spark: CustomEase.create('pkSpark', '.15,.7,.3,1'),
  rise: CustomEase.create('pkRise', '.2,.9,.3,1'),
};

/* cartas de energía: dos a los costados y la última, más alta, al centro */
const CARD_LEFT = { shift: -4, rot: -5, rise: -44, at: 1.45 };
const CARD_RIGHT = { shift: 4, rot: 5, rise: -44, at: 1.58 };
const CARD_CENTER = { shift: 0, rot: 0, rise: -58, at: 1.71 };

function cardMotion(i: number, count: number) {
  if (i === count - 1) return CARD_CENTER;
  return i === 1 ? CARD_RIGHT : CARD_LEFT;
}

/**
 * Coreografía de apertura, una sola línea de tiempo desde el click (t = 0):
 *    0 – 1.0s  carga: se abre el candado, el corte se ilumina, el sobre tiembla
 *  1.0 – 1.85s rasgado: la tira sale volando, chispas y haz de luz
 * 1.45 – 2.9s  salen las cartas de energía, el sobre cae
 *  2.5 – 3.7s  destello: pico en REVEAL (se llama a `onReveal`) y se apaga
 *
 * Los tamaños en cqw se convierten a px con el ancho del sobre (1cqw = 1% de su ancho).
 * Tiene que llamarse dentro de un gsap.context (useGSAP) para que se limpie sola.
 */
export function createOpeningTimeline(root: HTMLElement, onReveal: () => void, reduced: boolean) {
  const q = gsap.utils.selector(root);
  const [pk] = q('.pk');
  const u = pk.offsetWidth / 100;

  const tl = gsap.timeline();
  tl.addLabel('tear', TEAR).addLabel('reveal', REVEAL);

  // sin coreografía: el sobre se desvanece y el padre muestra el contenido
  if (reduced) {
    tl.to(pk, { opacity: 0, duration: 0.3, ease: EASE.out });
    tl.call(onReveal, [], REDUCED_REVEAL);
    return tl;
  }

  /* ---- carga ---- */

  tl.add(shake(q('.pk__shake'), u), 0);

  const aura = q('.pk__aura');
  gsap.set(aura, { opacity: 0.8, scale: 1 });
  tl.to(aura, { opacity: 1, scale: 1.25, duration: 1, ease: EASE.out }, 0);
  tl.to(aura, { scale: 1.5, duration: 1.035, ease: EASE.out }, 1);
  tl.to(aura, { opacity: 0, scale: 1.7, duration: 0.925, ease: EASE.out }, 2.035);

  // el frente está dibujado dos veces: los selectores toman las dos copias
  const shackles = q('.pk__shackle');
  gsap.set(shackles, { transformOrigin: '100% 100%' });
  tl.to(shackles, { y: -2.6, duration: 0.2025, ease: EASE.unlock }, 0.05);
  tl.to(shackles, { rotation: 28, duration: 0.2475, ease: EASE.unlock }, 0.2525);

  const locks = q('.pk__lock');
  tl.to(locks, { scale: 1.28, duration: 0.21, ease: EASE.out }, 0.15);
  tl.to(locks, { scale: 1.1, duration: 0.39, ease: EASE.out }, 0.36);

  // el corte se dibuja de izquierda a derecha y se apaga al rasgar
  const cut = q('.pk__cut');
  tl.fromTo(
    cut,
    { clipPath: 'inset(0% 100% 0% 0%)' },
    { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.75, ease: EASE.cut },
    0.2,
  );
  tl.to(cut, { opacity: 0, duration: 0.3, ease: EASE.out }, 'tear');

  /* ---- rasgado ---- */

  const top = q('.pk__piece--top');
  gsap.set(top, { transformOrigin: `100% ${TEAR_Y * u}px` });
  tl.to(top, { y: -1 * u, rotation: 9, duration: 0.187, ease: EASE.tear }, 'tear');
  tl.to(top, { x: 34 * u, y: -58 * u, rotation: 38, duration: 0.663, ease: EASE.tear }, 'tear+=0.187');
  tl.to(top, { opacity: 0, duration: 0.34, ease: EASE.tear }, 'tear+=0.51');

  const main = q('.pk__piece--main');
  tl.to(main, { y: 1.6 * u, scale: 0.99, duration: 0.105, ease: EASE.out }, 'tear');
  tl.to(main, { y: 0, scale: 1, duration: 0.245, ease: EASE.out }, 'tear+=0.105');
  // el sobre vacío cae y se desvanece, dejando libre lo que hay debajo
  tl.to(main, { y: 26 * u, scale: 0.94, opacity: 0, duration: 0.75, ease: EASE.sink }, 2.15);

  const glow = q('.pk__tear-glow');
  tl.to(glow, { opacity: 1, duration: 0.09, ease: EASE.out }, 'tear');
  tl.to(glow, { opacity: 0, duration: 0.81, ease: EASE.out }, 'tear+=0.09');

  q('.pk__spark').forEach((el, i) => {
    const { angle, dist, at } = SPARKS[i];
    const rad = (angle * Math.PI) / 180;
    gsap.set(el, { rotation: angle, scaleX: 0.4, transformOrigin: '0% 50%' });
    // rotate(a) translateX(d) en CSS: el desplazamiento va sobre el eje girado
    tl.to(
      el,
      { x: Math.cos(rad) * dist * u, y: Math.sin(rad) * dist * u, scaleX: 1, duration: 0.9, ease: EASE.spark },
      at,
    );
    tl.to(el, { opacity: 1, duration: 0.054, ease: EASE.spark }, at);
    tl.to(el, { opacity: 0, duration: 0.846, ease: EASE.spark }, at + 0.054);
  });

  const beam = q('.pk__beam');
  gsap.set(beam, { scaleX: 0.6, scaleY: 0, transformOrigin: '50% 100%' });
  tl.to(beam, { opacity: 1, scaleX: 1, scaleY: 1, duration: 0.2925, ease: EASE.out }, 1.05);
  tl.to(beam, { scaleX: 1.1, scaleY: 1.05, duration: 1.2675, ease: EASE.out }, 1.3425);
  tl.to(beam, { opacity: 0, scaleX: 1.2, scaleY: 1.1, duration: 0.39, ease: EASE.out }, 2.61);

  const rays = q('.pk__rays');
  tl.to(rays, { rotation: 40, duration: 1.75, ease: EASE.out }, 1.25);
  tl.to(rays, { opacity: 0.9, duration: 0.4375, ease: EASE.out }, 1.25);
  tl.to(rays, { opacity: 0, duration: 0.4375, ease: EASE.out }, 2.5625);

  /* ---- cartas y destello ---- */

  const cards = q('.pk__card');
  gsap.set(cards, { transformOrigin: '50% 100%' });
  cards.forEach((el, i) => {
    const { shift, rot, rise, at } = cardMotion(i, cards.length);
    tl.to(el, { x: shift * u, y: rise * u, rotation: rot, duration: 0.9, ease: EASE.rise }, at);
  });
  tl.to(cards, { opacity: 0, duration: 0.4, ease: EASE.in }, 2.6);

  // chispazo al rasgar, y blanco total en REVEAL
  const flash = q('.pk__flash');
  tl.to(flash, { opacity: 0.55, duration: 0.07, ease: 'none' }, 'tear');
  tl.to(flash, { opacity: 0, duration: 0.33, ease: 'none' }, 'tear+=0.07');
  tl.to(flash, { opacity: 1, duration: 0.48, ease: 'none' }, 'reveal-=0.48');
  tl.to(flash, { opacity: 0, duration: 0.7, ease: 'none' }, 'reveal');

  tl.call(onReveal, [], 'reveal');

  return tl;
}

/** Temblor que crece hasta el rasgado: sacudidas de 50ms que alternan de lado y suben de amplitud */
function shake(target: gsap.TweenTarget, u: number) {
  const tl = gsap.timeline({ defaults: { ease: 'none', duration: 0.05 } });
  for (let i = 2; i <= 19; i++) {
    const k = (i - 2) / 17;
    const dir = i % 2 ? 1 : -1;
    tl.to(target, {
      x: dir * (0.2 + 1.1 * k) * u,
      rotation: dir * (0.2 + 1.6 * k),
      scale: 1 + 0.04 * (i / 20) ** 2,
      // la primera sacudida parte de cero: dura el doble
      ...(i === 2 && { duration: 0.1 }),
    });
  }
  tl.to(target, { x: 0, rotation: 0, scale: 1 });
  return tl;
}

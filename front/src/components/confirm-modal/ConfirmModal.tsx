import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import './ConfirmModal.css';

gsap.registerPlugin(useGSAP);

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Botón cancelar, Escape o click en el fondo */
  onCancel: () => void;
  /** Se llama cuando el modal ya terminó de desaparecer (después de la animación de salida) */
  onClosed?: () => void;
}

/* Segundos que tarda el modal en aparecer / desaparecer por completo. Cada valor
 * gobierna el panel (GSAP) y el fondo oscuro (CSS, vía --cm-enter / --cm-exit). */
const ENTER_DURATION = 0.4;
const EXIT_DURATION = 0.5;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Confirmación modal sobre <dialog>: el navegador se encarga del foco atrapado,
 * del Escape, de dejar inerte el resto de la página y de devolver el foco al cerrar.
 * Es controlado: el padre decide `open`; la entrada y la salida las anima GSAP.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  onClosed,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  });
  const titleId = useId();
  const descId = useId();

  // Se dispara al cambiar `open`. Sin revertOnUpdate: la animación de salida tiene que
  // terminar (y recién ahí cerrar el <dialog>) aunque `open` ya haya cambiado.
  useGSAP(
    () => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const panel = dialog.querySelector('.cm__panel');
      const fast = prefersReducedMotion();

      if (open) {
        if (!dialog.open) dialog.showModal();
        gsap.killTweensOf(panel);
        gsap.fromTo(
          panel,
          { opacity: 0, y: 24, scale: 0.94 },
          { opacity: 1, y: 0, scale: 1, duration: fast ? 0 : ENTER_DURATION, ease: 'back.out(1.6)' },
        );
      } else if (dialog.open) {
        dialog.classList.add('is-closing');
        gsap.killTweensOf(panel);
        gsap.to(panel, {
          opacity: 0,
          y: 12,
          scale: 0.96,
          duration: fast ? 0 : EXIT_DURATION,
          ease: 'power2.in',
          onComplete: () => {
            dialog.close();
            dialog.classList.remove('is-closing');
            onClosedRef.current?.();
          },
        });
      }
    },
    { scope: dialogRef, dependencies: [open] },
  );

  return (
    <dialog
      ref={dialogRef}
      className="cm"
      style={{ '--cm-enter': `${ENTER_DURATION}s`, '--cm-exit': `${EXIT_DURATION}s` } as CSSProperties}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Escape: evitamos el cierre nativo para que lo maneje el padre (y la animación)
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      // con padding 0, un click sobre el propio <dialog> sólo puede venir del fondo
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="cm__panel">
        <div className="cm__frame">
          <div className="cm__body">
            <h2 id={titleId} className="cm__title">
              {title}
            </h2>
            {description && (
              <p id={descId} className="cm__desc">
                {description}
              </p>
            )}
            <div className="cm__actions">
              {/* el foco inicial va en "cancelar": un Enter apretado de más no abre nada */}
              <button type="button" className="cm__btn cm__btn--ghost" onClick={onCancel} autoFocus>
                {cancelLabel}
              </button>
              <button type="button" className="cm__btn cm__btn--primary" onClick={onConfirm}>
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

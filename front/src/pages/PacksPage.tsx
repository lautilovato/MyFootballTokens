import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { ConfirmModal } from '../components/confirm-modal/ConfirmModal';
import { PackReveal } from '../components/PackReveal';
import { PackTypeTile } from '../components/PackTypeTile';
import { Pack } from '../components/pack/Pack';
import { useCredits } from '../app/useCredits';
import { PACK_TYPE_NAMES, toPackData, toRevealedCard } from '../services/pack.mapper';
import {
  extractApiErrorCode,
  getPackCatalog,
  openPack,
  openPackErrorMessage,
  type PackCatalog,
  type PackOpening,
  type PackTypeInfo,
  type PackTypeKey,
} from '../services/packs.service';
import { useAuth } from '../services/useAuth';

interface PendingConfirm {
  info: PackTypeInfo;
  resolve: (proceed: boolean) => void;
}

/**
 * Pantalla de sobres (08-sobres US5). Orquesta: la red pasa por `services/` y el sobre animado,
 * el modal y la carta son los componentes que ya existían (constitución §7).
 *
 * Flujo de una apertura (research #16): `Pack` pide abrir → se confirma en el modal → se llama
 * a la API → recién con la respuesta exitosa el sobre se lleva a un escenario central, grande,
 * y se abre solo ahí (FR-058) → al terminar se revelan las cartas que informó el backend y se
 * actualizan saldo y stock (FR-059).
 */
export default function PacksPage() {
  const { user, logout } = useAuth();
  const { balance, refresh: refreshBalance, setBalance } = useCredits();

  const [catalog, setCatalog] = useState<PackCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [opening, setOpening] = useState<PackOpening | null>(null);
  // El sobre comprado, mientras se abre en el escenario central (null fuera de una apertura).
  const [stage, setStage] = useState<PackTypeInfo | null>(null);
  const [revealed, setRevealed] = useState(false);
  // Cambia para volver a montar los sobres: el que se abrió queda en su fase final.
  const [packsKey, setPacksKey] = useState(0);
  // FR-057: una sola apertura a la vez, desde el pedido hasta la revelación.
  const busy = useRef(false);

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await getPackCatalog());
      setLoadError(null);
    } catch {
      setLoadError('No se pudieron cargar los sobres. Intentá de nuevo en unos segundos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const requestOpen = useCallback(
    (info: PackTypeInfo) => (): Promise<boolean> => {
      if (busy.current) return Promise.resolve(false);
      busy.current = true;
      setMessage(null);
      return new Promise<boolean>((resolve) => {
        setPending({
          info,
          resolve: (proceed) => {
            if (!proceed) busy.current = false;
            resolve(proceed);
          },
        });
      });
    },
    [],
  );

  const cancel = useCallback(() => {
    pending?.resolve(false);
    setPending(null);
  }, [pending]);

  const confirm = useCallback(async () => {
    if (!pending) return;
    const { info, resolve } = pending;
    setPending(null);
    try {
      const result = await openPack(info.type);
      setOpening(result);
      setBalance(result.balanceAfter);
      // El sobre de la grilla no se abre en su lugar (es chico y queda fuera de foco): se lleva
      // al escenario central, que lo abre solo (FR-058). La apertura en el backend ya ocurrió.
      setStage(info);
      resolve(false);
    } catch (error) {
      setMessage(openPackErrorMessage(extractApiErrorCode(error)));
      resolve(false);
      // FR-060: el saldo y el stock visibles vuelven a ser los reales.
      void loadCatalog();
      void refreshBalance();
    }
  }, [pending, setBalance, loadCatalog, refreshBalance]);

  const onOpened = useCallback(() => {
    setStage(null);
    setRevealed(true);
    void loadCatalog();
  }, [loadCatalog]);

  const openAnother = useCallback(() => {
    setRevealed(false);
    setOpening(null);
    setPacksKey((k) => k + 1);
    busy.current = false;
  }, []);

  const disabledReason = (info: PackTypeInfo): string | null => {
    if (info.remaining === 0) return 'Agotado';
    if (balance !== null && info.price > balance) return 'Saldo insuficiente';
    return null;
  };

  return (
    <main className="min-h-screen bg-navy-deep text-slate-200">
      <AppHeader username={user?.username} balance={balance} onLogout={logout} isAdmin={user?.role === 'admin'} />

      <div className="mx-auto max-w-6xl p-6">
        <h1 className="title-display mb-2 text-3xl text-slate-100">Sobres</h1>
        <p className="mb-6 text-sm text-slate-400">
          Cada sobre trae cartas de jugadores. Las probabilidades muestran lo que queda en los sobres sin abrir.
        </p>

        {message && (
          <p role="alert" className="bevel mb-6 bg-error-red/10 px-4 py-3 text-error-red">
            {message}
          </p>
        )}

        {loading && <p className="py-12 text-center text-slate-400">Cargando sobres…</p>}

        {!loading && loadError && (
          <div className="py-12 text-center">
            <p className="text-error-red">{loadError}</p>
            <button onClick={() => void loadCatalog()} className="bevel mt-3 bg-navy-card px-4 py-2 text-sm">
              Reintentar
            </button>
          </div>
        )}

        {!loading && !loadError && catalog && !catalog.stockGenerated && (
          <div className="py-12 text-center">
            <p className="title-display text-slate-300">Todavía no hay sobres</p>
            <p className="mt-1 text-sm text-slate-500">
              Los sobres se arman cuando los jugadores tienen su cotización. Volvé en un rato.
            </p>
          </div>
        )}

        {opening && revealed && (
          <PackReveal
            cards={opening.cards.map((card) => ({ key: card.tokenId, card: toRevealedCard(card) }))}
            price={opening.price}
            balanceAfter={opening.balanceAfter}
            onOpenAnother={openAnother}
          />
        )}

        {!loading && !loadError && catalog?.stockGenerated && !revealed && (
          <div key={packsKey} className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {catalog.types.map((info) => (
              <PackTypeTile
                key={info.type}
                pack={toPackData(info)}
                price={info.price}
                probabilities={info.probabilities}
                remaining={info.remaining}
                disabledReason={disabledReason(info)}
                onOpenRequest={requestOpen(info)}
                onOpened={onOpened}
              />
            ))}
          </div>
        )}
      </div>

      {stage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Abriendo sobre ${PACK_TYPE_NAMES[stage.type]}`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-navy-deep/90 backdrop-blur-sm"
        >
          <div className="w-[min(80vw,340px)]">
            <Pack pack={toPackData(stage)} interactive={false} autoOpen onOpened={onOpened} />
          </div>
          <p className="title-display text-lg text-neon-blue">Abriendo tu sobre {PACK_TYPE_NAMES[stage.type]}…</p>
        </div>
      )}

      <ConfirmModal
        open={pending !== null}
        title={pending ? `¿Abrir un sobre ${PACK_TYPE_NAMES[pending.info.type as PackTypeKey]}?` : ''}
        description={pending ? confirmDescription(pending.info, balance) : undefined}
        confirmLabel="Abrir"
        onConfirm={() => void confirm()}
        onCancel={cancel}
      />
    </main>
  );
}

function confirmDescription(info: PackTypeInfo, balance: number | null): string {
  const price = `${info.price.toLocaleString('es-AR')} créditos`;
  if (balance === null) return `Cuesta ${price}.`;
  return `Cuesta ${price}. Te quedarían ${(balance - info.price).toLocaleString('es-AR')} créditos.`;
}

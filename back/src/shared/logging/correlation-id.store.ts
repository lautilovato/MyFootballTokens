import { AsyncLocalStorage } from 'node:async_hooks';

interface CorrelationContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

export const CorrelationIdStore = {
  run<T>(correlationId: string, fn: () => T): T {
    return storage.run({ correlationId }, fn);
  },
  getId(): string | undefined {
    return storage.getStore()?.correlationId;
  },
};

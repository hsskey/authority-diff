import { invariant } from '@authority/kernel';
import type { Transaction, TransactionRunner } from '@authority/kernel';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

type DrizzleTransaction = Parameters<Parameters<PostgresJsDatabase['transaction']>[0]>[0];

const registry = new WeakMap<Transaction, DrizzleTransaction>();

export function createTransactionRunner(db: PostgresJsDatabase): TransactionRunner {
  return {
    run: (fn) =>
      db.transaction((drizzleTx) => {
        const handle: Transaction = { __brand: 'authority.transaction' };
        registry.set(handle, drizzleTx);
        return fn(handle);
      }),
  };
}

export function narrowTransaction(tx: Transaction): DrizzleTransaction {
  const drizzleTx = registry.get(tx);
  invariant(drizzleTx !== undefined, 'transaction handle did not originate from this runner');
  return drizzleTx;
}

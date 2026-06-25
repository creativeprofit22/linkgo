import { IS_TAURI, IS_TEST } from "@/lib/env";

const DB_PATH = "sqlite:linkgo.db";

export interface LinkgoDatabase {
  execute(
    query: string,
    bindValues?: unknown[],
  ): Promise<{ lastInsertId: number; rowsAffected: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  close(): Promise<void>;
}

let dbInstance: LinkgoDatabase | null = null;

type InjectedInvoke = (cmd: string, args?: unknown) => unknown;

interface TauriWindowLike {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

function isInjectedInvoke(candidate: unknown): candidate is InjectedInvoke {
  return typeof candidate === "function";
}

function getInjectedTestInvoke(): InjectedInvoke | null {
  if (!IS_TEST || typeof window === "undefined") return null;
  const tauriWindow = window as unknown as TauriWindowLike;
  const candidate =
    tauriWindow.__TAURI_INTERNALS__?.invoke ??
    tauriWindow.__TAURI__?.core?.invoke;
  return isInjectedInvoke(candidate) ? candidate : null;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeExecuteResult(result: unknown): {
  lastInsertId: number;
  rowsAffected: number;
} {
  if (Array.isArray(result)) {
    return {
      rowsAffected: toNumber(result[0]),
      lastInsertId: toNumber(result[1]),
    };
  }

  if (typeof result === "object" && result !== null) {
    const record = result as { lastInsertId?: unknown; rowsAffected?: unknown };
    return {
      lastInsertId: toNumber(record.lastInsertId),
      rowsAffected: toNumber(record.rowsAffected),
    };
  }

  return { lastInsertId: 0, rowsAffected: 0 };
}

function createInjectedTestDb(invoke: InjectedInvoke): LinkgoDatabase {
  return {
    execute: async (query, bindValues) => {
      const result = await invoke("plugin:sql|execute", {
        db: DB_PATH,
        query,
        values: bindValues ?? [],
      });
      return normalizeExecuteResult(result);
    },
    select: async <T>(query: string, bindValues?: unknown[]) => {
      const result = await invoke("plugin:sql|select", {
        db: DB_PATH,
        query,
        values: bindValues ?? [],
      });
      return result as T;
    },
    close: async () => {
      await invoke("plugin:sql|close", { db: DB_PATH });
    },
  };
}

const mockDb: LinkgoDatabase = {
  execute: async () => ({ lastInsertId: 0, rowsAffected: 0 }),
  select: async <T>() => [] as T,
  close: async () => {},
};

export async function getDb(): Promise<LinkgoDatabase> {
  const injectedTestInvoke = getInjectedTestInvoke();
  if (injectedTestInvoke) return createInjectedTestDb(injectedTestInvoke);
  if (!IS_TAURI) return mockDb;
  if (!dbInstance) {
    const Database = (await import("@tauri-apps/plugin-sql")).default;
    dbInstance = (await Database.load(DB_PATH)) as unknown as LinkgoDatabase;
  }
  return dbInstance;
}

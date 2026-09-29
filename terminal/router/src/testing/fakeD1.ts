import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result } from '../d1';

/** Test-only: a D1 stand-in over node:sqlite, running the real migration SQL. */
export function fakeD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  const dir = resolve(new URL('.', import.meta.url).pathname, '../../migrations');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(resolve(dir, file), 'utf8'));
  }
  const toSql = (query: string) => query.replace(/\?(\d+)/g, '?');
  const statement = (query: string, values: unknown[] = []): D1PreparedStatement => {
    // ?N placeholders may repeat; expand them positionally.
    const order = [...query.matchAll(/\?(\d+)/g)].map((match) => Number(match[1]) - 1);
    const args = () => order.map((index) => values[index] as never);
    return {
      bind: (...next: unknown[]) => statement(query, next),
      first: async <T>() => (sqlite.prepare(toSql(query)).get(...args()) as T | undefined) ?? null,
      all: async <T>() => ({ results: sqlite.prepare(toSql(query)).all(...args()) as T[], success: true }),
      run: async () => {
        const info = sqlite.prepare(toSql(query)).run(...args());
        return { results: [], success: true, meta: { changes: Number(info.changes) } } as D1Result<unknown>;
      },
    };
  };
  return {
    prepare: (query) => statement(query),
    batch: async (statements) => Promise.all(statements.map((item) => item.run())),
  };
}

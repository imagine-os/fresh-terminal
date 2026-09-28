/**
 * pnpm verify:chain [path/to/ledger.json]
 * Verifies every owner chain and the shared chain in an exported ledger
 * (the dev panel's "Export ledger" produces the file). Exit code 1 if broken.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { entrySchema, verifyLedger, type Entry } from '../shared/src/ledger/index.ts';

const path = resolve(process.argv[2] ?? 'docs/qa/ledger-sample.json');
const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
const list = Array.isArray(raw) ? raw : (raw as { entries?: unknown[] }).entries ?? [];

const entries: Entry[] = [];
for (const item of list) {
  const parsed = entrySchema.safeParse(item);
  if (!parsed.success) {
    console.error('invalid entry:', parsed.error.issues[0]?.message);
    process.exit(1);
  }
  entries.push(parsed.data);
}

const result = verifyLedger(entries);
let ok = result.shared.ok;
console.log(`file: ${path}`);
console.log(`entries: ${entries.length}`);
for (const [owner, verdict] of Object.entries(result.owners)) {
  ok = ok && verdict.ok;
  console.log(
    `owner ${owner}: ${verdict.ok ? 'ok' : `BROKEN at ${verdict.brokenAt} (${verdict.reason})`} (${verdict.count})`,
  );
}
console.log(
  `shared chain: ${result.shared.ok ? 'ok' : `BROKEN at ${result.shared.brokenAt} (${result.shared.reason})`} (${result.shared.count})`,
);
process.exit(ok ? 0 : 1);

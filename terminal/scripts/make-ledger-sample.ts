/** Generates docs/qa/ledger-sample.json: two owners, one on chain. Deterministic. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chainEntry, headsAfter, type Entry } from '../shared/src/ledger/index.ts';

const entries: Entry[] = [];
const owners = [
  { id: 'anon-sample-a', onChain: true },
  { id: 'anon-sample-b', onChain: false },
];
let counter = 0;
for (let round = 0; round < 3; round += 1) {
  for (const owner of owners) {
    counter += 1;
    entries.push(
      chainEntry(
        {
          box_id: `box-${owner.id}`,
          owner_identity: owner.id,
          kind: 'charge',
          what: 'model.call',
          model: 'anthropic/claude-haiku-4.5',
          units: 1,
          unit_kind: 'call',
          cost_micro: 100 * counter,
          price_micro: 100 * counter,
          ref: `gen-sample-${counter}`,
          created_at: 1_759_100_000_000 + counter * 1000,
        },
        { id: `entry-sample-${counter}`, onChain: owner.onChain, heads: headsAfter(entries, owner.id) },
      ),
    );
  }
}
const out = resolve('docs/qa/ledger-sample.json');
writeFileSync(out, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`wrote ${out} (${entries.length} entries)`);

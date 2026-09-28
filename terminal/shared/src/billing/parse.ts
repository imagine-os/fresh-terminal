import { CREDIT_MICRO } from '../ledger/types';
import {
  BILLING_PERIODS,
  BILLING_UNITS,
  ON_CHAIN_WORDS,
  SETTLE_WORDS,
  billingSpecSchema,
  type BillingPeriod,
  type BillingSpec,
  type BillingSubject,
  type BillingUnit,
  type OnChainWord,
  type PricingRule,
  type SettleWord,
} from './types';

export interface BillingIssue {
  line: number;
  message: string;
}

export interface BillingParseResult {
  spec: BillingSpec;
  issues: BillingIssue[];
}

const SUBJECT_ALIASES: Record<string, BillingSubject> = {
  'model calls': 'modelCalls',
  'model call': 'modelCalls',
  models: 'modelCalls',
  model: 'modelCalls',
  storage: 'storage',
  actions: 'actions',
  action: 'actions',
};

const UNIT_ALIASES: Record<string, BillingUnit> = {
  token: 'token',
  tokens: 'token',
  call: 'call',
  calls: 'call',
  mb: 'MB',
  megabyte: 'MB',
  gb: 'GB',
  gigabyte: 'GB',
  byte: 'byte',
  bytes: 'byte',
};

function defaultSpec(): BillingSpec {
  return {
    version: 0,
    rules: {
      modelCalls: { mode: 'passThrough', marginBasisPoints: 0 },
      storage: { mode: 'free' },
      actions: { mode: 'free' },
    },
    settle: 'manual',
    onChain: 'opt-in',
  };
}

/** "2.5%" -> 250 basis points. Rejects more than two decimals. */
export function percentToBasisPoints(text: string): number | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?%$/.exec(text.trim());
  if (match === null) {
    return undefined;
  }
  const whole = Number(match[1]);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return whole * 100 + Number(fraction);
}

/** "1 credit", "2 credits", "$0.01", "0.5 credits" -> micro-dollars (integer). */
export function amountToMicro(text: string): number | undefined {
  const credits = /^(\d+)(?:\.(\d{1,2}))?\s+credits?$/i.exec(text.trim());
  if (credits !== null) {
    const whole = Number(credits[1]);
    const fraction = Number((credits[2] ?? '').padEnd(2, '0'));
    return whole * CREDIT_MICRO + (fraction * CREDIT_MICRO) / 100;
  }
  const dollars = /^\$(\d+)(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (dollars !== null) {
    const whole = Number(dollars[1]);
    const fraction = Number((dollars[2] ?? '').padEnd(6, '0'));
    return whole * 1_000_000 + fraction;
  }
  return undefined;
}

function parseRule(text: string, line: number, issues: BillingIssue[]): PricingRule | undefined {
  const value = text.trim().toLowerCase();

  if (value === 'free') {
    return { mode: 'free' };
  }

  const passThrough = /^pass-?through(?:\s+(?:plus|\+)\s+(\d+(?:\.\d{1,2})?%))?$/.exec(value);
  if (passThrough !== null) {
    const percent = passThrough[1];
    const basisPoints = percent === undefined ? 0 : percentToBasisPoints(percent);
    if (basisPoints === undefined) {
      issues.push({ line, message: `Unknown margin "${percent}"` });
      return undefined;
    }
    return { mode: 'passThrough', marginBasisPoints: basisPoints };
  }

  const fixed = /^(.+?)\s+per\s+([a-z]+)(?:\s+per\s+([a-z]+))?$/.exec(value);
  if (fixed !== null) {
    const priceMicro = amountToMicro(fixed[1] ?? '');
    const unit = UNIT_ALIASES[fixed[2] ?? ''];
    const periodWord = fixed[3];
    let period: BillingPeriod = 'once';
    if (priceMicro === undefined) {
      issues.push({ line, message: `Unknown amount "${fixed[1]}"` });
      return undefined;
    }
    if (unit === undefined) {
      issues.push({ line, message: `Unknown unit "${fixed[2]}"` });
      return undefined;
    }
    if (periodWord !== undefined) {
      if ((BILLING_PERIODS as readonly string[]).includes(periodWord)) {
        period = periodWord as BillingPeriod;
      } else {
        issues.push({ line, message: `Unknown period "${periodWord}"` });
        return undefined;
      }
    }
    return { mode: 'fixed', priceMicro, unit, period };
  }

  issues.push({ line, message: `Unknown pricing "${text.trim()}"` });
  return undefined;
}

export function parseBilling(text: string): BillingParseResult {
  const spec = defaultSpec();
  const issues: BillingIssue[] = [];

  const statements = text
    .split(/\n|(?<=\.)\s+(?=[A-Z])/)
    .map((statement) => statement.trim().replace(/\.$/, '').trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('#'));

  statements.forEach((statement, index) => {
    const line = index + 1;
    const colon = statement.indexOf(':');
    if (colon === -1) {
      issues.push({ line, message: 'Expected "<Subject>: ..."' });
      return;
    }
    const subject = statement.slice(0, colon).trim().toLowerCase();
    const rest = statement.slice(colon + 1).trim();

    if (subject === 'settle') {
      const word = rest.toLowerCase();
      if ((SETTLE_WORDS as readonly string[]).includes(word)) {
        spec.settle = word as SettleWord;
      } else {
        issues.push({ line, message: `Unknown settle word "${rest}"` });
      }
      return;
    }

    if (subject === 'on chain' || subject === 'on-chain' || subject === 'chain') {
      const word = rest.toLowerCase().replace(/\s+/g, '-');
      if ((ON_CHAIN_WORDS as readonly string[]).includes(word)) {
        spec.onChain = word as OnChainWord;
      } else {
        issues.push({ line, message: `Unknown on-chain word "${rest}"` });
      }
      return;
    }

    if (subject === 'margin') {
      const basisPoints = percentToBasisPoints(rest);
      if (basisPoints === undefined) {
        issues.push({ line, message: `Unknown margin "${rest}"` });
        return;
      }
      for (const key of Object.keys(spec.rules) as BillingSubject[]) {
        const rule = spec.rules[key];
        if (rule.mode === 'passThrough') {
          rule.marginBasisPoints = basisPoints;
        }
      }
      return;
    }

    const target = SUBJECT_ALIASES[subject];
    if (target === undefined) {
      issues.push({ line, message: `Unknown subject "${statement.slice(0, colon).trim()}"` });
      return;
    }
    const rule = parseRule(rest, line, issues);
    if (rule !== undefined) {
      spec.rules[target] = rule;
    }
  });

  const checked = billingSpecSchema.safeParse(spec);
  if (!checked.success) {
    issues.push({ line: 0, message: checked.error.message });
    return { spec: defaultSpec(), issues };
  }
  return { spec: checked.data, issues };
}

export function printBilling(spec: BillingSpec): string {
  const labels: Record<BillingSubject, string> = {
    modelCalls: 'Model calls',
    storage: 'Storage',
    actions: 'Actions',
  };
  const lines: string[] = [];
  for (const subject of Object.keys(labels) as BillingSubject[]) {
    const rule = spec.rules[subject];
    let text: string;
    if (rule.mode === 'free') {
      text = 'free';
    } else if (rule.mode === 'passThrough') {
      const whole = Math.floor(rule.marginBasisPoints / 100);
      const fraction = rule.marginBasisPoints % 100;
      const percent = fraction === 0 ? `${whole}%` : `${whole}.${String(fraction).padStart(2, '0')}%`;
      text = `pass-through plus ${percent}`;
    } else {
      const credits = rule.priceMicro / CREDIT_MICRO;
      const amount = Number.isInteger(credits)
        ? `${credits} credit${credits === 1 ? '' : 's'}`
        : `$${(rule.priceMicro / 1_000_000).toFixed(6).replace(/0+$/, '')}`;
      const period = rule.period === 'once' ? '' : ` per ${rule.period}`;
      text = `${amount} per ${rule.unit}${period}`;
    }
    lines.push(`${labels[subject]}: ${text}.`);
  }
  lines.push(`Settle: ${spec.settle}.`);
  lines.push(`On chain: ${spec.onChain}.`);
  return lines.join('\n');
}

export const BILLING_WORDS = {
  subjects: Object.keys(SUBJECT_ALIASES),
  units: BILLING_UNITS,
  periods: BILLING_PERIODS,
  settle: SETTLE_WORDS,
  onChain: ON_CHAIN_WORDS,
  fixed: ['charge', 'credit', 'balance', 'price', 'cost', 'margin', 'settle', 'pass-through', 'on chain'],
};

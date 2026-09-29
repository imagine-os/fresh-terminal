import { useMemo, useState } from 'react';
import { defaultBillingText } from '@shared/billing';
import { parseDialect, type SizeClass } from '@shared/dialect';
import { formatMicro, verifyLedger, type Entry } from '@shared/ledger';
import { SEED_THEMES, printTheme, type Theme } from '@shared/themes';
import { listActions } from '../actions/registry';
import { useI18n } from '../i18n';
import { NOT_WIRED } from '../lib/notWired';
import { spacetimeEnvPresent, store, useStoreSnapshot } from '../store';
import { Button } from '../ui/Button';
import { NotWiredButton } from '../ui/NotWiredButton';
import { PlanViewer } from './PlanViewer';

interface Props {
  dialectText: string;
  onDialectChange: (text: string) => void;
  sizeClass: SizeClass;
  widthEm: number;
  theme: Theme;
  onPickTheme: (id: string) => void;
  modelTagger: boolean;
  onModelTagger: (enabled: boolean) => void;
}

function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function DevPanel({ dialectText, onDialectChange, sizeClass, widthEm, theme, onPickTheme, modelTagger, onModelTagger }: Props) {
  const { t } = useI18n();
  const snapshot = useStoreSnapshot();
  const [verdict, setVerdict] = useState<string | null>(null);

  const parsed = useMemo(() => parseDialect(dialectText), [dialectText]);
  const recent: Entry[] = snapshot.entries.slice(-20).reverse();

  const verify = () => {
    const result = verifyLedger(snapshot.entries);
    const owner = result.owners[store.identity];
    const parts: string[] = [];
    if (owner) {
      parts.push(
        owner.ok ? `${t('dev.chainOk')} (${owner.count})` : `${t('dev.chainBroken')} ${owner.brokenAt} (${owner.reason})`,
      );
    } else {
      parts.push(`${t('dev.chainOk')} (0)`);
    }
    parts.push(
      `shared: ${result.shared.ok ? `${t('dev.chainOk')} (${result.shared.count})` : `${t('dev.chainBroken')} ${result.shared.brokenAt}`}`,
    );
    setVerdict(parts.join(' · '));
  };

  return (
    <div className="dev" data-testid="dev-panel">
      <h2>{t('dev.title')}</h2>

      <section>
        <h3>{t('dev.dialect')}</h3>
        <textarea
          aria-label={t('dev.dialect')}
          value={dialectText}
          onChange={(event) => onDialectChange(event.target.value)}
          spellCheck={false}
        />
        {parsed.issues.length > 0 ? (
          <ul className="list-plain">
            {parsed.issues.map((issue, index) => (
              <li key={index} className="issue">
                line {issue.line}: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <dl className="readout">
          <dt>{t('dev.sizeClass')}</dt>
          <dd>{sizeClass}</dd>
          <dt>{t('dev.widthEm')}</dt>
          <dd>{widthEm.toFixed(1)}</dd>
          <dt>{t('dev.store')}</dt>
          <dd>
            {store.mode}
            {spacetimeEnvPresent ? ' (SpacetimeDB env present, bindings not generated)' : ''}
          </dd>
          <dt>{t('dev.identity')}</dt>
          <dd>{store.identity}</dd>
        </dl>
      </section>

      <section>
        <h3>{t('topbar.theme')}</h3>
        <div className="pm-tabs" role="radiogroup" aria-label={t('topbar.theme')}>
          {SEED_THEMES.map((candidate) => (
            <Button
              key={candidate.id}
              variant="ghost"
              role="radio"
              aria-checked={candidate.id === theme.id}
              aria-pressed={candidate.id === theme.id}
              onClick={() => onPickTheme(candidate.id)}
            >
              {candidate.name}
            </Button>
          ))}
        </div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{printTheme(theme)}</pre>
      </section>

      <section>
        <h3>{t('dev.tagger')}</h3>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minHeight: 'var(--target)' }}>
          <input type="checkbox" checked={modelTagger} onChange={(event) => onModelTagger(event.target.checked)} style={{ width: '1.5rem', height: '1.5rem' }} />
          {t('dev.taggerToggle')}
        </label>
      </section>

      <PlanViewer />

      <section>
        <h3>{t('dev.ledger')}</h3>
        <div className="pm-tabs">
          <Button variant="ghost" onClick={verify}>
            {t('dev.verify')}
          </Button>
          <Button variant="ghost" onClick={() => downloadJson('ledger.json', snapshot.entries)}>
            {t('dev.export')}
          </Button>
          <NotWiredButton what="Stripe settlement" label={t('dev.settle')}>
            {t('dev.settle')}
          </NotWiredButton>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minHeight: 'var(--target)' }}>
          <input
            type="checkbox"
            checked={snapshot.owner.on_chain}
            onChange={(event) => store.setOnChain(event.target.checked)}
            style={{ width: '1.5rem', height: '1.5rem' }}
          />
          {t('dev.onChain')}
        </label>
        {verdict ? (
          <p className={verdict.includes(t('dev.chainBroken')) ? 'status-bad' : 'status-ok'} role="status">
            {verdict}
          </p>
        ) : null}
        {recent.length > 0 ? (
          <table className="ledger-table">
            <thead>
              <tr>
                <th>kind</th>
                <th>what</th>
                <th>model</th>
                <th>cost</th>
                <th>price</th>
                <th>hash</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.kind}</td>
                  <td>{entry.what}</td>
                  <td title={entry.model}>{entry.model.split('/').pop()}</td>
                  <td>{formatMicro(entry.cost_micro)}</td>
                  <td>{formatMicro(entry.price_micro)}</td>
                  <td title={entry.hash}>{entry.hash.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--fg-faint)' }}>—</p>
        )}
      </section>

      <section>
        <h3>{t('dev.billing')}</h3>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{defaultBillingText}</pre>
      </section>

      <section>
        <h3>{t('dev.actions')}</h3>
        <ul className="list-plain">
          {listActions().map((action) => (
            <li key={action.id}>
              <code>{action.id}</code> — {action.intent} ({action.permission}
              {action.shortcut ? `, ${action.shortcut}` : ''}
              {action.notWired ? `, ${t('notWired').toLowerCase()}` : ''})
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>{t('dev.notWired')}</h3>
        <ul className="list-plain">
          {NOT_WIRED.map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

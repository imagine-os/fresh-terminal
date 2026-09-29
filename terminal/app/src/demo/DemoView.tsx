import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { hrefFor } from '../lib/router';
import { TagsView } from '../tags-view/TagsView';
import { DEMOS, findDemo } from './index';

/**
 * /demo/<name>: the Tags page over a made-up data set instead of the person's
 * own stages (C-108). A short header says what it is; nothing is saved.
 */
export function DemoView({ name }: { name: string }) {
  const { t } = useI18n();
  const demo = findDemo(name);
  const source = useMemo(() => (demo ? demo.build() : null), [demo]);
  if (!demo || !source) {
    return (
      <section className="actions demo" aria-label={t('demo.title')} data-testid="demo-view">
        <header className="actions-head">
          <h1>{t('demo.title')}</h1>
        </header>
        <p className="actions-empty">{t('demo.unknown', { name })}</p>
        <ul className="demo-list">
          {Object.values(DEMOS).map((candidate) => (
            <li key={candidate.name}>
              <a href={hrefFor({ name: 'demo', id: candidate.name })}>{candidate.title}</a> <small>/demo/{candidate.name}</small>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  const users = source.lines.filter((line) => line.kind === 'user').length;
  return (
    <div className="demo" data-testid="demo-view" data-demo={demo.name}>
      <header className="demo-head">
        <span className="demo-badge">{t('demo.badge')}</span>
        <h1>{demo.title}</h1>
        <p>{demo.blurb}</p>
        <p className="demo-meta">
          {t('demo.meta', { stages: String(source.boxes.length), lines: String(users) })} · {source.boxes.map((box) => box.name).join(' · ')} · <a href={hrefFor({ name: 'tags' })}>{t('demo.yours')}</a>
        </p>
      </header>
      <TagsView boxId={null} source={source} />
    </div>
  );
}

import { useMemo, useRef } from 'react';
import type { NavItem, NavTarget } from '@shared/ui';
import { useI18n } from '../i18n';
import { useStoreSnapshot, type Box } from '../store';
import { Button } from '../ui/Button';
import { Reveal } from '../ui/Reveal';
import { IconClose, IconPlus } from '../ui/icons';
import { Tooltip } from '../ui/Tooltip';
import { NavTree } from './NavTree';

interface Props {
  boxes: Box[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onNavigate: (target: NavTarget, item: NavItem) => void;
  onRemove?: (id: string) => void;
  /** Replay: the menu as it was at the chosen step, instead of the live one. */
  navOverride?: NavItem[] | null;
}

export function Sidebar({ boxes, currentId, onOpen, onNew, onNavigate, onRemove, navOverride = null }: Props) {
  const { t } = useI18n();
  const snapshot = useStoreSnapshot();
  const mountedAt = useRef(Date.now());
  const liveItems = useMemo(() => snapshot.navItems.filter((item) => item.box_id === currentId), [snapshot.navItems, currentId]);
  const items = navOverride ?? liveItems;

  // Beam the menu in again when an edit just changed it.
  const lastNavEdit = [...snapshot.edits]
    .reverse()
    .find((edit) => edit.box_id === currentId && edit.changes.some((change) => change.region === 'nav'));
  const fresh = navOverride === null && lastNavEdit !== undefined && lastNavEdit.created_at > mountedAt.current;

  return (
    <nav className="sidebar" aria-label={t('sidebar.boxes')}>
      {items.length > 0 ? (
        <>
          <div className="sidebar-title">{t('nav.menu')}</div>
          <Reveal key={fresh ? `${lastNavEdit?.id}:${lastNavEdit?.state}` : 'static'} pattern={fresh ? 'beam-horizontal' : 'none'}>
            <NavTree items={items} onActivate={onNavigate} />
          </Reveal>
        </>
      ) : null}
      <div className="sidebar-title">{t('sidebar.boxes')}</div>
      {boxes.map((box, index) => (
        <div key={box.id} className="box-row">
          <button
            type="button"
            className="box-link"
            aria-current={box.id === currentId ? 'page' : undefined}
            onClick={() => onOpen(box.id)}
            title={box.name}
          >
            <span className="box-glyph" aria-hidden="true">
              {index + 1}
            </span>
            <span className="box-name">{box.name}</span>
          </button>
          {onRemove ? (
            <Tooltip label={t('box.remove', { name: box.name })} align="end">
              <Button
                icon
                variant="ghost"
                className="box-remove"
                aria-label={t('box.remove', { name: box.name })}
                onClick={() => {
                  if (window.confirm(t('box.removeConfirm', { name: box.name }))) onRemove(box.id);
                }}
                data-testid={`remove-box-${index + 1}`}
              >
                <IconClose />
              </Button>
            </Tooltip>
          ) : null}
        </div>
      ))}
      <Button variant="ghost" onClick={onNew} aria-label={t('sidebar.newBox')} style={{ justifyContent: 'flex-start' }}>
        <IconPlus />
        <span className="btn-label">{t('sidebar.newBox')}</span>
      </Button>
    </nav>
  );
}

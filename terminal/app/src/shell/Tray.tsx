import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { NavItem, NavTarget } from '@shared/ui';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { IconClose, IconPin, IconTray } from '../ui/icons';
import { NavTree } from './NavTree';

export interface Tool {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  shortcut?: string;
  pressed?: boolean;
  /** An <a> instead of a button. */
  href?: string;
  testId?: string;
}

interface Props {
  tools: Tool[];
  pinned: string[];
  onPinned: (ids: string[]) => void;
  /** The current box's menu, shown inside the tray. */
  nav: NavItem[];
  onNavigate: (target: NavTarget, item: NavItem) => void;
}

function ToolButton({ tool, inTray }: { tool: Tool; inTray: boolean }) {
  const common = {
    'aria-label': tool.label,
    'aria-pressed': tool.pressed,
    'data-testid': tool.testId,
    'data-tool': tool.id,
  };
  const content = inTray ? (
    <>
      {tool.icon}
      <span className="btn-label">{tool.label}</span>
    </>
  ) : (
    tool.icon
  );
  if (tool.href) {
    return (
      <a className="btn" data-variant="ghost" data-icon={inTray ? undefined : 'true'} href={tool.href} {...common}>
        {content}
      </a>
    );
  }
  return (
    <Button icon={!inTray} variant="ghost" onClick={tool.onClick} {...common}>
      {content}
    </Button>
  );
}

/**
 * The tools tray. Everything that used to sit in the top bar lives behind one
 * button; pin a tool to bring it back to the bar (click the pin, or drag it
 * onto the bar). The current box's menu lives here too.
 */
export function Tray({ tools, pinned, onPinned, nav, onNavigate }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node) && event.target !== buttonRef.current) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onClick);
    };
  }, [open]);

  const pin = (id: string, value: boolean) => {
    const next = value ? [...pinned.filter((candidate) => candidate !== id), id] : pinned.filter((candidate) => candidate !== id);
    onPinned(next);
  };
  const pinnedTools = pinned.map((id) => tools.find((tool) => tool.id === id)).filter((tool): tool is Tool => tool !== undefined);

  return (
    <>
      <span
        className="topbar-pins"
        data-testid="topbar-pins"
        data-dropping={dropping}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('text/x-tool')) {
            event.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDropping(false);
          const id = event.dataTransfer.getData('text/x-tool');
          if (id) pin(id, true);
        }}
      >
        {pinnedTools.map((tool) => (
          <Tooltip key={tool.id} label={tool.label} shortcut={tool.shortcut}>
            <ToolButton tool={tool} inTray={false} />
          </Tooltip>
        ))}
      </span>
      <span className="tray-anchor">
        <Tooltip label={t('tray.title')} align="end">
          <Button ref={buttonRef} icon variant="ghost" aria-label={t('tray.title')} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => !current)} data-testid="tray-toggle">
            <IconTray />
          </Button>
        </Tooltip>
        {open ? (
          <div className="tray" ref={panelRef} role="dialog" aria-label={t('tray.title')} data-testid="tray">
            <div className="tray-head">
              <span>{t('tray.title')}</span>
              <span className="tray-hint">{t('tray.hint')}</span>
              <Button icon variant="ghost" aria-label={t('tray.close')} onClick={() => setOpen(false)}>
                <IconClose />
              </Button>
            </div>
            {nav.length > 0 ? (
              <section className="tray-section">
                <div className="tray-label">{t('nav.menu')}</div>
                <NavTree
                  items={nav}
                  onActivate={(target, item) => {
                    setOpen(false);
                    onNavigate(target, item);
                  }}
                />
              </section>
            ) : null}
            <section className="tray-section">
              <div className="tray-label">{t('tray.tools')}</div>
              <ul className="tray-tools">
                {tools.map((tool) => {
                  const isPinned = pinned.includes(tool.id);
                  return (
                    <li
                      key={tool.id}
                      className="tray-tool"
                      data-pinned={isPinned}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/x-tool', tool.id);
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                    >
                      <span className="tray-tool-main">
                        <ToolButton tool={tool} inTray />
                        {tool.shortcut ? <kbd className="kbd">{tool.shortcut}</kbd> : null}
                      </span>
                      <Tooltip label={isPinned ? t('tray.unpin') : t('tray.pin')} align="end">
                        <Button
                          icon
                          variant="ghost"
                          className="tray-pin"
                          aria-pressed={isPinned}
                          aria-label={`${isPinned ? t('tray.unpin') : t('tray.pin')}: ${tool.label}`}
                          onClick={() => pin(tool.id, !isPinned)}
                          data-testid={`pin-${tool.id}`}
                        >
                          <IconPin />
                        </Button>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </section>
            <div className="tray-foot">
              {t('tray.hint')} · {t('shortcut.alt')}
            </div>
          </div>
        ) : null}
      </span>
    </>
  );
}

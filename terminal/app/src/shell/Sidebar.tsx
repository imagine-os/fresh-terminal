import { useI18n } from '../i18n';
import type { Box } from '../store';
import { Button } from '../ui/Button';
import { IconPlus } from '../ui/icons';

interface Props {
  boxes: Box[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({ boxes, currentId, onOpen, onNew }: Props) {
  const { t } = useI18n();
  return (
    <nav className="sidebar" aria-label={t('sidebar.boxes')}>
      <div className="sidebar-title">{t('sidebar.boxes')}</div>
      {boxes.map((box, index) => (
        <button
          key={box.id}
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
      ))}
      <Button variant="ghost" onClick={onNew} aria-label={t('sidebar.newBox')} style={{ justifyContent: 'flex-start' }}>
        <IconPlus />
        <span className="btn-label">{t('sidebar.newBox')}</span>
      </Button>
    </nav>
  );
}

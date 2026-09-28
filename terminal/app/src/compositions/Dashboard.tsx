import { useI18n } from '../i18n';
import { useStoreSnapshot } from '../store';
import { NotWiredButton } from '../ui/NotWiredButton';

/** Demo composition from our primitives. Numbers come from the real store. */
export function Dashboard() {
  const { t } = useI18n();
  const snapshot = useStoreSnapshot();
  const rows = [...snapshot.boxes].sort((a, b) => b.updated_at - a.updated_at).slice(0, 5);
  return (
    <div className="composition" data-testid="composition-dashboard">
      <div className="composition-label">
        <span>demo composition · shadcn-style dashboard</span>
        <span>{t('notWired')}: model-generated layout</span>
      </div>
      <div className="tiles">
        <div className="tile">
          <small>boxes</small>
          <b>{snapshot.boxes.length}</b>
        </div>
        <div className="tile">
          <small>lines</small>
          <b>{snapshot.lines.length}</b>
        </div>
        <div className="tile">
          <small>ledger entries</small>
          <b>{snapshot.entries.length}</b>
        </div>
        <div className="tile">
          <small>themes</small>
          <b>{snapshot.themes.length}</b>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>box</th>
            <th>lines</th>
            <th>updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((box) => (
            <tr key={box.id}>
              <td>{box.name}</td>
              <td>{snapshot.lines.filter((line) => line.box_id === box.id).length}</td>
              <td>{new Date(box.updated_at).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <NotWiredButton what="dashboard export" label="Export">
          Export
        </NotWiredButton>
      </div>
    </div>
  );
}

import { useState } from 'react';
import plan from '@docs/plan/plan.json';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  depends_on: string[];
  model: string;
  pass: number;
}

const tasks = plan.tasks as Task[];

/** Depth = 1 + max depth of dependencies. Timeline is by dependency, not dates. */
export function dependencyDepth(list: Task[]): Map<string, number> {
  const byId = new Map(list.map((task) => [task.id, task]));
  const depth = new Map<string, number>();
  const visit = (id: string, trail: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) {
      return known;
    }
    if (trail.has(id)) {
      return 1;
    }
    const task = byId.get(id);
    if (task === undefined) {
      return 1;
    }
    trail.add(id);
    let max = 0;
    for (const dep of task.depends_on) {
      max = Math.max(max, visit(dep, trail));
    }
    trail.delete(id);
    depth.set(id, max + 1);
    return max + 1;
  };
  for (const task of list) {
    visit(task.id, new Set());
  }
  return depth;
}

/** The real plan.json as a kanban. Also used by the "Draw a kanban of the plan" starter. */
export function Kanban() {
  return (
    <div className="kanban" data-testid="plan-kanban">
      {(['todo', 'doing', 'done'] as const).map((status) => (
        <div key={status} className="kanban-col">
          <h4>
            {status} ({tasks.filter((task) => task.status === status).length})
          </h4>
          {tasks
            .filter((task) => task.status === status)
            .map((task) => (
              <div key={task.id} className="task" data-status={task.status}>
                {task.title}
                <small>
                  {task.model} · pass {task.pass}
                </small>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

export function PlanViewer() {
  const { t } = useI18n();
  const [view, setView] = useState<'kanban' | 'list' | 'timeline'>('kanban');
  const depths = dependencyDepth(tasks);
  const maxDepth = Math.max(...depths.values());

  return (
    <section>
      <h3>{t('dev.pm')}</h3>
      <div className="pm-tabs" role="tablist">
        {(['kanban', 'list', 'timeline'] as const).map((name) => (
          <Button key={name} variant="ghost" role="tab" aria-selected={view === name} aria-pressed={view === name} onClick={() => setView(name)}>
            {t(`dev.${name}`)}
          </Button>
        ))}
      </div>

      {view === 'kanban' ? <Kanban /> : null}

      {view === 'list' ? (
        <ol className="list-plain">
          {tasks.map((task) => (
            <li key={task.id}>
              <span data-status={task.status}>
                [{task.status}] {task.title}
              </span>{' '}
              <small>
                — {task.model}, pass {task.pass}
                {task.depends_on.length ? `, after ${task.depends_on.join(', ')}` : ''}
              </small>
            </li>
          ))}
        </ol>
      ) : null}

      {view === 'timeline' ? (
        <div className="timeline">
          {[...tasks]
            .sort((a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0))
            .map((task) => {
              const depth = depths.get(task.id) ?? 1;
              const left = ((depth - 1) / maxDepth) * 100;
              const width = (1 / maxDepth) * 100;
              return (
                <div key={task.id} className="timeline-row" title={`${task.title} (depth ${depth})`}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                  <div className="timeline-bar">
                    <span data-status={task.status} style={{ left: `${left}%`, width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      ) : null}
    </section>
  );
}

import { Kanban } from '../dev/PlanViewer';
import { Dashboard } from './Dashboard';
import { LoginScreen } from './LoginScreen';
import { NoRouter } from './NoRouter';

export const COMPOSITIONS = {
  dashboard: Dashboard,
  login: LoginScreen,
  'plan-kanban': Kanban,
  'no-router': NoRouter,
} as const;

export type CompositionName = keyof typeof COMPOSITIONS;

export function isComposition(name: string): name is CompositionName {
  return name in COMPOSITIONS;
}

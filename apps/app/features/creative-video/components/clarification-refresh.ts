import type { CreativeVideoActionState } from "../actions/project-actions";

export function refreshAfterRevisionConflict(state: CreativeVideoActionState, refresh: () => void) {
  if (!state.refreshRequired) return false;
  refresh();
  return true;
}

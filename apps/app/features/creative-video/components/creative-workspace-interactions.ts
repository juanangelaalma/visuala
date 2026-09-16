export type PollResult = "unchanged" | "refreshed" | "retry";
export type WorkspaceView = "chat" | "preview";

type StatusResponse = { ok: boolean; json?: () => Promise<{ revision: number }> };
type PollInput = {
  projectId: string;
  revision: number;
  fetchStatus: (url: string) => Promise<StatusResponse>;
  refresh: () => void;
};

export async function pollCreativeProjectStatus(input: PollInput): Promise<PollResult> {
  try {
    const response = await input.fetchStatus(`/api/creative-projects/${input.projectId}/status?revision=${input.revision}`);
    if (!response.ok || !response.json) return "retry";
    const status = await response.json();
    if (status.revision <= input.revision) return "unchanged";
    input.refresh();
    return "refreshed";
  } catch {
    return "retry";
  }
}

export function workspaceViewAfterKey(current: WorkspaceView, key: string): WorkspaceView {
  if (key === "ArrowRight" || key === "End") return "preview";
  if (key === "ArrowLeft" || key === "Home") return "chat";
  return current;
}

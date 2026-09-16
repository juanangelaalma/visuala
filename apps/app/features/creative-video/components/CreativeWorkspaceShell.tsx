"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { CreativeProjectState } from "@/domain/creative-video/types";
import { pollCreativeProjectStatus, workspaceViewAfterKey, type WorkspaceView } from "./creative-workspace-interactions";

type CreativeWorkspaceShellProps = {
  projectId?: string;
  revision?: number;
  state?: CreativeProjectState;
  chat: ReactNode;
  preview: ReactNode;
};

export default function CreativeWorkspaceShell({ projectId, revision, state, chat, preview }: CreativeWorkspaceShellProps) {
  const router = useRouter();
  const [tab, setTab] = useState<WorkspaceView>("chat");
  const [pollingMessage, setPollingMessage] = useState("");
  const tabRefs = useRef<Record<WorkspaceView, HTMLButtonElement | null>>({ chat: null, preview: null });

  useEffect(() => {
    if (!projectId || revision === undefined || !state || !["analyzing", "building_preview", "rendering"].includes(state)) return;
    const timer = window.setInterval(async () => {
      const result = await pollCreativeProjectStatus({ projectId, revision, fetchStatus: (url) => fetch(url, { cache: "no-store" }), refresh: router.refresh });
      if (result === "retry") {
        window.clearInterval(timer);
        setPollingMessage("Pembaruan otomatis terhenti. Muat ulang halaman untuk mencoba lagi.");
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [projectId, revision, router, state]);

  return (
    <div>
      <div role="tablist" aria-label="Workspace view" className="mb-4 grid grid-cols-2 rounded-full border border-white/10 bg-[#161616] p-1 lg:hidden">
        {(["chat", "preview"] as const).map((value) => <button ref={(node) => { tabRefs.current[value] = node; }} key={value} id={`creative-${value}-tab`} role="tab" aria-controls={`creative-${value}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={(event) => { const next = workspaceViewAfterKey(tab, event.key); if (next !== tab) { event.preventDefault(); setTab(next); tabRefs.current[next]?.focus(); } }} className={`min-h-11 rounded-full text-sm font-semibold capitalize ${tab === value ? "bg-[#EFF31B] text-black" : "text-neutral-400"}`}>{value === "chat" ? "Chat" : "Preview"}</button>)}
      </div>
      <p aria-live="polite" className="mb-3 text-sm text-neutral-300">{pollingMessage}</p>
      <div className="lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)] lg:gap-5">
        <div id="creative-chat-panel" role="tabpanel" aria-labelledby="creative-chat-tab" className={tab === "chat" ? "block" : "hidden lg:block"}>{chat}</div>
        <div id="creative-preview-panel" role="tabpanel" aria-labelledby="creative-preview-tab" className={tab === "preview" ? "block" : "hidden lg:block"}>{preview}</div>
      </div>
    </div>
  );
}

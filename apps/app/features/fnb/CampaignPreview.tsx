"use client";

import { useEffect, useRef, useState } from "react";
import type { HyperframesPlayer } from "@hyperframes/player";
import { z } from "zod";
import { campaignRequest, compositionResponseSchema } from "./api";
import { sceneLabels, type Scene } from "./types";

type PreviewProps = {
  campaignId: string; revision: number | null; scenes: Scene[]; selectedScene: string; outdated: boolean;
  onSceneSelect: (id: string) => void; onStateChange: (state: { revision: number | null; ready: boolean; error: string | null }) => void;
};

const playerErrorDetailSchema = z.object({ message: z.string() });

export function CampaignPreview(props: PreviewProps) {
  const [attempt, setAttempt] = useState(0);

  function retry() {
    props.onStateChange({ revision: props.revision, ready: false, error: null });
    setAttempt((value) => value + 1);
  }

  return <CampaignPreviewSession key={`${props.campaignId}:${props.revision}:${attempt}`} {...props} onRetry={retry} />;
}

function CampaignPreviewSession({ campaignId, revision, scenes, selectedScene, outdated, onSceneSelect, onStateChange, onRetry }: PreviewProps & { onRetry: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HyperframesPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const selectedSceneRef = useRef(selectedScene);
  const [playhead, setPlayhead] = useState({ time: 0, scene: selectedScene });
  const time = playhead.scene === selectedScene ? playhead.time : scenes.find((scene) => scene.id === selectedScene)?.start ?? 0;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let player: HyperframesPlayer | null = null;
    let disposed = false;

    if (revision === null) return;

    async function mount() {
      try {
        const [{ html }, { HyperframesPlayer: PlayerConstructor }] = await Promise.all([
          campaignRequest(`/${campaignId}/composition/${revision}`, compositionResponseSchema, { signal: controller.signal }),
          import("@hyperframes/player"),
        ]);

        if (disposed || !hostRef.current) return;
        const element = document.createElement("hyperframes-player");

        if (!(element instanceof PlayerConstructor)) throw new Error("Player preview tidak dapat dimuat. Coba muat ulang preview.");
        player = element;
        player.setAttribute("width", "1080"); player.setAttribute("height", "1920");
        player.setAttribute("audio-locked", ""); player.setAttribute("disable-click-to-play", "");
        player.setAttribute("aria-label", `Preview campaign revisi ${revision}`);
        player.style.width = "100%"; player.style.aspectRatio = "9 / 16"; player.style.display = "block";
        player.addEventListener("ready", () => {
          if (disposed) return;
          setReady(true); onStateChange({ revision, ready: true, error: null });
        });
        player.addEventListener("timeupdate", () => { if (!disposed && player) setPlayhead({ time: player.currentTime, scene: selectedSceneRef.current }); });
        player.addEventListener("play", () => { if (!disposed) setPlaying(true); });
        player.addEventListener("pause", () => { if (!disposed) setPlaying(false); });
        player.addEventListener("ended", () => { if (!disposed) setPlaying(false); });

        const failed = (event: Event) => {
          if (disposed) return;
          const parsed = playerErrorDetailSchema.safeParse(event instanceof CustomEvent ? event.detail : null);
          const message = parsed.success && parsed.data.message ? parsed.data.message : "Preview gagal dimuat. Coba muat ulang preview.";
          setError(message); setReady(false); onStateChange({ revision, ready: false, error: message });
        };

        player.addEventListener("error", failed); player.addEventListener("playbackerror", failed);
        playerRef.current = player; hostRef.current.replaceChildren(player);
        player.setAttribute("srcdoc", html);
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : "Preview tidak dapat dimuat.";
        setError(message); onStateChange({ revision, ready: false, error: message });
      }
    }

    void mount();

    return () => {
      disposed = true; controller.abort(); player?.pause(); player?.remove(); playerRef.current = null;
    };
  }, [campaignId, revision, onStateChange]);
  useEffect(() => {
    selectedSceneRef.current = selectedScene;

    if (!ready) return;
    const scene = scenes.find((scene) => scene.id === selectedScene);

    if (scene) { playerRef.current?.pause(); playerRef.current?.seek(scene.start); }
  }, [selectedScene, ready, scenes]);

  function seek(timeInSeconds: number) {
    const player = playerRef.current;

    if (!player) return;
    player.pause(); player.seek(timeInSeconds);
    setPlaying(false); setPlayhead({ time: player.currentTime, scene: selectedScene });
  }

  return <section className="fnb-panel fnb-preview" aria-label="Preview video">
    <div className="fnb-preview-title"><h2>Preview</h2><span>{revision === null ? "Belum tersedia" : `Revisi ${revision}`}</span></div>
    <p role="status" className={outdated && scenes.length > 0 ? "fnb-warning" : "fnb-note"}>{scenes.length === 0 ? "Pilih Buat storyboard & style pada brief untuk menyiapkan preview." : outdated ? "Preview belum diperbarui. Simpan perubahan dan perbaiki validasi untuk memperbaruinya." : "Komposisi tersimpan, sama dengan sumber render final."}</p>
    <div className={`fnb-player-frame${revision === null ? " fnb-player-empty" : ""}`}><div ref={hostRef} />{revision === null && <p>Storyboard belum memiliki komposisi tervalidasi.</p>}</div>
    {revision !== null && !ready && !error && <p role="status">Memuat komposisi...</p>}
    {error && <div role="alert" className="fnb-error"><p>{error}</p><button type="button" className="fnb-button" onClick={onRetry}>Muat ulang preview</button></div>}
    <div className="fnb-playback"><button type="button" className="fnb-button" disabled={!ready} onClick={() => playing ? playerRef.current?.pause() : playerRef.current?.play()}>{playing ? "Pause" : "Play"}</button><output aria-label="Waktu video">{time.toFixed(1)} / 15.0 detik</output></div>
    <label className="fnb-field"><span>Seek waktu video</span><input type="range" min="0" max="14.99" step="0.01" value={Math.min(time, 14.99)} disabled={!ready} onChange={(event) => seek(Number(event.target.value))} /></label>
    <div className="fnb-scene-jumps" aria-label="Pilih scene preview">{scenes.map((scene) => <button className="fnb-button" type="button" key={scene.id} disabled={!ready} aria-pressed={selectedScene === scene.id} onClick={() => { onSceneSelect(scene.id); seek(scene.start); }}>{sceneLabels[scene.id]} · {scene.start}s</button>)}</div>
  </section>;
}

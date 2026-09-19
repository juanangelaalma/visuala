"use client";

import Image from "next/image";
import { type ChangeEvent, useMemo, useState } from "react";

type View = "library" | "setup" | "workspace";
type RenderState = "idle" | "rendering" | "ready";
type Project = {
  id: string;
  title: string;
  kind: string;
  status: string;
  meta: string;
  tone: string;
};

const projects: Project[] = [
  { id: "kopi", title: "Es Kopi Gula Aren", kind: "Promosi produk", status: "Siap", meta: "9:16 / 10 detik / 1080p", tone: "from-[#d9a36e] to-[#64301b]" },
  { id: "paket", title: "Paket Hemat Siang", kind: "Diskon dan promo", status: "Render 64%", meta: "1:1 / 15 detik / 1080p", tone: "from-[#efd05a] to-[#b66d22]" },
  { id: "croissant", title: "Croissant Almond", kind: "Peluncuran produk", status: "Brief", meta: "9:16 / 6 detik / 720p", tone: "from-[#d7ad94] to-[#8d5139]" },
];

const styles = [
  { id: "bold_pop", name: "Bold Pop", description: "Kontras tinggi", colors: ["#EFF31B", "#050505"], recommended: true },
  { id: "clean_product", name: "Clean Product", description: "Fokus produk", colors: ["#F3F3EF", "#B9C4CC"] },
  { id: "warm_artisan", name: "Warm Artisan", description: "Hangat dan natural", colors: ["#D99A62", "#5B2E1B"] },
  { id: "premium_dark", name: "Premium Dark", description: "Elegan dan tenang", colors: ["#D7C39A", "#171717"] },
];

const videoTypes = ["Promosi produk", "Diskon / promo harga", "Peluncuran produk", "Menu / etalase"];
const durations = ["6 detik", "10 detik", "15 detik"];
const ratios = ["9:16", "1:1", "16:9"];
const resolutions = ["720p", "1080p"];
const chatChoices = [
  { id: "bold_pop", label: "Bold Pop", detail: "Typography tegas dan motion energik", recommended: true },
  { id: "clean_product", label: "Clean Product", detail: "Rapi, ringan, dan fokus pada produk" },
  { id: "custom", label: "Lainnya", detail: "Jelaskan style visual dengan kata-kata Anda" },
];

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EFF31B]";
const press = "active:scale-[0.96] motion-reduce:transform-none";

function ChoiceGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return <fieldset>
    <legend className="mb-2 text-xs font-semibold text-white">{label}</legend>
    <div className="grid grid-cols-2 gap-2 sm:flex">
      {options.map((option) => <button type="button" key={option} aria-pressed={value === option} onClick={() => onChange(option)} className={"min-h-10 flex-1 rounded-lg border px-3 text-xs font-medium transition-colors " + focus + " " + press + (value === option ? " border-[#EFF31B] bg-[#292B09] text-[#EFF31B]" : " border-[#333] bg-[#161616] text-[#F9FAFB] hover:border-[#555]")}>{option}</button>)}
    </div>
  </fieldset>;
}

function ProjectLibrary({ onCreate, onOpen }: { onCreate: () => void; onOpen: (project: Project) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => projects.filter((project) => project.title.toLowerCase().includes(query.toLowerCase())), [query]);
  return <main id="main-content" className="min-h-[760px] rounded-[2rem] bg-black p-5 text-white sm:p-8 lg:p-10">
    <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#EFF31B]">Video workspace</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">Proyek video</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#BABABA]">Lanjutkan brief, pantau render, atau unduh versi yang sudah siap.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex min-h-11 items-center rounded-xl border border-[#333] bg-[#161616] px-3 text-[#BABABA]"><span aria-hidden="true">⌕</span><span className="sr-only">Cari proyek</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="ml-2 min-w-0 bg-transparent text-base text-white outline-none sm:text-sm" placeholder="Cari proyek" /></label>
        <button type="button" onClick={onCreate} className={"min-h-11 rounded-xl bg-[#EFF31B] px-5 text-sm font-bold text-black " + focus + " " + press}>+ Buat video</button>
      </div>
    </header>
    <section aria-label="Ringkasan proyek" className="mt-8 grid gap-3 sm:grid-cols-3">
      {[["5","Total proyek"],["2","Siap diunduh"],["1","Sedang dirender"]].map(([value,label]) => <article key={label} className="rounded-xl border border-[#333] bg-[#161616] p-5"><strong className="font-mono text-2xl tabular-nums">{value}</strong><p className="mt-1 text-xs text-[#BABABA]">{label}</p></article>)}
    </section>
    <section aria-labelledby="project-list-title" className="mt-6"><h2 id="project-list-title" className="sr-only">Daftar proyek</h2>
      {filtered.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((project) => <button type="button" key={project.id} onClick={() => onOpen(project)} className={"group rounded-2xl border border-[#333] bg-[#161616] p-3 text-left transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-[#555] hover:shadow-2xl " + focus + " " + press}><div className={"relative aspect-[16/10] overflow-hidden rounded-xl bg-gradient-to-br " + project.tone}><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,.38),transparent_34%)]" /><span className="absolute left-3 top-3 rounded bg-black/80 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-[#EFF31B]">{project.status}</span><span aria-hidden="true" className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-[#EFF31B] text-black opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">→</span></div><div className="px-1 py-4"><h3 className="font-semibold">{project.title}</h3><p className="mt-1 text-xs text-[#BABABA]">{project.kind}</p><p className="mt-4 font-mono text-[10px] text-[#777]">{project.meta}</p></div></button>)}</div> : <div role="status" className="rounded-2xl border border-dashed border-[#555] bg-[#161616] p-10 text-center"><h2 className="font-semibold">Proyek tidak ditemukan</h2><p className="mt-2 text-sm text-[#BABABA]">Coba kata lain atau hapus pencarian.</p><button type="button" onClick={() => setQuery("")} className={"mt-4 text-sm font-semibold text-[#EFF31B] underline underline-offset-4 " + focus}>Hapus pencarian</button></div>}
    </section>
  </main>;
}

function SetupScreen({ onBack, onContinue }: { onBack: () => void; onContinue: (title: string, style: string, meta: string) => void }) {
  const [type, setType] = useState(videoTypes[0]);
  const [style, setStyle] = useState(styles[0].id);
  const [duration, setDuration] = useState(durations[1]);
  const [ratio, setRatio] = useState(ratios[0]);
  const [resolution, setResolution] = useState(resolutions[1]);
  const [rights, setRights] = useState(false);
  const [voice, setVoice] = useState(true);
  const [music, setMusic] = useState(true);
  const [caption, setCaption] = useState(true);
  const [assets, setAssets] = useState<string[]>([]);
  const [error, setError] = useState("");

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 4);
    setAssets(files.map((file) => URL.createObjectURL(file)));
  }
  function submit() {
    if (!rights) { setError("Konfirmasikan hak penggunaan aset untuk melanjutkan."); return; }
    setError("");
    onContinue("Video " + type, styles.find((item) => item.id === style)?.name ?? "Bold Pop", ratio + " / " + duration + " / " + resolution);
  }

  return <main id="main-content" className="min-h-[760px] overflow-hidden rounded-[2rem] bg-black text-white">
    <header className="flex min-h-16 items-center justify-between border-b border-[#333] bg-[#161616] px-5 sm:px-8"><button type="button" onClick={onBack} className={"min-h-10 text-sm text-[#BABABA] hover:text-white " + focus}>← Kembali</button><span className="font-mono text-[10px] uppercase tracking-widest text-[#BABABA]">Langkah 1 dari 2</span></header>
    <div className="grid gap-8 p-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:p-10">
      <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-6">
        <div><p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[#EFF31B]">Video baru</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Atur hasil yang Anda butuhkan</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#BABABA]">Pilihan ini membantu AI menyusun brief dan menjaga setiap versi tetap konsisten.</p></div>
        <ChoiceGroup label="Tipe video" options={videoTypes} value={type} onChange={setType} />
        <fieldset><legend className="mb-2 flex w-full items-center justify-between text-xs font-semibold"><span>Style video</span><span className="rounded border border-[#4A4D0C] bg-[#292B09] px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-[#EFF31B]">Rekomendasi AI</span></legend><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{styles.map((item) => <button type="button" key={item.id} aria-pressed={style === item.id} onClick={() => setStyle(item.id)} className={"min-h-24 rounded-lg border p-2.5 text-left transition-colors " + focus + " " + press + (style === item.id ? " border-[#EFF31B] bg-[#292B09]" : " border-[#333] bg-[#161616] hover:border-[#555]")}><span className="flex h-4 gap-1"><i className="flex-1 rounded-sm" style={{ background: item.colors[0] }} /><i className="flex-1 rounded-sm" style={{ background: item.colors[1] }} /></span><strong className={"mt-2 block text-xs " + (style === item.id ? "text-[#EFF31B]" : "text-white")}>{item.name}</strong><span className="mt-1 block text-[10px] text-[#BABABA]">{item.description}</span></button>)}</div></fieldset>
        <ChoiceGroup label="Durasi" options={durations} value={duration} onChange={setDuration} />
        <ChoiceGroup label="Rasio" options={ratios} value={ratio} onChange={setRatio} />
        <ChoiceGroup label="Resolusi" options={resolutions} value={resolution} onChange={setResolution} />
        <fieldset><legend className="mb-2 text-xs font-semibold">Audio dan caption</legend><div className="grid gap-2 sm:grid-cols-3">{[["Voice-over",voice,setVoice],["Musik latar",music,setMusic],["Caption otomatis",caption,setCaption]].map(([label,checked,setter]) => <label key={String(label)} className="flex min-h-14 cursor-pointer items-center justify-between rounded-lg border border-[#333] bg-[#161616] px-3 text-xs font-semibold"><span>{String(label)}</span><input type="checkbox" checked={Boolean(checked)} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} className={"size-5 accent-[#EFF31B] " + focus} /></label>)}</div></fieldset>
      </form>
      <aside className="h-fit rounded-2xl border border-[#333] bg-[#161616] p-5 xl:sticky xl:top-4">
        <h2 className="text-lg font-semibold">Tambahkan foto produk</h2><p className="mt-2 text-xs leading-5 text-[#BABABA]">Gunakan JPEG, PNG, atau WebP. Anda dapat memilih hingga empat foto untuk prototype ini.</p>
        <label className={"mt-5 grid min-h-48 cursor-pointer place-items-center rounded-xl border border-dashed border-[#555] bg-[#101010] p-5 text-center hover:border-[#EFF31B] " + focus}><span><span aria-hidden="true" className="mx-auto grid size-11 place-items-center rounded-full bg-[#292B09] text-[#EFF31B]">▧</span><strong className="mt-3 block text-sm">Pilih foto produk</strong><span className="mt-1 block text-[10px] uppercase tracking-wide text-[#777]">JPEG, PNG, WEBP</span></span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} className="sr-only" /></label>
        {assets.length > 0 && <div className="mt-3 grid grid-cols-4 gap-2" aria-label={assets.length + " foto dipilih"}>{assets.map((src,index) => <Image unoptimized width={160} height={160} key={src} src={src} alt={"Pratinjau aset " + (index + 1)} className="aspect-square rounded-lg object-cover outline outline-1 outline-white/10" />)}</div>}
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-xs leading-5"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} aria-describedby={error ? "rights-error" : undefined} aria-invalid={Boolean(error)} className={"mt-0.5 size-5 shrink-0 accent-[#EFF31B] " + focus} /><span>Saya memiliki hak untuk menggunakan semua aset yang diunggah.</span></label>
        {error && <p id="rights-error" role="alert" className="mt-2 text-xs text-[#ff8b8b]">{error}</p>}
        <button type="button" onClick={submit} className={"mt-6 min-h-11 w-full rounded-lg bg-[#EFF31B] px-4 text-sm font-bold text-black " + focus + " " + press}>Lanjut ke percakapan</button>
        <p className="mt-3 text-center text-[10px] text-[#777]">Aset tetap lokal pada prototype frontend ini.</p>
      </aside>
    </div>
  </main>;
}

function Workspace({ project, styleName, meta, onBack }: { project: Project; styleName: string; meta: string; onBack: () => void }) {
  const [choice, setChoice] = useState("bold_pop");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [renderState, setRenderState] = useState<RenderState>("idle");
  const send = () => { const value = draft.trim() || chatChoices.find((item) => item.id === choice)?.label || ""; if (!value) return; setMessages((items) => [...items, value]); setDraft(""); };
  const render = () => { setRenderState("rendering"); window.setTimeout(() => setRenderState("ready"), 1400); };

  return <main id="main-content" className="min-h-[760px] overflow-hidden rounded-[2rem] bg-[#101010] text-white">
    <div className="grid min-h-[760px] xl:grid-cols-[minmax(0,1fr)_350px]">
      <section className="flex min-w-0 flex-col bg-[#161616]">
        <header className="flex min-h-20 items-center justify-between border-b border-[#333] px-5 sm:px-6"><div className="flex items-center gap-4"><button type="button" onClick={onBack} className={"grid size-10 place-items-center rounded-lg border border-[#333] text-[#BABABA] hover:text-white " + focus} aria-label="Kembali ke proyek">←</button><div><h1 className="font-semibold">{project.title}</h1><p className="mt-1 font-mono text-[10px] uppercase text-[#777]">{project.kind} / {meta}</p></div></div><span className="rounded border border-[#4A4D0C] bg-[#292B09] px-2 py-1 font-mono text-[10px] uppercase text-[#EFF31B]">Menyusun brief</span></header>
        <div className="flex flex-1 flex-col p-5 sm:p-8"><p className="text-center font-mono text-[9px] uppercase tracking-widest text-[#777]">Hari ini, 10.24</p><p className="ml-auto mt-5 max-w-lg rounded-[14px_14px_4px_14px] bg-[#EFF31B] px-4 py-3 text-sm leading-6 text-black">Buat video jualan untuk produk ini. Tonjolkan keunggulannya untuk media sosial.</p>
          <div className="mt-6 flex max-w-2xl gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#292B09] text-[#EFF31B]">✦</span><div className="flex-1"><div className="rounded-[4px_14px_14px_14px] border border-[#333] bg-[#202020] p-4"><p className="text-sm leading-6 text-[#BABABA]">Berdasarkan warna dan tipe produk, saya merekomendasikan style yang kontras agar tetap kuat di layar ponsel.</p><p className="mt-2 font-semibold">Style visual mana yang paling sesuai?</p></div><div className="mt-3 space-y-2">{chatChoices.map((item) => <button type="button" key={item.id} aria-pressed={choice === item.id} onClick={() => setChoice(item.id)} className={"flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left " + focus + " " + press + (choice === item.id ? " border-[#EFF31B] bg-[#292B09]" : " border-[#333] bg-[#161616] hover:border-[#555]")}><span className={"size-4 shrink-0 rounded-full border " + (choice === item.id ? "border-[#EFF31B] bg-[#EFF31B] ring-4 ring-[#161616]" : "border-[#777]")} /><span><strong className={"block text-sm " + (choice === item.id ? "text-[#EFF31B]" : "")}>{item.label}{item.recommended && <small className="ml-2 font-mono text-[9px] uppercase">Rekomendasi</small>}</strong><span className="block text-xs text-[#BABABA]">{item.detail}</span></span></button>)}</div></div></div>
          {messages.map((message,index) => <p key={index} className="ml-auto mt-4 max-w-lg rounded-[14px_14px_4px_14px] bg-[#EFF31B] px-4 py-3 text-sm text-black">{message}</p>)}
          <div className="mt-auto pt-8"><label className="sr-only" htmlFor="chat-reply">Jawaban Anda</label><div className="rounded-xl border border-[#3A3A3A] bg-[#161616] p-3 shadow-2xl"><textarea id="chat-reply" value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} className="w-full resize-none bg-transparent text-base text-white outline-none placeholder:text-[#777] sm:text-sm" placeholder="Pilih style atau tulis preferensi visual lain…" /><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-[#777]">AI hanya memakai fakta yang Anda konfirmasi.</span><button type="button" onClick={send} className={"grid size-10 place-items-center rounded-lg bg-[#EFF31B] text-black " + focus + " " + press} aria-label="Kirim jawaban">↑</button></div></div></div>
        </div>
      </section>
      <aside className="border-l border-[#333] bg-[#101010] p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Konteks proyek</h2><span aria-hidden="true" className="text-[#777]">•••</span></div><div className={"mt-5 grid aspect-video place-items-center rounded-2xl bg-gradient-to-br " + project.tone}><button type="button" className={"grid size-12 place-items-center rounded-full bg-white/90 text-black shadow " + focus + " " + press} aria-label="Putar pratinjau">▶</button></div>
        <div className="mt-4 rounded-xl border border-[#333] bg-[#161616] p-4"><h3 className="text-sm font-semibold">Output</h3><dl className="mt-4 space-y-3 text-xs">{[["Style",styleName],["Format",meta.split(" / ")[0] + " / " + meta.split(" / ")[2]],["Durasi",meta.split(" / ")[1]],["Voice-over","Bahasa Indonesia"],["Musik dan caption","Aktif"]].map(([key,value]) => <div key={key} className="flex justify-between gap-4"><dt className="text-[#BABABA]">{key}</dt><dd className={"font-mono text-[10px] font-semibold text-right " + (key === "Style" ? "text-[#EFF31B]" : "")}>{value}</dd></div>)}</dl></div>
        <h3 className="mt-5 text-sm font-semibold">Aset produk <span className="float-right font-mono text-[10px] text-[#777]">3 foto</span></h3><div className="mt-3 grid grid-cols-3 gap-2">{["bg-[#d9a36e]","bg-[#b66d3f]","bg-[#efd0a0]"].map((tone) => <div key={tone} className={"aspect-square rounded-lg outline outline-1 outline-white/10 " + tone} />)}</div>
        <div className="mt-5 rounded-xl border border-[#333] bg-black p-4"><div className="flex justify-between text-sm font-semibold"><span>Brief</span><span className="tabular-nums">5/8</span></div><div className="mt-3 h-1 rounded-full bg-[#303238]"><div className="h-full w-3/5 rounded-full bg-[#EFF31B]" /></div><p className="mt-3 text-xs leading-5 text-[#BABABA]">Selanjutnya: CTA, tujuan pemesanan, dan detail penawaran.</p></div>
        <div className="mt-5" role="status" aria-live="polite">{renderState === "idle" && <button type="button" onClick={render} className={"min-h-11 w-full rounded-lg bg-[#EFF31B] px-4 text-sm font-bold text-black " + focus + " " + press}>Simulasikan render</button>}{renderState === "rendering" && <div className="rounded-lg border border-[#4A4D0C] bg-[#292B09] p-3 text-sm text-[#EFF31B]"><span className="inline-block animate-pulse motion-reduce:animate-none">●</span> Menyiapkan preview…</div>}{renderState === "ready" && <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3"><p className="text-sm font-semibold text-emerald-300">Preview siap</p><button type="button" onClick={() => setRenderState("idle")} className={"mt-2 text-xs text-white underline underline-offset-4 " + focus}>Render ulang</button></div>}</div>
      </aside>
    </div>
  </main>;
}

export default function DashboardPage() {
  const [view, setView] = useState<View>("library");
  const [project, setProject] = useState<Project>(projects[0]);
  const [styleName, setStyleName] = useState("Bold Pop");
  const [meta, setMeta] = useState(projects[0].meta);
  return <>
    {view === "library" && <ProjectLibrary onCreate={() => setView("setup")} onOpen={(selected) => { setProject(selected); setMeta(selected.meta); setView("workspace"); }} />}
    {view === "setup" && <SetupScreen onBack={() => setView("library")} onContinue={(title,style,nextMeta) => { setProject({ ...projects[0], title, kind: "Draft baru", status: "Brief", meta: nextMeta }); setStyleName(style); setMeta(nextMeta); setView("workspace"); }} />}
    {view === "workspace" && <Workspace project={project} styleName={styleName} meta={meta} onBack={() => setView("library")} />}
  </>;
}

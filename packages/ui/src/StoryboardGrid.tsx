import StoryboardSceneCard, { type StoryboardScene } from "./StoryboardSceneCard";

export type StoryboardGridProps = {
    title?: string;
    subtitle?: string;
    scenes?: StoryboardScene[];
    onSceneAction?: (scene: StoryboardScene) => void;
    className?: string;
};

const defaultScenes: StoryboardScene[] = [
    {
        id: "opening-hook",
        number: 1,
        title: "SCENE: OPENING (HOOK)",
        visual: "Visual: Medium shot, karakter menyapa kamera.",
        dialog: "“Hai! Aku mau share facial wash yg bener-bener gentle di kulitku.”",
        actionLabel: "Save Scene",
    },
    {
        id: "intro-produk",
        title: "SCENE: INTRO PRODUK",
        visual: "Visual: Menunjukkan produk ke kamera.",
        dialog: "“Ini dia Oatmilk Gentle Facial Wash, cleanser andalanku setiap hari.”",
        actionLabel: "Edit Scene",
    },
    {
        id: "product-shot",
        title: "SCENE: PRODUCT SHOT",
        visual: "Visual: Close up produk dengan nuansa natural (oat & milk).",
        dialog: "“Diformulasikan dengan oat, milk & sodium hyaluronate. Super gentle buat semua j... Read More",
        actionLabel: "Edit Scene",
    },
    {
        id: "pemakaian",
        title: "SCENE: PEMAKAIAN",
        visual: "Visual: Menggunakan facial wash, berbusa lembut.",
        dialog: "“Teksturnya lembut, busanya halus, dan ngga bikin kulit terasa ketarik.”",
        actionLabel: "Edit Scene",
    },
    {
        id: "bilas",
        title: "SCENE: BILAS",
        visual: "Visual: Membilas wajah dengan air",
        dialog: "“Mudah dibilas dan bikin wajah terasa bersih tapi tetap lembap.”",
        actionLabel: "Edit Scene",
    },
    {
        id: "hasil",
        title: "SCENE: HASIL",
        visual: "Visual: Wajah bersih, segar, natural glow.",
        dialog: "“Kulit jadi bersih, lembap, dan nyaman. Cocok banget buat kulit sensitif kayak aku.”",
        actionLabel: "Edit Scene",
    },
    {
        id: "keunggulan",
        title: "SCENE: KEUNGGULAN",
        visual: "Visual: Infografis keunggulan produk.",
        dialog: "“No SLS, no alkohol, no animal testing, dan travel friendly.”",
        actionLabel: "Edit Scene",
    },
    {
        id: "rekomendasi",
        title: "SCENE: REKOMENDASI",
        visual: "Visual: Close up, merekomendasikan produk.",
        dialog: "“Untuk kamu yang cari facial wash gentle tapi tetap efektif, wajib coba ini!”",
        actionLabel: "Edit Scene",
    },
    {
        id: "closing",
        title: "SCENE: CLOSING",
        visual: "Visual: Produk + key message.",
        dialog: "“Oatmilk Gentle Facial Wash, gentle cleanser for all skin type.”",
        actionLabel: "Edit Scene",
    },
];

const storyboardClassNames = {
    root: "w-full rounded-3xl bg-pricing-bg px-8 py-14 text-white",
    header: "mx-auto mb-16 flex max-w-5xl flex-col items-center gap-4 text-center",
    title: "font-display text-section-md font-bold uppercase leading-tight text-white",
    subtitle: "font-sans-secondary text-base font-semibold text-neutral-450",
    grid: "grid grid-cols-1 gap-y-5 md:grid-cols-2 xl:grid-cols-3",
} as const;

function cx(...classNames: Array<string | undefined | false>) {
    return classNames.filter(Boolean).join(" ");
}

export default function StoryboardGrid({
    title = "STORY BOARD - OATMILK GENTLE FACIAL WASH",
    subtitle = "Konsep: UGC Natural - Clean - Relatable",
    scenes = defaultScenes,
    onSceneAction,
    className = "",
}: StoryboardGridProps) {
    return (
        <section className={cx(storyboardClassNames.root, className)}>
            <div className={storyboardClassNames.header}>
                <h2 className={storyboardClassNames.title}>{title}</h2>
                <p className={storyboardClassNames.subtitle}>{subtitle}</p>
            </div>

            <div className={storyboardClassNames.grid}>
                {scenes.map((scene) => (
                    <StoryboardSceneCard key={scene.id} scene={scene} onAction={onSceneAction} />
                ))}
            </div>
        </section>
    );
}

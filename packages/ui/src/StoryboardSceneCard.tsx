import Image, { type StaticImageData } from "next/image";
import Button from "./Button";

export type StoryboardScene = {
    id: string;
    number?: number;
    title: string;
    visual: string;
    dialog: string;
    imageSrc?: string | StaticImageData;
    imageAlt?: string;
    actionLabel?: string;
    actionHref?: string;
};

export type StoryboardSceneCardProps = {
    scene: StoryboardScene;
    onAction?: (scene: StoryboardScene) => void;
    className?: string;
};

const storyboardSceneCardClassNames = {
    root: "flex min-w-0 flex-col gap-4 p-5 text-white",
    imageWrap: "relative aspect-square w-full overflow-hidden rounded-3xl bg-neutral-150",
    image: "object-cover",
    numberBadge: "absolute left-0 top-0 z-10 flex h-10 w-10 items-center justify-center bg-white/50 font-sans-secondary text-2xl font-medium leading-5 text-black",
    contentGroup: "flex flex-col gap-2",
    heading: "font-sans text-sm font-bold leading-5 text-white",
    body: "font-sans-secondary text-sm font-medium leading-5 text-gray",
    span: "text-white",
    dialog: "font-sans-secondary text-sm font-medium italic leading-5 text-white",
    action: "mt-auto h-13 w-52 font-sans-secondary text-base font-semibold",
} as const;

function cx(...classNames: Array<string | undefined | false>) {
    return classNames.filter(Boolean).join(" ");
}

function StoryboardSceneImage({ scene }: { scene: StoryboardScene }) {
    return (
        <div className={storyboardSceneCardClassNames.imageWrap}>
            {scene.imageSrc ? (
                <Image
                    src={scene.imageSrc}
                    alt={scene.imageAlt ?? scene.title}
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className={storyboardSceneCardClassNames.image}
                />
            ) : null}
            {scene.number ? <span className={storyboardSceneCardClassNames.numberBadge}>{scene.number}</span> : null}
        </div>
    );
}

export default function StoryboardSceneCard({ scene, onAction, className = "" }: StoryboardSceneCardProps) {
    const actionLabel = scene.actionLabel ?? "Edit Scene";

    return (
        <article className={cx(storyboardSceneCardClassNames.root, className)}>
            <StoryboardSceneImage scene={scene} />

            <div className={storyboardSceneCardClassNames.contentGroup}>
                <h3 className={storyboardSceneCardClassNames.heading}>{scene.title}</h3>
                <p className={storyboardSceneCardClassNames.body}><span className={storyboardSceneCardClassNames.span}>Visual: </span>{scene.visual}</p>
            </div>

            <div className={storyboardSceneCardClassNames.contentGroup}>
                <p className={storyboardSceneCardClassNames.heading}>Dialog / VO:</p>
                <p className={storyboardSceneCardClassNames.dialog}>{scene.dialog}</p>
            </div>

            {scene.actionHref ? (
                <Button href={scene.actionHref} variant="primary" tone="dark" className={storyboardSceneCardClassNames.action}>
                    {actionLabel}
                </Button>
            ) : (
                <Button variant="primary" tone="dark" className={storyboardSceneCardClassNames.action} onClick={onAction ? () => onAction(scene) : undefined}>
                    {actionLabel}
                </Button>
            )}
        </article>
    );
}

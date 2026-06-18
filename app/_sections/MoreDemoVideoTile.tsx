import BaseVideo from "../_components/BaseVideo";

type MoreDemoVideoTileProps = {
    src: string;
    label: string;
};

export default function MoreDemoVideoTile({ src, label }: MoreDemoVideoTileProps) {
    return (
        <BaseVideo
            src={src}
            className="h-full w-full object-cover scale-125"
            ariaLabel={label}
            lazy
        />
    );
}

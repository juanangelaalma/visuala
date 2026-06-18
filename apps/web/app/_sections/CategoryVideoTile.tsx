import BaseVideo from "../_components/BaseVideo";

type CategoryVideoTileProps = {
    src: string;
    fallbackSrc?: string;
    title: string;
};

export default function CategoryVideoTile({ src, fallbackSrc, title }: CategoryVideoTileProps) {
    return (
        <>
            <BaseVideo
                src={src}
                fallbackSrc={fallbackSrc}
                ariaLabel={`${title} category video`}
                wrapperClassName="absolute inset-0 h-full w-full"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                lazy
            />
            <div className="absolute inset-0 bg-black/20 transition-colors duration-500 group-hover:bg-black/30" />
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <h3 className="text-center text-category font-normal uppercase tracking-wider text-white drop-shadow-md">
                    {title}
                </h3>
            </div>
        </>
    );
}

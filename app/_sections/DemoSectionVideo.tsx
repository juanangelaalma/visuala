import BaseVideo from "../_components/BaseVideo";

type DemoSectionVideoProps = {
    src: string;
};

export default function DemoSectionVideo({ src }: DemoSectionVideoProps) {
    return (
        <BaseVideo
            src={src}
            wrapperClassName="absolute inset-0 h-full w-full"
            className="absolute inset-0 h-full w-full object-cover"
            ariaLabel="Demo visual"
        />
    );
}

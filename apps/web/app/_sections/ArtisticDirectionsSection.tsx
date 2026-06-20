import { Section } from "@visuala/ui";
import ArtisticBoard from "../_components/artistic-directions/ArtisticBoard";

export default function ArtisticDirectionsSection() {
    return (
        <Section className="w-full overflow-hidden bg-black px-4 py-16 md:py-24" contained={false}>
            <ArtisticBoard />
        </Section>
    );
}

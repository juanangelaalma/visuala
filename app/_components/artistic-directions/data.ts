import { StaticImageData } from "next/image";
import img1 from "../../__assets/showcase/image 1.webp";
import img2 from "../../__assets/showcase/image 2.webp";
import img3 from "../../__assets/showcase/image 3.webp";

export const categories = [
    "UGC",
    "Beauty",
    "Fashion",
    "Food",
    "Fitness",
    "Automotive",
];

export type ItemType = {
    label: string;
    img: StaticImageData | null;
    video?: string;
};

export const categoryData: Record<string, ItemType[]> = {
    UGC: [
        { label: "UNBOXING", img: null, video: "/videos/artistics/ugc/unboxing.mp4" },
        { label: "TESTIMONIALS", img: null, video: "/videos/artistics/ugc/testimonial.mp4" },
        { label: "TRY-ONS", img: null, video: "/videos/artistics/ugc/try_on.mp4" },
        { label: "PODCASTS", img: null, video: "/videos/artistics/ugc/podcast.mp4" },
        { label: "REVIEWS", img: null, video: "/videos/artistics/ugc/review.mp4" },
        { label: "DEMOS", img: null, video: "/videos/artistics/ugc/demos.mp4" },
        { label: "POV'S", img: null, video: "/videos/artistics/ugc/povs.mp4" },
        { label: "HOOK + CAPTION STYLE", img: null, video: "/videos/artistics/ugc/hook_and_caption.mp4" },
        { label: "I TRIED X FOR 7 DAYS", img: null, video: "/videos/artistics/ugc/i_tried_x_for_7_days.mp4" },
        { label: "DAY IN THE LIFE (ASMR)", img: null, video: "/videos/artistics/ugc/day_in_the_life.mp4" },
        { label: "PROBLEM VS SOLUTION", img: null, video: "/videos/artistics/ugc/problem_solution.mp4" },
        { label: "AESTHETIC HAUL", img: null, video: "/videos/artistics/ugc/aesthetic_haul.mp4" },
    ],
    Beauty: [
        { label: "SKINCARE ROUTINE (ASMR)", img: img2 },
        { label: "BEFORE VS AFTER TRANSFORMATION", img: img3 },
        { label: "PRODUCT TEXTURE MACRO CLOSE-UP", img: null },
        { label: "GRWM (GET READY WITH ME)", img: img1 },
        { label: "SHADE SWATCHES GALLERY", img: null },
        { label: "AESTHETIC PRODUCT FLATLAY", img: null },
        { label: "HYDRATION & GLOW TEST", img: null },
        { label: "INGREDIENTS BREAKDOWN VISUAL", img: null },
        { label: "NIGHT CINEMA AESTHETIC", img: null },
        { label: "CLEAN GIRL AESTHETIC LOOK", img: null },
        { label: "WATERPROOF / SMUDGE-PROOF TEST", img: null },
        { label: "SATISFYING PRODUCT SCOOP", img: null },
    ],
    Fashion: [
        { label: "OUTFIT BREAKDOWN / LOOKBOOK", img: img3 },
        { label: "DYNAMIC TRANSITION (JUMP CUT)", img: img1 },
        { label: "FABRIC MOVEMENT SLOW-MO", img: null },
        { label: "MONOCHROME VS COLOR POP", img: img2 },
        { label: "STREET STYLE CINEMATIC", img: null },
        { label: "MIX AND MATCH / STYLING GUIDE", img: null },
        { label: "CAPSULE WARDROBE AESTHETIC", img: null },
        { label: "SILHOUETTES & SHADOWS PLAY", img: null },
        { label: "VINTAGE / RETRO EDITORIAL", img: null },
        { label: "CLOSE-UP STITCHING & DETAIL", img: null },
        { label: "AIRPORT / TRAVEL LOOK", img: null },
        { label: "GENDER-NEUTRAL / UNISEX STYLE", img: null },
    ],
    Food: [
        { label: "SIZZLING & STEAM SLOW-MO", img: img1 },
        { label: "MACRO INGREDIENT DROP", img: img3 },
        { label: "THE PERFECT POUR / DRIZZLE", img: null },
        { label: "CINEMATIC RECIPE (NO-TALKING)", img: img2 },
        { label: "CHEESE PULL / CRUNCH ASMR", img: null },
        { label: "VIBRANT COLOR GRADING", img: null },
        { label: "BEHIND THE KITCHEN MAGIC", img: null },
        { label: "FARM-TO-TABLE FRESHNESS", img: null },
        { label: "DARK MOODY FINE DINING", img: null },
        { label: "PLATING ART EXPRESSION", img: null },
        { label: "STEAM & SMOKE ATMOSPHERE", img: null },
        { label: "SATISFYING CUTTING / CHOPPING", img: null },
    ],
    Fitness: [
        { label: "HIGH-INTENSITY MOTION BLUR", img: img2 },
        { label: "THE SWEAT & GRIT CLOSE-UP", img: img1 },
        { label: "PRE/POST WORKOUT ROUTINE", img: null },
        { label: "CINEMATIC GYM LIGHTING", img: img3 },
        { label: "OUTDOOR TRAIL EXPLORATION", img: null },
        { label: "FORM & TECHNIQUE CORRECTION", img: null },
        { label: "CALISTHENICS SLOW-MOTION", img: null },
        { label: "GYM BAG ESSENTIALS", img: null },
        { label: "ATHLEISURE SHOWCASE", img: null },
        { label: "PROGRESS TIMELINE (BODY GOALS)", img: null },
        { label: "HOME WORKOUT AESTHETIC", img: null },
        { label: "MIND & BODY YOGA FLOW", img: null },
    ],
    Automotive: [
        { label: "ROLLING SHOTS (CAR-TO-CAR)", img: img3 },
        { label: "GOLDEN HOUR REFLECTIONS", img: img2 },
        { label: "EXHAUST SOUND & COLD START", img: null },
        { label: "MACRO DETAIL & BADGING", img: img1 },
        { label: "COCKPIT CINEMATIC VIEW", img: null },
        { label: "LED LIGHT CHOREOGRAPHY", img: null },
        { label: "WHEELS & RIMS IN MOTION", img: null },
        { label: "DRONE TRACKING SHOT", img: null },
        { label: "THE SATISFYING CAR WASH (ASMR)", img: null },
        { label: "HYPER-LAPSE URBAN DRIVE", img: null },
        { label: "ENGINE BAY SHOWCASE", img: null },
        { label: "OFF-ROAD RUGGED ATMOSPHERE", img: null },
    ],
};

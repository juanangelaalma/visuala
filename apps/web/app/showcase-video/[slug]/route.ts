import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const showcaseVideos = {
    eyelash: "Woman_receiving_eyelash_extensions_202605182110.mp4",
    leaves: "Asian_woman_among_leaves_flowers_202605182113.mp4",
    car: "Silver_luxury_sports_car_showroom_202605182126.mp4",
} as const;

const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "video/mp4",
};

type ShowcaseVideoSlug = keyof typeof showcaseVideos;

type RouteContext = {
    params: Promise<{ slug: string }>;
};

function getVideoPath(slug: string) {
    const fileName = showcaseVideos[slug as ShowcaseVideoSlug];

    if (!fileName) {
        return null;
    }

    return path.join(process.cwd(), "app", "__assets", "videos", "showcase", fileName);
}

function getRange(range: string, size: number) {
    const [startValue, endValue] = range.replace("bytes=", "").split("-");
    const start = Number.parseInt(startValue, 10);
    const end = endValue ? Number.parseInt(endValue, 10) : size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
        return null;
    }

    return { start, end };
}

export async function GET(request: Request, { params }: RouteContext) {
    const { slug } = await params;
    const videoPath = getVideoPath(slug);

    if (!videoPath) {
        return new Response(null, { status: 404 });
    }

    const { size } = await stat(videoPath);
    const range = request.headers.get("range");

    if (!range) {
        const stream = Readable.toWeb(createReadStream(videoPath));

        return new Response(stream as BodyInit, {
            headers: {
                ...commonHeaders,
                "Content-Length": String(size),
            },
        });
    }

    const parsedRange = getRange(range, size);

    if (!parsedRange) {
        return new Response(null, {
            status: 416,
            headers: {
                "Content-Range": `bytes */${size}`,
            },
        });
    }

    const { start, end } = parsedRange;
    const stream = Readable.toWeb(createReadStream(videoPath, { start, end }));
    const contentLength = end - start + 1;

    return new Response(stream as BodyInit, {
        status: 206,
        headers: {
            ...commonHeaders,
            "Content-Length": String(contentLength),
            "Content-Range": `bytes ${start}-${end}/${size}`,
        },
    });
}

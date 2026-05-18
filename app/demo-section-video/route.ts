import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const videoPath = path.join(
    process.cwd(),
    "app",
    "__assets",
    "videos",
    "demo-section-video.mp4"
);

const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "video/mp4",
};

export async function GET(request: Request) {
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

    const [startValue, endValue] = range.replace("bytes=", "").split("-");
    const start = Number.parseInt(startValue, 10);
    const end = endValue ? Number.parseInt(endValue, 10) : size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
        return new Response(null, {
            status: 416,
            headers: {
                "Content-Range": `bytes */${size}`,
            },
        });
    }

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

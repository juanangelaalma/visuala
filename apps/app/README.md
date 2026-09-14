This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use pnpm for this workspace:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI provider service

The provider-neutral text, structured-output, and image-input service is documented in [`docs/ai-provider-service.md`](docs/ai-provider-service.md). The guide covers profiles, task mappings, server-only callers, asset registration, offline configuration checks, paid smoke commands, and removal of the old video flow.

## AI worker configuration

AI routes are backend-only. Run `POST /api/ai/worker` from a trusted cron with
`Authorization: Bearer $AI_WORKER_SECRET`; never expose that secret to browser code.
Required production variables are `AI_WORKER_SECRET`, `GEMINI_API_KEY`, optional
`GEMINI_TEXT_MODEL`, `ATLASCLOUD_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, and
`ATLAS_ASSET_HOSTS` (a comma-separated allowlist of Atlas output CDN hostnames).
The public base URL
must be the durable HTTPS delivery origin for private R2 objects (for example, an
authenticated CDN or signed-URL gateway), not the R2 API endpoint.

Upload product/reference images through authenticated `POST /api/ai/assets` and
pass the returned durable URLs as `referenceAssets` when creating a storyboard.

`ATLAS_VIDEO_MODELS_JSON` must be a JSON object keyed by
`video_i2v_economy`, `video_i2v_default`, `video_i2v_complex`,
`video_talking_head`, and `video_i2v_premium`. Each value has this shape:

```json
{"modelId":"verified/model-id","estimatedCostUsdPerSecond":0.05,"fields":{"prompt":"prompt","image":"image","duration":"duration","resolution":"resolution","aspectRatio":"aspect_ratio","audio":"generate_audio"},"capabilities":{"duration":true,"resolution":true,"aspectRatio":true,"audio":true}}
```

Use the provider's verified contract for each model; unsupported fields may be
omitted and their capability must be `false`. Local Remotion/FFmpeg composition
is intentionally only a zero-credit `waiting_for_composer` queue boundary.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

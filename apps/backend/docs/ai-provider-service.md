# AI provider service

The AI provider service gives server code one interface for text, structured output, and image input. Import `createAIService` only from server code. Browser code must call an authenticated route or server action.

The active F&B creator calls `generateStructured` from `application/fnb/planner.ts`. The model selects factual copy fragments and an allowlisted visual preset; it never supplies executable HTML, CSS, or JavaScript. The legacy chat-storage routes do not generate assistant replies.

## Configuration

Get the AI service variables into the deployment environment by running `make -C apps/backend env`, which copies the `AI_*` and Supabase variables through the `env:` target in
`apps/backend/Makefile`, or by setting them directly in the environment. `apps/backend/docs/chat-video-generator.md` lists every variable this backend reads, with its default. Do not commit keys or production values.

`AI_PROFILES_JSON` is an array of connection profiles. Each profile contains:

- `id`: stable profile name referenced by task mappings.
- `apiFormat`: registered protocol: `google-generate-content` or `openai-responses`.
- `baseUrl`: compatible API endpoint.
- `apiKeyEnv`: name of the environment variable that stores the API key.
- `modelIdEnv`: name of the environment variable that stores the model ID.
- `provider`: provider label saved with usage records.
- `capabilities`: support flags for text, vision, and native structured output.
- `limits`: input, output, asset, concurrency, timeout, deadline, and retry limits.
- `pricing`: optional token prices and their version, source, and currency.

`AI_TASKS_JSON` maps every task to a profile ID. Define all four tasks: `connection_test`, `interviewer`, `planner`, and `product_analysis`. A task can override selected profile limits.

`AI_MAX_CONCURRENCY` sets the initial process-wide request cap. Each profile also has `limits.maxConcurrency`, and a task can lower it. When an operation resolves a lower task/profile cap, the shared process limiter tightens to that value and never loosens until the process restarts or test state is reset.

Credentials and model names are resolved from each profile's `apiKeyEnv` and `modelIdEnv`; they are not hardcoded by provider. The existing local 9Router profile uses `openai-responses` and `http://127.0.0.1:20128/v1`, with the key entered separately. Plain HTTP requires the explicit loopback development setting; do not use it for remote endpoints.

The service also needs these server-side variables for persistence and private image reads:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service stores and reads image assets through the private Supabase Storage bucket instead of a separate object store; `SUPABASE_ASSET_BUCKET` selects the bucket (default `assets`).

Smoke commands read `AI_SMOKE_USER_ID`; the vision command also reads `AI_SMOKE_ASSET_ID`.

Restart the app after local environment changes. Redeploy each process after changing deployment variables. Configuration is read when the service factory runs, and running processes do not receive edited environment values.

## Change an endpoint, key, or model

Callers select a task, not a provider. To switch to another endpoint that implements the same registered API format:

1. Update the profile `baseUrl`.
2. Point `apiKeyEnv` and `modelIdEnv` to the new environment variable names, or replace the values stored under the existing names.
3. Set `provider`, `capabilities`, `limits`, and `pricing` to match the endpoint.
4. Keep the task mapped to that profile in `AI_TASKS_JSON`.
5. Restart or redeploy the app.

No caller edit is required. Validate the endpoint's request and response compatibility before deployment.

A provider with a different API format needs a new `ProviderAdapter` implementation and registration in the service factory. Adding its URL and key to `AI_PROFILES_JSON` without an adapter fails configuration validation.

## Server-side calls

Use a unique request ID for each operation. Pass the authenticated user ID in `context.userId`. `promptVersion` identifies the prompt revision used for the result and usage record.

```ts
import { createAIService } from "@/infrastructure/ai-service/create-ai-service";

const result = await createAIService().generateText({
  requestId: crypto.randomUUID(),
  task: "interviewer",
  context: { userId, projectId },
  instructions: "Ask one concise follow-up question.",
  messages: [{ role: "user", content: answer }],
  promptVersion: "interviewer-v1",
});

const question = result.text;
```

Register structured schemas under the same `name@version` key passed in the request.

```ts
import { z } from "zod";
import { createAIService } from "@/infrastructure/ai-service/create-ai-service";

const planSchema = z.object({ title: z.string(), steps: z.array(z.string()) });
const service = createAIService({ schemas: { "plan@v1": planSchema } });

const result = await service.generateStructured({
  requestId: crypto.randomUUID(),
  task: "planner",
  context: { userId, projectId },
  instructions: "Return a plan that matches the schema.",
  messages: [{ role: "user", content: brief }],
  promptVersion: "planner-v1",
  schema: { name: "plan", version: "v1", schema: planSchema },
});

const plan = result.data;
```

## Image input

Before sending an image request, register the asset from trusted server code with `registerAsset`. The use case validates the image, writes it to private object storage, and records ownership. Keep the returned `id` as the `assetId`. The authenticated F&B upload route is `POST /fnb-campaigns/:id/assets`; its owner-scoped assets are used in composition, not sent to the current factual-fragment planner.

Pass that ID on the message that refers to the image:

```ts
const result = await createAIService().generateText({
  requestId: crypto.randomUUID(),
  task: "product_analysis",
  context: { userId, projectId },
  instructions: "Describe the product shown in the image.",
  messages: [{ role: "user", content: "Analyze this product.", assetId }],
  promptVersion: "product-analysis-v1",
});
```

`generateText` accepts an `assetId` only when the selected profile has `capabilities.vision` set to `true`.

The service checks asset ownership before reading bytes. Do not pass object-store URLs or raw image bytes through the caller contract.

## Checks and smoke commands

Run the offline configuration check after changing profiles or task mappings:

```bash
pnpm --filter backend ai:check-config
```

This command parses and resolves configuration without creating the provider client or the Supabase client. It sends no provider request.

The following commands send paid provider requests:

```bash
pnpm --filter backend ai:smoke:text
pnpm --filter backend ai:smoke:structured
pnpm --filter backend ai:smoke:vision
```

Add `-- --profile <profile-id>` to a smoke command to test a configured profile directly. Run paid smoke commands only with explicit authorization, valid credentials, and an owned test asset for vision.

Fixture tests use local HTTP servers and prove request translation, response parsing, errors, cancellation, and configuration behavior without external network access. They do not prove that a live endpoint accepts the configured model or credentials. Record fixture and live results separately. Use `NOT RUN` for each smoke command that was not executed.

## Video-flow independence

The provider service remains independent of credits and the renderer. The F&B planner registers `fnb-campaign-creative@1`, then passes validated choices to deterministic composition. Provider attempts use the existing usage/operation persistence, not billing integration.

The retained surface is `domain/ai-service`, `application/ai-service`, `infrastructure/ai-service`, `scripts/ai-service*`, `ai_assets`, `ai_service_operations`, and `ai_service_attempts`.

## Verified F&B caller

A real authenticated local campaign generated four fixed scenes and a preset through the existing 9Router `/responses` profile. The composition was saved separately and checked in an actual browser by Hyperframes. This proves the exercised structured planner path; it is not a claim that the unused text/vision smoke commands or a production deployment were run.

# AI provider service

The AI provider service gives server code one interface for text, structured output, and image input. Import `createAIService` only from server code. Browser code must call an authenticated route or server action.

The service currently has no production feature caller. The application-level analyze, storyboard, image/video generation, and worker routes have been removed. The scripts documented below remain available for configuration checks and explicitly authorized smoke tests.

## Configuration

Copy the AI service variables from `.env.example` into the deployment environment. Do not commit keys or production values.

`AI_PROFILES_JSON` is an array of connection profiles. Each profile contains:

- `id`: stable profile name referenced by task mappings.
- `apiFormat`: registered provider protocol. The current value is `google-generate-content`.
- `baseUrl`: compatible API endpoint.
- `apiKeyEnv`: name of the environment variable that stores the API key.
- `modelIdEnv`: name of the environment variable that stores the model ID.
- `provider`: provider label saved with usage records.
- `capabilities`: support flags for text, vision, and native structured output.
- `limits`: input, output, asset, concurrency, timeout, deadline, and retry limits.
- `pricing`: optional token prices and their version, source, and currency.

`AI_TASKS_JSON` maps every task to a profile ID. Define all four tasks: `connection_test`, `interviewer`, `planner`, and `product_analysis`. A task can override selected profile limits.

`AI_MAX_CONCURRENCY` sets the initial process-wide request cap. Each profile also has `limits.maxConcurrency`, and a task can lower it. When an operation resolves a lower task/profile cap, the shared process limiter tightens to that value and never loosens until the process restarts or test state is reset.

The example profile reads its credentials and model from `AI_GOOGLE_API_KEY` and `AI_GOOGLE_MODEL`. The service also needs these server-side variables for persistence and private image reads:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

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

Before sending an image request, register the asset from trusted server code with `registerAsset`. The use case validates the image, writes it to private object storage, and records ownership. Keep the returned `id` as the `assetId`. There is intentionally no public asset-upload route at this time.

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
pnpm --filter app ai:check-config
```

This command parses and resolves configuration without creating the provider client, Supabase client, or R2 client. It sends no provider request.

The following commands send paid provider requests:

```bash
pnpm --filter app ai:smoke:text
pnpm --filter app ai:smoke:structured
pnpm --filter app ai:smoke:vision
```

Add `-- --profile <profile-id>` to a smoke command to test a configured profile directly. Run paid smoke commands only with explicit authorization, valid credentials, and an owned test asset for vision.

Fixture tests use local HTTP servers and prove request translation, response parsing, errors, cancellation, and configuration behavior without external network access. They do not prove that a live endpoint accepts the configured model or credentials. Record fixture and live results separately. Use `NOT RUN` for each smoke command that was not executed.

## Video-flow independence

The AI provider service does not depend on the removed video flow, Atlas, credits, or worker modules. Its contracts, service factory, adapter, asset storage, usage storage, configuration, and SQL tables are standalone.

The retained surface is `domain/ai-service`, `application/ai-service`, `infrastructure/ai-service`, `scripts/ai-service*`, `ai_assets`, `ai_service_operations`, and `ai_service_attempts`.

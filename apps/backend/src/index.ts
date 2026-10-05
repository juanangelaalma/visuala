import { app } from "@/app";
import { getEnv } from "@/env";

const env = getEnv();
app.listen({ port: env.PORT, idleTimeout: 255 });

console.log(`Backend listening on port ${env.PORT}`);

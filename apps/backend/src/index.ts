import { app } from "@/app";
import { getEnv } from "@/env";

const env = getEnv();
app.listen(env.PORT);

console.log(`Backend listening on port ${env.PORT}`);

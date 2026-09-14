import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

export type FixtureRequest = {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: unknown;
};

export type FixtureResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
  delayMs?: number;
};

type FixtureServer = {
  baseUrl: string;
  requests: FixtureRequest[];
  close(): Promise<void>;
};

const openServers = new Set<FixtureServer>();

export async function startHttpFixtureServer(
  respond: (request: FixtureRequest) => FixtureResponse | Promise<FixtureResponse>,
  basePath = "/v1beta/",
): Promise<FixtureServer> {
  const requests: FixtureRequest[] = [];
  const server = createServer(async (request, response) => {
    const fixtureRequest = await readFixtureRequest(request);
    requests.push(fixtureRequest);
    const fixtureResponse = await respond(fixtureRequest);
    await sendFixtureResponse(response, fixtureResponse);
  });
  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind.");
  const fixtureServer: FixtureServer = {
    baseUrl: `http://127.0.0.1:${address.port}${basePath}`,
    requests,
    close: () => close(server),
  };
  openServers.add(fixtureServer);
  return fixtureServer;
}

afterEach(async () => {
  await Promise.all([...openServers].map(async (server) => server.close()));
  openServers.clear();
});

describe("HTTP fixture server", () => {
  it("captures requests on an ephemeral loopback port", async () => {
    const server = await startHttpFixtureServer(() => ({ body: { ok: true } }));

    const response = await fetch(`${server.baseUrl}probe`, {
      method: "POST",
      headers: { "x-probe": "yes" },
      body: JSON.stringify({ value: 1 }),
    });

    expect({ body: await response.json(), request: server.requests[0] }).toMatchObject({
      body: { ok: true },
      request: { method: "POST", url: "/v1beta/probe", headers: { "x-probe": "yes" }, body: { value: 1 } },
    });
  });
});

async function readFixtureRequest(request: import("node:http").IncomingMessage): Promise<FixtureRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  return { method: request.method, url: request.url, headers: request.headers, body: body ? JSON.parse(body) : null };
}

async function sendFixtureResponse(response: import("node:http").ServerResponse, fixture: FixtureResponse): Promise<void> {
  if (fixture.delayMs) await new Promise((resolve) => setTimeout(resolve, fixture.delayMs));
  response.writeHead(fixture.status ?? 200, { "content-type": "application/json", ...fixture.headers });
  response.end(fixture.rawBody ?? JSON.stringify(fixture.body ?? {}));
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { API_BODY_LIMIT_BYTES, installBodyParsers } from "./bodyParser";

let server: Server | undefined;

async function startServer(): Promise<string> {
  const app = express();
  installBodyParsers(app);
  app.post("/json", (req, res) => res.json({ accepted: true, body: req.body }));
  app.post("/form", (req, res) => res.json({ accepted: true, body: req.body }));
  app.use(
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(error.status ?? 500).end();
    }
  );

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server?.once("listening", resolve);
    server?.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server?.close(error => (error ? reject(error) : resolve()));
    });
  }
  server = undefined;
});

describe("bounded API body parsers", () => {
  it("accepts a small JSON request", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId: "T01" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ accepted: true });
  });

  it("rejects JSON and urlencoded bodies larger than 16 KiB", async () => {
    const baseUrl = await startServer();
    const oversizedValue = "x".repeat(API_BODY_LIMIT_BYTES + 128);
    const jsonResponse = await fetch(`${baseUrl}/json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: oversizedValue }),
    });
    const formResponse = await fetch(`${baseUrl}/form`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `payload=${oversizedValue}`,
    });

    expect(jsonResponse.status).toBe(413);
    expect(formResponse.status).toBe(413);
    await jsonResponse.text();
    await formResponse.text();
  });
});

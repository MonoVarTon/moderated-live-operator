import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeContext(
  remoteAddress: string,
  user: TrpcContext["user"] = null
): TrpcContext {
  return {
    req: { socket: { remoteAddress } } as unknown as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LIVE draft access policy", () => {
  it("serves deterministic offline drafts only to development loopback clients", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_DRAFT_MODE", "offline-demo");
    const networkRequest = vi.fn();
    vi.stubGlobal("fetch", networkRequest);
    const requestId = "00000000-0000-4000-8000-000000000001";
    const caller = appRouter.createCaller(makeContext("127.0.0.1"));

    await expect(caller.live.mode()).resolves.toBe("offline-demo");
    await expect(
      caller.live.draft({ fixtureId: "T01", requestId })
    ).resolves.toMatchObject({ ok: true, model: "offline-demo" });
    await expect(caller.live.cancelDraft({ requestId })).resolves.toEqual({
      cancelled: false,
    });
    expect(networkRequest).not.toHaveBeenCalled();
  });

  it("rejects anonymous remote draft and cancel requests in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_DRAFT_MODE", "offline-demo");
    const requestId = "00000000-0000-4000-8000-000000000002";
    const caller = appRouter.createCaller(makeContext("192.0.2.18"));

    await expect(
      caller.live.draft({ fixtureId: "T01", requestId })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.live.cancelDraft({ requestId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects anonymous loopback draft requests outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIVE_DRAFT_MODE", "offline-demo");
    const caller = appRouter.createCaller(makeContext("127.0.0.1"));

    await expect(
      caller.live.draft({
        fixtureId: "T01",
        requestId: "00000000-0000-4000-8000-000000000003",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires admin for provider mode and allows the authenticated admin route", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIVE_DRAFT_MODE", "provider");
    const networkRequest = vi.fn();
    vi.stubGlobal("fetch", networkRequest);
    const providerRequestId = "00000000-0000-4000-8000-000000000004";
    const anonymousCaller = appRouter.createCaller(
      makeContext("198.51.100.22")
    );

    await expect(anonymousCaller.live.mode()).resolves.toBe("provider");
    await expect(
      anonymousCaller.live.draft({
        fixtureId: "T02",
        requestId: providerRequestId,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    vi.stubEnv("LIVE_DRAFT_MODE", "offline-demo");
    const user = { openId: "test-admin", role: "admin" } as TrpcContext["user"];
    const adminCaller = appRouter.createCaller(
      makeContext("198.51.100.22", user)
    );
    await expect(adminCaller.live.mode()).resolves.toBe("offline-demo");
    await expect(
      adminCaller.live.draft({
        fixtureId: "T02",
        requestId: "00000000-0000-4000-8000-000000000005",
      })
    ).resolves.toMatchObject({ ok: true, model: "offline-demo" });
    expect(networkRequest).not.toHaveBeenCalled();
  });
});

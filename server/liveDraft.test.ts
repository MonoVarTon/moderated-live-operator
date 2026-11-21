import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvokeParams, InvokeResult } from "./_core/llm";
import { invokeLLM } from "./_core/llm";
import {
  createDraftService,
  createLiveDraftForClient,
  getLiveDraftMode,
  LIVE_DRAFT_MODEL,
} from "./liveDraft";
import type { LiveModerationRequest } from "./liveModeration";
import { LIVE_FIXTURES } from "../shared/liveFixtures";

function completion(content: string): InvokeResult {
  return {
    id: "mock-completion",
    created: 0,
    model: LIVE_DRAFT_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
  };
}

function createTestService(
  options: NonNullable<Parameters<typeof createDraftService>[0]> = {}
) {
  return createDraftService({
    moderate: async () => "allow" as const,
    ...options,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("safe LIVE draft service", () => {
  it("checks input and output separately before returning a provider draft", async () => {
    const invoke = vi.fn(async (_params: InvokeParams) =>
      completion("Эта демо-сцена имеет условную метку «Demo».")
    );
    const moderate = vi.fn(async () => "allow" as const);
    const service = createTestService({ invoke, moderate });

    const result = await service.createDraft("T01");

    expect(result).toEqual({
      ok: true,
      text: "Эта демо-сцена имеет условную метку «Demo».",
      model: LIVE_DRAFT_MODEL,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(moderate.mock.calls.map(([request]) => request.stage)).toEqual([
      "input",
      "output",
    ]);
    const request = invoke.mock.calls[0][0];
    expect(request.model).toBe(LIVE_DRAFT_MODEL);
    expect(request.reasoning).toEqual({ effort: "low" });
    expect(request.messages[1]).toEqual({
      role: "user",
      content: LIVE_FIXTURES[0].comment,
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request.messages[0].content).toContain("real person");
  });

  it("never sends an unsupported or free-form fixture to the model", async () => {
    const invoke = vi.fn(async () => completion("Не должен вызываться."));
    const service = createTestService({ invoke });

    const result = await service.createDraft(
      "T08" as (typeof LIVE_FIXTURES)[number]["id"]
    );

    expect(result).toEqual({ ok: false, code: "UNSUPPORTED_FIXTURE" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("fails closed before model invocation when moderation is not configured", async () => {
    const invoke = vi.fn(async () => completion("Не должен возвращаться."));
    const service = createDraftService({ invoke });

    await expect(service.createDraft("T01")).resolves.toEqual({
      ok: false,
      code: "MODERATION_UNAVAILABLE",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects review-required input before model invocation", async () => {
    const invoke = vi.fn(async () => completion("Не должен возвращаться."));
    const moderate = vi.fn(async () => "review" as const);
    const service = createTestService({ invoke, moderate });

    await expect(service.createDraft("T01")).resolves.toEqual({
      ok: false,
      code: "INPUT_REJECTED",
    });
    expect(moderate).toHaveBeenCalledTimes(1);
    expect(moderate.mock.calls[0][0].stage).toBe("input");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("never returns a blocked model answer", async () => {
    const invoke = vi.fn(async () =>
      completion("Потенциально рискованный ответ.")
    );
    const moderate = vi.fn(async ({ stage }: LiveModerationRequest) =>
      stage === "output" ? ("block" as const) : ("allow" as const)
    );
    const service = createTestService({ invoke, moderate });

    await expect(service.createDraft("T01")).resolves.toEqual({
      ok: false,
      code: "OUTPUT_REJECTED",
    });
    expect(moderate.mock.calls.map(([request]) => request.stage)).toEqual([
      "input",
      "output",
    ]);
  });

  it("fails closed and does not call the model when moderation throws", async () => {
    const invoke = vi.fn(async () => completion("Не должен возвращаться."));
    const moderate = vi.fn(async () => {
      throw new Error("private moderation failure");
    });
    const service = createTestService({ invoke, moderate });

    const result = await service.createDraft("T01");

    expect(result).toEqual({ ok: false, code: "MODERATION_UNAVAILABLE" });
    expect(invoke).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private moderation failure");
  });

  it("times out an unresponsive moderation provider and returns no draft", async () => {
    const invoke = vi.fn(async () => completion("Не должен возвращаться."));
    const moderate = vi.fn(() => new Promise<"allow">(() => undefined));
    const service = createTestService({ invoke, moderate, timeoutMs: 10 });

    await expect(service.createDraft("T01")).resolves.toEqual({
      ok: false,
      code: "MODEL_TIMEOUT",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("fails closed on a missing or empty completion", async () => {
    const invoke = vi.fn(async () => completion("   "));
    const service = createTestService({ invoke });

    await expect(service.createDraft("T02")).resolves.toEqual({
      ok: false,
      code: "MODEL_EMPTY",
    });
  });

  it("rejects overlong, linked or contact-like model output", async () => {
    const outputs = [
      "x".repeat(221),
      "Перейдите на https://example.invalid",
      "Напишите на demo@example.invalid",
      "+1 (555) 123-4567",
    ];

    for (const output of outputs) {
      const service = createTestService({
        invoke: vi.fn(async () => completion(output)),
      });
      await expect(service.createDraft("T01")).resolves.toEqual({
        ok: false,
        code: "DRAFT_REJECTED",
      });
    }
  });

  it("returns a safe error code without exposing upstream error text", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("private prompt text must not be forwarded");
    });
    const service = createTestService({ invoke });

    const result = await service.createDraft("T03");

    expect(result).toEqual({ ok: false, code: "MODEL_UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("private prompt text");
  });

  it("aborts a stalled model call and returns no fallback draft", async () => {
    const invoke = vi.fn(
      (params: InvokeParams) =>
        new Promise<InvokeResult>((_resolve, reject) => {
          params.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          );
        })
    );
    const service = createTestService({ invoke, timeoutMs: 10 });

    await expect(service.createDraft("T02")).resolves.toEqual({
      ok: false,
      code: "MODEL_TIMEOUT",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("limits repeated manual requests in the same server process", async () => {
    let clock = 1_000;
    const invoke = vi.fn(async () => completion("Тестовый ответ."));
    const service = createTestService({
      invoke,
      now: () => clock,
      cooldownMs: 5_000,
    });

    await expect(service.createDraft("T01")).resolves.toMatchObject({
      ok: true,
    });
    await expect(service.createDraft("T02")).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
    });
    clock += 5_001;
    await expect(service.createDraft("T03")).resolves.toMatchObject({
      ok: true,
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("applies cooldown per requester instead of blocking other operators", async () => {
    let clock = 1_000;
    const invoke = vi.fn(async () => completion("Тестовый ответ."));
    const service = createTestService({
      invoke,
      now: () => clock,
      cooldownMs: 5_000,
    });

    await expect(
      service.createDraft("T01", "operator-a")
    ).resolves.toMatchObject({ ok: true });
    await expect(
      service.createDraft("T02", "operator-b")
    ).resolves.toMatchObject({ ok: true });
    await expect(service.createDraft("T03", "operator-a")).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
    });
    clock += 5_001;
    await expect(
      service.createDraft("T03", "operator-a")
    ).resolves.toMatchObject({ ok: true });
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it("cancels only the matching in-flight request for its requester", async () => {
    let observedSignal: AbortSignal | undefined;
    const invoke = vi.fn(
      (params: InvokeParams) =>
        new Promise<InvokeResult>((_resolve, reject) => {
          observedSignal = params.signal;
          params.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted by operator")),
            { once: true }
          );
        })
    );
    const service = createTestService({ invoke, timeoutMs: 60_000 });
    const pending = service.createDraft("T01", "operator-a", "request-a");

    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(service.cancelDraft("operator-b", "request-a")).toBe(false);
    expect(service.cancelDraft("operator-a", "request-a")).toBe(true);
    await expect(pending).resolves.toEqual({ ok: false, code: "CANCELLED" });
    expect(observedSignal?.aborted).toBe(true);
    expect(service.cancelDraft("operator-a", "request-a")).toBe(false);
  });

  it("caps concurrent provider invocations", async () => {
    const invoke = vi.fn(
      (params: InvokeParams) =>
        new Promise<InvokeResult>((_resolve, reject) => {
          params.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          );
        })
    );
    const service = createTestService({ invoke, timeoutMs: 60_000 });
    const pending = Array.from({ length: 8 }, (_, index) =>
      service.createDraft("T01", `operator-${index}`, `request-${index}`)
    );

    await expect(
      service.createDraft("T01", "operator-overflow", "request-overflow")
    ).resolves.toEqual({ ok: false, code: "RATE_LIMITED" });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(8));
    expect(invoke).toHaveBeenCalledTimes(8);

    for (let index = 0; index < 8; index += 1) {
      expect(service.cancelDraft(`operator-${index}`, `request-${index}`)).toBe(
        true
      );
    }
    await expect(Promise.all(pending)).resolves.toHaveLength(8);
  });

  it("returns fixed offline drafts without calling fetch or a model provider", async () => {
    vi.stubEnv("LIVE_DRAFT_MODE", "offline-demo");
    vi.stubEnv("MANUS_API_URL", "");
    vi.stubEnv("MANUS_API_KEY", "");
    const networkRequest = vi.fn();
    vi.stubGlobal("fetch", networkRequest);

    const first = await createLiveDraftForClient("T01", "offline-test-a");
    const second = await createLiveDraftForClient("T01", "offline-test-b");

    expect(getLiveDraftMode()).toBe("offline-demo");
    expect(first).toEqual({
      ok: true,
      text: "Это демонстрационная сцена с синтетическими данными; реальный эфир не подключён.",
      model: "offline-demo",
    });
    expect(second).toEqual(first);
    expect(networkRequest).not.toHaveBeenCalled();
  });

  it("passes AbortSignal through to fetch and does not retry a canceled request", async () => {
    vi.stubEnv("MANUS_API_URL", "https://api.example.invalid");
    vi.stubEnv("MANUS_API_KEY", "unit-test-key");
    const request = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );
    vi.stubGlobal("fetch", request);

    const controller = new AbortController();
    const call = invokeLLM({
      model: LIVE_DRAFT_MODEL,
      messages: [{ role: "user", content: LIVE_FIXTURES[0].comment }],
      signal: controller.signal,
    });
    controller.abort();

    await expect(call).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionId, apiFetch } from "./api";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchResponse(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
  globalThis.fetch = vi.fn().mockResolvedValue(res);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("apiFetch", () => {
  it("sends credentials and a JSON body for POSTs", async () => {
    mockFetchResponse(200, { ok: true });
    await apiFetch("/auth/player/login", { body: { accessCode: "TEAMA", pin: "1123" } });

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/auth/player/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ accessCode: "TEAMA", pin: "1123" });
  });

  it("uses GET when no body is provided", async () => {
    mockFetchResponse(200, { entries: [] });
    await apiFetch("/leaderboard?limit=50");

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("throws ApiError with the server message on failure", async () => {
    mockFetchResponse(409, {
      statusCode: 409,
      error: "Conflict",
      message: "Game is still in progress",
    });

    await expect(apiFetch("/games/wordle/finish", { body: {} })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "Game is still in progress",
    });
  });

  it("throws ApiError with a fallback message when the body is empty", async () => {
    const res = { ok: false, status: 500, text: async () => "" } as Response;
    globalThis.fetch = vi.fn().mockResolvedValue(res);

    await expect(apiFetch("/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "Request failed (500)",
    });
  });
});

describe("actionId", () => {
  it("generates unique, prefixed ids", () => {
    const a = actionId("wfin");
    const b = actionId("wfin");
    expect(a).not.toBe(b);
    expect(a.startsWith("wfin-")).toBe(true);
  });
});

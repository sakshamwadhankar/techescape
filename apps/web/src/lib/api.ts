import type {
  AdminRoundConfigInput,
  AdminRoundStatusResponse,
  AdminTeamsResponse,
  CardsMoveResponse,
  CardsStartResponse,
  GameFinishResponse,
  LeaderboardMeResponse,
  LeaderboardResponse,
  PlayerStatusResponse,
  RosterImportResponse,
  ShadowAnswerResponse,
  ShadowStartResponse,
  TeamSummary,
  WordleGuessResponse,
  WordleStartResponse,
} from "@spiderman/types";
import type { ApiErrorBody } from "@spiderman/types";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly details: string | string[] | undefined;

  constructor(status: number, message: string, details?: string | string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const body = (typeof data === "object" && data !== null ? data : {}) as ApiErrorBody;
    const message = Array.isArray(body.message)
      ? body.message[0] ?? `Request failed (${res.status})`
      : body.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body.message);
  }

  return data as T;
}

/** A new idempotency key for a player action. */
export function actionId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

// --- Auth -------------------------------------------------------------------

export const api = {
  playerLogin(accessCode: string, pin: string): Promise<{ team: TeamSummary }> {
    return apiFetch("/auth/player/login", { body: { accessCode, pin } });
  },
  playerLogout(): Promise<{ ok: true }> {
    return apiFetch("/auth/player/logout");
  },
  adminLogin(username: string, password: string): Promise<{ role: "admin" }> {
    return apiFetch("/auth/admin/login", { body: { username, password } });
  },
  adminLogout(): Promise<{ ok: true }> {
    return apiFetch("/auth/admin/logout");
  },
  me(): Promise<{ team: TeamSummary }> {
    return apiFetch("/auth/me");
  },

  // --- Players ---------------------------------------------------------------
  playerStatus(): Promise<PlayerStatusResponse> {
    return apiFetch("/players/me");
  },

  // --- Wordle ----------------------------------------------------------------
  wordleStart(): Promise<WordleStartResponse> {
    return apiFetch("/games/wordle/start", { body: {} });
  },
  wordleGuess(guess: string, clientActionId: string): Promise<WordleGuessResponse> {
    return apiFetch("/games/wordle/guess", { body: { guess, clientActionId } });
  },
  wordleFinish(clientActionId: string): Promise<GameFinishResponse> {
    return apiFetch("/games/wordle/finish", { body: { clientActionId } });
  },

  // --- Shadow ----------------------------------------------------------------
  shadowStart(): Promise<ShadowStartResponse> {
    return apiFetch("/games/shadow/start", { body: {} });
  },
  shadowAnswer(
    questionId: string,
    answer: string,
    clientActionId: string,
  ): Promise<ShadowAnswerResponse> {
    return apiFetch("/games/shadow/answer", { body: { questionId, answer, clientActionId } });
  },
  shadowFinish(clientActionId: string): Promise<GameFinishResponse> {
    return apiFetch("/games/shadow/finish", { body: { clientActionId } });
  },

  // --- Cards ----------------------------------------------------------------
  cardsStart(): Promise<CardsStartResponse> {
    return apiFetch("/games/cards/start", { body: {} });
  },
  cardsMove(cardId: string, clientActionId: string): Promise<CardsMoveResponse> {
    return apiFetch("/games/cards/move", { body: { cardId, clientActionId } });
  },
  cardsFinish(clientActionId: string): Promise<GameFinishResponse> {
    return apiFetch("/games/cards/finish", { body: { clientActionId } });
  },

  // --- Leaderboard -----------------------------------------------------------
  leaderboard(limit = 50): Promise<LeaderboardResponse> {
    return apiFetch(`/leaderboard?limit=${limit}`);
  },
  leaderboardMe(): Promise<LeaderboardMeResponse> {
    return apiFetch("/leaderboard/me");
  },

  // --- Admin -----------------------------------------------------------------
  adminRound(): Promise<AdminRoundStatusResponse> {
    return apiFetch("/admin/round");
  },
  adminRoundConfig(config: AdminRoundConfigInput): Promise<AdminRoundStatusResponse> {
    return apiFetch("/admin/round/config", { body: config });
  },
  adminRoundAction(action: "start" | "pause" | "resume" | "end"): Promise<AdminRoundStatusResponse> {
    return apiFetch(`/admin/round/${action}`, { body: {} });
  },
  adminRosterImport(teams: {
    code: string;
    name: string;
    memberNames: string[];
    room?: string | null;
  }[]): Promise<RosterImportResponse> {
    return apiFetch("/admin/roster/import", { body: { teams } });
  },
  adminTeams(): Promise<AdminTeamsResponse> {
    return apiFetch("/admin/teams");
  },
  adminTeamReset(teamId: string, game?: "WORDLE" | "SHADOW" | "CARDS"): Promise<{ reset: number }> {
    return apiFetch("/admin/teams/reset", { body: { teamId, ...(game ? { game } : {}) } });
  },
};

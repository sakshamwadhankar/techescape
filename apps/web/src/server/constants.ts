export const PLAYER_COOKIE = "spm_access_token";
export const ADMIN_COOKIE = "spm_admin_token";

export const PLAYER_TOKEN_TTL_SECONDS = 4 * 60 * 60;
export const ADMIN_TOKEN_TTL_SECONDS = 2 * 60 * 60;

export const SESSION_STATE_TTL_BUFFER_SECONDS = 300;
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const ACTION_LOCK_TTL_MS = 5_000;
export const ROUND_CACHE_TTL_SECONDS = 5;

export const WORDLE_MAX_ATTEMPTS = 6;
export const WORDLE_WORD_LENGTH = 5;
export const SHADOW_MAX_ATTEMPTS_PER_QUESTION = 3;

export const CARDS_DECK_SLUGS: readonly string[] = Array.from(
  { length: 12 },
  (_, i) => `c${i + 1}`,
);
export const CARDS_PAIR_COUNT = CARDS_DECK_SLUGS.length;
export const CARDS_PERFECT_MOVES = CARDS_PAIR_COUNT * 2;
export const CARDS_SCORE_PER_PAIR = 100;
export const CARDS_MOVE_PENALTY = 10;

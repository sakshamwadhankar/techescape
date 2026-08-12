// ---------------------------------------------------------------------------
// Shared domain types for the Spider-Man IEEE Event Platform.
// Used by apps/web, apps/api and packages. No business logic lives here.
// ---------------------------------------------------------------------------

// --- Games -----------------------------------------------------------------

export const GAME_KINDS = ["WORDLE", "SHADOW", "CARDS"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const SESSION_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "TIMEOUT",
  "ABANDONED",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

// --- Teams / roster --------------------------------------------------------

export interface TeamSummary {
  id: string;
  code: string;
  name: string;
  memberNames: string[];
  room: string | null;
}

// --- Sessions --------------------------------------------------------------

export interface SessionSummary {
  game: GameKind;
  status: SessionStatus;
  startedAt: string | null;
  expiresAt: string | null;
  finishedAt: string | null;
  score: number | null;
}

export interface PlayerStatusResponse {
  team: TeamSummary;
  sessions: Record<GameKind, SessionSummary>;
  roundOpen: boolean;
}

// --- Wordle ----------------------------------------------------------------

export type WordleLetterStatus = "correct" | "present" | "absent";

export interface WordleFeedback {
  letter: string;
  status: WordleLetterStatus;
}

export type WordleFeedbackRow = WordleFeedback[];

export type WordleStatus = "IN_PROGRESS" | "WON" | "LOST" | "TIMEOUT";

export interface WordleStartResponse {
  sessionId: string;
  expiresAt: string;
  attemptsAllowed: number;
  wordLength: number;
}

export interface WordleGuessResponse {
  guessCount: number;
  attemptsLeft: number;
  feedback: WordleFeedbackRow;
  wordleStatus: WordleStatus;
}

export interface WordleResult {
  status: WordleStatus;
  guesses: string[];
  won: boolean;
  score: number;
  timeMs: number;
}

export interface GameFinishResponse {
  score: number;
  timeMs: number;
}

// --- Shadow ----------------------------------------------------------------

export interface ShadowQuestionPublic {
  id: string;
  assetUrl: string;
  options: string[];
}

export interface ShadowStartResponse {
  sessionId: string;
  expiresAt: string;
  questions: ShadowQuestionPublic[];
  maxAttemptsPerQuestion: number;
}

export interface ShadowAnswerResponse {
  questionId: string;
  questionIndex: number;
  correct: boolean;
  correctAnswer: string;
  attemptsUsed: number;
  attemptsLeft: number;
  questionScore: number;
  totalCorrect: number;
  questionCount: number;
  status: "IN_PROGRESS" | "COMPLETED" | "TIMEOUT";
}

export interface ShadowResult {
  correctCount: number;
  questionCount: number;
  score: number;
  timeMs: number;
}

// --- Cards -----------------------------------------------------------------

export interface CardPublic {
  id: string;
  index: number;
}

export interface CardsStartResponse {
  sessionId: string;
  expiresAt: string;
  cards: CardPublic[];
  backAssetUrl: string;
}

export interface CardsMoveResponse {
  moveId: string;
  cardId: string;
  frontAssetUrl: string;
  revealed: boolean;
  matched: boolean;
  matchCompleted: boolean;
  unmatchedFlipBack: boolean;
  state: CardsStatePublic;
}

export interface CardsStatePublic {
  moves: number;
  revealed: number[];
  matched: string[];
  matchedPairs: number;
  totalPairs: number;
  status: "IN_PROGRESS" | "COMPLETED" | "TIMEOUT";
}

export interface CardsResult {
  moves: number;
  matchedPairs: number;
  totalPairs: number;
  score: number;
  timeMs: number;
}

// --- Leaderboard -----------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  teamCode: string;
  teamName: string;
  totalScore: number;
  totalTimeMs: number;
  gamesCompleted: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  totalTeams: number;
}

export interface LeaderboardMeResponse {
  rank: number;
  entry: LeaderboardEntry;
}

// --- Errors ----------------------------------------------------------------

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}

import allWords from "an-array-of-english-words/index.json";
import type { WordleFeedback, WordleFeedbackRow, WordleStatus } from "@spiderman/types";
import { WORDLE_WORD_LENGTH } from "../constants";

export const WORDLE_ANSWERS: string[] = (allWords as string[]).filter(
  (word) => word.length === WORDLE_WORD_LENGTH,
);

export interface WordleState {
  word: string;
  guesses: string[];
  status: Exclude<WordleStatus, "TIMEOUT">;
  startedAt: number;
  wordLength: number;
  attemptsAllowed: number;
}

export function isValidWord(guess: string): boolean {
  return WORDLE_ANSWERS.includes(guess.toLowerCase());
}

export function isWinningFeedback(feedback: WordleFeedbackRow): boolean {
  return feedback.every((tile) => tile.status === "correct");
}

export function evaluateGuess(guess: string, answer: string): WordleFeedbackRow {
  const n = guess.length;
  const feedback: WordleFeedbackRow = new Array<WordleFeedback>(n);
  const remaining = answer.split("");

  for (let i = 0; i < n; i++) {
    const letter = guess[i] ?? "";
    if (letter === answer[i]) {
      feedback[i] = { letter, status: "correct" };
      remaining[i] = "";
    }
  }

  for (let i = 0; i < n; i++) {
    if (feedback[i]) continue;
    const letter = guess[i] ?? "";
    const idx = remaining.indexOf(letter);
    if (idx !== -1) {
      feedback[i] = { letter, status: "present" };
      remaining[idx] = "";
    } else {
      feedback[i] = { letter, status: "absent" };
    }
  }

  return feedback;
}

export function pickRandomAnswer(random: () => number = Math.random): string {
  const idx = Math.floor(random() * WORDLE_ANSWERS.length);
  return WORDLE_ANSWERS[idx] as string;
}

export function calculateWordleScore(attemptsUsed: number): number {
  return Math.max(0, Math.min(1000, 1000 - (attemptsUsed - 1) * 100));
}

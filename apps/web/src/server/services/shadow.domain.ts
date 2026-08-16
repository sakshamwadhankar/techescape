import type { ShadowQuestionPublic } from "@spiderman/types";

export interface ShadowQuestionCache {
  id: string;
  assetUrl: string;
  options: string[];
  correctAnswer: string;
}

export interface ShadowState {
  questionIds: string[];
  answers: string[];
  attemptsUsed: number[];
  resolved: boolean[];
  totalCorrect: number;
  totalScore: number;
  startedAt: number;
  maxAttemptsPerQuestion: number;
}

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesAnswer(submitted: string, correct: string): boolean {
  return normalizeAnswer(submitted) === normalizeAnswer(correct);
}

export function questionScore(attemptsUsed: number): number {
  return Math.max(0, 100 - (attemptsUsed - 1) * 30);
}

export function isAllResolved(resolved: boolean[]): boolean {
  return resolved.length > 0 && resolved.every(Boolean);
}

export function toPublicQuestion(question: ShadowQuestionCache): ShadowQuestionPublic {
  return { id: question.id, assetUrl: question.assetUrl, options: question.options };
}

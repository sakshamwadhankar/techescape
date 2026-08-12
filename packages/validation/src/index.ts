// ---------------------------------------------------------------------------
// Shared validation schemas (zod) for request payloads.
// Both apps/web (client-side checks) and apps/api (authoritative checks)
// import from here so validation rules are defined once.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { GAME_KINDS } from "@spiderman/types";

// --- Auth ------------------------------------------------------------------

const codeSchema = z
  .string()
  .trim()
  .min(2, "Team code is too short")
  .max(32, "Team code is too long")
  .regex(/^[A-Za-z0-9-]+$/, "Team code contains invalid characters");

const pinSchema = z
  .string()
  .trim()
  .min(4, "PIN must be at least 4 characters")
  .max(16, "PIN is too long");

export const playerLoginSchema = z.object({
  accessCode: z
    .string()
    .trim()
    .min(4, "Access code is too short")
    .max(32, "Access code is too long")
    .regex(/^[A-Za-z0-9-]+$/, "Access code contains invalid characters"),
  pin: pinSchema,
});

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, "Username is required").max(64),
  password: z.string().min(1, "Password is required").max(256),
});

// --- Idempotency -----------------------------------------------------------

export const clientActionIdSchema = z
  .string()
  .trim()
  .min(8, "clientActionId is too short")
  .max(64, "clientActionId is too long")
  .regex(/^[A-Za-z0-9-]+$/, "clientActionId contains invalid characters");

// --- Game: Wordle ----------------------------------------------------------

export const wordleGuessSchema = z.object({
  guess: z
    .string()
    .trim()
    .regex(/^[a-zA-Z]+$/, "Guess must contain only letters")
    .transform((s) => s.toLowerCase())
    .refine((s) => s.length === 5, {
      message: "Guess must be exactly 5 letters",
      path: ["guess"],
    }),
  clientActionId: clientActionIdSchema,
});

export const wordleFinishSchema = z.object({
  clientActionId: clientActionIdSchema,
});

// --- Game: Shadow ----------------------------------------------------------

export const shadowAnswerSchema = z.object({
  questionId: z
    .string()
    .trim()
    .min(1, "Invalid question id")
    .max(64, "Invalid question id"),
  answer: z.string().trim().min(1, "Answer is required").max(120),
  clientActionId: clientActionIdSchema,
});

export const shadowFinishSchema = z.object({
  clientActionId: clientActionIdSchema,
});

// --- Game: Cards -----------------------------------------------------------

export const cardsMoveSchema = z.object({
  cardId: z.string().uuid("Invalid card id"),
  clientActionId: clientActionIdSchema,
});

export const cardsFinishSchema = z.object({
  clientActionId: clientActionIdSchema,
});

// --- Game start ------------------------------------------------------------

export const startGameSchema = z.object({
  clientActionId: clientActionIdSchema.optional(),
});

// --- Admin: roster import --------------------------------------------------

export const rosterEntrySchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, "Team name is required").max(120),
  memberNames: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
  room: z.string().trim().max(64).optional().nullable(),
});

export const rosterImportSchema = z.object({
  teams: z.array(rosterEntrySchema).min(1, "At least one team is required").max(2000),
});

// --- Misc ------------------------------------------------------------------

export const gameKindSchema = z.enum(GAME_KINDS);

export type PlayerLogin = z.infer<typeof playerLoginSchema>;
export type AdminLogin = z.infer<typeof adminLoginSchema>;
export type WordleGuess = z.infer<typeof wordleGuessSchema>;
export type WordleFinish = z.infer<typeof wordleFinishSchema>;
export type ShadowAnswer = z.infer<typeof shadowAnswerSchema>;
export type ShadowFinish = z.infer<typeof shadowFinishSchema>;
export type CardsMove = z.infer<typeof cardsMoveSchema>;
export type CardsFinish = z.infer<typeof cardsFinishSchema>;
export type RosterImport = z.infer<typeof rosterImportSchema>;

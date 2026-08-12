import type { CardsStatePublic } from "@spiderman/types";
import {
  CARDS_MOVE_PENALTY,
  CARDS_SCORE_PER_PAIR,
} from "../../common/constants";

export interface CardsDeckCard {
  id: string;
  index: number;
  pairId: string;
  frontAssetUrl: string;
}

export interface CardsDeck {
  cards: CardsDeckCard[];
  backAssetUrl: string;
}

export interface CardsState {
  deck: CardsDeckCard[];
  matched: string[];
  revealed: number[];
  moves: number;
  matchedPairs: number;
  totalPairs: number;
  startedAt: number;
}

export interface CardsFlipOutcome {
  next: CardsState;
  revealed: boolean;
  matched: boolean;
  matchCompleted: boolean;
  unmatchedFlipBack: boolean;
}

/** Deterministic PRNG (mulberry32) so a round seed always yields the same deck. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function v4FromRng(next: () => number): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(next() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

/**
 * Build the round's card layout deterministically from the seed. Each slug
 * appears exactly twice; ids and board positions are derived from the RNG.
 */
export function buildDeck(
  seed: number,
  pairSlugs: readonly string[],
  assetBaseUrl: string,
): CardsDeck {
  const rng = mulberry32(seed);
  const slots: { pairId: string; instance: 0 | 1 }[] = [];
  for (const slug of pairSlugs) {
    slots.push({ pairId: slug, instance: 0 }, { pairId: slug, instance: 1 });
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  const cards: CardsDeckCard[] = slots.map((slot, index) => ({
    id: v4FromRng(rng),
    index,
    pairId: slot.pairId,
    frontAssetUrl: `${assetBaseUrl}/assets/cards/${slot.pairId}.svg`,
  }));
  return {
    cards,
    backAssetUrl: `${assetBaseUrl}/assets/cards/back.svg`,
  };
}

/**
 * Pure memory-match state transition for flipping the card at `index`.
 * First flip of an attempt just reveals it; the second flip either completes a
 * pair (cards stay matched) or flips both back. A move is one flip.
 */
export function flipCard(state: CardsState, index: number): CardsFlipOutcome {
  const card = state.deck[index];
  if (!card) throw new Error("Unknown card index");

  const revealed = [...state.revealed, index];
  const moves = state.moves + 1;
  const matched = [...state.matched];
  let matchedPairs = state.matchedPairs;
  let revealedOut = true;
  let matchedOut = false;
  let matchCompleted = false;
  let unmatchedFlipBack = false;
  let nextRevealed = revealed;

  if (revealed.length === 2) {
    const first = state.deck[revealed[0]!]!;
    if (first.pairId === card.pairId) {
      matched.push(first.id, card.id);
      matchedPairs += 1;
      matchedOut = true;
      matchCompleted = true;
      nextRevealed = [];
    } else {
      revealedOut = false;
      unmatchedFlipBack = true;
      nextRevealed = [];
    }
  }

  const next: CardsState = {
    ...state,
    matched,
    revealed: nextRevealed,
    moves,
    matchedPairs,
  };
  return {
    next,
    revealed: revealedOut,
    matched: matchedOut,
    matchCompleted,
    unmatchedFlipBack,
  };
}

export function isAllMatched(state: Pick<CardsState, "matchedPairs" | "totalPairs">): boolean {
  return state.matchedPairs === state.totalPairs;
}

/**
 * 100 points per matched pair, minus 10 per wasted move beyond the perfect
 * play for those pairs (2 flips each). Floors at 0.
 */
export function cardScore(matchedPairs: number, moves: number): number {
  return Math.max(
    0,
    CARDS_SCORE_PER_PAIR * matchedPairs -
      CARDS_MOVE_PENALTY * Math.max(0, moves - 2 * matchedPairs),
  );
}

export function toPublicState(state: CardsState): CardsStatePublic {
  return {
    moves: state.moves,
    revealed: state.revealed,
    matched: state.matched,
    matchedPairs: state.matchedPairs,
    totalPairs: state.totalPairs,
    status: isAllMatched(state) ? "COMPLETED" : "IN_PROGRESS",
  };
}

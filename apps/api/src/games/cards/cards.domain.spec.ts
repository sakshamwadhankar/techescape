import {
  buildDeck,
  cardScore,
  flipCard,
  isAllMatched,
  mulberry32,
  toPublicState,
  type CardsState,
} from "./cards.domain";

const SLUGS: readonly string[] = ["black-cat", "venom", "spiderman"];
const BASE = "http://localhost:3000";

function makeDeck(seed = 42): CardsState["deck"] {
  return buildDeck(seed, SLUGS, BASE).cards;
}

function makeState(overrides: Partial<CardsState> = {}): CardsState {
  return {
    deck: makeDeck(),
    matched: [],
    revealed: [],
    moves: 0,
    matchedPairs: 0,
    totalPairs: SLUGS.length,
    startedAt: 1_000,
    ...overrides,
  };
}

describe("cards.domain", () => {
  describe("mulberry32", () => {
    it("is deterministic for the same seed", () => {
      expect(mulberry32(7)()).toBe(mulberry32(7)());
    });

    it("produces values in [0, 1)", () => {
      for (let i = 0; i < 100; i++) {
        const v = mulberry32(i)();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe("buildDeck", () => {
    it("creates exactly two cards per slug", () => {
      const deck = buildDeck(1, SLUGS, BASE);
      expect(deck.cards).toHaveLength(SLUGS.length * 2);
      for (const slug of SLUGS) {
        expect(deck.cards.filter((c) => c.pairId === slug)).toHaveLength(2);
      }
    });

    it("is deterministic for the same seed", () => {
      const a = buildDeck(99, SLUGS, BASE);
      const b = buildDeck(99, SLUGS, BASE);
      expect(a.cards.map((c) => c.id)).toEqual(b.cards.map((c) => c.id));
      expect(a.cards.map((c) => c.pairId)).toEqual(b.cards.map((c) => c.pairId));
    });

    it("shuffles differently for different seeds", () => {
      const a = buildDeck(1, SLUGS, BASE);
      const b = buildDeck(2, SLUGS, BASE);
      expect(a.cards.map((c) => c.pairId)).not.toEqual(b.cards.map((c) => c.pairId));
    });

    it("assigns unique uuid-shaped ids and sequential indices", () => {
      const deck = buildDeck(5, SLUGS, BASE);
      const ids = deck.cards.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      }
      expect(deck.cards.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("builds front and back asset urls", () => {
      const deck = buildDeck(1, SLUGS, BASE);
      expect(deck.backAssetUrl).toBe(`${BASE}/assets/cards/back.svg`);
      for (const card of deck.cards) {
        expect(card.frontAssetUrl).toBe(`${BASE}/assets/cards/${card.pairId}.jpeg`);
      }
    });
  });

  describe("flipCard", () => {
    it("reveals a single card and increments moves", () => {
      const state = makeState();
      const out = flipCard(state, 0);
      expect(out.revealed).toBe(true);
      expect(out.matched).toBe(false);
      expect(out.matchCompleted).toBe(false);
      expect(out.unmatchedFlipBack).toBe(false);
      expect(out.next.revealed).toEqual([0]);
      expect(out.next.moves).toBe(1);
    });

    it("completes a pair when the second flip matches", () => {
      const deck = makeDeck();
      const first = deck.findIndex((c) => c.pairId === "venom");
      const second = deck.findIndex((c) => c.pairId === "venom" && c.index !== first);
      const state = makeState();
      const out = flipCard(flipCard(state, first).next, second);
      expect(out.matched).toBe(true);
      expect(out.matchCompleted).toBe(true);
      expect(out.revealed).toBe(true);
      expect(out.unmatchedFlipBack).toBe(false);
      expect(out.next.revealed).toEqual([]);
      expect(out.next.matched).toHaveLength(2);
      expect(out.next.matchedPairs).toBe(1);
      expect(out.next.moves).toBe(2);
      expect(isAllMatched(out.next)).toBe(false);
    });

    it("flips both cards back on a mismatch", () => {
      const deck = makeDeck();
      const first = deck.findIndex((c) => c.pairId === "venom");
      const second = deck.findIndex((c) => c.pairId === "black-cat");
      const out = flipCard(flipCard(makeState(), first).next, second);
      expect(out.matched).toBe(false);
      expect(out.matchCompleted).toBe(false);
      expect(out.revealed).toBe(false);
      expect(out.unmatchedFlipBack).toBe(true);
      expect(out.next.revealed).toEqual([]);
      expect(out.next.matched).toEqual([]);
      expect(out.next.matchedPairs).toBe(0);
      expect(out.next.moves).toBe(2);
    });

    it("completes the game when the last pair is matched", () => {
      const state = makeState({
        matchedPairs: SLUGS.length - 1,
        matched: ["pre-matched-1", "pre-matched-2"],
      });
      const target = state.deck[0]!.pairId;
      const [a, b] = state.deck
        .map((c, i) => ({ pairId: c.pairId, index: i }))
        .filter((c) => c.pairId === target)
        .map((c) => c.index);
      const next = flipCard(flipCard(state, a).next, b).next;
      expect(next.matchedPairs).toBe(SLUGS.length);
      expect(isAllMatched(next)).toBe(true);
    });
  });

  describe("cardScore", () => {
    it("awards full points for a perfect game", () => {
      expect(cardScore(3, 6)).toBe(300);
    });

    it("penalizes each wasted move", () => {
      expect(cardScore(3, 7)).toBe(290);
      expect(cardScore(3, 8)).toBe(280);
    });

    it("floors at zero", () => {
      expect(cardScore(0, 99)).toBe(0);
      expect(cardScore(1, 50)).toBe(0);
    });

    it("credits partial progress on timeout", () => {
      expect(cardScore(2, 5)).toBe(190);
    });
  });

  describe("toPublicState", () => {
    it("is IN_PROGRESS until all pairs are matched", () => {
      expect(toPublicState(makeState()).status).toBe("IN_PROGRESS");
    });

    it("is COMPLETED when all pairs are matched", () => {
      expect(toPublicState(makeState({ matchedPairs: SLUGS.length })).status).toBe(
        "COMPLETED",
      );
    });
  });
});

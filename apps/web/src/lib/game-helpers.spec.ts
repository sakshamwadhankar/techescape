import { describe, expect, it } from "vitest";
import type { CardPublic, CardsStatePublic } from "@spiderman/types";
import {
  buildCardTiles,
  buildWordleGrid,
  cardIndexById,
  deriveKeyStatuses,
  emptyGrid,
  isCardFaceUp,
  isCardMatched,
} from "./game-helpers";

describe("emptyGrid", () => {
  it("builds a rows x cols grid of empty tiles", () => {
    const grid = emptyGrid(6, 5);
    expect(grid).toHaveLength(6);
    expect(grid[0]).toHaveLength(5);
    expect(grid[0]![0]).toEqual({ letter: "", status: "empty" });
  });
});

describe("buildWordleGrid", () => {
  it("fills guessed rows with feedback and the current row below", () => {
    const grid = buildWordleGrid({
      guesses: ["spide"],
      feedbackRows: [[{ letter: "s", status: "correct" }]],
      currentRow: "he",
      attempts: 3,
      wordLength: 5,
    });
    expect(grid[0]![0]).toEqual({ letter: "s", status: "correct" });
    expect(grid[1]![0]).toEqual({ letter: "h", status: "empty" });
    expect(grid[1]![1]).toEqual({ letter: "e", status: "empty" });
    expect(grid[1]![2]).toEqual({ letter: "", status: "empty" });
    expect(grid[2]![0]).toEqual({ letter: "", status: "empty" });
  });

  it("does not add a current row when all attempts are used", () => {
    const grid = buildWordleGrid({
      guesses: ["aaaaa", "bbbbb"],
      feedbackRows: [],
      currentRow: "",
      attempts: 2,
      wordLength: 5,
    });
    expect(grid[1]![0]!.letter).toBe("b");
  });
});

describe("deriveKeyStatuses", () => {
  it("prefers correct over present over absent per key", () => {
    const statuses = deriveKeyStatuses([
      [{ letter: "a", status: "absent" }],
      [{ letter: "a", status: "present" }],
      [{ letter: "a", status: "correct" }],
    ]);
    expect(statuses["A"]).toBe("correct");
  });

  it("returns an empty map for no feedback", () => {
    expect(deriveKeyStatuses([])).toEqual({});
  });
});

const CARDS: CardPublic[] = [
  { id: "card-a", index: 0 },
  { id: "card-b", index: 1 },
  { id: "card-c", index: 2 },
  { id: "card-d", index: 3 },
];

const STATE: CardsStatePublic = {
  moves: 2,
  revealed: [0],
  matched: ["card-c"],
  matchedPairs: 1,
  totalPairs: 2,
  status: "IN_PROGRESS",
};

describe("cardIndexById", () => {
  it("finds the index or -1", () => {
    expect(cardIndexById(CARDS, "card-b")).toBe(1);
    expect(cardIndexById(CARDS, "nope")).toBe(-1);
  });
});

describe("isCardMatched / isCardFaceUp", () => {
  it("respects the server state", () => {
    expect(isCardMatched("card-c", STATE)).toBe(true);
    expect(isCardMatched("card-a", STATE)).toBe(false);
    expect(isCardFaceUp(CARDS, "card-a", STATE)).toBe(true);
    expect(isCardFaceUp(CARDS, "card-c", STATE)).toBe(true);
    expect(isCardFaceUp(CARDS, "card-b", STATE)).toBe(false);
  });
});

describe("buildCardTiles", () => {
  it("defaults to all face-down when state is null", () => {
    const tiles = buildCardTiles(CARDS, null);
    expect(tiles.every((t) => !t.faceUp && !t.matched)).toBe(true);
  });

  it("merges server state into tiles", () => {
    const tiles = buildCardTiles(CARDS, STATE);
    expect(tiles.find((t) => t.card.id === "card-a")?.faceUp).toBe(true);
    expect(tiles.find((t) => t.card.id === "card-c")?.matched).toBe(true);
  });
});

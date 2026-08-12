import {
  WORDLE_ANSWERS,
  calculateWordleScore,
  evaluateGuess,
  isWinningFeedback,
  isValidWord,
  pickRandomAnswer,
} from "./wordle.domain";

describe("wordle.domain", () => {
  describe("WORDLE_ANSWERS", () => {
    it("only contains 5-letter words", () => {
      expect(WORDLE_ANSWERS.length).toBeGreaterThan(1000);
      for (const word of WORDLE_ANSWERS) {
        expect(word).toHaveLength(5);
        expect(word).toMatch(/^[a-z]{5}$/);
      }
    });
  });

  describe("isValidWord", () => {
    it("accepts a real word", () => {
      expect(isValidWord("apple")).toBe(true);
    });

    it("rejects non-words", () => {
      expect(isValidWord("zzzzz")).toBe(false);
    });

    it("rejects wrong-length strings", () => {
      expect(isValidWord("aple")).toBe(false);
    });

    it("is case-sensitive (guesses are lowercased before validation)", () => {
      expect(isValidWord("APPLE")).toBe(false);
    });
  });

  describe("evaluateGuess", () => {
    it("returns correct for every tile on a winning guess", () => {
      const feedback = evaluateGuess("apple", "apple");
      expect(feedback.every((t) => t.status === "correct")).toBe(true);
      expect(isWinningFeedback(feedback)).toBe(true);
    });

    it("returns absent when nothing matches", () => {
      const feedback = evaluateGuess("fuzzy", "crane");
      expect(feedback).toEqual([
        { letter: "f", status: "absent" },
        { letter: "u", status: "absent" },
        { letter: "z", status: "absent" },
        { letter: "z", status: "absent" },
        { letter: "y", status: "absent" },
      ]);
      expect(isWinningFeedback(feedback)).toBe(false);
    });

    it("flags letters present in the wrong position", () => {
      const feedback = evaluateGuess("clean", "crane");
      expect(feedback).toEqual([
        { letter: "c", status: "correct" },
        { letter: "l", status: "absent" },
        { letter: "e", status: "present" },
        { letter: "a", status: "present" },
        { letter: "n", status: "present" },
      ]);
    });

    it("does not double-count duplicate letters", () => {
      const feedback = evaluateGuess("allot", "alert");
      expect(feedback).toEqual([
        { letter: "a", status: "correct" },
        { letter: "l", status: "correct" },
        { letter: "l", status: "absent" },
        { letter: "o", status: "absent" },
        { letter: "t", status: "correct" },
      ]);
    });

    it("handles a repeated answer letter matched in the right spots", () => {
      const feedback = evaluateGuess("speed", "speed");
      expect(feedback.every((t) => t.status === "correct")).toBe(true);
    });
  });

  describe("calculateWordleScore", () => {
    it("awards 1000 for a first-attempt win", () => {
      expect(calculateWordleScore(1)).toBe(1000);
    });

    it("deducts 100 per extra attempt", () => {
      expect(calculateWordleScore(3)).toBe(800);
      expect(calculateWordleScore(6)).toBe(500);
    });

    it("never returns a negative score", () => {
      expect(calculateWordleScore(99)).toBe(0);
    });

    it("caps at 1000", () => {
      expect(calculateWordleScore(0)).toBe(1000);
    });
  });

  describe("pickRandomAnswer", () => {
    it("returns a valid 5-letter word", () => {
      const word = pickRandomAnswer();
      expect(word).toHaveLength(5);
      expect(isValidWord(word)).toBe(true);
    });

    it("is deterministic given a seeded rng", () => {
      const a = pickRandomAnswer(() => 0.42);
      const b = pickRandomAnswer(() => 0.42);
      expect(a).toBe(b);
      expect(WORDLE_ANSWERS).toContain(a);
    });
  });
});

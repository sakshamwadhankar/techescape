import {
  isAllResolved,
  matchesAnswer,
  normalizeAnswer,
  questionScore,
  toPublicQuestion,
  type ShadowQuestionCache,
} from "./shadow.domain";

describe("shadow.domain", () => {
  describe("normalizeAnswer / matchesAnswer", () => {
    it("is case-insensitive", () => {
      expect(matchesAnswer("spider-man", "Spider-Man")).toBe(true);
      expect(matchesAnswer("VENOM", "venom")).toBe(true);
    });

    it("ignores surrounding whitespace", () => {
      expect(matchesAnswer("  Doctor Octopus ", "doctor octopus")).toBe(true);
    });

    it("rejects wrong answers", () => {
      expect(matchesAnswer("venom", "Spider-Man")).toBe(false);
    });

    it("normalizes without mutating input", () => {
      expect(normalizeAnswer("  Spider-Man ")).toBe("spider-man");
    });
  });

  describe("questionScore", () => {
    it("awards 100 on the first attempt", () => {
      expect(questionScore(1)).toBe(100);
    });

    it("awards 70 on the second attempt", () => {
      expect(questionScore(2)).toBe(70);
    });

    it("awards 40 on the third attempt", () => {
      expect(questionScore(3)).toBe(40);
    });

    it("never returns a negative score", () => {
      expect(questionScore(10)).toBe(0);
    });
  });

  describe("isAllResolved", () => {
    it("is true when every question is resolved", () => {
      expect(isAllResolved([true, true, true])).toBe(true);
    });

    it("is false when any question is pending", () => {
      expect(isAllResolved([true, false, true])).toBe(false);
    });

    it("is false for an empty list", () => {
      expect(isAllResolved([])).toBe(false);
    });
  });

  describe("toPublicQuestion", () => {
    const cached: ShadowQuestionCache = {
      id: "q1",
      assetUrl: "/assets/shadow/spiderman.svg",
      options: ["Spider-Man", "Venom", "Carnage", "Mysterio"],
      correctAnswer: "Spider-Man",
    };

    it("strips the correct answer and keeps the public fields", () => {
      expect(toPublicQuestion(cached)).toEqual({
        id: "q1",
        assetUrl: "/assets/shadow/spiderman.svg",
        options: cached.options,
      });
    });
  });
});

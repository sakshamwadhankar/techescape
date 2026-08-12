import type {
  CardPublic,
  CardsStatePublic,
  WordleFeedback,
  WordleLetterStatus,
} from "@spiderman/types";

export const KEYBOARD_ROWS: string[][] = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
];

export interface WordleTile {
  letter: string;
  status: WordleLetterStatus | "empty";
}

const EMPTY: WordleLetterStatus | "empty" = "empty";

/** A fully empty grid of `rows` x `cols` tiles. */
export function emptyGrid(rows: number, cols: number): WordleTile[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ letter: "", status: EMPTY })),
  );
}

/** Build the display grid given guesses, feedback history, and the in-progress row. */
export function buildWordleGrid(params: {
  guesses: string[];
  feedbackRows: WordleFeedback[][];
  currentRow: string;
  attempts: number;
  wordLength: number;
}): WordleTile[][] {
  const grid = emptyGrid(params.attempts, params.wordLength);
  params.guesses.forEach((guess, i) => {
    const feedback = params.feedbackRows[i] ?? [];
    grid[i] = guess.split("").map((letter, j) => ({
      letter,
      status: feedback[j] ? feedback[j].status : EMPTY,
    }));
  });
  if (params.guesses.length < params.attempts) {
    const letters = params.currentRow.padEnd(params.wordLength, " ").split("");
    grid[params.guesses.length] = letters.map((letter) => ({
      letter: letter.trim(),
      status: EMPTY,
    }));
  }
  return grid;
}

/** Reduce a guess history into per-key colors (correct > present > absent). */
export function deriveKeyStatuses(
  rows: WordleFeedback[][],
): Record<string, WordleLetterStatus> {
  const result: Record<string, WordleLetterStatus> = {};
  const rank: Record<WordleLetterStatus, number> = { absent: 0, present: 1, correct: 2 };
  for (const row of rows) {
    for (const tile of row) {
      const letter = tile.letter.toUpperCase();
      if (!result[letter] || rank[tile.status] > rank[result[letter] ?? "absent"]) {
        result[letter] = tile.status;
      }
    }
  }
  return result;
}

// --- Cards ------------------------------------------------------------------

export function cardIndexById(cards: CardPublic[], id: string): number {
  return cards.find((c) => c.id === id)?.index ?? -1;
}

export function isCardMatched(cardId: string, state: CardsStatePublic): boolean {
  return state.matched.includes(cardId);
}

export function isCardFaceUp(
  cards: CardPublic[],
  cardId: string,
  state: CardsStatePublic,
): boolean {
  const index = cardIndexById(cards, cardId);
  if (index === -1) return false;
  return state.revealed.includes(index) || state.matched.includes(cardId);
}

/** A display tile combines the board card with the live server state. */
export interface CardTile {
  card: CardPublic;
  faceUp: boolean;
  matched: boolean;
}

export function buildCardTiles(
  cards: CardPublic[],
  state: CardsStatePublic | null,
): CardTile[] {
  if (!state) return cards.map((card) => ({ card, faceUp: false, matched: false }));
  return cards.map((card) => ({
    card,
    faceUp: isCardFaceUp(cards, card.id, state),
    matched: isCardMatched(card.id, state),
  }));
}

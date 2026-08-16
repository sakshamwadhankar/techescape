export interface ShadowQuestionSeed {
  slug: string;
  character: string;
  assetUrl: string;
  distractors: string[];
}

/**
 * Event shadow questions. `character` is the correct answer; `distractors` are
 * wrong options. `assetUrl` is relative to the web app origin (served from
 * `apps/web/public/assets/shadow/` in dev and on Vercel).
 */
export const shadowQuestions: ShadowQuestionSeed[] = [
  {
    slug: "deadpool",
    character: "Deadpool",
    assetUrl: "/assets/shadow/deadpool.png",
    distractors: ["Taskmaster", "Carnage", "Morbius"],
  },
  {
    slug: "doctor-octopus",
    character: "Doctor Octopus",
    assetUrl: "/assets/shadow/dococ.png",
    distractors: ["Mysterio", "Scorpion", "Electro"],
  },
  {
    slug: "spider-gwen",
    character: "Spider-Gwen",
    assetUrl: "/assets/shadow/gwen.png",
    distractors: ["Silk", "Spider-Woman", "Spider-Man 2099"],
  },
  {
    slug: "spider-man-noir",
    character: "Spider-Man Noir",
    assetUrl: "/assets/shadow/noir.png",
    distractors: ["Prowler", "Scarlet Spider", "Kaine Parker"],
  },
  {
    slug: "catwomen",
    character: "Catwoman",
    assetUrl: "/assets/shadow/catwomen.png",
    distractors: ["Black Cat", "Black Panther", "Tigress"],
  },
  {
    slug: "lizard",
    character: "Lizard",
    assetUrl: "/assets/shadow/lizard.png",
    distractors: ["Rhino", "Kraven the Hunter", "Iguana"],
  },
];

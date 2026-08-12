export interface ShadowQuestionSeed {
  slug: string;
  character: string;
  assetUrl: string;
  distractors: string[];
}

/**
 * Dev placeholder asset URLs (relative — served by apps/web in development).
 * Replace `assetUrl` with real CDN/object-storage URLs before the event.
 */
export const shadowQuestions: ShadowQuestionSeed[] = [
  {
    slug: "spiderman",
    character: "Spider-Man",
    assetUrl: "/assets/shadow/spiderman.svg",
    distractors: ["Scarlet Spider", "Ben Reilly", "Kaine Parker"],
  },
  {
    slug: "venom",
    character: "Venom",
    assetUrl: "/assets/shadow/venom.svg",
    distractors: ["Carnage", "Anti-Venom", "Riot"],
  },
  {
    slug: "green-goblin",
    character: "Green Goblin",
    assetUrl: "/assets/shadow/green-goblin.svg",
    distractors: ["Hobgoblin", "Jack O'Lantern", "Goblin King"],
  },
  {
    slug: "doctor-octopus",
    character: "Doctor Octopus",
    assetUrl: "/assets/shadow/doctor-octopus.svg",
    distractors: ["Mysterio", "Scorpion", "Electro"],
  },
  {
    slug: "miles-morales",
    character: "Miles Morales",
    assetUrl: "/assets/shadow/miles-morales.svg",
    distractors: ["Spider-Gwen", "Silk", "Spider-Man 2099"],
  },
  {
    slug: "black-cat",
    character: "Black Cat",
    assetUrl: "/assets/shadow/black-cat.svg",
    distractors: ["Silver Sable", "Prowler", "Shocker"],
  },
];

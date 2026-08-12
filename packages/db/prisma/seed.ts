import { PrismaClient, RoundStatus } from "@prisma/client";
import { shadowQuestions } from "./seedData/shadowQuestions";

const prisma = new PrismaClient();

function shuffle<T>(items: T[]): T[] {
  const source = [...items];
  const result: T[] = [];
  while (source.length > 0) {
    const index = Math.floor(Math.random() * source.length);
    const item = source.splice(index, 1)[0];
    if (item !== undefined) result.push(item);
  }
  return result;
}

async function main(): Promise<void> {
  const round = await prisma.round.upsert({
    where: { number: 1 },
    create: { number: 1, status: RoundStatus.IDLE },
    update: {},
  });
  console.log(`Round ${round.number} ready (${round.status})`);

  let ensured = 0;
  for (const q of shadowQuestions) {
    const options = shuffle([q.character, ...q.distractors]);
    await prisma.shadowQuestion.upsert({
      where: { slug: q.slug },
      create: {
        slug: q.slug,
        character: q.character,
        assetUrl: q.assetUrl,
        options,
        correctAnswer: q.character,
        active: true,
      },
      update: { assetUrl: q.assetUrl, active: true },
    });
    ensured += 1;
  }
  console.log(`Shadow questions ensured: ${ensured}`);

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

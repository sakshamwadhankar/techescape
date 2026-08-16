// @prisma/nextjs-monorepo-workaround-plugin ships no type declarations.
declare module "@prisma/nextjs-monorepo-workaround-plugin" {
  export class PrismaPlugin {
    apply(): void;
  }
}

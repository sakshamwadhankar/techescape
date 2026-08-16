import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters").default("c364ebc28bdafac44b3db68b1d3ca2f6dc605219d6cdb3a03379022e2604424d"),
  EVENT_PIN: z.string().min(4, "EVENT_PIN must be at least 4 characters").default("6225"),
  GAME_DURATION_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(300),
  ROUND_DURATION_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86400)
    .default(1800),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  ASSET_CDN_URL: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid server environment:", parsed.error.format());
    throw new Error("Invalid server environment configuration");
  }
  return parsed.data;
}

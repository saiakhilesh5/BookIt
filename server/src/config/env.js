import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  MONGO_URI: z.string().default('mongodb://localhost:27017/bookit'),
  EMBEDDED_DB: z
    .string()
    .default('auto')
    .transform((v) => v === 'true' || v === 'auto'),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().default('dev_access_secret'),
  JWT_REFRESH_SECRET: z.string().default('dev_refresh_secret'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

  SEAT_HOLD_MINUTES: z.coerce.number().default(10),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
export const isProd = env.NODE_ENV === 'production';

if (isProd && (env.JWT_ACCESS_SECRET === 'dev_access_secret' || env.JWT_REFRESH_SECRET === 'dev_refresh_secret')) {
  console.error('FATAL: JWT secrets must be overridden in production');
  process.exit(1);
}

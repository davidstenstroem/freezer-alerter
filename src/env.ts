import z from 'zod';

const envSchema = z.object({
  API_KEY: z.string(),
  DEVICE_ID: z.string(),
  PUSHOVER_TOKEN: z.string(),
  PUSHOVER_USER: z.string(),
});

export const env = envSchema.parse(process.env);

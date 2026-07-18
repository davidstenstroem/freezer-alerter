import z from 'zod';

const envSchema = z.object({
  API_KEY: z.string(),
  DEVICE_ID: z.string(),
  PUSHOVER_TOKEN: z.string(),
  PUSHOVER_USER: z.string(),
  API_BASE_URL: z.url().default('https://home-api.smartdevice.liebherr.com/v1'),
});

export const env = envSchema.parse(process.env);

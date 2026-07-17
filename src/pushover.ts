import { env } from './env';

type Priority = -2 | -1 | 0 | 1 | 2;

export async function sendPushover({
  message,
  title,
  priority = 0,
}: {
  message: string;
  title?: string;
  priority?: Priority;
}): Promise<void> {
  const body = new URLSearchParams({
    token: env.PUSHOVER_TOKEN,
    user: env.PUSHOVER_USER,
    message,
    priority: String(priority),
    ...(title && { title }),
    ...(priority === 2 && { retry: '60', expire: '3600' }),
  });

  try {
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      body,
    });
    if (!res.ok) console.error(`[pushover] ${res.status}: ${await res.text()}`);
  } catch (error) {
    console.error('[pushover] send failed:', error);
  }
}

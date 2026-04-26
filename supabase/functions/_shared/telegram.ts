/**
 * Telegram Bot API helpers (free tier — no per-message charge from Telegram).
 */

const botToken = () => Deno.env.get('TELEGRAM_BOT_TOKEN');

/** Opaque token stored on `users.telegram_link_token` until the user opens `t.me/...?start=`. */
export const mintTelegramLinkToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** Deep link for the user to start the bot with a link token (requires `TELEGRAM_BOT_USERNAME`). */
export const telegramBotStartUrl = (linkToken: string): string | null => {
  const botUsername = Deno.env.get('TELEGRAM_BOT_USERNAME')?.trim();
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=${linkToken}`;
};

export const sendTelegramHtml = async (
  chatId: string | number,
  html: string,
): Promise<{ messageId: string } | null> => {
  const token = botToken();
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN missing — skipping Telegram send');
    return null;
  }
  const body = new URLSearchParams({
    chat_id: String(chatId),
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: 'true',
  });
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.ok) {
    console.error('Telegram sendMessage failed', resp.status, json);
    return null;
  }
  const mid = json?.result?.message_id;
  return mid != null ? { messageId: String(mid) } : null;
};

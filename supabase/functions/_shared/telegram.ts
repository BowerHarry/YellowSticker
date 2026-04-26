/**
 * Telegram Bot API helpers (free tier — no per-message charge from Telegram).
 */

const botToken = () => Deno.env.get('TELEGRAM_BOT_TOKEN');

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

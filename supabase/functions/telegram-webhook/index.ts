// Receives Telegram Bot updates (set this URL with setWebhook + secret_token).
// Links a user's Telegram chat when they open t.me/<bot>?start=<telegram_link_token>.
import { adminClient } from '../_shared/db.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-telegram-bot-api-secret-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonOk = () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (expectedSecret) {
    const got = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (got !== expectedSecret) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
  }

  let update: Record<string, unknown>;
  try {
    update = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response('Bad JSON', { status: 400, headers: corsHeaders });
  }

  const message = update.message as Record<string, unknown> | undefined;
  const text = typeof message?.text === 'string' ? message.text : '';
  const chat = message?.chat as Record<string, unknown> | undefined;
  const chatId = chat?.id;

  if (typeof chatId !== 'number' && typeof chatId !== 'string') {
    return jsonOk();
  }

  let startArg = '';
  if (text.startsWith('/start ')) {
    startArg = text.slice('/start '.length).trim();
  } else if (text === '/start') {
    startArg = '';
  } else {
    return jsonOk();
  }

  if (!startArg) {
    await sendTelegramReply(
      chatId,
      'Open your <b>Yellow Sticker</b> management page and tap <b>Connect Telegram</b> to get a personal link.',
    );
    return jsonOk();
  }

  const { data: user, error } = await adminClient
    .from('users')
    .select('id,email,telegram_link_token')
    .eq('telegram_link_token', startArg)
    .maybeSingle();

  if (error || !user) {
    console.warn('Telegram /start unknown or expired token');
    await sendTelegramReply(
      chatId,
      'This link is invalid or has already been used. Generate a fresh link from your Yellow Sticker management page.',
    );
    return jsonOk();
  }

  const { error: upErr } = await adminClient
    .from('users')
    .update({
      telegram_chat_id: Number(chatId),
      telegram_link_token: null,
    })
    .eq('id', user.id);

  if (upErr) {
    console.error('Failed to link Telegram chat', upErr);
    await sendTelegramReply(chatId, 'Could not save the link — please try again later.');
    return jsonOk();
  }

  await sendTelegramReply(
    chatId,
    'You are connected for <b>Yellow Sticker</b> alerts on Telegram. You can close this chat.',
  );
  return jsonOk();
});

const sendTelegramReply = async (chatId: string | number, html: string) => {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return;
  const body = new URLSearchParams({
    chat_id: String(chatId),
    text: html,
    parse_mode: 'HTML',
  });
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
};

import { adminClient } from '../_shared/db.ts';
import { accountAccessEmail, sendEmail } from '../_shared/emails.ts';
import { mintTelegramLinkToken, telegramBotStartUrl } from '../_shared/telegram.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

const isLikelyEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = (await req.json()) as { email?: string };
    const email = normalizeEmail(body.email ?? '');
    if (!isLikelyEmail(email)) {
      return jsonResponse({ error: 'Please enter a valid email address.' }, 400);
    }

    // Privacy: always return success, even when no account exists for this
    // email. This prevents account enumeration.
    const { data: user } = await adminClient
      .from('users')
      .select('id,email,telegram_chat_id')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      return jsonResponse({ ok: true });
    }

    const { data: subscriptions, error } = await adminClient
      .from('subscriptions')
      .select(`
        payment_status,
        subscription_end,
        management_token,
        notification_preference,
        production:productions (
          name,
          theatre,
          city
        )
      `)
      .eq('user_id', user.id)
      .not('management_token', 'is', null);

    if (error) {
      console.error('request-manage-link subscription query failed', error);
      return jsonResponse({ ok: true });
    }

    const now = new Date();
    const entries = (subscriptions ?? [])
      .map((row) => {
        const end = row.subscription_end ? new Date(row.subscription_end) : null;
        const isActive = row.payment_status === 'paid' && !!end && end > now;
        return {
          productionName: row.production?.name ?? 'Unknown production',
          theatre: row.production?.theatre ?? 'Unknown theatre',
          city: row.production?.city ?? null,
          managementToken: row.management_token as string,
          isActive,
          subscriptionEnd: row.subscription_end ?? null,
        };
      })
      .sort((a, b) => Number(b.isActive) - Number(a.isActive))
      .slice(0, 12);

    if (entries.length === 0) {
      return jsonResponse({ ok: true });
    }

    let telegramConnectUrl: string | null = null;
    const wantsTelegram = (subscriptions ?? []).some(
      (r: { notification_preference?: string | null }) =>
        r.notification_preference === 'telegram' || r.notification_preference === 'both',
    );
    const chatId = user.telegram_chat_id as number | null | undefined;
    if (wantsTelegram && chatId == null) {
      const linkToken = mintTelegramLinkToken();
      const { error: tokErr } = await adminClient
        .from('users')
        .update({ telegram_link_token: linkToken })
        .eq('id', user.id);
      if (!tokErr) {
        telegramConnectUrl = telegramBotStartUrl(linkToken);
      }
    }

    const { subject, html } = accountAccessEmail(entries, { telegramConnectUrl });
    const messageId = await sendEmail({ to: email, subject, html });

    if (messageId) {
      await adminClient.from('notification_logs').insert({
        user_id: user.id,
        production_id: null,
        type: 'email',
        channel_message_id: messageId,
        payload: {
          reason: 'account_access_links',
          count: entries.length,
        },
      });
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('request-manage-link failed', error);
    return jsonResponse({ ok: true });
  }
});

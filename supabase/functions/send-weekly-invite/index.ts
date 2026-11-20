import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { syncLatestQuiz, type ExtractedQuiz } from '../_shared/joe-extract.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'weekly' | 'resend' | 'fetch';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const brevoApiKey = Deno.env.get('BREVO_API_KEY') ?? '';
    const siteUrl = Deno.env.get('SITE_URL') ?? '';
    const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') ?? '';
    const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'CURT.ie Quiz';

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Function is missing Supabase environment variables.' }, 500);
    }
    if (!brevoApiKey || !siteUrl || !senderEmail) {
      return json(
        {
          error: 'Set BREVO_API_KEY, BREVO_SENDER_EMAIL, and SITE_URL as Edge Function secrets.',
        },
        500,
      );
    }

    const authorized = await authorizeCaller(request, {
      supabaseUrl,
      anonKey,
      serviceRoleKey,
    });
    if (!authorized.ok) {
      return json({ error: authorized.error }, authorized.status);
    }

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = normalizeAction(body.action);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const mail = {
      apiKey: brevoApiKey,
      senderEmail,
      senderName,
      siteUrl,
    };

    if (action === 'resend') {
      return json(await emailCurrentQuiz(admin, mail));
    }

    try {
      const result = await syncLatestQuiz({
        getCurrent: () => currentQuiz(admin),
        publish: (quiz) => publishQuiz(admin, quiz),
      });
      if (action === 'fetch') {
        return json({
          sent: 0,
          skipped: result.status === 'unchanged',
          published: result.status === 'published',
          title: result.title,
          reason:
            result.status === 'unchanged'
              ? `Week ${result.weekId} is already the current quiz.`
              : undefined,
        });
      }
      if (result.status === 'unchanged') {
        return json({
          sent: 0,
          skipped: true,
          published: false,
          title: result.title,
          reason: `Week ${result.weekId} is already the current quiz.`,
        });
      }
      const sent = await emailPlayers(admin, mail, result.title);
      return json({ sent, skipped: false, published: true, title: result.title });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not fetch the quiz.';
      if (action === 'fetch') {
        return json({ error: message }, 500);
      }
      await emailAdmins(admin, mail, message);
      return json({ sent: 0, skipped: true, published: false, reason: message });
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function normalizeAction(value: string | undefined): Action {
  if (value === 'resend' || value === 'fetch') {
    return value;
  }
  return 'weekly';
}

async function currentQuiz(
  admin: SupabaseClient,
): Promise<{ weekId: string; title: string } | null> {
  const { data, error } = await admin
    .from('quizzes')
    .select('week_id, title')
    .eq('is_current', true)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }
  return { weekId: data.week_id as string, title: data.title as string };
}

async function publishQuiz(admin: SupabaseClient, quiz: ExtractedQuiz): Promise<void> {
  const { error: clearError } = await admin
    .from('quizzes')
    .update({ is_current: false })
    .eq('is_current', true);
  if (clearError) {
    throw new Error(clearError.message);
  }
  const { error } = await admin.from('quizzes').upsert(
    {
      week_id: quiz.weekId,
      title: quiz.title,
      source_url: quiz.sourceUrl,
      questions: quiz.questions,
      is_current: true,
    },
    { onConflict: 'week_id' },
  );
  if (error) {
    throw new Error(error.message);
  }
}

async function emailCurrentQuiz(
  admin: SupabaseClient,
  mail: MailConfig,
): Promise<Record<string, unknown>> {
  const current = await currentQuiz(admin);
  if (!current) {
    return { sent: 0, skipped: true, reason: 'No current quiz is published.' };
  }
  const sent = await emailPlayers(admin, mail, current.title);
  return { sent, skipped: false, published: false, title: current.title };
}

async function emailPlayers(
  admin: SupabaseClient,
  mail: MailConfig,
  title: string,
): Promise<number> {
  const { data, error } = await admin.from('players').select('name, email').order('name');
  if (error) {
    throw new Error(error.message);
  }
  let sent = 0;
  for (const player of data ?? []) {
    await sendBrevoEmail({
      ...mail,
      toEmail: player.email as string,
      toName: player.name as string,
      subject: `CURT.ie Quiz: ${title}`,
      html: inviteHtml(player.name as string, title, mail.siteUrl),
      text: inviteText(player.name as string, title, mail.siteUrl),
    });
    sent += 1;
  }
  return sent;
}

async function emailAdmins(
  admin: SupabaseClient,
  mail: MailConfig,
  reason: string,
): Promise<void> {
  const { data: admins, error } = await admin.from('admins').select('user_id');
  if (error) {
    throw new Error(error.message);
  }
  const ids = new Set((admins ?? []).map((row) => row.user_id as string));
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    throw new Error(listError.message);
  }
  for (const user of listed.users) {
    if (!user.email || !ids.has(user.id)) {
      continue;
    }
    await sendBrevoEmail({
      ...mail,
      toEmail: user.email,
      toName: 'Admin',
      subject: 'CURT.ie Quiz: this week was not published',
      html: `<p>The Friday quiz was not published, so nobody was invited.</p><p>${escapeHtml(reason)}</p>`,
      text: `The Friday quiz was not published, so nobody was invited.\n\n${reason}\n`,
    });
  }
}

interface MailConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  siteUrl: string;
}

async function authorizeCaller(
  request: Request,
  keys: { supabaseUrl: string; anonKey: string; serviceRoleKey: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const apikey = request.headers.get('apikey') ?? '';
  const authHeader = request.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (apikey === keys.serviceRoleKey || bearer === keys.serviceRoleKey) {
    return { ok: true };
  }

  if (!keys.anonKey || !bearer) {
    return { ok: false, error: 'not_authenticated', status: 401 };
  }

  const userClient = createClient(keys.supabaseUrl, keys.anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return { ok: false, error: 'not_authenticated', status: 401 };
  }
  const { data: isAdmin } = await userClient.rpc('is_admin');
  if (isAdmin !== true) {
    return { ok: false, error: 'not_authorized', status: 403 };
  }
  return { ok: true };
}

async function sendBrevoEmail(input: MailConfig & {
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': input.apiKey,
    },
    body: JSON.stringify({
      sender: { email: input.senderEmail, name: input.senderName },
      to: [{ email: input.toEmail, name: input.toName }],
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo send failed for ${input.toEmail}: ${detail}`);
  }
}

function inviteHtml(name: string, title: string, siteUrl: string): string {
  return `<p>Hi ${escapeHtml(name)},</p>
<p>This week's CURT.ie Quiz is ready: <strong>${escapeHtml(title)}</strong>.</p>
<p><a href="${escapeHtml(siteUrl)}">Open the quiz</a>, enter your email for a sign-in link, then play.</p>
<p>Only your first score this week counts.</p>`;
}

function inviteText(name: string, title: string, siteUrl: string): string {
  return `Hi ${name},

This week's CURT.ie Quiz is ready: ${title}.

Open the quiz: ${siteUrl}
Enter your email for a sign-in link, then play. Only your first score this week counts.
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

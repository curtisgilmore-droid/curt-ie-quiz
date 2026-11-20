import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Function is missing Supabase environment variables.' }, 500);
    }

    const authHeader = request.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: 'not_authenticated' }, 401);
    }

    const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
    if (adminError || isAdmin !== true) {
      return json({ error: 'not_authorized' }, 403);
    }

    const body = (await request.json()) as {
      action?: string;
      name?: string;
      email?: string;
      playerId?: string;
    };
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (body.action === 'add') {
      const name = (body.name ?? '').trim();
      const email = (body.email ?? '').trim().toLowerCase();
      if (!name || !email.includes('@')) {
        return json({ error: 'Name and a valid email are required.' }, 400);
      }

      const { data: player, error: insertError } = await admin
        .from('players')
        .insert({ name, email })
        .select('id, name, email')
        .single();
      if (insertError) {
        return json({ error: insertError.message }, 400);
      }

      const { error: authError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (authError && !authError.message.toLowerCase().includes('already')) {
        await admin.from('players').delete().eq('id', player.id);
        return json({ error: authError.message }, 400);
      }

      return json({ player });
    }

    if (body.action === 'remove') {
      const playerId = body.playerId ?? '';
      if (!playerId) {
        return json({ error: 'playerId is required.' }, 400);
      }
      const { data: existing, error: lookupError } = await admin
        .from('players')
        .select('id, email')
        .eq('id', playerId)
        .maybeSingle();
      if (lookupError) {
        return json({ error: lookupError.message }, 400);
      }
      if (!existing) {
        return json({ error: 'player_not_found' }, 404);
      }

      const { error: deleteError } = await admin.from('players').delete().eq('id', playerId);
      if (deleteError) {
        return json({ error: deleteError.message }, 400);
      }

      const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const authUser = listed?.users.find((entry) => entry.email?.toLowerCase() === existing.email);
      if (authUser) {
        await admin.auth.admin.deleteUser(authUser.id);
      }

      return json({ removed: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

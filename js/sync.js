// مزامنة اختيارية عبر Supabase. المفتاح المستخدم هنا هو anon/public فقط، ولا يوضع service_role في المتصفح أبداً.
let clientPromise;
export async function getSupabaseClient(settings) {
  if (!settings?.supabaseUrl || !settings?.supabaseAnonKey) throw new Error('أدخل رابط مشروع Supabase ومفتاح anon العام أولاً.');
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) =>
      createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    ).catch(error => { clientPromise = null; throw error; });
  }
  return clientPromise;
}

export async function sendMagicLink(settings, email, redirectTo) {
  const supabase = await getSupabaseClient(settings);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
  return true;
}

export async function getCloudSession(settings) {
  const supabase = await getSupabaseClient(settings);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return { supabase, session: data.session };
}

export async function cloudSnapshot(settings) {
  const { supabase, session } = await getCloudSession(settings);
  if (!session) throw new Error('سجّل الدخول أولاً عبر رابط البريد الإلكتروني.');
  const { data, error } = await supabase.from('garden_sync').select('snapshot, updated_at, revision').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  return { supabase, session, data };
}

export async function pushCloudSnapshot(settings, snapshot, force = false) {
  const { supabase, session, data } = await cloudSnapshot(settings);
  if (!force && data?.snapshot?.garden?.updatedAt && snapshot.garden?.updatedAt && new Date(data.snapshot.garden.updatedAt).getTime() > new Date(snapshot.garden.updatedAt).getTime()) {
    return { conflict: true, remoteUpdatedAt: data.updated_at };
  }
  const safeSnapshot = structuredClone(snapshot);
  if (safeSnapshot.settings) { delete safeSnapshot.settings.supabaseUrl; delete safeSnapshot.settings.supabaseAnonKey; }
  const payload = {
    user_id: session.user.id,
    snapshot: safeSnapshot,
    revision: (data?.revision || 0) + 1,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('garden_sync').upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
  return { conflict: false, pushed: true };
}

export async function pullCloudSnapshot(settings) {
  const { data } = await cloudSnapshot(settings);
  return data?.snapshot || null;
}

export async function signOutCloud(settings) {
  const supabase = await getSupabaseClient(settings);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

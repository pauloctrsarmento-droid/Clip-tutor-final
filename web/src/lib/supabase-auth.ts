import { createBrowserClient } from "@supabase/ssr";

/** Browser-side Supabase client with auth session persistence */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

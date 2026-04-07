import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-server";
import { AuthenticationError } from "@/lib/errors";
import type { User } from "@supabase/supabase-js";

/** Server-side Supabase client with cookie-based auth */
async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );
}

/** Get the authenticated Supabase Auth user from cookies. Returns null if not logged in. */
export async function getAuthUser(): Promise<User | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Get the student_id (from students table) for the authenticated user. Throws 401 if not logged in. */
export async function getStudentId(): Promise<string> {
  const user = await getAuthUser();
  if (!user) throw new AuthenticationError();

  const { data } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!data) throw new AuthenticationError("Student profile not found");
  return data.id as string;
}

/** Get the student profile for the authenticated user. Throws 401 if not logged in. */
export async function getStudentProfile(): Promise<{
  id: string;
  name: string;
  email: string | null;
  current_streak: number;
  longest_streak: number;
}> {
  const user = await getAuthUser();
  if (!user) throw new AuthenticationError();

  const { data } = await supabaseAdmin
    .from("students")
    .select("id, name, email, current_streak, longest_streak")
    .eq("auth_id", user.id)
    .single();

  if (!data) throw new AuthenticationError("Student profile not found");
  return data as {
    id: string;
    name: string;
    email: string | null;
    current_streak: number;
    longest_streak: number;
  };
}

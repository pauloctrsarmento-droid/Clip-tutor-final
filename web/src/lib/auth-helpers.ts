import { createSupabaseServer } from "@/lib/supabase-auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { AuthenticationError } from "@/lib/errors";
import type { User } from "@supabase/supabase-js";

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

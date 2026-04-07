"use client";

import {
  createContext,
  useCallback,
  use,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { createSupabaseBrowser } from "@/lib/supabase-auth";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  /** Supabase Auth user (null if not logged in) */
  user: User | null;
  /** Student name from profile */
  studentName: string | null;
  /** Student UUID from students table */
  studentId: string | null;
  /** True when auth session is being loaded */
  loading: boolean;
  /** Sign out of Supabase Auth */
  signOut: () => Promise<void>;

  // --- Admin PIN (kept for backwards compat with admin views) ---
  pin: string | null;
  isAuthenticated: boolean;
  login: (pin: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const PIN_STORAGE_KEY = "clip-tutor-pin";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Supabase Auth state
  const [user, setUser] = useState<User | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Admin PIN state (kept for admin components)
  const [pin, setPin] = useState<string | null>(null);

  useEffect(() => {
    // Load admin PIN from session storage
    const storedPin = sessionStorage.getItem(PIN_STORAGE_KEY);
    if (storedPin) setPin(storedPin);

    // Load Supabase Auth session
    const supabase = createSupabaseBrowser();

    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser);
      if (authUser) {
        // Query student profile directly via browser client (avoids middleware cookie issues)
        Promise.resolve(
          supabase
            .from("students")
            .select("id, name")
            .eq("auth_id", authUser.id)
            .single()
        )
          .then(({ data: profile }) => {
            if (profile) {
              setStudentName(profile.name);
              setStudentId(profile.id);
            }
          })
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes (login/logout/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const newUser = session?.user ?? null;
        setUser(newUser);
        if (!newUser) {
          setStudentName(null);
          setStudentId(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null);
    setStudentName(null);
    setStudentId(null);
  }, []);

  // Admin PIN methods
  const login = useCallback((newPin: string) => {
    sessionStorage.setItem(PIN_STORAGE_KEY, newPin);
    setPin(newPin);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(PIN_STORAGE_KEY);
    setPin(null);
  }, []);

  return (
    <AuthContext value={{
      user,
      studentName,
      studentId,
      loading,
      signOut,
      pin,
      isAuthenticated: pin !== null,
      login,
      logout,
    }}>
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

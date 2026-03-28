"use client";

import {
  createContext,
  useCallback,
  use,
  useState,
  useEffect,
  type ReactNode,
} from "react";

interface AuthState {
  pin: string | null;
  isAuthenticated: boolean;
  login: (pin: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "clip-tutor-pin";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [pin, setPin] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) setPin(stored);
  }, []);

  const login = useCallback((newPin: string) => {
    sessionStorage.setItem(STORAGE_KEY, newPin);
    setPin(newPin);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setPin(null);
  }, []);

  return (
    <AuthContext value={{
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

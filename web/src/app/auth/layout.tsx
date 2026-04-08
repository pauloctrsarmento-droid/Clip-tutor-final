import { Fraunces, DM_Sans } from "next/font/google";
import type { ReactNode } from "react";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${fraunces.variable} ${dmSans.variable} min-h-screen bg-[#FBF7F1] text-[#1C1917] antialiased`}
      style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}

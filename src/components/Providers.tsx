"use client";
import { AuthProvider } from "@/lib/auth";
import { SetsProvider } from "./SetsContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SetsProvider>{children}</SetsProvider>
    </AuthProvider>
  );
}

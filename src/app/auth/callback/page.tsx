"use client";
// Where Google sign-in, email confirmation links, and password-reset links send the person back to.
// The Supabase library finishes the sign-in by itself; this page waits for that and then moves on.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export default function Callback() {
  const { status, recovering } = useAuth();
  const router = useRouter();
  const [problem, setProblem] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const err = q.get("error_description") ?? h.get("error_description") ?? q.get("error") ?? "";
    if (err) setProblem(err.replace(/\+/g, " "));
  }, []);

  useEffect(() => {
    if (status === "signed_in") router.replace(recovering ? "/account?recovery=1" : "/");
    if (status === "signed_out") {
      const t = setTimeout(() => setProblem((p) => p || "The sign-in link did not work. It may have expired or been opened on a different device."), 4000);
      return () => clearTimeout(t);
    }
  }, [status, recovering, router]);

  return (
    <div className="splash" role="status" aria-live="polite">
      <Logo size={56} />
      {problem ? (
        <>
          <p className="notice error" role="alert">{problem}</p>
          <Link className="btn" href="/login">Back to sign in</Link>
        </>
      ) : <p className="muted">Finishing sign-in...</p>}
    </div>
  );
}

"use client";

import { useEffect } from "react";

import { hasBrowserSupabaseConfig, supabaseBrowser } from "@/lib/supabase-browser";

export default function LogoutPage() {
  useEffect(() => {
    async function logout() {
      if (hasBrowserSupabaseConfig()) {
        try {
          await supabaseBrowser().auth.signOut();
        } catch {
          // Continue to the dashboard even if the local video session is already gone.
        }
      }

      window.localStorage.clear();
      window.sessionStorage.clear();
      window.location.href = safeReturnTo();
    }

    logout();
  }, []);

  return (
    <main className="room-state">
      <div className="room-state__panel">
        <h1>Signing out</h1>
        <p>Clearing your video room session...</p>
      </div>
    </main>
  );
}

function safeReturnTo() {
  const fallback = process.env.NEXT_PUBLIC_STUDENT_DASHBOARD_URL || "https://dashboard.rmtutoringservices.com";
  const raw = new URLSearchParams(window.location.search).get("return_to");
  if (!raw) return `${fallback.replace(/\/$/, "")}/login.html`;

  try {
    const url = new URL(raw);
    const dashboard = new URL(fallback);
    if (url.origin === dashboard.origin) return url.toString();
  } catch {
    return `${fallback.replace(/\/$/, "")}/login.html`;
  }

  return `${fallback.replace(/\/$/, "")}/login.html`;
}

"use client";

import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Copy, PhoneOff, X } from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";

import { hasBrowserSupabaseConfig, supabaseBrowser } from "@/lib/supabase-browser";

type VideoRoomProps = {
  roomName: string;
  dailyUrl: string;
  startsAt: string | null;
  endsAt: string | null;
  requiresAuth: boolean;
  isDemoRoom: boolean;
};

export default function VideoRoom({
  roomName,
  dailyUrl,
  startsAt,
  endsAt,
  requiresAuth,
  isDemoRoom
}: VideoRoomProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callRef = useRef<DailyCall | null>(null);
  const cleanupPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const joinAttemptRef = useRef(0);
  const joiningRef = useRef(false);
  const dashboardBridgeAttemptedRef = useRef(false);
  const autoRecordAttemptedRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!requiresAuth);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [canEndSession, setCanEndSession] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [showEndMeetingModal, setShowEndMeetingModal] = useState(false);
  const [endMeetingError, setEndMeetingError] = useState<string | null>(null);
  const [hasEndedSession, setHasEndedSession] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!requiresAuth || !hasBrowserSupabaseConfig()) {
      setAuthReady(true);
      return;
    }

    const supabase = supabaseBrowser();
    let mounted = true;

    async function syncSession() {
      const redirectedSession = await consumeDashboardRedirectSession(supabase).catch(() => null);
      const { data } = await supabase.auth.getSession();
      let nextSession = redirectedSession || data.session;

      if (!nextSession && !dashboardBridgeAttemptedRef.current) {
        dashboardBridgeAttemptedRef.current = true;
        nextSession = await requestDashboardSession(supabase, getDashboardUrl()).catch(() => null);
      }

      if (!mounted) return;
      setSession(nextSession);
      setAuthReady(true);
    }

    syncSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession) => {
      setSession(nextSession);
    });

    function syncVisibleSession() {
      if (document.visibilityState === "visible") {
        syncSession();
      }
    }

    window.addEventListener("focus", syncSession);
    window.addEventListener("storage", syncSession);
    document.addEventListener("visibilitychange", syncVisibleSession);

    return () => {
      mounted = false;
      window.removeEventListener("focus", syncSession);
      window.removeEventListener("storage", syncSession);
      document.removeEventListener("visibilitychange", syncVisibleSession);
      subscription.unsubscribe();
    };
  }, [requiresAuth]);

  useEffect(() => {
    if (hasEndedSession) return;
    if (!containerRef.current || callRef.current || joiningRef.current || !authReady) return;
    if (requiresAuth && !accessToken) return;

    let cancelled = false;
    const attemptId = joinAttemptRef.current + 1;
    joinAttemptRef.current = attemptId;
    joiningRef.current = true;

    async function joinRoom() {
      setIsJoining(true);
      setCanEndSession(false);
      setJoinError(null);

      try {
        const tokenResponse = await fetch(
          `/api/rooms/${encodeURIComponent(roomName)}/daily-token`,
          {
            method: "POST",
            headers: {
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
            }
          }
        );

        if (!tokenResponse.ok) {
          throw new Error(
            tokenResponse.status === 401
              ? "Please sign in before joining this room."
              : "We could not prepare this video room."
          );
        }

        const { token, canRecord } = (await tokenResponse.json()) as {
          token: string;
          canRecord?: boolean;
        };

        if (cancelled || !containerRef.current) return;
        await cleanupPromiseRef.current;
        if (cancelled || !containerRef.current) return;

        const existingCall = DailyIframe.getCallInstance();
        if (existingCall && existingCall !== callRef.current) {
          await existingCall.destroy();
        }

        if (cancelled || !containerRef.current) return;
        containerRef.current.replaceChildren();

        const call = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: true,
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "0"
          }
        });

        callRef.current = call;
        setCanEndSession(Boolean(canRecord && accessToken));
        setIsJoining(false);
        await call.join({ url: dailyUrl, token });
        if (!cancelled && canRecord && shouldAutoRecord()) {
          await startRecordingOnce(call);
        }
      } catch (error) {
        if (!cancelled) {
          setJoinError(error instanceof Error ? error.message : "Unable to join room.");
        }
      } finally {
        if (joinAttemptRef.current === attemptId) {
          joiningRef.current = false;
        }

        if (!cancelled) {
          setIsJoining(false);
        }
      }
    }

    joinRoom();

    return () => {
      cancelled = true;
      joinAttemptRef.current += 1;
      joiningRef.current = false;
      const call = callRef.current;
      callRef.current = null;
      cleanupPromiseRef.current = call
        ? call.destroy().catch(() => undefined)
        : Promise.resolve();
    };
  }, [accessToken, authReady, dailyUrl, hasEndedSession, requiresAuth, roomName]);

  async function startRecordingOnce(call: DailyCall) {
    if (autoRecordAttemptedRef.current) return;
    autoRecordAttemptedRef.current = true;
    try {
      const recordableCall = call as DailyCall & { startRecording?: () => Promise<unknown> };
      if (typeof recordableCall.startRecording !== "function") return;
      await recordableCall.startRecording();
    } catch (error) {
      console.warn("Unable to start Daily recording automatically", error);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function endMeeting() {
    if (!accessToken || isEndingSession) return;

    setIsEndingSession(true);
    setEndMeetingError(null);
    setJoinError(null);

    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomName)}/end-session`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error("We could not end this meeting.");
      }

      setCanEndSession(false);
      setShowEndMeetingModal(false);
      setHasEndedSession(true);
      const call = callRef.current;
      callRef.current = null;
      if (call) {
        cleanupPromiseRef.current = call.destroy().catch(() => undefined);
      }
    } catch (error) {
      setEndMeetingError(error instanceof Error ? error.message : "Unable to end meeting.");
    } finally {
      setIsEndingSession(false);
    }
  }

  return (
    <main className="call-shell">
      <header className="call-topbar">
        <div className="brand-lockup">
          <Image
            className="brand-logo"
            src="https://www.rmtutoringservices.com/assets/logo.png"
            alt="RM Tutoring Services"
            width={42}
            height={42}
          />
          <div className="brand-copy">
            <div className="brand-title">RM Tutoring Video</div>
            <div className="brand-subtitle">
              {hasMounted ? formatWindow(startsAt, endsAt) || roomName : roomName}
            </div>
          </div>
        </div>

        <div className="call-actions">
          {canEndSession ? (
            <button
              className="icon-button icon-button--danger"
              type="button"
              onClick={() => {
                setEndMeetingError(null);
                setShowEndMeetingModal(true);
              }}
              disabled={isEndingSession}
              aria-label={isEndingSession ? "Ending meeting" : "End meeting"}
              title={isEndingSession ? "Ending meeting" : "End meeting"}
            >
              <PhoneOff size={17} />
            </button>
          ) : null}
          <button
            className="icon-button"
            type="button"
            onClick={copyLink}
            aria-label={copied ? "Copied meeting link" : "Copy meeting link"}
            title={copied ? "Copied" : "Copy meeting link"}
          >
            <Copy size={17} />
          </button>
        </div>
      </header>

      <section className="call-stage" aria-label="Video room">
        {requiresAuth && !hasBrowserSupabaseConfig() ? (
          <RoomState
            title="Video sign-in is not configured"
            message="Ask RM Tutoring to add the Supabase anon key to the video site before joining protected rooms."
          />
        ) : authReady && requiresAuth && !session ? (
          <AuthPrompt roomName={roomName} />
        ) : hasEndedSession ? (
          <RoomState title="Meeting ended" message="This room has been closed and marked completed." />
        ) : joinError ? (
          <RoomState title="Unable to join" message={joinError} />
        ) : isJoining ? (
          <RoomState
            title={isDemoRoom ? "Opening demo room" : "Opening your room"}
            message={
              isDemoRoom
                ? "Recording is disabled for this demo space."
                : "Checking your student dashboard session..."
            }
          />
        ) : null}
        <div ref={containerRef} className="daily-frame" />
      </section>

      {showEndMeetingModal ? (
        <EndMeetingModal
          error={endMeetingError}
          isEnding={isEndingSession}
          onCancel={() => {
            if (isEndingSession) return;
            setShowEndMeetingModal(false);
            setEndMeetingError(null);
          }}
          onConfirm={endMeeting}
        />
      ) : null}
    </main>
  );
}

function EndMeetingModal({
  error,
  isEnding,
  onCancel,
  onConfirm
}: {
  error: string | null;
  isEnding: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-meeting-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close-button"
          type="button"
          onClick={onCancel}
          disabled={isEnding}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X size={16} />
        </button>
        <h1 id="end-meeting-title">End meeting?</h1>
        <p>
          This will close the room for everyone and mark the session completed in the student dashboard.
        </p>
        {error ? <div className="modal-error">{error}</div> : null}
        <div className="modal-actions">
          <button className="secondary-button modal-action-button" type="button" onClick={onCancel} disabled={isEnding}>
            Cancel
          </button>
          <button className="danger-button modal-action-button" type="button" onClick={onConfirm} disabled={isEnding}>
            {isEnding ? <ButtonSpinner /> : <PhoneOff size={15} />}
            {isEnding ? "Ending..." : "End meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ButtonSpinner() {
  return <span className="button-spinner" aria-hidden="true" />;
}

function AuthPrompt({ roomName }: { roomName: string }) {
  const [mode, setMode] = useState<"choice" | "email">("choice");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [returnUrl, setReturnUrl] = useState("");
  const dashboardUrl = getDashboardUrl();

  useEffect(() => {
    setReturnUrl(getRoomReturnUrl());
  }, []);

  async function signInWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getRoomReturnUrl()
      }
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate__panel">
        <p className="auth-gate__eyebrow">Student dashboard required</p>
        <h1>Sign in to join</h1>
        <p>
          This room link is protected. Use your RM Tutoring student account to
          continue to {roomName}.
        </p>

        {mode === "choice" ? (
          <div className="auth-gate__actions">
            <button className="primary-button" type="button" onClick={() => setMode("email")}>
              Sign in here
            </button>
            <button className="secondary-button" type="button" onClick={signInWithGoogle}>
              Continue with Google
            </button>
            <a className="secondary-button" href={dashboardAuthUrl(dashboardUrl, "signup.html", returnUrl)}>
              Create account
            </a>
            <a className="text-link" href={dashboardAuthUrl(dashboardUrl, "login.html", returnUrl)}>
              Open student dashboard
            </a>
          </div>
        ) : (
          <form className="auth-form" onSubmit={signInWithEmail}>
            <label>
              Email
              <input
                value={email}
                type="email"
                autoComplete="email"
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                value={password}
                type="password"
                autoComplete="current-password"
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <div className="auth-form__error">{error}</div> : null}
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Join room"}
            </button>
            <button className="text-link" type="button" onClick={() => setMode("choice")}>
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RoomState({ title, message }: { title: string; message: string }) {
  return (
    <div className="room-state">
      <div className="room-state__panel">
        <h1>{title}</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}

function formatWindow(startsAt: string | null, endsAt: string | null) {
  if (!startsAt) return null;

  const start = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(startsAt));

  if (!endsAt) return start;

  const end = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(endsAt));

  return `${start} - ${end}`;
}

function getDashboardUrl() {
  return (process.env.NEXT_PUBLIC_STUDENT_DASHBOARD_URL || "https://dashboard.rmtutoringservices.com").replace(
    /\/$/,
    ""
  );
}

function getRoomReturnUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(`${window.location.origin}${window.location.pathname}${window.location.search}`);
  return url.toString();
}

function shouldAutoRecord() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("rmvideo_auto_record") === "1";
}

async function consumeDashboardRedirectSession(supabase: ReturnType<typeof supabaseBrowser>) {
  if (typeof window === "undefined") return null;

  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = query.get("code") || hash.get("code");
  const accessToken =
    query.get("access_token") ||
    hash.get("access_token") ||
    query.get("rmvideo_access_token") ||
    hash.get("rmvideo_access_token");
  const refreshToken =
    query.get("refresh_token") ||
    hash.get("refresh_token") ||
    query.get("rmvideo_refresh_token") ||
    hash.get("rmvideo_refresh_token");

  if (!code && !(accessToken && refreshToken)) return null;

  try {
    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.setSession({
          access_token: accessToken || "",
          refresh_token: refreshToken || ""
        });

    if (error) throw error;
    return data.session || null;
  } finally {
    removeAuthParamsFromUrl();
  }
}

async function requestDashboardSession(
  supabase: ReturnType<typeof supabaseBrowser>,
  dashboardUrl: string
): Promise<Session | null> {
  if (typeof window === "undefined") return null;

  const dashboardOrigin = new URL(dashboardUrl).origin;

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    let settled = false;
    const timeout = window.setTimeout(() => finish(null), 1800);

    function finish(session: Session | null) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      iframe.remove();
      resolve(session);
    }

    async function onMessage(event: MessageEvent) {
      if (event.origin !== dashboardOrigin) return;
      if (!isDashboardSessionMessage(event.data)) return;

      if (!event.data.accessToken || !event.data.refreshToken) {
        finish(null);
        return;
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: event.data.accessToken,
        refresh_token: event.data.refreshToken
      });

      finish(error ? null : data.session || null);
    }

    window.addEventListener("message", onMessage);
    iframe.hidden = true;
    iframe.src = `${dashboardUrl}/auth-bridge.html?parent_origin=${encodeURIComponent(window.location.origin)}`;
    document.body.appendChild(iframe);
  });
}

function isDashboardSessionMessage(
  value: unknown
): value is {
  type: "rmvideo-dashboard-session";
  accessToken?: string;
  refreshToken?: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type?: unknown }).type === "rmvideo-dashboard-session"
  );
}

function removeAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  const authParams = [
    "code",
    "access_token",
    "refresh_token",
    "expires_at",
    "expires_in",
    "provider_token",
    "provider_refresh_token",
    "token_type",
    "type",
    "rmvideo_access_token",
    "rmvideo_refresh_token"
  ];

  for (const param of authParams) {
    url.searchParams.delete(param);
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  for (const param of authParams) {
    hash.delete(param);
  }

  const nextHash = hash.toString();
  url.hash = nextHash ? `#${nextHash}` : "";
  window.history.replaceState({}, document.title, url.toString());
}

function dashboardAuthUrl(dashboardUrl: string, path: string, returnUrl: string) {
  const url = new URL(path, `${dashboardUrl}/`);
  if (returnUrl) {
    url.searchParams.set("return_to", returnUrl);
  }
  return url.toString();
}

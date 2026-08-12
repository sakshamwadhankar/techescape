import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminRoundStatusResponse, PlayerStatusResponse } from "@spiderman/types";
import { api, ApiError } from "./api";

export type SessionState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "unauthenticated" };

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function usePlayerSession(): SessionState<PlayerStatusResponse> {
  const [state, setState] = useState<SessionState<PlayerStatusResponse>>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    api
      .playerStatus()
      .then((data) => alive && setState({ status: "ok", data }))
      .catch((error) => alive && setState({ status: isUnauthenticated(error) ? "unauthenticated" : "loading" }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/** Guard for player pages: returns null while loading, or redirects when logged out. */
export function useRequirePlayer(): PlayerStatusResponse | null {
  const session = usePlayerSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "unauthenticated") router.replace("/login");
  }, [session.status, router]);

  return session.status === "ok" ? session.data : null;
}

export function useAdminSession(): SessionState<AdminRoundStatusResponse> {
  const [state, setState] = useState<SessionState<AdminRoundStatusResponse>>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    api
      .adminRound()
      .then((data) => alive && setState({ status: "ok", data }))
      .catch((error) => alive && setState({ status: isUnauthenticated(error) ? "unauthenticated" : "loading" }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/** Guard for the admin dashboard: redirects to /admin/login when logged out. */
export function useRequireAdmin(): AdminRoundStatusResponse | null {
  const session = useAdminSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "unauthenticated") router.replace("/admin/login");
  }, [session.status, router]);

  return session.status === "ok" ? session.data : null;
}

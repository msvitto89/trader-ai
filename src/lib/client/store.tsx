"use client";

/**
 * Session store: the signed-in profile, entitlements, usage meters and the
 * user's watchlist. One fetch on mount, then mutations keep it in sync.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { UserProfile, UsageLimits } from "@/lib/types";

export interface SessionState {
  user: UserProfile | null;
  usage: UsageLimits | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
  toggleWatch: (symbol: string) => Promise<void>;
  isWatched: (symbol: string) => boolean;
}

const Ctx = createContext<SessionState>({
  user: null,
  usage: null,
  loading: true,
  refresh: async () => {},
  setUser: () => {},
  toggleWatch: async () => {},
  isWatched: () => false,
});

export function SessionProvider({ children, initialUser }: { children: ReactNode; initialUser: UserProfile | null }) {
  const [user, setUser] = useState<UserProfile | null>(initialUser);
  const [usage, setUsage] = useState<UsageLimits | null>(null);
  const [loading, setLoading] = useState(!initialUser);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: UserProfile | null; usage: UsageLimits | null }>("/api/me");
      setUser(data.user);
      setUsage(data.usage);
    } catch {
      setUser(null);
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialUser) {
      void refresh();
    } else {
      void api
        .get<{ user: UserProfile | null; usage: UsageLimits | null }>("/api/me")
        .then((d) => setUsage(d.usage))
        .catch(() => {});
      setLoading(false);
    }
  }, [initialUser, refresh]);

  const toggleWatch = useCallback(
    async (symbol: string) => {
      if (!user) return;
      const watching = user.watchlist.includes(symbol);
      // Optimistic update keeps the star responsive.
      setUser({
        ...user,
        watchlist: watching ? user.watchlist.filter((s) => s !== symbol) : [...user.watchlist, symbol],
      });
      try {
        await api.post("/api/watchlist", { symbol, action: watching ? "remove" : "add" });
        void api
          .get<{ usage: UsageLimits | null }>("/api/me")
          .then((d) => setUsage(d.usage))
          .catch(() => {});
      } catch {
        void refresh();
      }
    },
    [user, refresh],
  );

  const isWatched = useCallback((symbol: string) => Boolean(user?.watchlist.includes(symbol)), [user]);

  const value = useMemo(
    () => ({ user, usage, loading, refresh, setUser, toggleWatch, isWatched }),
    [user, usage, loading, refresh, toggleWatch, isWatched],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}

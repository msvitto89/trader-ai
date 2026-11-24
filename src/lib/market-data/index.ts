/**
 * Market-data layer entry point.
 *
 * Selection rules:
 *  - MARKET_DATA_PROVIDER=demo  → DEMO DATA (default; always available)
 *  - MARKET_DATA_PROVIDER=http  → custom REST provider (requires credentials)
 *  - MARKET_DATA_PROVIDER=auto  → live if configured, otherwise demo
 *
 * If a live provider is selected but unreachable, calls fail loudly rather
 * than silently substituting simulated prices. The UI surfaces a data-source
 * badge from `source` on every payload.
 */

import { DemoMarketDataProvider } from "./demo";
import { HttpMarketDataProvider } from "./http";
import { MarketDataError, type MarketDataProvider } from "./types";

export { MarketDataError } from "./types";
export type { MarketDataProvider } from "./types";

const demo = new DemoMarketDataProvider();
const http = new HttpMarketDataProvider();

export function getMarketDataProvider(): MarketDataProvider {
  const configured = (process.env.MARKET_DATA_PROVIDER ?? "demo").toLowerCase();
  if (configured === "demo") return demo;
  if (configured === "http") {
    if (!http.isConfigured()) {
      throw new MarketDataError(
        "MARKET_DATA_PROVIDER=http but MARKET_DATA_BASE_URL/MARKET_DATA_API_KEY are missing",
        "NOT_CONFIGURED",
      );
    }
    return http;
  }
  if (configured === "auto") return http.isConfigured() ? http : demo;
  throw new MarketDataError(`Unknown MARKET_DATA_PROVIDER "${configured}"`, "BAD_CONFIG");
}

/** Which feed the product will use, for status display (no secrets). */
export function describeMarketData(): { provider: string; source: "live" | "demo"; label: string } {
  try {
    const provider = getMarketDataProvider();
    return { provider: provider.id, source: provider.source, label: provider.label };
  } catch {
    return { provider: "demo", source: "demo", label: "TRADIA Demo Feed" };
  }
}

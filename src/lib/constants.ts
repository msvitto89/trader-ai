/** Shared product constants safe for both server and client. */

export const PRODUCT_NAME = "TRADIA AI";

export const DISCLAIMER_SHORT =
  "Analysis and educational information only. Not investment advice. Trading involves substantial risk of loss.";

export const DISCLAIMER_LONG =
  "TRADIA AI provides market analysis and educational information and does not guarantee trading results. AI-generated setups are potential scenarios derived from available market data — never certainties, recommendations, or guarantees. Prices may be delayed or simulated (see the data-source badge). You are solely responsible for your trading decisions.";

/**
 * True while the product runs on the deterministic DEMO feed. The UI uses this
 * only for chrome-level hints; per-payload `source` fields remain authoritative.
 */
export const DEMO_DATA_SOURCE = (process.env.NEXT_PUBLIC_DATA_SOURCE ?? "demo") !== "live";

export const ASSET_CLASS_ICON: Record<string, string> = {
  crypto: "₿",
  forex: "€",
  stocks: "▤",
  indices: "◫",
  commodities: "◆",
};

export const STYLE_LABEL: Record<string, string> = {
  scalping: "Scalping",
  day: "Day trading",
  swing: "Swing trading",
  longterm: "Long-term",
};

export const STYLE_DESCRIPTION: Record<string, string> = {
  scalping: "Seconds to minutes. Tight stops, high frequency, 1m–15m charts.",
  day: "Intraday to a few hours. 15m–4H, flat overnight.",
  swing: "Days to weeks. 4H–1D, tolerates wider stops.",
  longterm: "Weeks to months. 1D–1W, position-level risk.",
};

export const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const RISK_PREFERENCE_LABEL: Record<string, string> = {
  conservative: "Conservative",
  moderate: "Moderate",
  aggressive: "Aggressive",
};

export const RISK_PREFERENCE_HINT: Record<string, string> = {
  conservative: "Lower volatility instruments, tighter exposure",
  moderate: "Balanced across volatility regimes",
  aggressive: "Accepts high volatility and wider drawdowns",
};

export const ALERT_KIND_LABEL: Record<string, string> = {
  "price-above": "Price above",
  "price-below": "Price below",
  breakout: "Breakout",
  "trend-change": "Trend change",
  "ai-opportunity": "AI opportunity",
  risk: "Risk threshold",
  "economic-event": "Economic event",
};

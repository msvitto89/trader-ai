/**
 * TRADIA AI — core domain types.
 *
 * These are the contracts shared by the market-data layer, the analysis
 * engine, the risk engine, the API routes and the UI. Keep them free of
 * framework imports so any layer can depend on them.
 */

export type AssetClass = "crypto" | "forex" | "stocks" | "indices" | "commodities";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

export const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
};

/** Milliseconds of history each timeframe represents per candle. */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

export type TradingStyle = "scalping" | "day" | "swing" | "longterm";
export type Experience = "beginner" | "intermediate" | "advanced";
export type RiskPreference = "conservative" | "moderate" | "aggressive";
export type Direction = "long" | "short";
export type Bias = "bullish" | "bearish" | "neutral";
export type SetupQuality = "high" | "medium" | "low";
export type Plan = "free" | "pro";

export interface Instrument {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quote: string;
  /** Price precision for display. */
  precision: number;
  /** Typical spread in price units, used for cost estimates. */
  pipSize: number;
  /** Contract size / point value hint for position sizing (units per 1 lot). */
  unitLabel: string;
  blurb: string;
}

export interface Candle {
  /** Open time, epoch ms (UTC). */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Quote {
  symbol: string;
  price: number;
  /** Absolute change over the last 24h (or session, for non-24/7 markets). */
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  /** Spread in price units. */
  spread: number;
  timestamp: number;
}

export type DataSource = "live" | "demo";

export interface SeriesBundle {
  symbol: string;
  source: DataSource;
  provider: string;
  /** Candle series by timeframe, oldest first. */
  series: Record<Timeframe, Candle[]>;
  asOf: number;
}

export interface IndicatorSnapshot {
  ema20: number;
  ema50: number;
  ema200: number;
  sma20: number;
  rsi14: number;
  macd: { macd: number; signal: number; histogram: number };
  atr14: number;
  atrPct: number;
  bb: { upper: number; mid: number; lower: number; widthPct: number };
  stoch: { k: number; d: number };
  obvSlope: number;
  volumeRatio: number;
  adx: number;
}

export interface Level {
  price: number;
  kind: "support" | "resistance";
  /** 0..1 — how many touches / how clean the level is. */
  strength: number;
  touches: number;
}

export interface TimeframeReading {
  timeframe: Timeframe;
  bias: Bias;
  score: number; // -100..100
  momentum: number;
  trendStrength: number;
  volatilityPct: number;
  notes: string[];
}

export type MarketRegime =
  | "trending-up"
  | "trending-down"
  | "ranging"
  | "high-volatility"
  | "compression";

export interface MarketOverview {
  price: number;
  trend: Bias;
  trendStrength: number;
  structure: "higher-highs-higher-lows" | "lower-highs-lower-lows" | "range" | "transition";
  structureNotes: string;
  momentum: string;
  volatility: { atrPct: number; label: "low" | "normal" | "elevated" | "high" };
  volume: { ratio: number; label: "thin" | "normal" | "expanding" | "climactic" };
  regime: MarketRegime;
  regimeLabel: string;
  supports: Level[];
  resistances: Level[];
  indicators: IndicatorSnapshot;
  keyLevelNote: string;
}

export interface ScenarioLevels {
  entryLow: number;
  entryHigh: number;
  stop: number;
  targets: number[];
  invalidation: number;
}

export interface SetupReason {
  label: string;
  detail: string;
}

export interface TradeSetup {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  direction: Direction;
  timeframe: Timeframe;
  style: TradingStyle;
  entryLow: number;
  entryHigh: number;
  stop: number;
  takeProfit: number;
  /** Risk/reward as R multiple of the first target. */
  riskReward: number;
  quality: SetupQuality;
  /** Regime of the timeframe this setup was generated on. */
  regime: MarketRegime;
  regimeLabel: string;
  confidence: number; // 0..100, AI-estimated
  score: number; // -100..100 composite
  rationale: SetupReason[];
  invalidatedIf: string[];
  riskNote: string;
  createdAt: number;
  /** Price used when the setup was generated. */
  referencePrice: number;
  /** True when the setup came from demo market data. */
  demo: boolean;
  /** 'open' while actionable, 'invalidated' once price breaks the plan. */
  status: "open" | "invalidated" | "triggered" | "expired";
}

export interface AnalysisScenario {
  name: string;
  probability: "most likely" | "alternative" | "low probability";
  summary: string;
  triggers: string;
}

export interface AIAnalysis {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  timeframe: Timeframe;
  source: DataSource;
  provider: string;
  asOf: number;
  price: number;
  overview: MarketOverview;
  timeframes: TimeframeReading[];
  /** Timeframes analysed but not shown on the current plan. */
  hiddenTimeframes: Timeframe[];
  overallBias: Bias;
  overallScore: number;
  biasExplanation: string;
  scenarios: AnalysisScenario[];
  setups: TradeSetup[];
  riskNotes: string[];
  narrative: string;
  engine: string;
  dataDisclaimer: string;
}

export interface ScannedAsset {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  changePct: number;
  source: DataSource;
  bias: Bias;
  score: number;
  regime: MarketRegime;
  volatilityPct: number;
  setup: TradeSetup | null;
  headline: string;
}

export interface ScanFilters {
  assetClasses: AssetClass[];
  style: TradingStyle;
  risk: RiskPreference;
  limit: number;
}

export interface RiskInput {
  symbol: string;
  balance: number;
  riskPct: number;
  entry: number;
  stop: number;
  takeProfit: number;
  direction: Direction;
  leverage?: number;
  /** Existing open exposure in account currency, optional for context. */
  openExposure?: number;
}

export interface RiskResult {
  valid: boolean;
  errors: string[];
  symbol: string;
  direction: Direction;
  maxRiskAmount: number;
  stopDistance: number;
  stopDistancePct: number;
  takeProfitDistance: number;
  positionSize: number; // units of the base asset
  notional: number;
  marginRequired: number | null;
  potentialLoss: number;
  potentialProfit: number;
  riskReward: number;
  breakEvenMove: number;
  exposurePct: number;
  warnings: string[];
}

export interface Position {
  id: string;
  symbol: string;
  direction: Direction;
  entry: number;
  size: number;
  stop: number | null;
  takeProfit: number | null;
  openedAt: number;
  closedAt: number | null;
  exitPrice: number | null;
  pnl: number | null;
  pnlPct: number | null;
  setupId: string | null;
  notes: string;
  source: "manual" | "ai-setup";
}

export interface JournalEntry {
  id: string;
  symbol: string;
  direction: Direction;
  entry: number;
  exit: number;
  stop: number | null;
  takeProfit: number | null;
  size: number;
  strategy: TradingStyle | "other";
  result: "win" | "loss" | "breakeven";
  pnl: number;
  notes: string;
  tags: string[];
  openedAt: number;
  closedAt: number;
  rMultiple: number | null;
}

export interface JournalInsight {
  id: string;
  title: string;
  detail: string;
  severity: "positive" | "watch" | "risk";
  metric?: string;
  sampleSize: number;
}

export interface EquityPoint {
  t: number;
  equity: number;
}

export interface PortfolioSummary {
  currency: string;
  startingEquity: number;
  totalEquity: number;
  availableBalance: number;
  unrealizedPnl: number;
  realizedPnl: number;
  dailyPnl: number;
  weeklyPnl: number;
  monthlyPnl: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  trades: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  riskExposurePct: number;
  equityCurve: EquityPoint[];
  dailyPnlSeries: { t: number; pnl: number }[];
  allocation: { label: string; value: number; pct: number }[];
  bySymbol: { symbol: string; trades: number; pnl: number; winRate: number }[];
  byStyle: { style: string; trades: number; pnl: number; winRate: number }[];
}

export interface AlertRule {
  id: string;
  symbol: string;
  kind:
    | "price-above"
    | "price-below"
    | "breakout"
    | "trend-change"
    | "ai-opportunity"
    | "risk"
    | "economic-event";
  value: number | null;
  note: string;
  active: boolean;
  createdAt: number;
}

export interface AlertEvent {
  id: string;
  ruleId: string | null;
  symbol: string;
  kind: AlertRule["kind"];
  title: string;
  detail: string;
  createdAt: number;
  read: boolean;
}

export interface EconomicEvent {
  id: string;
  time: number;
  title: string;
  currency: string;
  impact: "high" | "medium" | "low";
  forecast: string;
  previous: string;
}

export interface DailyBriefing {
  date: string;
  generatedAt: number;
  source: DataSource;
  headline: string;
  marketOverview: { symbol: string; name: string; bias: Bias; note: string; changePct: number }[];
  opportunities: { symbol: string; direction: Direction; quality: SetupQuality; summary: string }[];
  events: EconomicEvent[];
  volatilityNote: string;
  risks: string[];
  watchlistToday: string[];
}

export interface UserPreferences {
  markets: AssetClass[];
  style: TradingStyle;
  experience: Experience;
  riskPreference: RiskPreference;
  defaultRiskPct: number;
  defaultBalance: number;
  currency: string;
  briefingTime: string;
  alertsEnabled: boolean;
  compactMode: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  createdAt: number;
  onboardedAt: number | null;
  preferences: UserPreferences;
  watchlist: string[];
}

export interface UsageLimits {
  plan: Plan;
  analysesUsedToday: number;
  analysesLimit: number | null;
  scansUsedToday: number;
  scansLimit: number | null;
  chatsUsedToday: number;
  chatsLimit: number | null;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** Structured blocks the assistant attached (levels, tables, links). */
  blocks?: ChatBlock[];
  /** Data sources consulted, shown for transparency. */
  sources?: string[];
}

export type ChatBlock =
  | { type: "levels"; symbol: string; rows: { label: string; value: string }[] }
  | { type: "table"; title: string; columns: string[]; rows: string[][] }
  | { type: "note"; tone: "info" | "warn"; text: string }
  | { type: "link"; href: string; label: string };

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

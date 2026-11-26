/**
 * AI Trading Copilot.
 *
 * Intent routing over the product's own data. The copilot is grounded: it can
 * only speak about instruments in the catalogue and figures it actually
 * computed. When a question needs data we do not have (news, order flow,
 * another broker's balances) it says so explicitly rather than improvising.
 */

import { INSTRUMENTS } from "../instruments";
import type {
  AIAnalysis,
  ChatBlock,
  ChatMessage,
  Direction,
  JournalEntry,
  PortfolioSummary,
  SetupQuality,
} from "../types";
import { TIMEFRAME_LABEL } from "../types";
import { fmtMoney, fmtPct, fmtPrice, fmtQty } from "../format";

export interface ChatContext {
  analyses: Map<string, AIAnalysis>;
  portfolio: PortfolioSummary | null;
  journal: JournalEntry[];
  journalInsights: { title: string; detail: string; severity: string }[];
  riskDefaults: { balance: number; riskPct: number };
  watchlist: string[];
  plan: string;
}

export interface CopilotReply {
  content: string;
  blocks?: ChatBlock[];
  sources?: string[];
  /** Instruments the reply referenced, so the client can offer a jump link. */
  symbols: string[];
}

const DISCLAIMER =
  "Analysis and educational information only — not investment advice, and not a guarantee of results.";

/** Resolve "BTC", "bitcoin", "gold", "nasdaq", "eurusd" etc. to a symbol. */
export function resolveSymbol(text: string): string | null {
  const t = text.toLowerCase();
  const aliases: Record<string, string> = {
    bitcoin: "BTC/USD",
    btc: "BTC/USD",
    ethereum: "ETH/USD",
    eth: "ETH/USD",
    solana: "SOL/USD",
    sol: "SOL/USD",
    gold: "XAU/USD",
    xau: "XAU/USD",
    "gold spot": "XAU/USD",
    oil: "WTI/USD",
    wti: "WTI/USD",
    crude: "WTI/USD",
    euro: "EUR/USD",
    eurusd: "EUR/USD",
    eur: "EUR/USD",
    cable: "GBP/USD",
    gbpusd: "GBP/USD",
    sterling: "GBP/USD",
    yen: "USD/JPY",
    usdjpy: "USD/JPY",
    jpy: "USD/JPY",
    apple: "AAPL",
    aapl: "AAPL",
    nvidia: "NVDA",
    nvda: "NVDA",
    tesla: "TSLA",
    tsla: "TSLA",
    nasdaq: "NASDAQ",
    ndx: "NASDAQ",
    "s&p": "S&P 500",
    "s&p 500": "S&P 500",
    sp500: "S&P 500",
    spx: "S&P 500",
    dax: "DAX",
    gdaxi: "DAX",
  };

  // 1. Multi-word aliases first ("s&p 500", "gold spot") — longest wins.
  const multiWord = Object.keys(aliases)
    .filter((k) => k.includes(" "))
    .sort((a, b) => b.length - a.length);
  for (const key of multiWord) {
    if (t.includes(key)) return aliases[key];
  }

  // 2. Exact symbol mentions: "btc/usd", "s&p 500", "aapl".
  const symbols = [...INSTRUMENTS].sort((a, b) => b.symbol.length - a.symbol.length);
  for (const inst of symbols) {
    const needle = inst.symbol.toLowerCase();
    // Word-boundary match so "eth" inside "something" cannot match.
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    if (re.test(t)) return inst.symbol;
  }

  // 3. Single-token aliases, matched against whole words only.
  const words = t.replace(/[^a-z0-9&/\s]/g, " ").split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (aliases[w]) return aliases[w];
  }

  // 4. Multi-character aliases embedded in a token (e.g. "eurusd").
  const compact = t.replace(/[^a-z0-9]/g, "");
  for (const key of Object.keys(aliases).sort((a, b) => b.length - a.length)) {
    if (key.length >= 4 && !key.includes(" ") && compact.includes(key)) return aliases[key];
  }

  return null;
}

type Intent =
  | "analyze"
  | "opportunities"
  | "compare"
  | "position-size"
  | "portfolio"
  | "journal-review"
  | "explain-setup"
  | "journal-what"
  | "help"
  | "data-unavailable";

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/(compare|vs\.?|versus|better|which is stronger)/.test(t)) return "compare";
  if (/(position size|size my|how much should i (risk|buy|trade)|risk calculator|lot size)/.test(t))
    return "position-size";
  if (/(review|analy[sz]e|look at).{0,24}(trades|journal|history|performance|last \d+)/.test(t))
    return "journal-review";
  if (/(my (portfolio|account|p&l|equity|balance|performance))/.test(t)) return "portfolio";
  if (/(find|scan|any|show me|best).{0,20}(opportunit|setup|trade|signal)/.test(t)) return "opportunities";
  if (/(why|explain).{0,30}(setup|trade|this)/.test(t)) return "explain-setup";
  if (/(what (should|can) i|help|how do i|how does|what is tradia)/.test(t)) return "help";
  if (/(news|sentiment|funding|order book|liquidations|whale|on-?chain|earnings call|twitter|x\.com|economy today)/.test(t))
    return "data-unavailable";
  if (/(analy[sz]e|analysis|outlook|view on|what.{0,12}(happening|going on)|how is)/.test(t)) return "analyze";
  return "help";
}

function qualityWord(q: SetupQuality): string {
  return q === "high" ? "high-confluence" : q === "medium" ? "moderate-confluence" : "low-confluence";
}

function setupBlocks(analysis: AIAnalysis): ChatBlock[] {
  const setup = analysis.setups[0];
  if (!setup) return [];
  return [
    {
      type: "levels",
      symbol: analysis.symbol,
      rows: [
        { label: "Direction", value: `${setup.direction.toUpperCase()} · ${TIMEFRAME_LABEL[setup.timeframe]}` },
        { label: "Entry zone", value: `${fmtPrice(setup.entryLow, setup.symbol)} – ${fmtPrice(setup.entryHigh, setup.symbol)}` },
        { label: "Stop loss", value: fmtPrice(setup.stop, setup.symbol) },
        { label: "First target", value: fmtPrice(setup.takeProfit, setup.symbol) },
        { label: "Reward / risk", value: `${setup.riskReward.toFixed(1)} : 1` },
        { label: "AI confidence", value: `${setup.confidence}/100 (${qualityWord(setup.quality)})` },
      ],
    },
  ];
}

export function buildReply(
  message: string,
  ctx: ChatContext,
  _recent: ChatMessage[] = [],
): CopilotReply {
  const intent = detectIntent(message);
  const symbol = resolveSymbol(message);
  const sources: string[] = [];

  // ── Comparison ────────────────────────────────────────────────
  if (intent === "compare") {
    const mentioned = INSTRUMENTS.filter((i) => {
      const t = message.toLowerCase();
      return t.includes(i.symbol.toLowerCase()) || t.includes(i.name.toLowerCase().split(" ")[0].toLowerCase());
    }).filter((i) => resolveSymbol(i.symbol) === i.symbol);
    const withData = mentioned.map((i) => ctx.analyses.get(i.symbol)).filter(Boolean) as AIAnalysis[];
    if (withData.length < 2) {
      const a = symbol ? ctx.analyses.get(symbol) : null;
      if (!a) {
        return {
          content: `I need two instruments I have current data for to compare. I can analyse ${INSTRUMENTS.slice(0, 6)
            .map((i) => i.symbol)
            .join(", ")} and more — name two of them (for example "compare BTC and ETH") and I'll build the comparison from the same engine output used in the AI Analyst.`,
          sources: ["Instrument catalogue"],
          symbols: [],
        };
      }
      return {
        content: `I have a current read on ${a.symbol} but not a second instrument in that question. Name the pair you want compared — for example "${a.symbol} vs ETH/USD" — and I'll rank them on trend, momentum, volatility and setup quality.`,
        sources: ["AI Analyst cache"],
        symbols: [a.symbol],
      };
    }
    const rows = withData.map((a) => {
      const best = a.setups[0];
      return [
        a.symbol,
        a.overallBias,
        `${a.overallScore > 0 ? "+" : ""}${a.overallScore}`,
        a.overview.regimeLabel,
        `${a.overview.volatility.atrPct.toFixed(2)}%`,
        best ? `${best.direction.toUpperCase()} ${TIMEFRAME_LABEL[best.timeframe]} ${best.quality}` : "none",
        best ? `${best.riskReward.toFixed(1)}:1` : "—",
      ];
    });
    const ranked = [...withData].sort((a, b) => Math.abs(b.overallScore) - Math.abs(a.overallScore));
    const winner = ranked[0];
    const loser = ranked[ranked.length - 1];
    sources.push(...withData.map((a) => `${a.symbol} · ${a.source === "demo" ? "DEMO DATA" : "live feed"}`));

    return {
      content: `${winner.symbol} carries the cleaner directional read than ${loser.symbol}.\n\n${winner.symbol} scores ${winner.overallScore > 0 ? "+" : ""}${winner.overallScore} with a ${winner.overview.regimeLabel.toLowerCase()} regime and ${winner.overview.volatility.atrPct.toFixed(2)}% ATR. ${loser.symbol} scores ${loser.overallScore > 0 ? "+" : ""}${loser.overallScore} in a ${loser.overview.regimeLabel.toLowerCase()} regime.\n\n"Cleaner" means the timeframes agree more and the volatility supports a defined stop, not that it will go up. A cleaner read with a ${winner.setups[0] ? `${winner.setups[0].riskReward.toFixed(1)}:1` : "defined"} reward-to-risk is a better use of risk than a noisy one at the same size.\n\n${DISCLAIMER}`,
      blocks: [
        {
          type: "table",
          title: "Side-by-side (engine output)",
          columns: ["Asset", "Bias", "Score", "Regime", "ATR", "Best setup", "R/R"],
          rows,
        },
      ],
      sources,
      symbols: withData.map((a) => a.symbol),
    };
  }

  // ── Position sizing ───────────────────────────────────────────
  if (intent === "position-size") {
    const analysis = symbol ? ctx.analyses.get(symbol) : null;
    const setup = analysis?.setups[0];
    const balance = ctx.riskDefaults.balance;
    const riskPct = ctx.riskDefaults.riskPct;
    if (!setup) {
      return {
        content: `I can size a trade, but I need an entry and a stop — sizing without a stop is guessing. ${symbol ? `I don't have a live setup for ${symbol} right now.` : "Tell me the instrument and your levels."} \n\nOpen the Risk Manager and enter entry, stop and target: it returns position size, dollar risk, reward-to-risk and portfolio heat instantly. Or say "analyze ${symbol ?? "BTC"}" and I'll generate a setup with a defined stop, then size it for you.\n\nFor reference, your saved defaults are ${fmtMoney(balance)} balance at ${riskPct}% risk per trade, which is ${fmtMoney((balance * riskPct) / 100)} of risk.`,
        sources: ["Risk defaults"],
        symbols: symbol ? [symbol] : [],
      };
    }
    const riskAmount = (balance * riskPct) / 100;
    const entry = (setup.entryLow + setup.entryHigh) / 2;
    const stopDist = Math.abs(entry - setup.stop);
    const size = stopDist > 0 ? riskAmount / stopDist : 0;
    const notional = size * entry;
    sources.push(`${analysis!.symbol} setup`, "Risk defaults");

    return {
      content: `Sizing the ${analysis!.symbol} ${setup.direction} at your defaults (${fmtMoney(balance)} equity, ${riskPct}% risk):\n\nRisking ${fmtMoney(riskAmount)} over a stop distance of ${fmtPrice(stopDist, analysis!.symbol)} gives a position of ${fmtQty(size, analysis!.symbol)} (notional ${fmtMoney(notional)}, ${((notional / balance) * 100).toFixed(0)}% of equity).\n\nIf the stop is hit you lose ${fmtMoney(riskAmount)}. At the ${setup.riskReward.toFixed(1)}:1 target you make ${fmtMoney(riskAmount * setup.riskReward)}.\n\nOne caveat: this assumes the stop fills at your price. On a gap or a fast market, slippage makes the real loss larger — which is why the stop should never be the only thing between you and a bad outcome.\n\n${DISCLAIMER}`,
      blocks: [
        {
          type: "levels",
          symbol: analysis!.symbol,
          rows: [
            { label: "Reference entry", value: fmtPrice(entry, analysis!.symbol) },
            { label: "Stop", value: fmtPrice(setup.stop, analysis!.symbol) },
            { label: "Position size", value: fmtQty(size, analysis!.symbol) },
            { label: "Notional", value: fmtMoney(notional) },
            { label: "Risk", value: fmtMoney(riskAmount) },
            { label: "Target profit", value: fmtMoney(riskAmount * setup.riskReward) },
          ],
        },
        { type: "link", href: "/risk", label: "Open Risk Manager with these levels" },
      ],
      sources,
      symbols: [analysis!.symbol],
    };
  }

  // ── Portfolio ─────────────────────────────────────────────────
  if (intent === "portfolio") {
    const p = ctx.portfolio;
    if (!p) {
      return {
        content: "I don't have portfolio data for this account yet. Once you open a paper trade or log a journal entry, I can analyse equity, win rate, profit factor and risk exposure. I won't estimate figures I don't have.",
        sources: ["Paper trading ledger"],
        symbols: [],
      };
    }
    sources.push("Paper trading ledger", "Journal");
    return {
      content: `Your paper account: equity ${fmtMoney(p.totalEquity)} (${p.realizedPnl >= 0 ? "+" : ""}${fmtMoney(p.realizedPnl)} realised), ${p.trades} closed trades at a ${p.winRate.toFixed(0)}% win rate, profit factor ${p.profitFactor.toFixed(2)}, max drawdown ${p.maxDrawdownPct.toFixed(1)}%. Open risk is ${p.riskExposurePct.toFixed(1)}% of equity.\n\n${p.riskExposurePct > 6 ? `That open risk is above the 6% portfolio-heat guideline. Reducing or hedging one position would restore headroom before you take another trade.` : `Exposure is within a reasonable band. The constraint on growth right now is ${p.winRate < 45 ? "win rate" : p.profitFactor < 1.3 ? "payoff size" : "opportunity count"}, not size.`}\n\nRemember this is PAPER TRADING performance — simulated, and not comparable to live results.\n\n${DISCLAIMER}`,
      blocks: [
        {
          type: "table",
          title: "Account summary (paper)",
          columns: ["Metric", "Value"],
          rows: [
            ["Total equity", fmtMoney(p.totalEquity)],
            ["Available balance", fmtMoney(p.availableBalance)],
            ["Unrealised P&L", fmtMoney(p.unrealizedPnl, { sign: true })],
            ["Daily P&L", fmtMoney(p.dailyPnl, { sign: true })],
            ["Win rate", `${p.winRate.toFixed(1)}%`],
            ["Profit factor", p.profitFactor.toFixed(2)],
            ["Max drawdown", `${p.maxDrawdownPct.toFixed(2)}%`],
            ["Risk exposure", `${p.riskExposurePct.toFixed(1)}%`],
          ],
        },
      ],
      symbols: [],
    };
  }

  // ── Journal review ────────────────────────────────────────────
  if (intent === "journal-review") {
    const n = ctx.journal.length;
    if (n === 0) {
      return {
        content: "Your journal is empty, so I have nothing to review — and I won't invent a pattern from zero trades. Log a few closed trades (or close a paper position, which can be copied across in one click) and I'll analyse style, hold time, payoff ratio and stop discipline.",
        sources: ["Journal"],
        symbols: [],
      };
    }
    const insights = ctx.journalInsights.slice(0, 3);
    sources.push(`Journal · ${n} recorded trades`);
    const lines = insights.map((i, idx) => `${idx + 1}. ${i.title} — ${i.detail}`).join("\n\n");
    return {
      content: `Reviewing your ${n} recorded trades:\n\n${lines}\n\n${n < 8 ? "Sample size is small, so treat these as hypotheses rather than conclusions." : "These observations are drawn from your own history, not a general template."}\n\n${DISCLAIMER}`,
      blocks: [
        {
          type: "note",
          tone: "info",
          text: "Journal analysis is based only on trades you recorded. Missing entries bias every conclusion below.",
        },
        { type: "link", href: "/journal", label: "Open Trading Journal" },
      ],
      sources,
      symbols: [],
    };
  }

  // ── Opportunities ─────────────────────────────────────────────
  if (intent === "opportunities") {
    const all = [...ctx.analyses.values()];
    const withSetups = all
      .filter((a) => a.setups.length)
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 } as const;
        return rank[a.setups[0].quality] - rank[b.setups[0].quality] || b.setups[0].confidence - a.setups[0].confidence;
      });
    if (!all.length) {
      return {
        content:
          "I don't have a scan in memory yet. Run the Market Scanner (or ask me to analyse a specific instrument) and I'll rank what the engine found. I won't list opportunities I haven't actually computed.",
        sources: [],
        symbols: [],
      };
    }
    if (!withSetups.length) {
      return {
        content: `I checked ${all.length} instruments with current engine data and none clears the confluence threshold for an actionable setup right now. ${all
          .slice(0, 4)
          .map((a) => `${a.symbol} is ${a.overallBias} in a ${a.overview.regimeLabel.toLowerCase()} regime`)
          .join("; ")}. Standing aside is a valid decision — the scanner re-evaluates on the next refresh.`,
        sources: all.slice(0, 4).map((a) => `${a.symbol} · engine read`),
        symbols: all.slice(0, 4).map((a) => a.symbol),
      };
    }
    sources.push(...withSetups.slice(0, 5).map((a) => `${a.symbol} · engine read`));
    return {
      content: `Ranked from the ${all.length} instruments with current data. Quality reflects confluence across trend, structure, momentum, volume and reward-to-risk — not a probability of profit.\n\n${withSetups
        .slice(0, 4)
        .map(
          (a, i) =>
            `${i + 1}. ${a.symbol} — ${a.setups[0].direction.toUpperCase()} ${TIMEFRAME_LABEL[a.setups[0].timeframe]}, ${a.setups[0].quality} quality, ${a.setups[0].riskReward.toFixed(1)}:1. ${a.setups[0].rationale[0]?.detail ?? ""}`,
        )
        .join("\n\n")}\n\nEvery one of these can be wrong. The stop and the invalidation condition are the parts that do the work.\n\n${DISCLAIMER}`,
      blocks: [
        {
          type: "table",
          title: "Ranked opportunities",
          columns: ["#", "Asset", "Side", "TF", "Quality", "R/R", "Confidence"],
          rows: withSetups.slice(0, 6).map((a, i) => [
            String(i + 1),
            a.symbol,
            a.setups[0].direction.toUpperCase(),
            TIMEFRAME_LABEL[a.setups[0].timeframe],
            a.setups[0].quality,
            `${a.setups[0].riskReward.toFixed(1)}:1`,
            `${a.setups[0].confidence}/100`,
          ]),
        },
      ],
      sources,
      symbols: withSetups.slice(0, 4).map((a) => a.symbol),
    };
  }

  // ── Explicitly unavailable data ───────────────────────────────
  if (intent === "data-unavailable") {
    return {
      content: `I don't have that data connected. TRADIA AI analyses price structure, momentum, volatility, volume and levels from the connected market-data feed — it does not ingest news wires, social sentiment, funding rates, order-book depth or on-chain flows.\n\nRather than guess at sentiment or repeat a headline I can't verify, I'll tell you what I can see: for ${symbol ?? "any instrument in your watchlist"} I can give you trend, regime, key levels and a risk-defined setup. If a news event is driving the move, it will show up as abnormal volume or a volatility spike in the data — which I can flag.\n\nData availability note: the current feed is ${
        [...ctx.analyses.values()][0]?.source === "demo"
          ? "DEMO DATA (simulated, for product evaluation)"
          : "a live market-data feed"
      }.`,
      sources: ["Capability boundary"],
      symbols: symbol ? [symbol] : [],
    };
  }

  // ── Explain a setup ───────────────────────────────────────────
  if (intent === "explain-setup") {
    const target = symbol ? ctx.analyses.get(symbol) : [...ctx.analyses.values()].find((a) => a.setups.length);
    const setup = target?.setups[0];
    if (!setup || !target) {
      return {
        content: "There's no setup in front of me to explain. Run an analysis first, then ask again — I'll walk through each confluence factor and the exact conditions that would invalidate it.",
        sources: [],
        symbols: [],
      };
    }
    sources.push(`${target.symbol} · engine read`);
    return {
      content: `Here is the reasoning behind the ${target.symbol} ${setup.direction.toUpperCase()} on the ${TIMEFRAME_LABEL[setup.timeframe]}, factor by factor:\n\n${setup.rationale
        .map((r) => `**${r.label}** — ${r.detail}`)
        .join("\n\n")}\n\n**What kills it:** ${setup.invalidatedIf.join(" ")}\n\n**Risk:** ${setup.riskNote}\n\nThe confidence figure (${setup.confidence}/100) is an AI estimate of how much confluence is present — not a probability of profit. A high-confluence setup fails regularly; the point of the stop is that a failure is survivable.\n\n${DISCLAIMER}`,
      blocks: setupBlocks(target),
      sources,
      symbols: [target.symbol],
    };
  }

  // ── Single instrument analysis ────────────────────────────────
  if (intent === "analyze") {
    if (!symbol) {
      const watch = ctx.watchlist.slice(0, 5);
      return {
        content: `Tell me which instrument to analyse. ${watch.length ? `You're watching ${watch.join(", ")} — ` : ""}I can cover ${INSTRUMENTS.map((i) => i.symbol).join(", ")}, and I'll return trend, regime, multi-timeframe bias, key levels and any risk-defined setup the engine finds.`,
        sources: ["Instrument catalogue"],
        symbols: [],
      };
    }
    const analysis = ctx.analyses.get(symbol);
    if (!analysis) {
      return {
        content: `I don't have a current analysis cached for ${symbol}. Open the AI Analyst for ${symbol} and run "Analyze with AI" — that computes the full read — then I can discuss it with the exact figures. I won't describe a chart I haven't computed.`,
        sources: [],
        symbols: [symbol],
      };
    }
    sources.push(`${symbol} · ${analysis.source === "demo" ? "DEMO DATA" : "live feed"} · ${new Date(analysis.asOf).toISOString()}`);
    const best = analysis.setups[0];
    return {
      content: `${analysis.name} (${symbol}) at ${fmtPrice(analysis.price, symbol)} — ${analysis.overallBias} bias (score ${analysis.overallScore > 0 ? "+" : ""}${analysis.overallScore}), ${analysis.overview.regimeLabel.toLowerCase()} regime.\n\n${analysis.overview.structureNotes} ${analysis.overview.momentum}.\n\n${analysis.biasExplanation}\n\n${best ? `The engine flags a ${best.direction.toUpperCase()} on the ${TIMEFRAME_LABEL[best.timeframe]} — ${best.quality} confluence, entry ${fmtPrice(best.entryLow, symbol)}–${fmtPrice(best.entryHigh, symbol)}, stop ${fmtPrice(best.stop, symbol)}, target ${fmtPrice(best.takeProfit, symbol)} (${best.riskReward.toFixed(1)}:1).` : "No setup clears the confluence threshold right now — noted, but not actionable."}\n\n${analysis.overview.keyLevelNote}\n\n${DISCLAIMER}`,
      blocks: [
        ...setupBlocks(analysis),
        {
          type: "table",
          title: "Timeframe alignment",
          columns: ["TF", "Bias", "Score"],
          rows: analysis.timeframes.map((r) => [TIMEFRAME_LABEL[r.timeframe], r.bias, `${r.score > 0 ? "+" : ""}${r.score}`]),
        },
      ],
      sources,
      symbols: [symbol],
    };
  }

  // ── Help / default ────────────────────────────────────────────
  const examples = [
    "Analyze BTC/USD",
    "Find potential opportunities",
    "Compare BTC and ETH",
    "Why is gold moving?",
    "Calculate my position size for the ETH setup",
    "Review my last 20 trades",
    "What does 'confluence' mean here?",
  ];
  return {
    content: `I'm the TRADIA AI trading copilot. I work from the data inside this workspace — the market feed, the analysis engine, your paper trades and your journal.\n\nThings I can do right now:\n${examples.map((e) => `· ${e}`).join("\n")}\n\nWhat I won't do: claim a probability of profit, invent prices, or describe data I don't have (news, sentiment, order flow). If you ask for something outside the connected data, I'll say so directly.\n\n${DISCLAIMER}`,
    sources: ["Copilot capability map"],
    symbols: [],
  };
}

/** Compact context block injected when an LLM provider is configured. */
export function buildGroundedSummary(ctx: ChatContext): string {
  const analyses = [...ctx.analyses.values()].slice(0, 6).map((a) => ({
    symbol: a.symbol,
    price: a.price,
    bias: a.overallBias,
    score: a.overallScore,
    regime: a.overview.regime,
    atrPct: a.overview.volatility.atrPct,
    setup: a.setups[0]
      ? {
          direction: a.setups[0].direction as Direction,
          timeframe: a.setups[0].timeframe,
          entry: [a.setups[0].entryLow, a.setups[0].entryHigh],
          stop: a.setups[0].stop,
          target: a.setups[0].takeProfit,
          rr: a.setups[0].riskReward,
          quality: a.setups[0].quality as SetupQuality,
        }
      : null,
    source: a.source,
  }));
  return JSON.stringify({ analyses, portfolio: ctx.portfolio ? { equity: ctx.portfolio.totalEquity, winRate: ctx.portfolio.winRate, trades: ctx.portfolio.trades } : null, riskDefaults: ctx.riskDefaults });
}

export { DISCLAIMER, fmtPct };

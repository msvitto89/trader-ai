import type { Candle, IndicatorSnapshot, Level } from "./types";

/** Exponential moving average series (seeded with SMA). */
export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function stdev(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j++) mean += values[j];
    mean /= period;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine = values.map((_, i) =>
    Number.isFinite(fastEma[i]) && Number.isFinite(slowEma[i]) ? fastEma[i] - slowEma[i] : NaN,
  );
  const defined = macdLine.filter((v) => Number.isFinite(v));
  const signalDefined = ema(defined, signalPeriod);
  const offset = macdLine.findIndex((v) => Number.isFinite(v));
  const signal = new Array(values.length).fill(NaN);
  signalDefined.forEach((v, i) => {
    if (Number.isFinite(v)) signal[offset + i] = v;
  });
  const histogram = macdLine.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(signal[i]) ? v - signal[i] : NaN,
  );
  return { macdLine, signal, histogram };
}

export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period + 1) return out;
  const trs: number[] = [NaN];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(
      Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c)),
    );
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  let prevAtr = sum / period;
  out[period] = prevAtr;
  for (let i = period + 1; i < candles.length; i++) {
    prevAtr = (prevAtr * (period - 1) + trs[i]) / period;
    out[i] = prevAtr;
  }
  return out;
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const sd = stdev(values, period);
  const upper = mid.map((m, i) => (Number.isFinite(sd[i]) ? m + mult * sd[i] : NaN));
  const lower = mid.map((m, i) => (Number.isFinite(sd[i]) ? m - mult * sd[i] : NaN));
  return { mid, upper, lower };
}

export function stochastic(candles: Candle[], period = 14, smoothK = 3, smoothD = 3) {
  const raw: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].h);
      ll = Math.min(ll, candles[j].l);
    }
    raw[i] = hh === ll ? 50 : ((candles[i].c - ll) / (hh - ll)) * 100;
  }
  const kSeries = sma(raw.filter(Number.isFinite), smoothK);
  const k: number[] = new Array(candles.length).fill(NaN);
  const firstIdx = raw.findIndex(Number.isFinite);
  kSeries.forEach((v, i) => {
    if (Number.isFinite(v)) k[firstIdx + i] = v;
  });
  const dSeries = sma(k.filter(Number.isFinite), smoothD);
  const d: number[] = new Array(candles.length).fill(NaN);
  const kFirst = k.findIndex(Number.isFinite);
  dSeries.forEach((v, i) => {
    if (Number.isFinite(v)) d[kFirst + i] = v;
  });
  return { k, d };
}

export function obv(candles: Candle[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const dir = Math.sign(candles[i].c - candles[i - 1].c);
    out.push(out[i - 1] + dir * candles[i].v);
  }
  return out;
}

/** Wilders ADX with +DI/-DI. Returns 0..100 trend strength. */
export function adx(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period * 2) return out;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const upMove = c.h - p.h;
    const downMove = p.l - c.l;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  const smooth = (arr: number[]) => {
    const s: number[] = new Array(arr.length).fill(NaN);
    let acc = 0;
    for (let i = 1; i <= period; i++) acc += arr[i];
    s[period] = acc;
    for (let i = period + 1; i < arr.length; i++) {
      acc = acc - acc / period + arr[i];
      s[i] = acc;
    }
    return s;
  };
  const trS = smooth(tr);
  const pS = smooth(plusDM);
  const mS = smooth(minusDM);
  const dx: number[] = new Array(candles.length).fill(NaN);
  for (let i = period; i < candles.length; i++) {
    if (!Number.isFinite(trS[i]) || trS[i] === 0) continue;
    const pdi = (100 * pS[i]) / trS[i];
    const mdi = (100 * mS[i]) / trS[i];
    const denom = pdi + mdi;
    dx[i] = denom === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / denom;
  }
  // Wilder-smooth the DX into ADX
  let firstIdx = -1;
  for (let i = 0; i < dx.length; i++) {
    if (Number.isFinite(dx[i])) {
      firstIdx = i;
      break;
    }
  }
  if (firstIdx < 0) return out;
  let acc = 0;
  let count = 0;
  let i = firstIdx;
  for (; i < dx.length && count < period; i++) {
    if (Number.isFinite(dx[i])) {
      acc += dx[i];
      count++;
    }
  }
  if (count < period) return out;
  let prevAdx = acc / period;
  out[i - 1] = prevAdx;
  for (; i < dx.length; i++) {
    if (!Number.isFinite(dx[i])) {
      out[i] = prevAdx;
      continue;
    }
    prevAdx = (prevAdx * (period - 1) + dx[i]) / period;
    out[i] = prevAdx;
  }
  return out;
}

const lastFinite = (arr: number[], fallback = 0): number => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return fallback;
};

/** Linear-regression slope, normalised to a fraction of price. */
export function normalizedSlope(values: number[], lookback = 20): number {
  const slice = values.slice(-lookback).filter(Number.isFinite);
  if (slice.length < 3) return 0;
  const n = slice.length;
  const meanX = (n - 1) / 2;
  const meanY = slice.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (slice[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const level = Math.abs(meanY) || 1;
  return (slope / level) * 100; // percent per bar
}

export function computeIndicators(candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((c) => c.c);
  const volumes = candles.map((c) => c.v);
  const price = closes[closes.length - 1] ?? 0;

  const ema20s = ema(closes, 20);
  const ema50s = ema(closes, 50);
  const ema200s = ema(closes, 200);
  const sma20s = sma(closes, 20);
  const rsiS = rsi(closes, 14);
  const m = macd(closes);
  const atrS = atr(candles, 14);
  const bb = bollinger(closes, 20, 2);
  const st = stochastic(candles);
  const obvS = obv(candles);
  const adxS = adx(candles, 14);

  const volWindow = volumes.slice(-20);
  const volAvg = volWindow.reduce((a, b) => a + b, 0) / Math.max(1, volWindow.length);
  const atrVal = lastFinite(atrS, price * 0.01);

  const bbUpper = lastFinite(bb.upper, price);
  const bbLower = lastFinite(bb.lower, price);
  const bbMid = lastFinite(bb.mid, price);

  return {
    ema20: lastFinite(ema20s, price),
    ema50: lastFinite(ema50s, price),
    ema200: lastFinite(ema200s, price),
    sma20: lastFinite(sma20s, price),
    rsi14: lastFinite(rsiS, 50),
    macd: {
      macd: lastFinite(m.macdLine, 0),
      signal: lastFinite(m.signal, 0),
      histogram: lastFinite(m.histogram, 0),
    },
    atr14: atrVal,
    atrPct: price ? (atrVal / price) * 100 : 0,
    bb: {
      upper: bbUpper,
      mid: bbMid,
      lower: bbLower,
      widthPct: bbMid ? ((bbUpper - bbLower) / bbMid) * 100 : 0,
    },
    stoch: { k: lastFinite(st.k, 50), d: lastFinite(st.d, 50) },
    obvSlope: normalizedSlope(obvS, 20),
    volumeRatio: volAvg ? volumes[volumes.length - 1] / volAvg : 1,
    adx: lastFinite(adxS, 20),
  };
}

/**
 * Swing-pivot based support/resistance. Clusters pivots within a
 * volatility-scaled tolerance so nearby wicks merge into one level.
 */
export function findLevels(candles: Candle[], price: number, atrValue: number, lookback = 180): Level[] {
  const slice = candles.slice(-lookback);
  const tol = Math.max(atrValue * 0.6, price * 0.0015);
  const pivots: { price: number; kind: "support" | "resistance" }[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    const c = slice[i];
    const isHigh = c.h > slice[i - 1].h && c.h > slice[i - 2].h && c.h > slice[i + 1].h && c.h > slice[i + 2].h;
    const isLow = c.l < slice[i - 1].l && c.l < slice[i - 2].l && c.l < slice[i + 1].l && c.l < slice[i + 2].l;
    if (isHigh) pivots.push({ price: c.h, kind: "resistance" });
    if (isLow) pivots.push({ price: c.l, kind: "support" });
  }

  const clusters: { price: number; touches: number; kind: "support" | "resistance" }[] = [];
  for (const p of pivots) {
    const hit = clusters.find((c) => Math.abs(c.price - p.price) <= tol);
    if (hit) {
      hit.price = (hit.price * hit.touches + p.price) / (hit.touches + 1);
      hit.touches += 1;
    } else {
      clusters.push({ price: p.price, touches: 1, kind: p.kind });
    }
  }

  return clusters
    .map((c) => ({
      price: c.price,
      // A level below price acts as support; above price as resistance.
      kind: (c.price <= price ? "support" : "resistance") as "support" | "resistance",
      touches: c.touches,
      strength: Math.min(1, 0.28 + c.touches * 0.18),
    }))
    .sort((a, b) => b.strength - a.strength);
}

/** Realised volatility of log returns, expressed in percent, annualised-ish per bar. */
export function realizedVol(values: number[], lookback = 30): number {
  const slice = values.slice(-lookback - 1);
  if (slice.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    rets.push(Math.log(slice[i] / slice[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * 100;
}

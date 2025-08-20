// src/lib/analyzer.js
const N = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const safe = (a, b) => (b > 0 ? a / b : 0);

export const OBJECTIVE_WEIGHTS = {
  OUTCOME_LEADS:           { ctr: 0.10, cpc: 0.15, cvr: 0.35, cpa: 0.30, roas: 0.10 },
  LEAD_GENERATION:         { ctr: 0.10, cpc: 0.15, cvr: 0.35, cpa: 0.30, roas: 0.10 },

  TRAFFIC:                 { ctr: 0.40, cpc: 0.40, cvr: 0.10, cpa: 0.00, roas: 0.10 },

  OUTCOME_ENGAGEMENT:      { ctr: 0.50, cpc: 0.30, cvr: 0.00, cpa: 0.00, roas: 0.20 },
  POST_ENGAGEMENT:         { ctr: 0.50, cpc: 0.30, cvr: 0.00, cpa: 0.00, roas: 0.20 },

  VIDEO_VIEWS:             { ctr: 0.25, cpc: 0.15, cvr: 0.00, cpa: 0.00, roas: 0.00, vvRate: 0.60 },
  OUTCOME_AWARENESS:       { ctr: 0.15, cpc: 0.10, cvr: 0.00, cpa: 0.00, roas: 0.00, reachEff: 0.65 },

  OUTCOME_SALES:           { ctr: 0.10, cpc: 0.10, cvr: 0.20, cpa: 0.20, roas: 0.40 },
  CONVERSIONS:             { ctr: 0.10, cpc: 0.10, cvr: 0.25, cpa: 0.25, roas: 0.30 },
};

// нормализуем метрики к [0..1], чем больше — тем лучше
function normalizeMetric(name, value) {
  const v = N(value);
  if (!Number.isFinite(v)) return 0;
  switch (name) {
    case "ctr":
    case "cr":
    case "cvr":
    case "vvRate": // video complete/view rate
    case "reachEff": // reach / impressions
    case "roas":
      return Math.max(0, Math.min(1, v / (name === "roas" ? 5 : 100))); // 5x ROAS => 1.0; 100% rate => 1.0
    case "cpc":
      return 1 - Math.min(1, v / 1.0); // 1$ CPC = 0; 0$=1
    case "cpa":
      return 1 - Math.min(1, v / 10.0); // 10$ CPA = 0
    default:
      return 0;
  }
}

// быстрый two-proportion z-test по кликам/показам или лидам/кликам
export function twoProportionZTest(convA, totA, convB, totB) {
  const a = N(convA), b = N(convB), na = N(totA), nb = N(totB);
  if (na === 0 || nb === 0) return { z: 0, p: 1 };
  const pa = a / na, pb = b / nb;
  const p = (a + b) / (na + nb);
  const se = Math.sqrt(p * (1 - p) * (1 / na + 1 / nb));
  if (se === 0) return { z: 0, p: 1 };
  const z = (pa - pb) / se;
  // p-value (двусторонняя)
  const pval = 2 * (1 - cdfStdNormal(Math.abs(z)));
  return { z, p: pval };
}

// стандартное норм. распределение CDF — быстрая аппроксимация
function cdfStdNormal(x) {
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = 1 - d * (1.330274 * Math.pow(t, 5) - 1.821256 * Math.pow(t, 4) + 1.781478 * Math.pow(t, 3) - 0.356538 * Math.pow(t, 2) + 0.3193815 * t);
  return prob;
}

// производные метрики из сырья
export function deriveMetrics(r) {
  const impressions = N(r.impressions);
  const clicks = N(r.clicks);
  const lp = N(r.pageviews);
  const leads = N(r.leads);
  const spend = N(r.spend);
  const reach = N(r.reach);

  const ctr = safe(clicks, impressions) * 100;
  const cr  = safe(leads, clicks) * 100;
  const cvr = safe(leads, lp) * 100;
  const cpc = safe(spend, clicks);
  const cpa = safe(spend, leads);
  const freq = reach > 0 ? impressions / reach : 0;

  // видео завершения, если придут — считаем общий rate (можно уточнить градации)
  const vvRate = N(r.video_plays_at_100) ? safe(N(r.video_plays_at_100), N(r.video_plays) || impressions) * 100 : 0;
  const reachEff = safe(reach, impressions) * 100;

  const roas = N(r.roas);

  return { impressions, clicks, lp, leads, spend, ctr, cr, cvr, cpc, cpa, freq, roas, vvRate, reachEff };
}

// скоринг под цель
export function scoreItem(r, objective) {
  const w = OBJECTIVE_WEIGHTS[objective] || OBJECTIVE_WEIGHTS.OUTCOME_LEADS;
  const d = deriveMetrics(r);

  const parts = [];
  const push = (k, val) => {
    if (w[k] && w[k] > 0) {
      parts.push({ k, w: w[k], s: normalizeMetric(k, val) });
    }
  };

  push("ctr", d.ctr);
  push("cpc", d.cpc);
  push("cvr", d.cvr);
  push("cpa", d.cpa);
  push("roas", d.roas);
  push("vvRate", d.vvRate);
  push("reachEff", d.reachEff);

  const score = parts.reduce((acc, p) => acc + p.w * p.s, 0);
  // нормируем на сумму весов, чтобы всегда 0..1
  const denom = parts.reduce((a, p) => a + p.w, 0) || 1;
  return { score: score / denom, detail: parts, derived: d };
}

// сравнение 2 креативов: кто лучше и насколько «достоверно»
export function comparePair(a, b, objective) {
  const sa = scoreItem(a, objective);
  const sb = scoreItem(b, objective);

  // Выбор главного теста значимости под цель
  let test = { z: 0, p: 1, metric: "ctr" };
  if (OBJECTIVE_WEIGHTS[objective]?.cvr > 0 && (a.clicks > 0 || b.clicks > 0)) {
    // проверяем CR = leads/clicks
    test = { ...twoProportionZTest(a.leads, a.clicks, b.leads, b.clicks), metric: "cr" };
  } else {
    // проверяем CTR = clicks/impressions
    test = { ...twoProportionZTest(a.clicks, a.impressions, b.clicks, b.impressions), metric: "ctr" };
  }

  const winner = sa.score > sb.score ? "A" : sa.score < sb.score ? "B" : "tie";
  const confidence = 1 - test.p; // 0..1
  return { winner, confidence, reasonMetric: test.metric, A: sa, B: sb };
}

// выбрать TOP из массива креативов
export function pickTop(items, objective, { minImpr = 100, minClicks = 10 } = {}) {
  const pool = items.filter((x) => N(x.impressions) >= minImpr || N(x.clicks) >= minClicks);
  if (pool.length <= 1) {
    const only = pool[0] || items[0];
    return { top: only, ranked: items.map((it) => ({ item: it, score: scoreItem(it, objective).score })) };
  }
  const ranked = pool
    .map((it) => ({ item: it, score: scoreItem(it, objective).score }))
    .sort((a, b) => b.score - a.score);
  return { top: ranked[0]?.item, ranked };
}
// Нишевые ориентиры (можно потом подружить с настройками в UI)
export const BENCHMARKS = {
  OUTCOME_ENGAGEMENT: { metric: "ctr", value: 3.0 },   // 3% хороший CTR
  POST_ENGAGEMENT:    { metric: "ctr", value: 3.0 },
  TRAFFIC:            { metric: "ctr", value: 2.0 },
  VIDEO_VIEWS:        { metric: "vvRate", value: 25.0 }, // 25% досмотров (пример)
  OUTCOME_AWARENESS:  { metric: "reachEff", value: 60.0 }, // 60% reach/impr (условно)
  OUTCOME_LEADS:      { metric: "cvr", value: 8.0 },    // 8% конверсия кликов в лид
  LEAD_GENERATION:    { metric: "cvr", value: 8.0 },
  CONVERSIONS:        { metric: "cvr", value: 5.0 },    // если «покупки», можно заменить на ROAS
  OUTCOME_SALES:      { metric: "roas", value: 3.0 },   // ROAS 3x — хороший ориентир
};

// Утилита: какая главная метрика под цель
export function getPrimaryMetricName(objective) {
  const def = { metric: "ctr", value: 2.0 };
  return (BENCHMARKS[objective] || def).metric;
}


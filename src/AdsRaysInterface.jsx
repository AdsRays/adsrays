// src/AdsRaysInterface.jsx
// -----------------------------------------------------------------------------
// AdsRays — интерфейс анализа и сравнения кампаний и креативов
// Обновление: сравнение кампаний + восстановлен блок “2) Выбор кампаний” +
// раскрытие кампаний с креативами (+) и выбором креативов с превью/именем
// добавлены «Развернуть все / Свернуть все», «Очистить выбранные креативы»
// -----------------------------------------------------------------------------

import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { fetchAdInsights } from "./lib/metaApi";
import PDFReport from "./components/PDFReport";
import AgeBreakdownPanel from "./components/AgeBreakdownPanel"; // если файл лежит в src/



// Логика сравнения креативов — используем твои утилиты
import {
  scoreItem,
  deriveMetrics,
  twoProportionZTest,
  BENCHMARKS as CREATIVE_BENCHMARKS,
  getPrimaryMetricName,
} from "./lib/analyzer";

// -------------------------------------------------------------
// Утилиты
// -------------------------------------------------------------
const fmt = {
  num: (v) => (isFinite(v) ? new Intl.NumberFormat("ru-RU").format(v) : "—"),
  pct: (v, digits = 1) => (isFinite(v) ? `${(v * 100).toFixed(digits)}%` : "—"),
  pct100: (v, digits = 1) => (isFinite(v) ? `${v.toFixed(digits)}%` : "—"),
  money: (v, currency = "USD") =>
    isFinite(v)
      ? new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(v)
      : "—",
};

const N = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const safe = (a, b) => (b > 0 ? a / b : 0);
function safeDiv(a, b) {
  const aa = +a || 0;
  const bb = +b || 0;
  if (bb === 0) return 0;
  return aa / bb;
}

// Перевод цели на русский (Первая буква — заглавная)
function translateObjective(obj) {
  if (!obj) return "—";
  const key = String(obj).toUpperCase();
  const map = {
    LEADS: "Лиды",
    LEAD_GENERATION: "Лиды",
    OUTCOME_LEADS: "Лиды",
    TRAFFIC: "Трафик",
    CONVERSIONS: "Конверсии",
    OUTCOME_SALES: "Продажи",
    POST_ENGAGEMENT: "Вовлечённость",
    OUTCOME_ENGAGEMENT: "Вовлечённость",
    VIDEO_VIEWS: "Просмотры видео",
    OUTCOME_AWARENESS: "Осведомлённость",
    AWARENESS: "Осведомлённость",
    REACH: "Охват",
  };
  const ru = map[key] || key.toLowerCase();
  return ru.charAt(0).toUpperCase() + ru.slice(1);
}

// KPI по цели кампании + скор (для сравнения кампаний)
function objectiveKPI(cmp) {
  const impressions = +cmp.impressions || 0;
  const clicks = +cmp.clicks || 0;
  const pageviews = +cmp.pageviews || 0;
  const leads = +cmp.leads || 0;
  const spend = +cmp.cost || +cmp.spend || 0;

  const ctr = safeDiv(clicks, impressions);
  const cpc = safeDiv(spend, clicks);
  const lpc = safeDiv(leads, clicks);
  const lpp = safeDiv(leads, pageviews);
  const cpa = safeDiv(spend, leads);

  const objective = (cmp.objective || cmp.campaign_objective || "").toLowerCase();

  let score = 0;
  if (objective.includes("traffic") || objective.includes("клики")) {
    score = 0.6 * ctr + 0.4 * (isFinite(cpc) ? 1 / (1 + cpc) : 0);
  } else if (
    objective.includes("leads") ||
    objective.includes("lead") ||
    objective.includes("лиды") ||
    objective.includes("messages") ||
    objective.includes("сообщ")
  ) {
    score = 0.4 * lpc + 0.4 * lpp + 0.2 * (isFinite(cpa) ? 1 / (1 + cpa) : 0);
  } else if (objective.includes("conversion") || objective.includes("конверс")) {
    score = 0.35 * lpc + 0.35 * lpp + 0.3 * (isFinite(cpa) ? 1 / (1 + cpa) : 0);
  } else if (objective.includes("reach") || objective.includes("охват")) {
    const cpm = safeDiv(spend, impressions) * 1000;
    score = 0.6 * (isFinite(cpm) ? 1 / (1 + cpm) : 0) + 0.4 * ctr;
  } else {
    score =
      0.25 * ctr +
      0.25 * (isFinite(cpc) ? 1 / (1 + cpc) : 0) +
      0.25 * lpc +
      0.25 * (isFinite(cpa) ? 1 / (1 + cpa) : 0);
  }

  return {
    impressions,
    clicks,
    pageviews,
    leads,
    spend,
    ctr,
    cpc,
    lpc,
    lpp,
    cpa,
    objective,
    score,
  };
}

// Бенчмарки (для кампаний — проценты от ориентира)
const CAMPAIGN_BENCHMARKS = {
  traffic: { ctr: 0.015, cpc: 0.5 },
  leads: { lpc: 0.08, lpp: 0.05, cpa: 10 },
  conversion: { lpc: 0.07, lpp: 0.04, cpa: 12 },
  reach: { ctr: 0.005, cpm: 3 },
  default: { ctr: 0.01, lpc: 0.05, cpa: 15 },
};

function benchKey(objective) {
  const o = (objective || "").toLowerCase();
  if (o.includes("traffic") || o.includes("клики")) return "traffic";
  if (o.includes("leads") || o.includes("лиды") || o.includes("messages") || o.includes("сообщ")) return "leads";
  if (o.includes("conversion") || o.includes("конверс")) return "conversion";
  if (o.includes("reach") || o.includes("охват")) return "reach";
  return "default";
}

function percentOfBenchmark(cmp) {
  const kpi = objectiveKPI(cmp);
  const bk = CAMPAIGN_BENCHMARKS[benchKey(kpi.objective)];
  if (benchKey(kpi.objective) === "traffic") {
    const ctrPct = safeDiv(kpi.ctr, bk.ctr) * 100;
    return { valuePct: ctrPct, label: "от бенчмарка CTR" };
  }
  if (benchKey(kpi.objective) === "leads" || benchKey(kpi.objective) === "conversion") {
    const lpcPct = safeDiv(kpi.lpc, bk.lpc) * 100;
    return { valuePct: lpcPct, label: "от бенчмарка CR (лиды/клики)" };
  }
  if (benchKey(kpi.objective) === "reach") {
    const ctrPct = safeDiv(kpi.ctr, bk.ctr) * 100;
    return { valuePct: ctrPct, label: "от бенчмарка CTR" };
  }
  const defaultPct = safeDiv(kpi.ctr, CAMPAIGN_BENCHMARKS.default.ctr) * 100;
  return { valuePct: defaultPct, label: "от бенчмарка CTR" };
}

// Z-тест для A/B (кампании)
function abZTest({ k1, n1, k2, n2 }) {
  if (n1 === 0 || n2 === 0) return { z: 0, p: 1, ciLow: 0, ciHigh: 0, liftPct: 0 };
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, p: 1, ciLow: 0, ciHigh: 0, liftPct: 0 };

  const z = (p1 - p2) / se;
  const pval = 2 * (1 - cdfStdNormal(Math.abs(z)));
  const liftPct = (p1 - p2) * 100;

  const z975 = 1.959963984540054;
  const diff = p1 - p2;
  const seDiff = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const ciLow = (diff - z975 * seDiff) * 100;
  const ciHigh = (diff + z975 * seDiff) * 100;

  return { z, p: pval, ciLow, ciHigh, liftPct };
}

function cdfStdNormal(x) {
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p =
    d *
    (0.3193815 * t -
      0.3565638 * t ** 2 +
      1.781478 * t ** 3 -
      1.821256 * t ** 4 +
      1.330274 * t ** 5);
  return x >= 0 ? 1 - p : p;
}

// ---------- Нормализация одного ad из raw insights (как в старом коде) ----------
function normalizeAdRowFromRaw(r) {
  const impressions = N(r.impressions);
  const spend = N(r.spend);
  const inline = N(r.inline_link_clicks);
  const clicksMeta = N(r.clicks);

  // fallback по link_click из actions
  let linkClickFromActions = 0;
  (r.actions || []).forEach((a) => {
    if (a.action_type === "link_click") linkClickFromActions += N(a.value);
  });

  const clicks = inline || linkClickFromActions || clicksMeta || 0;

  // карта actions
  const map = new Map();
  (r.actions || []).forEach((a) => {
    const t = String(a.action_type || "");
    map.set(t, (map.get(t) || 0) + N(a.value));
  });
  const groupMax = (types) => types.reduce((mx, t) => Math.max(mx, N(map.get(t) || 0)), 0);

  const lpv = groupMax(["landing_page_view", "omni_landing_page_view"]);
  const leads = groupMax([
    "lead",
    "onsite_web_lead",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.lead_grouped",
  ]);

  const ctr = safe(clicks, impressions) * 100;
  const cpc = safe(spend, clicks);
  const cpa = safe(spend, leads);
  const cr = safe(leads, clicks) * 100;
  const cvr = safe(leads, lpv) * 100;

  return { impressions, clicks, pageviews: lpv, leads, spend, ctr, cpc, cpa, cr, cvr };
}

// -------------------------------------------------------------
// Основной компонент
// -------------------------------------------------------------
export default function AdsRaysInterface() {
  // Даты / период (ШАГ 1)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Кампании
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // NEW: выбор и сравнение кампаний
  const [selectedTiles, setSelectedTiles] = useState(new Set()); // плитки в блоке 2 (фильтр таблицы)
  const [selectedCmpCampaigns, setSelectedCmpCampaigns] = useState(new Set()); // чекбоксы в таблице (корзина сравнения)

  // НЕ трогаем: выбор креативов
  const [selectedAds, setSelectedAds] = useState(new Set());

  // Подсказка
  const [showCmpHint, setShowCmpHint] = useState(true);

  // NEW: раскрытие кампаний и креативы
  const [expandedCampaigns, setExpandedCampaigns] = useState(new Set());
  const [campaignCreatives, setCampaignCreatives] = useState({}); // { [campaignId]: Array<creative> }
  const [loadingCreatives, setLoadingCreatives] = useState(new Set());

  // Загрузка кампаний (реальные данные)
  async function handleLoadCampaigns() {
    try {
      setLoading(true);
      setLoadError("");

      const rows = await fetchAdInsights({
        since: dateFrom || undefined,
        until: dateTo || undefined,
      });

      // Приводим к формату UI
      const mapped = (Array.isArray(rows) ? rows : []).map((r) => ({
        ...r,
        id: r.campaign_id,
        name: r.campaign_name || "—",
        objective: r.objective || r.campaign_objective || "",
        impressions: +r.impressions || 0,
        clicks: +r.clicks || 0,
        pageviews: +r.pageviews || 0,
        leads: +r.leads || 0,
        cost: +r.spend || 0,
        spend: +r.spend || 0,
      }));

      setCampaigns(mapped);
      setSelectedTiles(new Set()); // по умолчанию — все в таблице
      setSelectedCmpCampaigns(new Set());
      setExpandedCampaigns(new Set());
      setCampaignCreatives({});
      setSelectedAds(new Set());
    } catch (e) {
      setLoadError(e?.message || "Ошибка загрузки");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }

  // Подгрузка креативов КАК РАНЬШЕ: из /api/debug/campaign-ads (fallback /api/ads)
  async function loadCreativesForCampaign(campaignId) {
    const fetchJsonSafe = async (url) => {
      const res = await fetch(url);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Сервер вернул не JSON (${res.status}) → ${text.slice(0, 120)}`);
      }
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      return json;
    };

    setLoadingCreatives((prev) => new Set(prev).add(campaignId));
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("since", dateFrom);
      if (dateTo) qs.set("until", dateTo);
      qs.set("campaign_id", campaignId);

      // 1) основной путь (как было в старом коде)
      let j;
      try {
        j = await fetchJsonSafe(`/api/debug/campaign-ads?${qs.toString()}`);
      } catch {
        // 2) fallback-алиас
        j = await fetchJsonSafe(`/api/ads?${qs.toString()}`);
      }

      const out = [];
      const data = j.ads?.data || [];
      // найдём цель кампании для весов скоринга
      const parent = campaigns.find((c) => String(c.id) === String(campaignId));
      const parentObjective = parent?.objective || "";

      for (const ad of data) {
        const r = (ad.insights?.data || [])[0] || {};
        const k = normalizeAdRowFromRaw(r);

        out.push({
          ad_id: ad.id, // устойчивый уникальный ID
          name: ad.name || ad.id,
          preview: ad?.creative?.thumbnail_url || "",
          objective: parentObjective, // пригодится для сравнения
          __campaign_id: campaignId,
          ...k, // impressions, clicks, pageviews, leads, spend, ctr, cpc, cpa, cr, cvr
        });
      }

      setCampaignCreatives((prev) => ({ ...prev, [campaignId]: out }));
    } catch (e) {
      console.error("Ошибка загрузки креативов:", e);
      setCampaignCreatives((prev) => ({ ...prev, [campaignId]: [] }));
    } finally {
      setLoadingCreatives((prev) => {
        const next = new Set(prev);
        next.delete(campaignId);
        return next;
      });
    }
  }

  // Переключение раскрытия кампании (кнопка «+»)
  async function toggleExpandCampaign(id) {
    if (expandedCampaigns.has(id)) {
      setExpandedCampaigns((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    setExpandedCampaigns((prev) => new Set(prev).add(id));
    if (!campaignCreatives[id]) {
      await loadCreativesForCampaign(id);
    }
  }

  // Развернуть все / Свернуть все (по текущему фильтру)
  async function expandAllCampaigns() {
    const ids = filteredCampaigns.map((c) => c.id);
    setExpandedCampaigns(new Set(ids));
    const needLoad = ids.filter((id) => !campaignCreatives[id]);
    if (needLoad.length) {
      await Promise.all(needLoad.map((id) => loadCreativesForCampaign(id)));
    }
  }
  function collapseAllCampaigns() {
    setExpandedCampaigns(new Set());
  }

  // Переключение плиток (ШАГ 2)
  function toggleTile(id) {
    setSelectedTiles((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Чекбокс «корзины сравнения кампаний»
  function toggleCmpSelect(id) {
    setSelectedCmpCampaigns((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearSelectedCmp() {
    setSelectedCmpCampaigns(new Set());
  }

  // Очистить выбранные креативы
  function clearSelectedAds() {
    setSelectedAds(new Set());
  }

  // Фильтр для таблицы по выбранным плиткам
  const filteredCampaigns = useMemo(() => {
    if (!selectedTiles.size) return campaigns;
    return campaigns.filter((c) => selectedTiles.has(c.id));
  }, [campaigns, selectedTiles]);

  // Рэнкинг выбранных кампаний
  const rankedSelected = useMemo(() => {
    const selectedList = campaigns.filter((c) => selectedCmpCampaigns.has(c.id));
    return [...selectedList].sort((a, b) => objectiveKPI(b).score - objectiveKPI(a).score);
  }, [campaigns, selectedCmpCampaigns]);

  const objectivesInSelection = useMemo(() => {
    const set = new Set(rankedSelected.map((c) => (c.objective || "").toLowerCase()));
    return set;
  }, [rankedSelected]);

 // A/B входные данные для кампаний
function abInputsForCampaign(cmp) {
  const kpi = objectiveKPI(cmp);
  if (benchKey(kpi.objective) === "traffic" || benchKey(kpi.objective) === "reach") {
    return { k: kpi.clicks, n: kpi.impressions, label: "CTR" };
  }
  if (benchKey(kpi.objective) === "leads" || benchKey(kpi.objective) === "conversion") {
    if (kpi.clicks > 0) return { k: kpi.leads, n: kpi.clicks, label: "CR (лиды/клики)" };
    return { k: kpi.leads, n: kpi.pageviews, label: "CVR (лиды/просм.ЦС)" };
  }
  return { k: kpi.clicks, n: kpi.impressions, label: "CTR" };
}

// --- Выбор креативов, соберём объекты по selectedAds ---
// --- Выбор креативов, соберём объекты по selectedAds ---
const selectedCreativeRows = useMemo(() => {
  if (!selectedAds.size) return [];

  const tmp = [];

  // ключи campaignCreatives — это id кампаний
  for (const [cid, list] of Object.entries(campaignCreatives)) {
    for (const ad of list || []) {
      // где-то ad_id, где-то id — подстрахуемся
      const adId = ad.ad_id || ad.id;
      if (selectedAds.has(adId)) {
        // добавляем campaignId к каждой строке
        const withCampaign = { ...ad, ad_id: adId, __campaign_id: String(cid) };

        // скор для сортировки: берём ad.sc, иначе считаем через scoreItem (если есть)
        const scVal =
          Number(ad.sc) ||
          (typeof scoreItem === "function"
            ? Number(scoreItem(ad, ad.objective || "LEAD_GENERATION")?.score) || 0
            : 0);

        tmp.push({ ad: withCampaign, sc: scVal });
      }
    }
  }

  return tmp
    .sort((a, b) => b.sc - a.sc)
    .map((x) => x.ad);
}, [selectedAds, campaignCreatives]);


const creativeObjectivesInSelection = useMemo(() => {
  const set = new Set(
    selectedCreativeRows.map((ad) => String(ad.objective || "").toUpperCase())
  );
  return set;
}, [selectedCreativeRows]);

// -------------------------------------------------------------
// РЕНДЕР
// -------------------------------------------------------------

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
      {/* Заголовок */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">AdsRays — Аналитика кампаний и креативов</h1>
        <p className="text-sm text-gray-500 mt-1">Период и загрузка статистики</p>
      </div>

      {/* ШАГ 1 — период и данные */}
      <section className="bg-white rounded-2xl shadow p-4 md:p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">ШАГ 1) Период и данные</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Дата с</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded-xl px-3 py-2"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Дата по</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded-xl px-3 py-2"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleLoadCampaigns}
              className="w-full md:w-auto bg-black text-white rounded-2xl px-4 py-2"
              disabled={loading}
            >
              {loading ? "Загрузка…" : "Загрузить кампании"}
            </button>
          </div>
          <div className="flex items-end">
            <div className="text-sm text-gray-500">
              {loadError ? <span className="text-red-600">{loadError}</span> : "Данные подгружаются из Meta/CSV"}
            </div>
          </div>
        </div>
      </section>

      {/* ШАГ 2 — Выбор кампаний (плитки) */}
      <section className="bg-white rounded-2xl shadow p-4 md:p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">ШАГ 2) Выбор кампаний</h2>

        {campaigns.length === 0 ? (
          <div className="text-sm text-gray-500">Нет кампаний за выбранный период. Загрузите данные на ШАГЕ 1.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {campaigns.map((c) => {
                const checked = selectedTiles.has(c.id);
                const kpi = objectiveKPI(c);
                return (
                  <label
                    key={c.id}
                    className={`border rounded-2xl p-3 cursor-pointer flex items-start gap-3 ${
                      checked ? "border-black ring-1 ring-black" : "border-gray-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggleTile(c.id)}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-gray-500">
                        Цель: {translateObjective(c.objective)} · Показы: {fmt.num(kpi.impressions)} · Клики: {fmt.num(kpi.clicks)} · Лиды: {fmt.num(kpi.leads)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <p className="text-xs text-gray-500 mt-3">
              По умолчанию ниже показываются все кампании. Если отметить 1+ галочек здесь, таблица отфильтруется только по выбранным.
            </p>
          </>
        )}
      </section>

      {/* Таблица кампаний + раскрытие (+) */}
      <section className="bg-white rounded-2xl shadow p-4 md:p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Кампании за период</h2>

          <div className="flex items-center gap-3">
            {filteredCampaigns.length > 0 && (
              <>
                <button
                  onClick={expandAllCampaigns}
                  className="text-sm underline underline-offset-2"
                  title="Развернуть все кампании"
                >
                  Развернуть все
                </button>
                <button
                  onClick={collapseAllCampaigns}
                  className="text-sm underline underline-offset-2"
                  title="Свернуть все кампании"
                >
                  Свернуть все
                </button>
              </>
            )}
            {selectedCmpCampaigns.size > 0 && (
              <button
                onClick={clearSelectedCmp}
                className="text-sm underline underline-offset-2"
                title="Снять все галочки сравнения"
              >
                Очистить выбранные кампании
              </button>
            )}
          </div>
        </div>

        {showCmpHint && (
          <div className="mb-4 rounded-xl border border-dashed p-3 text-sm bg-gray-50">
            <div className="flex items-start gap-2">
              <div className="mt-0.5">💡</div>
              <div className="flex-1">
                <div className="font-medium mb-1">Подсказка</div>
                <div>
                  Чтобы сравнить кампании, отметьте чекбоксы <b>слева</b> у названий; чтобы сравнить креативы,
                  разверните кампанию (кнопка «+») и отметьте чекбоксы у креативов.
                </div>
                <button className="text-xs mt-2 underline" onClick={() => setShowCmpHint(false)}>
                  Понятно, скрыть подсказку
                </button>
              </div>
            </div>
          </div>
        )}

        {filteredCampaigns.length === 0 ? (
          <div className="text-sm text-gray-500">Нет данных для отображения.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2 pr-2 w-10">{/* чекбокс сравнения */}</th>
                  <th className="py-2 pr-2 w-10">{/* +/− */}</th>
                  <th className="py-2 pr-2">Кампания</th>
                  <th className="py-2 pr-2">Цель</th>
                  <th className="py-2 pr-2">Показы</th>
                  <th className="py-2 pr-2">Клики</th>
                  <th className="py-2 pr-2">Просм. ЦС</th>
                  <th className="py-2 pr-2">Лиды</th>
                  <th className="py-2 pr-2">CTR</th>
                  <th className="py-2 pr-2">CPC</th>
                  <th className="py-2 pr-2">CR (L/К)</th>
                  <th className="py-2 pr-2">CVR (L/Просм)</th>
                  <th className="py-2 pr-2">CPA</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((c) => {
                  const checked = selectedCmpCampaigns.has(c.id);
                  const k = objectiveKPI(c);
                  const isOpen = expandedCampaigns.has(c.id);
                  return (
                    <React.Fragment key={c.id}>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-2 pr-2 align-top">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCmpSelect(c.id)}
                            title="Добавить в сравнение кампаний"
                          />
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <button
                            onClick={() => toggleExpandCampaign(c.id)}
                            className="w-6 h-6 rounded border flex items-center justify-center"
                            title={isOpen ? "Свернуть" : "Развернуть"}
                          >
                            {isOpen ? "−" : "+"}
                          </button>
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <div className="font-medium leading-5">{c.name}</div>
                          <div className="text-[11px] text-gray-500">ID: {c.id}</div>
                        </td>
                        <td className="py-2 pr-2 align-top">{translateObjective(c.objective)}</td>
                        <td className="py-2 pr-2 align-top">{fmt.num(k.impressions)}</td>
                        <td className="py-2 pr-2 align-top">{fmt.num(k.clicks)}</td>
                        <td className="py-2 pr-2 align-top">{fmt.num(k.pageviews)}</td>
                        <td className="py-2 pr-2 align-top">{fmt.num(k.leads)}</td>
                        <td className="py-2 pr-2 align-top">{fmt.pct(k.ctr)}</td>
                        <td className="py-2 pr-2 align-top">{isFinite(k.cpc) ? fmt.money(k.cpc) : "—"}</td>
                        <td className="py-2 pr-2 align-top">{fmt.pct(k.lpc)}</td>
                        <td className="py-2 pr-2 align-top">{fmt.pct(k.lpp)}</td>
                        <td className="py-2 pr-2 align-top">{isFinite(k.cpa) ? fmt.money(k.cpa) : "—"}</td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-gray-50">
                          <td colSpan={13} className="p-3">
                            {loadingCreatives.has(c.id) ? (
                              <div className="text-sm text-gray-600">Загрузка креативов…</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-gray-600 border-b">
                                      <th className="py-2 pr-2 w-10">{/* чекбокс выбора креатива */}</th>
                                      <th className="py-2 pr-2">Креатив</th>
                                      <th className="py-2 pr-2">Показы</th>
                                      <th className="py-2 pr-2">Клики</th>
                                      <th className="py-2 pr-2">Просм. ЦС</th>
                                      <th className="py-2 pr-2">Лиды</th>
                                      <th className="py-2 pr-2">CTR</th>
                                      <th className="py-2 pr-2">CPC</th>
                                      <th className="py-2 pr-2">CR (L/К)</th>
                                      <th className="py-2 pr-2">CVR (L/Просм)</th>
                                      <th className="py-2 pr-2">CPA</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(campaignCreatives[c.id] || []).map((ad) => {
                                      const adCtr = safe(ad.clicks, ad.impressions);
                                      const adCpc = safe(ad.spend, ad.clicks);
                                      const adLpc = safe(ad.leads, ad.clicks);
                                      const adLpp = safe(ad.leads, ad.pageviews);
                                      const adCpa = safe(ad.spend, ad.leads);
                                      const checkedAd = selectedAds.has(ad.ad_id);

                                      return (
                                        <tr key={ad.ad_id} className="border-b">
                                          <td className="py-2 pr-2">
                                            <input
                                              type="checkbox"
                                              checked={checkedAd}
                                              onChange={() =>
                                                setSelectedAds((prev) => {
                                                  const next = new Set(prev);
                                                  next.has(ad.ad_id) ? next.delete(ad.ad_id) : next.add(ad.ad_id);
                                                  return next;
                                                })
                                              }
                                              title="Добавить креатив в сравнение"
                                            />
                                          </td>
                                          <td className="py-2 pr-2">
                                            <div className="flex items-center gap-2">
                                              {ad.preview ? (
                                                <img
                                                  src={ad.preview}
                                                  alt={ad.name || "preview"}
                                                  className="w-10 h-10 object-cover rounded"
                                                  loading="lazy"
                                                />
                                              ) : (
                                                <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                                  нет
                                                </div>
                                              )}
                                              <div>
                                                <div className="font-medium">{ad.name || "—"}</div>
                                                <div className="text-[11px] text-gray-500">ID: {ad.ad_id}</div>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-2 pr-2">{fmt.num(ad.impressions)}</td>
                                          <td className="py-2 pr-2">{fmt.num(ad.clicks)}</td>
                                          <td className="py-2 pr-2">{fmt.num(ad.pageviews)}</td>
                                          <td className="py-2 pr-2">{fmt.num(ad.leads)}</td>
                                          <td className="py-2 pr-2">{fmt.pct(adCtr)}</td>
                                          <td className="py-2 pr-2">{isFinite(adCpc) ? fmt.money(adCpc) : "—"}</td>
                                          <td className="py-2 pr-2">{fmt.pct(adLpc)}</td>
                                          <td className="py-2 pr-2">{fmt.pct(adLpp)}</td>
                                          <td className="py-2 pr-2">{isFinite(adCpa) ? fmt.money(adCpa) : "—"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Сравнение выбранных кампаний */}
      <section className="bg-white rounded-2xl shadow p-4 md:p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Сравнение выбранных кампаний</h2>

        {selectedCmpCampaigns.size === 0 ? (
          <div className="text-sm text-gray-500">Для сравнения отметьте чекбоксы слева от названий кампаний в таблице.</div>
        ) : (
          <>
            {objectivesInSelection.size > 1 && (
              <div className="mb-4 rounded-xl border border-amber-500 bg-amber-50 text-amber-900 p-3 text-sm">
                Внимание: выбраны кампании с разными целями. Сравнение выполнено, но не является полностью корректным.
              </div>
            )}

            {rankedSelected.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-gray-500 mb-1">Победитель по цели кампании</div>
                  <div className="text-base font-semibold">{rankedSelected[0].name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Цель: {translateObjective(rankedSelected[0].objective)}
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-gray-500 mb-1">% улучшения к 2 месту</div>
                  <div className="text-2xl font-semibold">
                    {rankedSelected.length > 1
                      ? fmt.pct100(
                          (objectiveKPI(rankedSelected[0]).score /
                            (objectiveKPI(rankedSelected[1]).score || 1) -
                            1) * 100,
                          1
                        )
                      : "—"}
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  {(() => {
                    const { valuePct, label } = percentOfBenchmark(rankedSelected[0]);
                    return (
                      <>
                        <div className="text-xs text-gray-500 mb-1">% {label}</div>
                        <div className="text-2xl font-semibold">{valuePct.toFixed(0)}%</div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="overflow-x-auto mb-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-2">Кампания</th>
                    <th className="py-2 pr-2">Цель</th>
                    <th className="py-2 pr-2">CTR</th>
                    <th className="py-2 pr-2">CPC</th>
                    <th className="py-2 pr-2">CR (L/К)</th>
                    <th className="py-2 pr-2">CVR (L/Просм)</th>
                    <th className="py-2 pr-2">CPA</th>
                    <th className="py-2 pr-2">Score (под цель)</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedSelected.map((c) => {
                    const k = objectiveKPI(c);
                    return (
                      <tr key={c.id} className="border-b">
                        <td className="py-2 pr-2">{c.name}</td>
                        <td className="py-2 pr-2">{translateObjective(c.objective)}</td>
                        <td className="py-2 pr-2">{fmt.pct(k.ctr)}</td>
                        <td className="py-2 pr-2">{isFinite(k.cpc) ? fmt.money(k.cpc) : "—"}</td>
                        <td className="py-2 pr-2">{fmt.pct(k.lpc)}</td>
                        <td className="py-2 pr-2">{fmt.pct(k.lpp)}</td>
                        <td className="py-2 pr-2">{isFinite(k.cpa) ? fmt.money(k.cpa) : "—"}</td>
                        <td className="py-2 pr-2">{objectiveKPI(c).score.toFixed(4)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rankedSelected.length === 2 && (
              <div className="rounded-2xl border p-4">
                <div className="text-base font-semibold mb-2">A/B сравнение (95% доверительный интервал)</div>
                {(() => {
                  const [A, B] = rankedSelected;
                  const a = abInputsForCampaign(A);
                  const b = abInputsForCampaign(B);
                  const res = abZTest({ k1: a.k, n1: a.n, k2: b.k, n2: b.n });
                  return (
                    <div className="text-sm">
                      <div className="mb-1">
                        Метрика: <b>{a.label}</b>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-500 mb-1">A: {A.name}</div>
                          <div>
                            k/n: {fmt.num(a.k)} / {fmt.num(a.n)} · {fmt.pct(safeDiv(a.k, a.n))}
                          </div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-500 mb-1">B: {B.name}</div>
                          <div>
                            k/n: {fmt.num(b.k)} / {fmt.num(b.n)} · {fmt.pct(safeDiv(b.k, b.n))}
                          </div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-500 mb-1">Разница (A − B)</div>
                          <div>
                            Лифт: {res.liftPct.toFixed(2)} п.п. · 95% ДИ: {res.ciLow.toFixed(2)} … {res.ciHigh.toFixed(2)} п.п.
                          </div>
                          <div>z = {res.z.toFixed(3)} · p = {res.p.toFixed(4)}</div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Примечание: используется приблизительный двусторонний Z-тест пропорций.
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </section>

      {/* ─────────────────── Сравнение выбранных креативов ─────────────────── */}
      <section className="bg-white rounded-2xl shadow p-4 md:p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Сравнение выбранных креативов</h2>
          {selectedCreativeRows.length > 0 && (
            <button
              onClick={clearSelectedAds}
              className="text-sm underline underline-offset-2"
              title="Снять все галочки креативов"
            >
              Очистить выбранные креативы
            </button>
          )}
        </div>

        {selectedCreativeRows.length === 0 ? (
          <div className="text-sm text-gray-500">
            Выберите креативы: разверните кампанию «+» и отметьте чекбоксы слева от креативов.
          </div>
        ) : (
          <>
            {creativeObjectivesInSelection.size > 1 && (
              <div className="mb-4 rounded-xl border border-amber-500 bg-amber-50 text-amber-900 p-3 text-sm">
                Внимание: выбраны креативы из кампаний с разными целями. Сравнение проведено по их целям, но
                корректность ограничена.
              </div>
            )}

            {/* ТОП креатив + % улучшения к 2 месту + % от бенчмарка под цель ТОПа */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
              <div className="rounded-2xl border p-4">
                <div className="text-xs text-gray-500 mb-1">Победитель (по цели кампании)</div>
                <div className="text-base font-semibold">{selectedCreativeRows[0].name || selectedCreativeRows[0].ad_id}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Цель: {translateObjective(selectedCreativeRows[0].objective)}
                </div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs text-gray-500 mb-1">% улучшения к 2 месту</div>
                <div className="text-2xl font-semibold">
                  {selectedCreativeRows.length > 1
                    ? (() => {
                        const a = scoreItem(selectedCreativeRows[0], selectedCreativeRows[0].objective || "LEAD_GENERATION").score;
                        const b = scoreItem(selectedCreativeRows[1], selectedCreativeRows[1].objective || "LEAD_GENERATION").score || 1;
                        return fmt.pct100(((a / b) - 1) * 100, 1);
                      })()
                    : "—"}
                </div>
              </div>
              <div className="rounded-2xl border p-4">
                {(() => {
                  const obj = String(selectedCreativeRows[0].objective || "").toUpperCase();
                  const primary = getPrimaryMetricName(obj); // ctr / cvr / vvRate / reachEff / roas
                  const d = deriveMetrics(selectedCreativeRows[0]);
                  let pct = 0, label = "от бенчмарка";
                  const bench = CREATIVE_BENCHMARKS[obj] || CREATIVE_BENCHMARKS["LEAD_GENERATION"];
                  if (primary === "ctr") { pct = safe(d.ctr, bench.value) * 100; label = "от бенчмарка CTR"; }
                  else if (primary === "cvr") { pct = safe(d.cvr, bench.value) * 100; label = "от бенчмарка CR"; }
                  else if (primary === "roas") { pct = safe(d.roas, bench.value) * 100; label = "от бенчмарка ROAS"; }
                  else { pct = safe(d.ctr, (CREATIVE_BENCHMARKS.TRAFFIC?.value || 2.0)) * 100; label = "от бенчмарка CTR"; }
                  return (
                    <>
                      <div className="text-xs text-gray-500 mb-1">% {label}</div>
                      <div className="text-2xl font-semibold">{pct.toFixed(0)}%</div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Таблица выбранных креативов с ключевыми метриками и скором */}
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-2">Креатив</th>
                    <th className="py-2 pr-2">Цель</th>
                    <th className="py-2 pr-2">CTR</th>
                    <th className="py-2 pr-2">CPC</th>
                    <th className="py-2 pr-2">CR (L/К)</th>
                    <th className="py-2 pr-2">CVR (L/Просм)</th>
                    <th className="py-2 pr-2">CPA</th>
                    <th className="py-2 pr-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCreativeRows.map((ad) => {
                    const d = deriveMetrics(ad);
                    const sc = scoreItem(ad, ad.objective || "LEAD_GENERATION").score;
                    return (
                      <tr key={ad.ad_id} className="border-b">
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            {ad.preview ? (
                              <img src={ad.preview} alt={ad.name || "preview"} className="w-8 h-8 rounded object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center text-[10px] text-gray-500">нет</div>
                            )}
                            <div>
                              <div className="font-medium">{ad.name || "—"}</div>
                              <div className="text-[11px] text-gray-500">ID: {ad.ad_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-2">{translateObjective(ad.objective)}</td>
                        <td className="py-2 pr-2">{fmt.pct(d.ctr / 100)}</td>
                        <td className="py-2 pr-2">{isFinite(d.cpc) ? fmt.money(d.cpc) : "—"}</td>
                        <td className="py-2 pr-2">{fmt.pct(d.cr / 100)}</td>
                        <td className="py-2 pr-2">{fmt.pct(d.cvr / 100)}</td>
                        <td className="py-2 pr-2">{isFinite(d.cpa) ? fmt.money(d.cpa) : "—"}</td>
                        <td className="py-2 pr-2">{sc.toFixed(4)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
<AgeBreakdownPanel
  selectedAds={selectedCreativeRows}
  since={dateFrom}
  until={dateTo}
/>





            {/* A/B сравнение для двух креативов */}
            {selectedCreativeRows.length === 2 && (
              <div className="rounded-2xl border p-4">
                {(() => {
                  const [A, B] = selectedCreativeRows;
                  // Выбор главной метрики под цель A (если цели разные — это всё равно разумно)
                  const main = getPrimaryMetricName(String(A.objective || "").toUpperCase());
                  let k1, n1, k2, n2, label = "CTR";

                  if (main === "cvr" && (A.clicks > 0 || B.clicks > 0)) {
                    k1 = A.leads; n1 = A.clicks; k2 = B.leads; n2 = B.clicks; label = "CR (лиды/клики)";
                  } else {
                    k1 = A.clicks; n1 = A.impressions; k2 = B.clicks; n2 = B.impressions; label = "CTR";
                  }

                  const res = twoProportionZTest(k1, n1, k2, n2);
                  const lift = (k1 / n1 - k2 / n2) * 100;

                  return (
                    <div className="text-sm">
                      <div className="text-base font-semibold mb-2">A/B сравнение креативов (95% доверительный уровень)</div>
                      <div className="mb-1">Метрика: <b>{label}</b></div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-500 mb-1">A: {A.name}</div>
                          <div>k/n: {fmt.num(k1)} / {fmt.num(n1)} · {fmt.pct(k1 / n1)}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-500 mb-1">B: {B.name}</div>
                          <div>k/n: {fmt.num(k2)} / {fmt.num(n2)} · {fmt.pct(k2 / n2)}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-500 mb-1">Разница (A − B)</div>
                          <div>Лифт: {lift.toFixed(2)} п.п. · z = {res.z.toFixed(3)} · p = {res.p.toFixed(4)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

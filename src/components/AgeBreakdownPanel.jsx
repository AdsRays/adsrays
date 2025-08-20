// src/components/AgeBreakdownPanel.jsx
// Сравнение креативов по точному возрасту ЦА + по группам возрастов
// ВНИМАНИЕ: селекты метрик в верхнем и нижнем блоках независимы

import React, { useEffect, useMemo, useState } from "react";
import { fetchCampaignAgeInsights, fetchCampaignTargetAges } from "../lib/metaApi";

const AGE_BUCKETS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

const METRICS = [
  { id: "index", label: "Индекс качества", higher: true },
  { id: "ctr", label: "CTR", higher: true },
  { id: "impressions", label: "Показы", higher: true },
  { id: "clicks", label: "Клики", higher: true },
  { id: "pageviews", label: "Просм. ЦС", higher: true },
  { id: "leads", label: "Лиды", higher: true },
  { id: "spend", label: "Затраты", higher: false },
  { id: "cr", label: "CR", higher: true },      // лиды/клики
  { id: "cvr", label: "CVR", higher: true },    // лиды/просм. ЦС
  { id: "cpc", label: "CPC", higher: false },   // spend/clicks
  { id: "cpa", label: "CPA", higher: false },   // spend/leads
  { id: "all", label: "Все метрики", higher: true },
];

const MEXPLAIN = {
  index:
    "Индекс качества (ИК) — сводный балл 0–100. Учитывает CTR (кликабельность), CR (лиды/клики), CVR (лиды/просм. ЦС), а также цены CPC и CPA (ниже — лучше). Победитель по ИК может иметь ниже CTR, но выигрывать за счёт стоимости результата.",
  ctr: "CTR — доля кликов от показов. Чем выше, тем лучше: объявление кликают охотнее.",
  impressions: "Показы — сколько раз объявление увидели. Это объём охвата, не качество.",
  clicks: "Клики — сколько раз креатив кликнули. Косвенно отражает интерес, но не качество трафика.",
  pageviews:
    "Просмотры целевой страницы — сколько пользователей дошли до сайта/лендинга (quality-клик). Это ценнее обычных кликов.",
  leads:
    "Лиды — количество заявок. Главная бизнес-метрика: чем больше при той же цене, тем лучше.",
  spend:
    "Затраты — сколько потрачено. Для сравнения качества мы стараемся получать больше результата при меньших тратах.",
  cr: "CR — конверсия кликов в лиды (лиды/клики). Показывает, как реклама превращает клики в заявки.",
  cvr: "CVR — конверсия приземления (лиды/просм. ЦС). Насколько хорошо лендинг конвертит пришедших.",
  cpc: "CPC — цена клика. Ниже — лучше: дешевле привлекаем трафик.",
  cpa: "CPA — цена лида. Ниже — лучше: дешевле получаем заявку.",
  all: "Компактная сводка всех метрик: сначала ИК (жирным), затем CTR, CR, CVR, Показы, Клики, Просм. ЦС, Лиды, CPC, CPA и Затраты.",
};

function fmtInt(n) {
  n = Number(n) || 0;
  return n.toLocaleString("ru-RU");
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  return `${v.toFixed(2)} $`;
}
function fmtPct(n) {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

// CR, CVR, CPC, CPA с защитой на нули
function safeCR({ leads, clicks }) {
  if (!clicks) return 0;
  return leads / clicks;
}
function safeCVR({ leads, pageviews }) {
  if (!pageviews) return 0;
  return leads / pageviews;
}
function safeCPC({ spend, clicks }) {
  if (!clicks) return Infinity;
  return spend / clicks;
}
function safeCPA({ spend, leads }) {
  if (!leads) return Infinity;
  return spend / leads;
}

// Сведение по выбранным записям
function sumRows(rows) {
  return rows.reduce(
    (a, r) => ({
      impressions: a.impressions + (Number(r.impressions) || 0),
      clicks: a.clicks + (Number(r.clicks) || 0),
      pageviews: a.pageviews + (Number(r.pageviews) || 0),
      leads: a.leads + (Number(r.leads) || 0),
      spend: a.spend + (Number(r.spend) || 0),
    }),
    { impressions: 0, clicks: 0, pageviews: 0, leads: 0, spend: 0 }
  );
}

// Вытягиваем значение метрики из агрегата
function metricValue(agg, id) {
  switch (id) {
    case "ctr":
      return agg.impressions ? agg.clicks / agg.impressions : 0;
    case "cr":
      return safeCR(agg);
    case "cvr":
      return safeCVR(agg);
    case "cpc":
      return safeCPC(agg);
    case "cpa":
      return safeCPA(agg);
    case "impressions":
    case "clicks":
    case "pageviews":
    case "leads":
    case "spend":
      return Number(agg[id]) || 0;
    default:
      return 0;
  }
}

// Индекс качества 0–100 по 5 метрикам, min–max нормализация
function qualityIndex(aggList) {
  // aggList: [{id, data:{impressions, clicks, pageviews, leads, spend}}]
  const W = { ctr: 0.25, cr: 0.25, cvr: 0.2, cpc: 0.15, cpa: 0.15 };
  const series = ["ctr", "cr", "cvr", "cpc", "cpa"];

  const vals = {};
  for (const s of series) {
    vals[s] = aggList.map((x) => metricValue(x.data, s));
  }
  const min = {};
  const max = {};
  for (const s of series) {
    min[s] = Math.min(...vals[s].map((v) => (isFinite(v) ? v : s === "cpc" || s === "cpa" ? Infinity : 0)));
    max[s] = Math.max(...vals[s].map((v) => (isFinite(v) ? v : 0)));
    if (!isFinite(min[s])) min[s] = 0; // если все бесконечности — обнулим
  }

  function norm(v, s) {
    if (!isFinite(v)) return 0;
    const a = min[s];
    const b = max[s];
    if (b === a) return 0.5; // чтобы не давать 0, если все одинаковые
    const raw = (v - a) / (b - a);
    return Math.max(0, Math.min(1, raw));
  }

  // для cpc/cpa инвертируем (ниже — лучше)
  function normDir(v, s) {
    if (s === "cpc" || s === "cpa") return 1 - norm(v, s);
    return norm(v, s);
  }

  const out = [];
  for (let i = 0; i < aggList.length; i++) {
    let score = 0;
    for (const s of series) {
      score += W[s] * normDir(vals[s][i], s);
    }
    out.push(Math.round(score * 100));
  }
  return out;
}

// Ранги 1/2/3 по массиву значений (высшее = лучше или наоборот)
function ranks(values, higher = true) {
  // если есть повторы — ранги не ставим (исключаем подсветку для аккуратности)
  const uniq = Array.from(new Set(values.filter((v) => isFinite(v))));
  if (uniq.length < 3) return values.map(() => undefined);
  if (uniq.length !== values.length) return values.map(() => undefined);

  const sorted = [...values].sort((a, b) => (higher ? b - a : a - b));
  const map = new Map();
  sorted.forEach((v, i) => map.set(v, i + 1)); // 1..n

  return values.map((v) => map.get(v));
}

function clsByRank(r) {
  if (r === 1) return "text-emerald-700 font-bold";
  if (r === 2) return "text-amber-600 font-bold";
  if (r === 3) return "text-red-600 font-bold";
  return "font-bold";
}

export default function AgeBreakdownPanel({ selectedAds = [], since, until }) {
  const [ageRowsByCampaign, setAgeRowsByCampaign] = useState({});
  const [defaultAges, setDefaultAges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Точный возраст по умолчанию
  const [ageFrom, setAgeFrom] = useState(30);
  const [ageTo, setAgeTo] = useState(40);
  const [fineMetric, setFineMetric] = useState("index"); // независимый селект
  const [groupMetric, setGroupMetric] = useState("index"); // селект в блоке групп

  const campaignIds = useMemo(
    () => Array.from(new Set(selectedAds.map((a) => a.__campaign_id).filter(Boolean))),
    [selectedAds]
  );

  // тянем таргетированные возраста (для подсказки) и инсайты по возрасту
  useEffect(() => {
    if (!campaignIds.length) return;
    let dead = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        // какие возраста есть в таргетинге адсетов
        const union = new Set();
        for (const cid of campaignIds) {
          try {
            const ages = await fetchCampaignTargetAges({ campaignId: cid });
            ages.forEach((x) => union.add(x));
          } catch {}
        }
        if (!dead) setDefaultAges(Array.from(union));

        // инсайты с breakdown=age
        const all = {};
        for (const cid of campaignIds) {
          const rows = await fetchCampaignAgeInsights({ campaignId: cid, since, until });
          all[cid] = rows;
        }
        if (!dead) setAgeRowsByCampaign(all);
      } catch (e) {
        if (!dead) setErr(String(e.message || e));
      } finally {
        if (!dead) setLoading(false);
      }
    })();

    return () => {
      dead = true;
    };
  }, [campaignIds.join(","), since, until]);

  // Соберём по ad_id → ageBucket → агрегат
  const byAd = useMemo(() => {
    const map = new Map();
    for (const rows of Object.values(ageRowsByCampaign)) {
      for (const r of rows || []) {
        if (!r?.ad_id || !r?.age) continue;
        const id = String(r.ad_id);
        if (!map.has(id)) map.set(id, {});
        const item = map.get(id)[r.age] || {
          impressions: 0,
          clicks: 0,
          pageviews: 0,
          leads: 0,
          spend: 0,
        };
        item.impressions += Number(r.impressions) || 0;
        item.clicks += Number(r.clicks) || 0;
        item.pageviews += Number(r.pageviews) || 0;
        item.leads += Number(r.leads) || 0;
        item.spend += Number(r.spend) || 0;
        map.get(id)[r.age] = item;
      }
    }
    return map;
  }, [ageRowsByCampaign]);

  // Выборка по точному возрасту (fine window)
  function inFineWindow(age) {
    const [a, b] = age === "65+" ? [65, 120] : age.split("-").map(Number);
    return !(b < ageFrom || a > ageTo);
  }
  const aggFineByAd = useMemo(() => {
    const out = new Map();
    for (const ad of selectedAds) {
      const b = byAd.get(String(ad.ad_id)) || {};
      const rows = Object.entries(b)
        .filter(([age]) => inFineWindow(age))
        .map(([, v]) => v);
      out.set(String(ad.ad_id), sumRows(rows));
    }
    return out;
  }, [selectedAds, byAd, ageFrom, ageTo]);

  // Победитель в точном возрасте по выбранной fineMetric
  const fineWinner = useMemo(() => {
    if (selectedAds.length < 2) return null;

    if (fineMetric === "index") {
      const list = selectedAds.map((ad) => ({ id: String(ad.ad_id), data: aggFineByAd.get(String(ad.ad_id)) || {} }));
      const idx = qualityIndex(list);
      const arr = selectedAds.map((ad, i) => ({ ad, score: idx[i] || 0 }));
      arr.sort((a, b) => b.score - a.score);
      return { metric: "index", ranked: arr };
    }

    const meta = METRICS.find((m) => m.id === fineMetric) || { higher: true };
    const arr = selectedAds.map((ad) => {
      const agg = aggFineByAd.get(String(ad.ad_id)) || {};
      return { ad, score: metricValue(agg, fineMetric) };
    });
    arr.sort((a, b) => (meta.higher ? b.score - a.score : a.score - b.score));
    return { metric: fineMetric, ranked: arr };
  }, [selectedAds, aggFineByAd, fineMetric]);

  // Сводка по окну 30–40
  const fineSummary = useMemo(() => {
    const rows = Array.from(aggFineByAd.values());
    return sumRows(rows);
  }, [aggFineByAd]);

  // Сильные стороны / Что подтянуть (сравниваем победителя vs второй) — CPA, CPC, CVR, CR
  const strengthsWeaknesses = useMemo(() => {
    if (!fineWinner || fineWinner.ranked.length < 2) return { pros: [], cons: [] };
    const best = fineWinner.ranked[0].ad;
    const second = fineWinner.ranked[1].ad;
    const A = aggFineByAd.get(String(best.ad_id)) || {};
    const B = aggFineByAd.get(String(second.ad_id)) || {};

    function deltaPct(valA, valB, higher = true) {
      if (!isFinite(valA) || !isFinite(valB) || valA === 0 || valB === 0) return 0;
      return Math.round((higher ? valA / valB - 1 : valB / valA - 1) * 100);
    }

    const list = [
      { id: "cpa", label: "CPA", a: safeCPA(A), b: safeCPA(B), higher: false },
      { id: "cpc", label: "CPC", a: safeCPC(A), b: safeCPC(B), higher: false },
      { id: "cvr", label: "CVR", a: safeCVR(A), b: safeCVR(B), higher: true },
      { id: "cr", label: "CR", a: safeCR(A), b: safeCR(B), higher: true },
    ];

    const pros = [];
    const cons = [];
    for (const m of list) {
      const d = deltaPct(m.a, m.b, m.higher);
      if (!isFinite(d)) continue;
      if (d >= 10) pros.push(`${m.label}: лучше на ${d}%`);
      if (d <= -10) cons.push(`${m.label}: ниже соперника на ${Math.abs(d)}%`);
    }
    return { pros, cons };
  }, [fineWinner, aggFineByAd]);

  // Таблица «по группам возрастов» — готовим данные и ранги по колонкам
  const groupTable = useMemo(() => {
    // на каждую возрастную строку дадим массив значений по креативам
    const metric = groupMetric;

    // на каждую возрастную строку посчитаем ИК (если он выбран)
    function rowIK(rowAggs) {
      const list = rowAggs.map((x) => ({ id: x.id, data: x.data }));
      const idx = qualityIndex(list);
      return rowAggs.map((x, i) => ({ ...x, value: idx[i] || 0 }));
    }

    return AGE_BUCKETS.map((age) => {
      const rowAggs = selectedAds.map((ad) => {
        const bag = byAd.get(String(ad.ad_id)) || {};
        const agg = bag[age] || { impressions: 0, clicks: 0, pageviews: 0, leads: 0, spend: 0 };
        return { id: String(ad.ad_id), data: agg };
      });

      let values;
      if (metric === "index") {
        values = rowIK(rowAggs).map((x) => x.value);
      } else if (metric === "all") {
        // для all вернём полный набор агрегатов, подсветку не ставим (по ТЗ подсвечиваем только цифры ИК/одной метрики)
        values = rowAggs.map(() => undefined);
      } else {
        values = rowAggs.map((x) => metricValue(x.data, metric));
      }

      const meta = METRICS.find((m) => m.id === metric) || { higher: true };
      const rank = metric === "all" ? rowAggs.map(() => undefined) : ranks(values, meta.higher);

      return {
        age,
        aggs: rowAggs,
        values,
        rank, // ранги для подсветки в каждой колонке
      };
    });
  }, [selectedAds, byAd, groupMetric]);

  return (
    <div className="mt-8">
      {/* ======= СРАВНЕНИЕ ПО ТОЧНОМУ ВОЗРАСТУ ======= */}
      <div>
        <div className="text-base font-semibold">Сравнение по точному возрасту ЦА</div>
        <div className="text-xs text-gray-500 mb-3">
          Введите точный возраст вашей целевой аудитории и выберите метрику. По умолчанию — Индекс качества.
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-xs text-gray-600 mb-1">Точная ЦА</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={18}
                max={120}
                value={ageFrom}
                onChange={(e) => setAgeFrom(Math.max(18, Math.min(120, Number(e.target.value) || 0)))}
                className="w-16 rounded-md border px-2 py-1"
              />
              <span className="text-sm">—</span>
              <input
                type="number"
                min={18}
                max={120}
                value={ageTo}
                onChange={(e) => setAgeTo(Math.max(18, Math.min(120, Number(e.target.value) || 0)))}
                className="w-16 rounded-md border px-2 py-1"
              />
              <span className="text-sm text-gray-500">лет</span>
            </div>
            {!!defaultAges.length && (
              <div className="mt-1 text-[11px] text-gray-500">
                Подсказка из AM: {defaultAges.join(", ")}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Метрика</div>
            <select
              value={fineMetric}
              onChange={(e) => setFineMetric(e.target.value)}
              className="rounded-md border px-2 py-1"
            >
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 text-right text-xs text-gray-500">
            {loading ? "Загрузка возрастной разбивки…" : err ? <span className="text-red-600">{err}</span> : null}
          </div>
        </div>

        {/* Карточки результата */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Победитель */}
          <div className="rounded-2xl border p-4 bg-emerald-50">
            <div className="text-xs text-gray-500 mb-1">Победитель в точном возрасте {ageFrom}–{ageTo}</div>
            {fineWinner && fineWinner.ranked.length ? (
              <>
                <div className="text-base font-semibold">
                  {fineWinner.ranked[0].ad.name || fineWinner.ranked[0].ad.ad_id}
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  {fineMetric === "index" ? (
                    <>ИК: <b>{fineWinner.ranked[0].score}</b> / 100</>
                  ) : (
                    <>
                      {METRICS.find((m) => m.id === fineMetric)?.label}:{" "}
                      <b>
                        {(() => {
                          const v = fineWinner.ranked[0].score;
                          if (["cpc", "cpa", "spend"].includes(fineMetric)) return fmtMoney(v);
                          if (["ctr", "cr", "cvr"].includes(fineMetric)) return fmtPct(v);
                          return fmtInt(v);
                        })()}
                      </b>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500">—</div>
            )}
          </div>

          {/* Насколько лучше второго */}
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500 mb-1">Насколько лучше второго</div>
            <div className="text-2xl font-semibold">
              {fineWinner && fineWinner.ranked.length >= 2 ? (
                (() => {
                  const a = fineWinner.ranked[0].score || 0;
                  const b = fineWinner.ranked[1].score || 0;
                  if (!isFinite(a) || !isFinite(b) || b === 0) return "—";
                  const higher = (METRICS.find((m) => m.id === fineMetric) || { higher: true }).higher;
                  const rel = Math.round((higher ? a / b - 1 : b / a - 1) * 100);
                  return `${rel}%`;
                })()
              ) : (
                "—"
              )}
            </div>
          </div>

          {/* Объяснение (только под верхний селект) */}
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500 mb-1">Объяснение</div>
            <div className="text-sm text-gray-700 leading-snug">{MEXPLAIN[fineMetric] || ""}</div>
          </div>
        </div>

        {/* Сильные стороны / Что подтянуть + сводка по окну */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500 mb-1">Сильные стороны победителя</div>
            <ul className="list-disc pl-5 text-sm text-gray-700">
              {strengthsWeaknesses.pros.length ? (
                strengthsWeaknesses.pros.map((s, i) => <li key={i}>{s}</li>)
              ) : (
                <li className="text-gray-500">—</li>
              )}
            </ul>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500 mb-1">Что подтянуть</div>
            <ul className="list-disc pl-5 text-sm text-gray-700">
              {strengthsWeaknesses.cons.length ? (
                strengthsWeaknesses.cons.map((s, i) => <li key={i}>{s}</li>)
              ) : (
                <li className="text-gray-500">—</li>
              )}
            </ul>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500 mb-1">Сводка в окне {ageFrom}–{ageTo}</div>
            <div className="text-sm text-gray-700 space-x-2">
              <b>Показы:</b> {fmtInt(fineSummary.impressions)} • <b>Клики:</b> {fmtInt(fineSummary.clicks)} •{" "}
              <b>Просм. ЦС:</b> {fmtInt(fineSummary.pageviews)} • <b>Лиды:</b> {fmtInt(fineSummary.leads)} •{" "}
              <b>Затраты:</b> {fmtMoney(fineSummary.spend)}
            </div>
          </div>
        </div>
      </div>

      {/* ======= СРАВНЕНИЕ ПО ГРУППАМ ВОЗРАСТОВ ======= */}
      <div className="mt-8">
        <div className="text-base font-semibold">Сравнение по группам возрастов</div>
        <div className="text-xs text-gray-500">Выберите любую метрику для сравнения. По умолчанию — Индекс качества.</div>

        {/* селект метрики прямо под заголовком (лево) */}
        <div className="mt-2">
          <label className="text-xs text-gray-600 mr-2">Метрика:</label>
          <select
            value={groupMetric}
            onChange={(e) => setGroupMetric(e.target.value)}
            className="rounded-md border px-2 py-1"
          >
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Таблица Возраст × Креативы */}
        <div className="overflow-x-auto mt-3">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 pr-3">Возраст</th>
                {selectedAds.map((a) => (
                  <th key={a.ad_id} className="py-2 pr-6">
                    {a.name || a.ad_id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupTable.map((row, rowIdx) => {
                // для каждой колонки (креатива) нужно знать ранги среди возрастов этого столбца;
                // row.rank уже содержит ранги в пределах строки между креативами,
                // но по ТЗ подсвечиваем ПЕРЕДОВЫЕ ВОЗРАСТА внутри столбца.
                // Поэтому рассчитаем ещё раз — по столбцам:
                return (
                  <tr key={row.age} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-medium">{row.age}</td>
                    {selectedAds.map((a, colIdx) => {
                      const data = row.aggs[colIdx]?.data || {
                        impressions: 0,
                        clicks: 0,
                        pageviews: 0,
                        leads: 0,
                        spend: 0,
                      };

                      const value =
                        groupMetric === "index"
                          ? (() => {
                              // посчитать ИК для этой строки между креативами
                              const list = selectedAds.map((ad) => {
                                const bag = row.aggs.find((x) => x.id === String(ad.ad_id))?.data || {
                                  impressions: 0,
                                  clicks: 0,
                                  pageviews: 0,
                                  leads: 0,
                                  spend: 0,
                                };
                                return { id: String(ad.ad_id), data: bag };
                              });
                              const idx = qualityIndex(list);
                              return idx[colIdx] || 0;
                            })()
                          : groupMetric === "all"
                          ? undefined
                          : metricValue(data, groupMetric);

                      // ранг внутри КОЛОНКИ (креатива) — сравним по всем возрастам значение этого креатива
                      const columnValues = groupTable.map((r) =>
                        groupMetric === "index"
                          ? (() => {
                              const list = selectedAds.map((ad) => {
                                const bag = r.aggs.find((x) => x.id === String(ad.ad_id))?.data || {
                                  impressions: 0,
                                  clicks: 0,
                                  pageviews: 0,
                                  leads: 0,
                                  spend: 0,
                                };
                                return { id: String(ad.ad_id), data: bag };
                              });
                              const idx = qualityIndex(list);
                              return idx[colIdx] || 0;
                            })()
                          : groupMetric === "all"
                          ? NaN
                          : metricValue(r.aggs[colIdx]?.data || {}, groupMetric)
                      );
                      const meta = METRICS.find((m) => m.id === groupMetric) || { higher: true };
                      const columnRanks =
                        groupMetric === "all" ? columnValues.map(() => undefined) : ranks(columnValues, meta.higher);
                      const rankCls = clsByRank(columnRanks[rowIdx]);

                      return (
                        <td key={`${row.age}-${a.ad_id}`} className="py-2 pr-6">
                          {groupMetric === "all" ? (
                            <div className="text-[13px] leading-5">
                              <div>
                                <b>ИК:</b>{" "}
                                <span className="font-bold">
                                  {(() => {
                                    const list = selectedAds.map((ad) => {
                                      const bag = row.aggs.find((x) => x.id === String(ad.ad_id))?.data || {
                                        impressions: 0,
                                        clicks: 0,
                                        pageviews: 0,
                                        leads: 0,
                                        spend: 0,
                                      };
                                      return { id: String(ad.ad_id), data: bag };
                                    });
                                    const idx = qualityIndex(list);
                                    return `${idx[colIdx] || 0} / 100`;
                                  })()}
                                </span>
                              </div>
                              <div>
                                <b>CTR:</b> {fmtPct(metricValue(data, "ctr"))} • <b>CR:</b>{" "}
                                {fmtPct(metricValue(data, "cr"))} • <b>CVR:</b> {fmtPct(metricValue(data, "cvr"))}
                              </div>
                              <div>
                                <b>Показы:</b> {fmtInt(data.impressions)} • <b>Клики:</b> {fmtInt(data.clicks)} •{" "}
                                <b>Просм. ЦС:</b> {fmtInt(data.pageviews)} • <b>Лиды:</b> {fmtInt(data.leads)}
                              </div>
                              <div>
                                <b>CPC:</b> {fmtMoney(metricValue(data, "cpc"))} • <b>CPA:</b>{" "}
                                {fmtMoney(metricValue(data, "cpa"))} • <b>Затраты:</b> {fmtMoney(data.spend)}
                              </div>
                            </div>
                          ) : groupMetric === "index" ? (
                            <span className={rankCls}>
                              ИК: {value} / 100
                            </span>
                          ) : ["ctr", "cr", "cvr"].includes(groupMetric) ? (
                            <span className={rankCls}>{fmtPct(value)}</span>
                          ) : ["cpc", "cpa", "spend"].includes(groupMetric) ? (
                            <span className={rankCls}>{fmtMoney(value)}</span>
                          ) : (
                            <span className={rankCls}>{fmtInt(value)}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Объяснение под таблицей именно для НИЖНЕГО селекта */}
        <div className="mt-2 text-xs text-gray-600">
          <b>Объяснение:</b> {MEXPLAIN[groupMetric] || ""}
        </div>
      </div>
    </div>
  );
}

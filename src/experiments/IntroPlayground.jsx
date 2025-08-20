import React, { useMemo, useState } from "react";

/* =========================
   Палитра и базовые стили
   ========================= */
const BLUE = "#1877F2";
const PAGE_BG = "#F0F2F5";
const TEXT = "#434242";
const LINE = "#BABABA";

/* =========================
   Цели (как в Meta)
   ========================= */
const GOALS = [
  { id: "awareness", label: "Узнаваемость", hint: "Повысить узнаваемость бренда." },
  { id: "traffic", label: "Трафик", hint: "Привести людей на сайт/лендинг." },
  { id: "engagement", label: "Вовлечённость", hint: "Лайки, комментарии, сохранения." },
  { id: "leads", label: "Лиды", hint: "Сбор заявок через форму/сообщения." },
  { id: "app", label: "Продвижение приложения", hint: "Установки и события в приложении." },
  { id: "sales", label: "Продажи", hint: "Онлайн-покупки и выручка." },
];

/* =========================
   Поля по целям (знак ? = опционально)
   Порядок для awareness: Reach → Impressions → Spend(+валюта) → CTR? → Реакции?
   ========================= */
const FIELDS = {
  awareness: ["reach", "impressions", "spend", "ctr?", "reactions?"],
  traffic: ["impressions", "clicks", "pageviews?", "spend?"],
  engagement: ["impressions", "engagements", "spend?"],
  leads: ["impressions", "clicks", "pageviews?", "leads", "spend"],
  app: ["impressions", "installs", "clicks?", "spend"],
  sales: ["impressions?", "clicks", "purchases", "revenue", "spend"],
};

const LABELS = {
  impressions: "Показы",
  reach: "Охват",
  clicks: "Клики",
  pageviews: "Просм. целевой страницы",
  engagements: "Взаимодействия (лайк/коммент/сохран.)",
  leads: "Лиды",
  installs: "Установки",
  purchases: "Покупки",
  revenue: "Выручка",
  spend: "Затраты",
  ctr: "CTR (Click-Through Rate)",
  reactions: "Реакции на публикацию",
};

/* Описания метрик для тултипов (таблица) */
const METRIC_DESCRIPTIONS = {
  "Охват (Reach)":
    "Сколько уникальных людей увидели рекламу хотя бы один раз.",
  "Показы (Impressions)":
    "Сколько раз реклама была показана (один человек может увидеть несколько раз).",
  "Затраты / CPM":
    "Затраты — сколько потратили. CPM — цена 1000 показов.",
  "CTR":
    "Click-Through Rate — доля людей, кликнувших по объявлению (клики / показы).",
  "Реакции":
    "Сумма лайков, комментариев, репостов и др. взаимодействий.",
  "Клики (оценка)":
    "Оценка: CTR × показы.",
  "CPC (оценка)":
    "Цена клика: затраты / клики (оценочные).",
  "LP / Лиды / Продажи / Выручка":
    "Данные сайта/продаж. Для точности подключите Ads Manager.",
};

/* Термины для выделения в текстах анализа */
const TERMS = [
  { key: "CTR", def: "Click-Through Rate — доля кликов: клики / показы." },
  { key: "CPM", def: "Cost per Mille — цена 1000 показов." },
  { key: "CPC", def: "Cost per Click — цена клика: затраты / клики." },
  { key: "Частота", def: "Impressions / Reach — среднее число показов на человека." },
  { key: "ER", def: "Engagement Rate — вовлечённость: реакции / показы." },
];

/* =========================
   Форматтеры и утилиты
   ========================= */
const N = (v) => (+v || 0);
const safe = (a, b) => (b > 0 ? a / b : 0);

const fNum = (v) => (Number.isFinite(v) ? new Intl.NumberFormat("ru-RU").format(v) : "—");
const fPct = (v, d = 2) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "—");
const fMoney = (v, cur = "UAH") =>
  Number.isFinite(v) ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: cur }).format(v) : "—";

/** Нормализация ввода (включая CTR) */
function toNum(raw, key) {
  if (raw == null) return 0;
  const original = String(raw);
  let s = original
    .replace(/\s/g, "")
    .replace(/,/g, ".")
    .replace(/[₴$]/g, "")
    .replace(/грн|uah|usd|eur|pln/gi, "")
    .replace("%", "");
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  if (key === "ctr") {
    if (original.includes("%")) return n / 100;
    if (n > 1) return n / 100;
    const decimals = (s.split(".")[1] || "").length;
    return decimals <= 2 ? n / 100 : n;
  }
  return n;
}

/* =========================
   Термины в тексте: выделение + ховер
   ========================= */
function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function Term({ children, def }) {
  return (
    <span
      title={def}
      style={{ color: BLUE, textDecoration: "underline dotted" }}
    >
      {children}
    </span>
  );
}
function renderWithTerms(text) {
  if (!text) return null;
  const map = Object.fromEntries(TERMS.map((t) => [t.key, t.def]));
  const keys = TERMS.map((t) => escapeReg(t.key)).join("|");
  const re = new RegExp(`\\b(${keys})\\b`, "g");
  const parts = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[1];
    parts.push(<Term key={parts.length} def={map[t]}>{t}</Term>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/* =========================
   Оценка статуса CTR (для словесных выводов)
   ========================= */
function ctrStatus(ctr) {
  if (!Number.isFinite(ctr)) return { label: "нет данных", line: "CTR — данных нет." };
  if (ctr >= 0.10) return { label: "Космос", line: `CTR ${fPct(ctr)} — выдающийся результат. Масштабируйте аккуратно.` };
  if (ctr >= 0.03) return { label: "Вау", line: `CTR ${fPct(ctr)} — вау-уровень (3%+). Сохраняйте паттерн креатива.` };
  if (ctr >= 0.02) return { label: "Хорошо", line: `CTR ${fPct(ctr)} — хорошо. Можно масштабировать.` };
  if (ctr >= 0.008) return { label: "Средне", line: `CTR ${fPct(ctr)} — средне. Усильте хук: эмоция + выгода + один CTA.` };
  return {
    label: "Нужна помощь",
    line: `CTR ${fPct(ctr)} — ниже добрых ориентиров (1–2%). Начните с первого кадра: эмоция/проблема → выгода → CTA.`,
  };
}

/* =========================
   ЖИВОЙ АНАЛИЗ (математика + правила)
   ========================= */
function deriveModel({ reach = 0, impressions = 0, spend = 0, ctrInput = null, reactions = 0, currency = "UAH" }) {
  const ctr = (function normalizeCTR(raw) {
    if (raw == null) return 0;
    const s0 = String(raw), s = s0.replace(/\s/g, "").replace(",", ".").replace("%", "");
    const n = parseFloat(s);
    if (!isFinite(n)) return 0;
    if (s0.includes("%")) return n / 100;
    if (n > 1) return n / 100;
    const dec = (s.split(".")[1] || "").length;
    return dec <= 2 ? n / 100 : n;
  })(ctrInput);

  const freq = safe(impressions, reach);
  const cpm = safe(spend, impressions / 1000);
  const clicksEst = Math.round(ctr * impressions) || 0;
  const cpcEst = safe(spend, clicksEst);

  const cap = 3;
  const extraImpr = Math.max(0, impressions - reach * cap);
  const cpi = safe(spend, impressions);
  const extraBudget = extraImpr * cpi;
  const extraReach = Math.round(extraImpr / cap);

  return { reach, impressions, spend, reactions, currency, ctr, freq, cpm, clicksEst, cpcEst, extraImpr, extraBudget, extraReach };
}
function whatIfCTR(m, target) {
  const tgt = Math.min(target, 0.04); // целимся в 3–4%
  const tgtClicks = Math.round(tgt * m.impressions) || 0;
  const tgtCPC = safe(m.spend, tgtClicks);
  return { target: tgt, tgtClicks, tgtCPC, deltaClicks: tgtClicks - m.clicksEst, deltaCPC: tgtCPC - m.cpcEst };
}

const rules = [
  {
    id: "freq_high",
    when: (m) => m.freq >= 3.5 && m.reach > 0,
    say: [
      (m) => `Перегрев Частота ${m.freq.toFixed(1)}. Лишние показы ≈ ${fNum(m.extraImpr)} (${fMoney(m.extraBudget, m.currency)}). Можно показать рекламу ещё ${fNum(m.extraReach)} людям без доп. бюджета.`,
      (m) => `Частота ${m.freq.toFixed(1)} — аудитория устала. Около ${fNum(m.extraImpr)} показов «в никуда» (≈ ${fMoney(m.extraBudget, m.currency)}).`,
    ],
    action: () => `Поставьте frequency cap 2–3/7 дней и добавьте 1–2 свежих креатива.`,
  },
  {
    id: "ctr_low",
    when: (m) => m.ctr < 0.01,
    say: [
      (m) => `CTR ${fPct(m.ctr)} — ниже добрых ориентиров (1–2%). Первый кадр: эмоция/проблема → выгода → один CTA.`,
      (m) => `Кликают мало (${fPct(m.ctr)}). Усильте хук, сформулируйте выгоду в цифрах.`,
    ],
    action: () => `Цель CTR ≥ 1.0%.`,
  },
  {
    id: "ctr_ok",
    when: (m) => m.ctr >= 0.02 && m.ctr < 0.03,
    say: [(m) => `CTR ${fPct(m.ctr)} — хорошо, можно масштабировать. Доработка первого кадра даст +0.3–0.6 п.п.`],
    action: () => `Плавное увеличение бюджета и тест форматов (stories/карусель).`,
  },
  {
    id: "ctr_wow",
    when: (m) => m.ctr >= 0.03,
    say: [(m) => `CTR ${fPct(m.ctr)} — вау-уровень. Сохраняйте идею и масштабируйте аккуратно.`],
    action: () => `+20–30% бюджета при контроле Частота и CPM.`,
  },
  {
    id: "cpm_high",
    when: (m) => Number.isFinite(m.cpm) && m.cpm > 40,
    say: [(m) => `CPM ${fMoney(m.cpm, m.currency)} — выше среднего. Свежие креативы/новые интересы часто дают −10…−20%.`],
    action: () => `Расширьте плейсменты (Reels) и тестируйте новые интересы.`,
  },
  {
    id: "where_put_creatives",
    when: (m) => true,
    say: [
      (m) =>
        m.freq >= 3.5 || m.ctr < 0.01
          ? `Начните с обновления в текущей кампании (сохранится обучение). Если через 5–7 дней CTR < 1% или CPM > ${fMoney(
              40,
              m.currency
            )} — запустите новую кампанию для «чистого старта».`
          : "Обновляйте креативы в текущей кампании: быстрее и нагляднее сравнение «до/после».",
    ],
    action: () => `Текущая кампания → новые креативы; при слабой динамике — новая кампания.`,
  },
];

const pick = (arr, seed = 0) => (arr && arr.length ? arr[Math.abs(seed * 97) % arr.length] : "");

function buildReport(input, { seed = 7 } = {}) {
  const m = deriveModel(input);

  // Ключевые наблюдения
  const tldr = [];
  if (Number.isFinite(m.freq)) {
    if (m.freq >= 3.5)
      tldr.push(
        `Перегрев Частота ${m.freq.toFixed(1)}. Лишние показы: ${fNum(m.extraImpr)} → ≈ ${fMoney(
          m.extraBudget,
          m.currency
        )} или +${fNum(m.extraReach)} новых людей.`
      );
    else if (m.freq >= 2.5) tldr.push(`Частота ${m.freq.toFixed(1)} — рабочая зона 2.5–3.0.`);
  }
  if (Number.isFinite(m.cpm)) tldr.push(`CPM ${fMoney(m.cpm, m.currency)}. Новые креативы/аудитории обычно дают −10…−20%.`);
  if (Number.isFinite(m.ctr)) tldr.push(ctrStatus(m.ctr).line);

  const cards = rules
    .filter((r) => r.when(m))
    .map((r, i) => ({ id: r.id, text: pick(r.say.map((fn) => fn(m)), seed + i), action: r.action ? r.action(m) : "" }));

  const dashIfZero = (value, text) => (N(value) === 0 ? "—" : text);

  const freqComment = Number.isFinite(m.freq)
    ? m.freq >= 3.5
      ? `Частота ≈ ${m.freq.toFixed(1)} — перегрев и «баннерная слепота»`
      : m.freq >= 2.5
      ? `Частота ≈ ${m.freq.toFixed(1)} — рабочая зона 2.5–3.0`
      : `Частота ≈ ${m.freq.toFixed(1)} — контактов мало, можно масштабировать`
    : "—";

  const diagnostics = [
    ["Охват (Reach)", fNum(m.reach), dashIfZero(m.reach, m.reach >= 1_000_000 ? "Отличный масштаб — бренд заметен широкой аудитории" : "Охват скромный — стоит расширить аудитории или бюджет")],
    ["Показы (Impressions)", fNum(m.impressions), dashIfZero(m.impressions, freqComment)],
    ["Затраты / CPM", `${fMoney(m.spend, m.currency)} / ${fMoney(m.cpm, m.currency)}`, dashIfZero(m.spend, Number.isFinite(m.cpm) ? (m.cpm > 40 ? "Дороговато для охвата — есть запас снижения" : "Ниже/около среднего") : "—")],
    ["CTR", fPct(m.ctr), dashIfZero(m.ctr, m.ctr < 0.01 ? "Слабый хук. Люди видят, но не кликают" : "Ок/выше нормы")],
    ["Реакции", fNum(m.reactions), dashIfZero(m.reactions, m.reactions && m.impressions ? `ER ≈ ${(m.reactions / m.impressions * 100).toFixed(2)}% — эмоция есть` : "—")],
    ["Клики (оценка)", fNum(m.clicksEst), dashIfZero(m.clicksEst, "CTR × показы")],
    ["CPC (оценка)", fMoney(m.cpcEst, m.currency), dashIfZero(m.clicksEst && m.spend, "Затраты / клики")],
    ["LP / Лиды / Продажи / Выручка", "нет данных", "Для точности подключите Ads Manager"],
  ];

  return { m, tldr, cards, diagnostics };
}

/* ===== Рекомендации ИИ: скоринг и топ-3 ===== */
function whatIfUp(m, factor) {
  const base = Number.isFinite(m.ctr) && m.ctr > 0 ? m.ctr : 0.01;
  const target = Math.min(base * factor, 0.04);
  return whatIfCTR(m, target);
}
function buildRecommendations(m) {
  const items = [];

  if (Number.isFinite(m.freq) && m.freq >= 3.5 && m.reach > 0) {
    const score = 100 + Math.min(100, (m.extraBudget || 0) / Math.max(1, m.spend || 1) * 100);
    items.push({
      id: "rec_freq_cap",
      score,
      title: "Снизить частоту до 3.0 и ротация креативов",
      reason: `Частота ${m.freq.toFixed(1)} → лишние показы ≈ ${fNum(m.extraImpr)} (${fMoney(m.extraBudget, m.currency)}).`,
      action: "Поставьте frequency cap 2–3/7 дней, добавьте 1–2 новых креатива.",
      effect: `Ожидание: вернуть часть бюджета или показать +${fNum(m.extraReach)} людям без доп. затрат.`,
      effort: "M",
      confidence: "80%",
    });
  }

  if (Number.isFinite(m.ctr) && m.impressions > 0 && m.ctr < 0.01) {
    const s1 = whatIfCTR(m, 0.01);
    const score = 90 + Math.min(100, (s1.tgtClicks - m.clicksEst) / Math.max(1, m.clicksEst || 1) * 100);
    items.push({
      id: "rec_ctr_boost",
      score,
      title: "Усилить хук в первом кадре (цель CTR ≥ 1.0%)",
      reason: `Сейчас CTR ${fPct(m.ctr)} на объёме ${fNum(m.impressions)} показов.`,
      action: "Первый кадр: эмоция/проблема → конкретная выгода → один CTA.",
      effect: `Если CTR = 1.0%: клики ${fNum(s1.tgtClicks)} (${s1.deltaClicks > 0 ? "+" : ""}${fNum(s1.deltaClicks)}), CPC ≈ ${fMoney(s1.tgtCPC, m.currency)}.`,
      effort: "M",
      confidence: "75%",
    });
  }

  if (Number.isFinite(m.cpm) && m.cpm > 0 && m.impressions > 0) {
    const save10 = m.spend * 0.10;
    const save20 = m.spend * 0.20;
    const score = m.cpm > 40 ? 70 : 50;
    items.push({
      id: "rec_cpm_down",
      score,
      title: "Снизить CPM через новые интересы/плейсменты",
      reason: `CPM ${fMoney(m.cpm, m.currency)} при ${fNum(m.impressions)} показов.`,
      action: "Добавьте Reels/Stories, расширьте интересы, обновите баннеры/видео.",
      effect: `Ориентир: экономия ${fMoney(save10, m.currency)} – ${fMoney(save20, m.currency)} на текущем бюджете.`,
      effort: "S",
      confidence: "70%",
    });
  }

  {
    const hard = m.freq >= 3.5 || m.ctr < 0.01;
    items.push({
      id: "rec_where_put",
      score: 60,
      title: "Куда загрузить новые креативы",
      reason: hard ? "Метрики указывают на перегрев/слабый CTR." : "Метрики нейтральные — можно обновляться в текущей кампании.",
      action: hard
        ? `Начните с обновления в текущей кампании (сохранится обучение). Если через 5–7 дней CTR < 1% или CPM > ${fMoney(40, m.currency)} — запустите новую кампанию.`
        : "Обновляйте в текущей кампании: быстрее и нагляднее сравнение «до/после».",
      effect: "Контроль: динамика CTR/CPM за 5–7 дней после обновления.",
      effort: "S",
      confidence: "65%",
    });
  }

  if (m.reach >= 200_000 && m.ctr < 0.01) {
    items.push({
      id: "rec_rmkt",
      score: 55,
      title: "Включить ремаркетинг 3–7 дней",
      reason: `Большой охват ${fNum(m.reach)} при низком CTR (${fPct(m.ctr)}).`,
      action: "Создайте аудитории «видели, но не кликнули» и «смотрели видео 3+ сек».",
      effect: "Ожидание: рост кликов и снижение CPC за счёт «тёплой» аудитории.",
      effort: "S",
      confidence: "70%",
    });
  }

  return items.sort((a, b) => b.score - a.score).slice(0, 3);
}

/* ===== Перспективы: живые фразы (вместо CTR-таблиц) ===== */
function buildProspects(m) {
  const phrases = [];
  const base = Number.isFinite(m.ctr) && m.ctr > 0 ? m.ctr : 0.01;
  const factors = [1.5, 2, 3];
  factors.forEach((mult) => {
    const s = whatIfUp(m, mult);
    const clicksCur = m.clicksEst;
    const cpcCur = m.cpcEst;

    const clicksPart =
      Number.isFinite(clicksCur) && Number.isFinite(s.tgtClicks)
        ? `кликов станет ${fNum(s.tgtClicks)} (${s.deltaClicks > 0 ? "+" : ""}${fNum(s.deltaClicks)})`
        : "кликов станет больше";
    const cpcPart =
      Number.isFinite(cpcCur) && Number.isFinite(s.tgtCPC)
        ? `, а CPC ≈ ${fMoney(s.tgtCPC, m.currency)}${Number.isFinite(s.deltaCPC) ? ` (${s.deltaCPC < 0 ? "дешевле на " : "дороже на "}${fMoney(Math.abs(s.deltaCPC), m.currency)})` : ""}`
        : "";

    phrases.push(`Если CTR вырастет ~в ${mult} раза до ${fPct(s.target, 1)} на том же бюджете: ${clicksPart}${cpcPart}.`);
  });

  if (Number.isFinite(m.freq) && m.freq >= 3.5 && m.reach > 0) {
    phrases.push(
      `Снижение Частота до 3.0 высвободит ≈ ${fMoney(m.extraBudget, m.currency)} или добавит охват ~${fNum(
        m.extraReach
      )} людей без увеличения бюджета.`
    );
  }

  phrases.push("Цель по кликабельности — двигаться к 3–4% CTR за счёт сильного первого кадра и чёткого CTA.");

  return phrases;
}

/* =========================
   Компонент страницы
   ========================= */
export default function IntroPlayground() {
  const [goal, setGoal] = useState("awareness");
  const [currency, setCurrency] = useState("UAH");
  const [dataSrc, setDataSrc] = useState("manual"); // manual / csv / api
  const [form, setForm] = useState({});

  const requiredList = (FIELDS[goal] ?? []).filter((f) => !f.endsWith("?"));
  const vals = new Proxy(
    {},
    {
      get(_, k) {
        return N(form[k]);
      },
    }
  );

  const onChange = (key) => (e) => setForm({ ...form, [key]: toNum(e.target.value, key) });

  /* ===== Расчёты по цели (локально) ===== */
  useMemo(() => {}, [goal, form]); // (оставлено для будущей логики)

  // Статусы заполнения
  const requiredFilled = requiredList.every((k) => N(form[k]) > 0);
  const requiredAllZero = requiredList.every((k) => N(form[k]) === 0);
  const missing = requiredList.filter((k) => N(form[k]) <= 0).map((k) => LABELS[k] || k);

  // Живой отчёт
  const modelInput = {
    reach: vals.reach,
    impressions: vals.impressions,
    spend: vals.spend,
    ctrInput: form.ctr,
    reactions: vals.reactions,
    currency,
  };
  const report = buildReport(modelInput, { seed: 7 });

  // Для рекомендаций/перспектив — добавим оценочные клики/СPC
  const mFull = {
    ...report.m,
    clicksEst: Math.round((Number.isFinite(report.m.ctr) ? report.m.ctr : 0) * report.m.impressions) || 0,
    cpcEst: safe(report.m.spend, Math.round((Number.isFinite(report.m.ctr) ? report.m.ctr : 0) * report.m.impressions) || 0),
  };

  const recs = buildRecommendations(mFull);
  const prospects = buildProspects(mFull);

  /* ===== Рендер ===== */
  return (
    <div className="min-h-screen" style={{ background: PAGE_BG, color: TEXT }}>
      {/* ШАПКА */}
      <header style={{ borderBottom: `1px solid ${LINE}` }} className="bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Логотип из public/logo.png — оригинальный размер */}
            <img src="/logo.png" alt="AdsRays — Анализ рекламы Ads Manager (Facebook, Instagram)" />
            <h1 className="text-base font-normal leading-tight" style={{ color: BLUE }}>
              Анализ рекламы Ads Manager (Facebook, Instagram)
            </h1>
          </div>
        </div>
      </header>

      {/* ТЕЛО */}
      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Левая колонка */}
        <section className="md:col-span-1 rounded-[5px] p-4 bg-white" style={{ border: `1px solid ${LINE}` }}>
          <h2 className="text-lg font-semibold mb-3">Источник данных</h2>

          <div className="mb-4">
            <select
              className="w-full px-3 py-2 rounded-[5px] text-sm bg-white"
              style={{ border: `1px solid ${LINE}` }}
              value={dataSrc}
              onChange={(e) => setDataSrc(e.target.value)}
            >
              <option value="manual">Ввод вручную</option>
              <option value="csv">Загрузить отчёт .CSV</option>
              <option value="api">Автоматически из AdsManager</option>
            </select>
          </div>

          <h2 className="text-lg font-semibold mb-2">Какая цель рекламы?</h2>
          <div className="grid grid-cols-1 gap-2 mb-3">
            {GOALS.map((g) => (
              <label
                key={g.id}
                className="flex items-center justify-between px-3 py-2 rounded-[5px] text-sm bg-white"
                style={{ border: `1px solid ${LINE}` }}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="goal" checked={goal === g.id} onChange={() => setGoal(g.id)} />
                  {g.label}
                </span>
                <InfoDot text={g.hint} />
              </label>
            ))}
          </div>

          <div className="mt-3">
            <h2 className="text-lg font-semibold mb-2">Ввод данных</h2>

            {(FIELDS[goal] ?? []).map((f) => {
              const optional = f.endsWith("?");
              const key = optional ? f.slice(0, -1) : f;

              if (key === "spend") {
                return (
                  <div key={f} className="mb-3">
                    <label className="block text-sm mb-1">{LABELS[key]}</label>
                    <div className="flex items-center gap-2 w-full">
                      <input
                        className="flex-1 px-2 py-1.5 rounded-[5px] text-sm text-right bg-white"
                        style={{ border: `1px solid ${LINE}` }}
                        inputMode="text"
                        onChange={onChange(key)}
                      />
                      <select
                        className="w-24 px-2 py-1.5 rounded-[5px] text-sm bg-white"
                        style={{ border: `1px solid ${LINE}` }}
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        title="Валюта затрат"
                      >
                        {["UAH", "USD", "EUR", "PLN"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              }

              return (
                <div key={f} className="mb-3">
                  <label className="block text-sm mb-1">{LABELS[key]}</label>
                  <input
                    className="w-full px-2 py-1.5 rounded-[5px] text-sm text-right bg-white"
                    style={{ border: `1px solid ${LINE}` }}
                    inputMode="text"
                    onChange={onChange(key)}
                  />
                </div>
              );
            })}

            {/* Дисклеймер + ссылка */}
            <div className="mt-4 text-sm" style={{ color: TEXT }}>
              <div className="mb-2">
                Это ознакомительный расчёт — цифры ориентировочные. Для профессионального анализа и сравнения с реальными кампаниями
                пройдите короткую настройку подключения к Ads Manager (Facebook, Instagram). Потратьте всего несколько минут и получите:
              </div>
              <ul className="list-disc pl-5 space-y-1">
                <li>Автоподтягивание кампаний, адсетов и креативов</li>
                <li>Точные метрики и тренды по дням</li>
                <li>Сравнение кампаний и возрастов, Индекс качества 0–100</li>
                <li>Экспорт отчётов в PDF/CSV</li>
                <li>Автосигналы: рост CPM, падение CTR, всплески CPA</li>
              </ul>
              <a href="/connect" className="inline-block mt-3 font-semibold" style={{ color: BLUE }}>
                Подключить Ads Manager →
              </a>
            </div>
          </div>
        </section>

        {/* Правая колонка */}
        <section className="md:col-span-2 rounded-[5px] p-4 bg-white" style={{ border: `1px solid ${LINE}` }}>
          {/* ===== Диагностика по текущим данным ===== */}
          <h2 className="text-lg font-semibold mb-2">Диагностика по текущим данным</h2>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm bg-white" style={{ borderCollapse: "collapse", border: `1px solid ${LINE}` }}>
              <thead>
                <tr style={{ background: PAGE_BG }}>
                  <th className="text-left p-2" style={{ border: `1px solid ${LINE}`, color: TEXT }}>Метрика</th>
                  <th className="text-left p-2" style={{ border: `1px solid ${LINE}`, color: TEXT }}>Значение</th>
                  <th className="text-left p-2" style={{ border: `1px solid ${LINE}`, color: TEXT }}>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {report.diagnostics.map((row, i) => {
                  const name = row[0];
                  const value = row[1];
                  const comment = row[2];
                  return (
                    <tr key={i}>
                      <td className="p-2" style={{ border: `1px solid ${LINE}`, color: TEXT }}>
                        <span className="inline-flex items-center gap-2">
                          {name}
                          <InfoDot color={TEXT} text={METRIC_DESCRIPTIONS[name] || "Описание метрики"} />
                        </span>
                      </td>
                      <td className="p-2" style={{ border: `1px solid ${LINE}`, color: TEXT }}>{value}</td>
                      <td className="p-2" style={{ border: `1px solid ${LINE}`, color: TEXT }}>{comment}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ===== Анализ ===== */}
          <div className="mt-6 p-4 rounded-[5px]" style={{ border: `1px solid ${LINE}`, background: "#FFF" }}>
            <h2 className="text-lg font-semibold mb-2">Анализ:</h2>
            {!requiredFilled ? (
              <div className="text-sm">
                {requiredAllZero
                  ? "Нет данных."
                  : `Недостаточно данных. Заполните обязательные поля: ${requiredList
                      .filter((k) => LABELS[k])
                      .map((k) => LABELS[k])
                      .join(", ")}.`}
              </div>
            ) : (
              <>
                {/* Ключевые наблюдения */}
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {report.tldr.map((t, i) => (
                    <li key={i}>{renderWithTerms(t)}</li>
                  ))}
                </ul>

                {/* Карточки инсайтов */}
                <div className="mt-3 space-y-2 text-sm">
                  {report.cards.map((c) => (
                    <div key={c.id}>
                      <div>{renderWithTerms(c.text)}</div>
                      {c.action && <div className="text-gray-600">Действие: {renderWithTerms(c.action)}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ===== Рекомендации ===== */}
          <div className="mt-6 p-4 rounded-[5px]" style={{ border: `1px solid ${LINE}`, background: "#FFF" }}>
            <h2 className="text-lg font-semibold mb-2">Рекомендации:</h2>
            {!requiredFilled ? (
              <div className="text-sm">
                {requiredAllZero ? "Нет данных." : "Недостаточно данных. Заполните обязательные поля слева и повторите."}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {recs.map((r) => (
                  <div key={r.id} className="p-3 rounded-[5px]" style={{ border: `1px solid ${LINE}`, background: "#FFF" }}>
                    <div className="font-medium mb-1">{renderWithTerms(r.title)}</div>
                    <div className="mb-1"><span className="font-medium">Почему:</span> {renderWithTerms(r.reason)}</div>
                    <div className="mb-1"><span className="font-medium">Что делать:</span> {renderWithTerms(r.action)}</div>
                    <div className="mb-1"><span className="font-medium">Ожидаемый эффект:</span> {renderWithTerms(r.effect)}</div>
                    <div className="text-xs" style={{ color: "#666" }}>
                      Effort: {r.effort} · Confidence: {r.confidence}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ===== Перспективы ===== */}
          <div className="mt-6 p-4 rounded-[5px]" style={{ border: `1px solid ${LINE}`, background: "#FFF" }}>
            <h2 className="text-lg font-semibold mb-2">Перспективы:</h2>
            {!requiredFilled ? (
              <div className="text-sm">
                {requiredAllZero ? "Нет данных." : "Недостаточно данных. Заполните обязательные поля слева, чтобы увидеть прогнозы."}
              </div>
            ) : (
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {prospects.map((p, i) => (
                  <li key={i}>{renderWithTerms(p)}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/* =========================
   Мелкие компоненты
   ========================= */
function InfoDot({ text, color = BLUE }) {
  return (
    <span
      title={text}
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: 15,
        height: 15,
        background: color,
        color: "#F0F2F5",
        fontSize: 12,
        fontWeight: 700,
        cursor: "help",
        lineHeight: "15px",
      }}
    >
      i
    </span>
  );
}

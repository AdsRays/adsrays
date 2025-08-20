// src/lib/metaApi.js — client helpers for AdsRays

export async function fetchAdInsights({ since, until } = {}) {
  const qs = new URLSearchParams();
  if (since) qs.set("since", since);
  if (until) qs.set("until", until);
  const res = await fetch(`/api/insights-full?${qs.toString()}`);
  const json = await res.json();
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json.rows || [];
}

export async function fetchCampaignInsights({ level = "campaign", campaignId, since, until, date_preset, breakdowns } = {}) {
  const base = new URLSearchParams();
  base.set("level", level);
  if (campaignId) base.set("campaignId", campaignId);
  if (since) base.set("since", since);
  if (until) base.set("until", until);
  if (date_preset) base.set("date_preset", date_preset);
  if (breakdowns) base.set("breakdowns", Array.isArray(breakdowns) ? breakdowns.join(",") : breakdowns);

  // попытка №1 — прямой фильтр
  let res = await fetch(`/api/insights-full?${base.toString()}`);
  let json = await res.json().catch(() => null);
  if (res.ok && json?.ok && Array.isArray(json.rows)) {
    return json.rows.filter((r) => !campaignId || String(r.campaign_id) === String(campaignId));
  }

  // попытка №2 — Meta filtering payload
  const q2 = new URLSearchParams(base);
  q2.set("filtering", JSON.stringify([{ field: "campaign.id", operator: "IN", value: [String(campaignId)] }]));
  res = await fetch(`/api/insights-full?${q2.toString()}`);
  json = await res.json().catch(() => null);
  if (res.ok && json?.ok && Array.isArray(json.rows)) {
    return json.rows.filter((r) => String(r.campaign_id) === String(campaignId));
  }

  throw new Error(json?.error || `HTTP ${res.status}`);
}

export async function fetchCampaignAgeInsights({ campaignId, since, until, date_preset } = {}) {
  return await fetchCampaignInsights({ level: "ad", campaignId, since, until, date_preset, breakdowns: "age" });
}

export async function fetchCampaignAds({ campaignId, since, until, date_preset } = {}) {
  const qs = new URLSearchParams();
  if (campaignId) qs.set("campaign_id", campaignId);
  if (since) qs.set("since", since);
  if (until) qs.set("until", until);
  if (date_preset) qs.set("date_preset", date_preset);

  const res = await fetch(`/api/debug/campaign-ads?${qs.toString()}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json?.ads?.data || [];
}

export async function fetchCampaignTargetAges({ campaignId } = {}) {
  const qs = new URLSearchParams();
  if (campaignId) qs.set("campaignId", campaignId);
  const res = await fetch(`/api/campaign-targeting?${qs.toString()}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json.ages || [];
}

/* ---------- ДОБАВЛЕНО: фолбэк на уровень адсета ---------- */

// разрез по возрасту на уровне ADSET
export async function fetchCampaignAdsetAgeInsights({ campaignId, since, until, date_preset } = {}) {
  return await fetchCampaignInsights({ level: "adset", campaignId, since, until, date_preset, breakdowns: "age" });
}

// сопоставление ad_id -> adset_id (из обычных ad-инсайтов без breakdowns)
export async function fetchAdToAdsetMap({ campaignId, since, until, date_preset } = {}) {
  const rows = await fetchCampaignInsights({ level: "ad", campaignId, since, until, date_preset });
  const map = new Map();
  for (const r of rows || []) {
    if (r?.ad_id && r?.adset_id) map.set(String(r.ad_id), String(r.adset_id));
  }
  return map;
}

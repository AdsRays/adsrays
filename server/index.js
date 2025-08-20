// server/index.js — AdsRays backend (ESM). Никакого JSX здесь быть не должно!

import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ── базовая настройка
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const GRAPH = process.env.GRAPH_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || ""; // только цифры

// ── утилиты
const base = `https://graph.facebook.com/${GRAPH}`;

function toURL(pathname, params = {}) {
  const u = new URL(`${base}/${pathname}`);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) u.searchParams.set(k, JSON.stringify(v));
    else if (typeof v === "object") u.searchParams.set(k, JSON.stringify(v));
    else u.searchParams.set(k, String(v));
  }
  if (!u.searchParams.has("access_token")) u.searchParams.set("access_token", TOKEN);
  return u.toString();
}

async function fetchAllPages(firstUrl, maxPages = 50) {
  const all = [];
  let url = firstUrl;
  let pages = 0;
  while (url && pages < maxPages) {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = j?.error || {};
      if (e.code === 190) throw Object.assign(new Error(e.message || "Auth error"), { needReauth: true });
      throw new Error(e.message || `Graph ${r.status}`);
    }
    if (Array.isArray(j.data)) all.push(...j.data);
    url = j?.paging?.next || null;
    pages += 1;
  }
  return all;
}

function extractMetric(actions, type) {
  if (!Array.isArray(actions)) return 0;
  const a = actions.find((x) => x?.action_type === type);
  return Number(a?.value) || 0;
}

async function getCampaignMetaMap() {
  const url = toURL(`act_${AD_ACCOUNT_ID}/campaigns`, {
    fields: "id,name,objective",
    limit: 1000,
  });
  const data = await fetchAllPages(url);
  const map = new Map();
  for (const c of data) if (c?.id) map.set(String(c.id), { name: c.name || "", objective: c.objective || "" });
  return map;
}

// ── ping
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── основной инсайт эндпоинт (поддерживает breakdowns=age)
app.get("/api/insights-full", async (req, res) => {
  try {
    if (!TOKEN) return res.status(401).json({ ok: false, needReauth: true, error: "META_TOKEN_MISSING" });
    if (!AD_ACCOUNT_ID) return res.status(400).json({ ok: false, error: "META_AD_ACCOUNT_ID not set" });

    const {
      since,
      until,
      level = "campaign",
      campaignId,
      campaign_id,
      adsetId,
      date_preset,
      breakdowns,
      filtering,
    } = req.query;

    const fields = [
      "account_id",
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "impressions",
      "reach",
      "clicks",
      "unique_clicks",
      "spend",
      "inline_link_clicks",
      "actions",
      // если Meta вернёт age — просто придёт отдельным полем
    ].join(",");

    const filt = [];
    const cmp = campaignId ?? campaign_id;
    if (cmp) filt.push({ field: "campaign.id", operator: "IN", value: Array.isArray(cmp) ? cmp : [cmp] });
    if (adsetId) filt.push({ field: "adset.id", operator: "IN", value: Array.isArray(adsetId) ? adsetId : [adsetId] });

    // разрешим прокидывать filtering «как есть», если попросили с фронта
    let filteringParam = filt;
    if (filtering) {
      try {
        const parsed = JSON.parse(filtering);
        if (Array.isArray(parsed)) filteringParam = parsed;
      } catch {}
    }

    const params = {
      level,
      fields,
      limit: 1000,
      filtering: filteringParam.length ? filteringParam : undefined,
    };
    if (since && until) params.time_range = { since, until };
    else if (date_preset) params.date_preset = date_preset;
    else params.date_preset = "last_90d";

    if (breakdowns) params.breakdowns = Array.isArray(breakdowns) ? breakdowns.join(",") : breakdowns;

    const raw = await fetchAllPages(toURL(`act_${AD_ACCOUNT_ID}/insights`, params));

    const rows = raw.map((row) => {
      const lpv =
        extractMetric(row.actions, "landing_page_view") ||
        extractMetric(row.actions, "omni_landing_page_view");
      const leads =
        extractMetric(row.actions, "lead") ||
        extractMetric(row.actions, "onsite_web_lead") ||
        extractMetric(row.actions, "offsite_conversion.fb_pixel_lead") ||
        extractMetric(row.actions, "onsite_conversion.lead_grouped");

      return {
        ...row,
        impressions: Number(row.impressions) || 0,
        reach: Number(row.reach) || 0,
        clicks: Number(row.clicks) || 0,
        inline_link_clicks: Number(row.inline_link_clicks) || 0,
        pageviews: Number(lpv) || 0,
        leads: Number(leads) || 0,
        spend: Number(row.spend) || 0,
      };
    });

    if (level === "campaign") {
      const metaMap = await getCampaignMetaMap();
      for (const r of rows) {
        const meta = metaMap.get(String(r.campaign_id));
        if (meta) {
          if (!r.campaign_name && meta.name) r.campaign_name = meta.name;
          r.objective = meta.objective || r.objective || "";
          r.campaign_objective = r.objective;
        }
      }
    }

    res.json({ ok: true, rows });
  } catch (err) {
    console.error("insights-full error", err);
    if (err?.needReauth) return res.status(401).json({ ok: false, needReauth: true, error: String(err.message || err) });
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// ── креативы кампании (минимально для клиента)
function creativeSubFields() {
  return "id,thumbnail_url,image_url,title,body,object_story_id,object_story_spec{link_data{image_hash,link,caption,message,name,description,picture,child_attachments{picture,name}},video_data{title}}";
}
function pickCreativeName(ad, cr, acr) {
  const ld = cr?.object_story_spec?.link_data || acr?.object_story_spec?.link_data;
  const vd = cr?.object_story_spec?.video_data || acr?.object_story_spec?.video_data;
  const ldName = ld?.name || ld?.caption || ld?.message || ld?.description;
  const vdName = vd?.title;
  return ad?.name || ldName || cr?.title || acr?.title || vdName || (ad?.id ? `Креатив ${ad.id}` : "Креатив");
}
function pickCreativePreview(cr, acr) {
  const ld = cr?.object_story_spec?.link_data || acr?.object_story_spec?.link_data;
  const child = Array.isArray(ld?.child_attachments) ? ld.child_attachments[0] : null;
  return cr?.thumbnail_url || cr?.image_url || ld?.picture || child?.picture || acr?.thumbnail_url || acr?.image_url || null;
}
function buildInsightsFields({ since, until, date_preset }) {
  const base = "impressions,spend,clicks,inline_link_clicks,actions";
  const tr = since && until ? `.time_range({'since':'${since}','until':'${until}'})` : date_preset ? `.date_preset(${JSON.stringify(date_preset)})` : "";
  return `insights${tr}{${base}}`;
}
async function fetchAdsByCampaignPaged(campaignId, fieldsStr, effective = ["ACTIVE", "PAUSED", "ARCHIVED"]) {
  const url = toURL(`${campaignId}/ads`, { fields: fieldsStr, limit: 500, effective_status: effective });
  return await fetchAllPages(url);
}
async function fetchAdsByAccountFiltered(fieldsStr, campaignId, effective = ["ACTIVE", "PAUSED", "ARCHIVED"]) {
  const url = toURL(`act_${AD_ACCOUNT_ID}/ads`, {
    fields: fieldsStr,
    limit: 500,
    filtering: [{ field: "campaign.id", operator: "IN", value: [String(campaignId)] }],
    effective_status: effective,
  });
  return await fetchAllPages(url);
}

async function handleCampaignAds(req, res) {
  try {
    const campaignParam = req.query.campaign_id ?? req.query.campaignId;
    if (!campaignParam) return res.status(400).json({ ok: false, error: "campaign_id required" });

    const { since, until, date_preset } = req.query;
    const adFields = [
      "id",
      "name",
      `creative{${creativeSubFields()}}`,
      `adcreatives{${creativeSubFields()}}`,
      buildInsightsFields({ since, until, date_preset }),
    ].join(",");

    let data = await fetchAdsByCampaignPaged(campaignParam, adFields);
    if (!data.length) data = await fetchAdsByAccountFiltered(adFields, campaignParam);

    const norm = data.map((ad) => {
      const cr = ad?.creative || {};
      const acr = ad?.adcreatives?.data?.[0] || null;
      const preview = pickCreativePreview(cr, acr);
      const name = pickCreativeName(ad, cr, acr);
      return { ...ad, name: ad?.name || name, creative: { ...cr, thumbnail_url: cr?.thumbnail_url || preview || null } };
    });

    res.json({ ok: true, ads: { data: norm } });
  } catch (err) {
    console.error("debug campaign-ads error", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

app.get("/api/debug/campaign-ads", handleCampaignAds);
app.get("/api/ads", handleCampaignAds);

// ── возрастные корзины из таргетинга адсетов (для «Сбросить на ЦА из AM»)
app.get("/api/campaign-targeting", async (req, res) => {
  try {
    const campaignId = req.query.campaignId || req.query.campaign_id;
    if (!campaignId) return res.status(400).json({ ok: false, error: "campaignId required" });

    const url = toURL(`${campaignId}/adsets`, { fields: "id,name,targeting{age_min,age_max}", limit: 500 });
    const adsets = await fetchAllPages(url);

    const BUCKETS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
    const ranges = adsets
      .map((a) => ({ min: Number(a?.targeting?.age_min) || 18, max: Number(a?.targeting?.age_max) || 65 }))
      .filter((r) => r.min && r.max && r.max >= r.min);

    const hit = (bucket, r) => {
      const [s, e] = bucket === "65+" ? [65, 120] : bucket.split("-").map(Number);
      return !(e < r.min || s > r.max);
    };

    const ages = BUCKETS.filter((b) => ranges.some((r) => hit(b, r)));
    res.json({ ok: true, ages, source: "ads_manager", adsetsCount: adsets.length });
  } catch (err) {
    console.error("campaign-targeting error", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// ── старт
app.listen(PORT, () => console.log(`AdsRays server listening on http://localhost:${PORT}`));

export async function fetchAdInsights() {
  // build stub: return empty data
  return { ok: true, data: [] };
}
export default { fetchAdInsights };

// ---- TEMP STUB to unblock legacy build ----
// Возвращает пустой список сегментов возрастов.
// При желании можно заменить на реальный вызов Graph API.
export async function fetchCampaignTargetAges(/* accountId, campaignId, accessToken */) {
  return [];
}

// ---- TEMP STUB auto-added to unblock legacy build ----
export async function fetchCampaignAgeInsights(/* ...args */) {
  // TODO: implement real data fetch; temporary empty result
  return [];
}

// src/metaAdsService.js
import axios from "axios";

const API_BASE_URL = "https://graph.facebook.com/v12.0";

export async function fetchCampaigns(accessToken, adAccountId) {
  try {
    const response = await axios.get(`${API_BASE_URL}/${adAccountId}/campaigns`, {
      params: {
        access_token: accessToken,
        fields: "id,name,effective_status,insights{ctr,cr,cvr,cpa,cpc,spend}",
      },
    });
    return response.data.data;
  } catch (error) {
    console.error("Ошибка при получении кампаний:", error);
    throw error;
  }
}

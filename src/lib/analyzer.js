/**
 * BUILD STUB for legacy-ui: ./lib/analyzer
 * Экспортируем и default, и именованные — чтобы сборка прошла при любом способе импорта.
 */
export function analyze(data){ return { ok:true, summary:null, insights:[] }; }
export function analyzeCampaigns(list){ return { ok:true, items:[], metrics:{} }; }
export function getInsights(){ return []; }
export function calcKPIs(){ return { ctr:0, cpc:0, cvr:0, cpa:0, roas:0 }; }
export const analyzer = { analyze, analyzeCampaigns, getInsights, calcKPIs };
export default analyzer;

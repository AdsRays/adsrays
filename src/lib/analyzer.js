/** LEGACY build analyzer stub */
export function analyze(data){ return { ok:true, summary:null, insights:[] }; }
export function analyzeCampaigns(list){ return { ok:true, items:[], metrics:{} }; }
export function getInsights(){ return []; }
export function calcKPIs(){ return { ctr:0, cpc:0, cvr:0, cpa:0, roas:0 }; }

/* Доп. именованные экспорты кладём в __analyzer_extra__.js */
export * from './__analyzer_extra__';

/* Default export с базовыми ф-циями */
const analyzer = { analyze, analyzeCampaigns, getInsights, calcKPIs };
export default analyzer;

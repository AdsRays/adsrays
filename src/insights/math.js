// src/insights/math.js
export const N = v => (+v || 0);
export const safe = (a, b) => (b > 0 ? a / b : 0);

export function normalizeCTR(raw){
  if(raw==null) return 0;
  const s0 = String(raw), s = s0.replace(/\s/g,'').replace(',','.').replace('%','');
  const n = parseFloat(s); if(!isFinite(n)) return 0;
  if(s0.includes('%')) return n/100; if(n>1) return n/100;
  const dec=(s.split('.')[1]||'').length; return dec<=2 ? n/100 : n;
}

export const fNum = v => Number.isFinite(v) ? new Intl.NumberFormat('ru-RU').format(v) : '—';
export const fPct = (v,d=2) => Number.isFinite(v) ? `${(v*100).toFixed(d)}%` : '—';
export const fMoney = (v,cur='UAH') =>
  Number.isFinite(v) ? new Intl.NumberFormat('ru-RU',{style:'currency',currency:cur}).format(v) : '—';

export function derive({reach=0, impressions=0, spend=0, ctrInput=null, reactions=0, currency='UAH'}){
  const ctr = normalizeCTR(ctrInput);
  const freq = safe(impressions, reach);
  const cpm  = safe(spend, impressions/1000);
  const clicksEst = Math.round(ctr*impressions) || 0;
  const cpcEst = safe(spend, clicksEst);
  const cpi = safe(spend, impressions);

  // «лишнее» при капе 3.0
  const cap=3, extraImpr = Math.max(0, impressions - reach*cap);
  const extraBudget = extraImpr * cpi;
  const extraReach  = Math.round(extraImpr / cap);

  return { reach, impressions, spend, reactions, currency, ctr, freq, cpm, clicksEst, cpcEst, extraImpr, extraBudget, extraReach };
}

export function whatIfCTR(m, target){
  const tgtClicks = Math.round(target*m.impressions) || 0;
  const tgtCPC = safe(m.spend, tgtClicks);
  return { tgtClicks, tgtCPC, deltaClicks: tgtClicks - m.clicksEst, deltaCPC: tgtCPC - m.cpcEst };
}

// src/insights/nlg.js
import { derive, whatIfCTR, fNum, fMoney, fPct } from "./math";
import { rules } from "./rules";

const F = { num:fNum, money:fMoney, pct:fPct };
const pick = (arr, seed=0) => arr[(Math.abs(seed*97) % arr.length)];

/** Собираем отчёт */
export function buildReport(input, {emojis=true, seed=1}={}){
  const m = derive(input);

  // TL;DR — ровно 3 пункта
  const tldr = [];
  if(isFinite(m.freq)){
    if(m.freq>=3.5) tldr.push(`${emojis?'🚨 ':''}Перегрев частоты ${m.freq.toFixed(1)}. Лишние показы: ${fNum(m.extraImpr)} → ≈ ${fMoney(m.extraBudget,m.currency)} или +${fNum(m.extraReach)} новых людей.`);
    else if(m.freq>=2.5) tldr.push(`Частота ${m.freq.toFixed(1)} — рабочая зона 2.5–3.0.`);
    else tldr.push(`Частота ${m.freq.toFixed(1)} — контактов мало, можно масштабировать.`);
  }
  const s1 = whatIfCTR(m,0.01);
  tldr.push(`${emojis?'🩹 ':''}CTR ${fPct(m.ctr)}. Доведём до 1.0% → +${fNum(s1.tgtClicks - m.clicksEst)} клика, CPC ≈ ${fMoney(s1.tgtCPC,m.currency)}.`);
  if(isFinite(m.cpm)) tldr.push(`${emojis?'💰 ':''}CPM ${fMoney(m.cpm,m.currency)}. Новые креативы/аудитории обычно дают −10…−20%.`);

  // Карточки по правилам
  const cards = rules.filter(r=>r.when(m)).map((r,i)=>({
    id:r.id,
    text: pick(r.say.map(fn=>fn(m,F)), seed+i),
    action: r.action ? r.action(m) : ""
  }));

  // Таблицы What-If
  const scenarios = [0.01,0.02,0.03].map(target=>{
    const s = whatIfCTR(m,target);
    return {
      title:`Если CTR = ${(target*100).toFixed(1)}% — что изменится`,
      rows:[
        {metric:"Текущий CTR", cur:fPct(m.ctr), tgt:fPct(target,1), diff:"—"},
        {metric:"Клики",       cur:fNum(m.clicksEst), tgt:fNum(s.tgtClicks), diff:`${s.deltaClicks>0?'+':''}${fNum(s.deltaClicks)}`},
        {metric:"CPC",         cur:fMoney(m.cpcEst,m.currency), tgt:fMoney(s.tgtCPC,m.currency),
          diff:`${s.deltaCPC<0?'↓ ':'↑ '}${fMoney(Math.abs(s.deltaCPC),m.currency)}`}
      ]
    };
  });

  // Таблица «Диагностика»
  const diagnostics = [
    ["Охват (Reach)", fNum(m.reach), m.reach>=1_000_000?"Отличный масштаб — бренд заметен широкому рынку":"Охват скромный — расширьте интересы или бюджет"],
    ["Показы (Impressions)", fNum(m.impressions), isFinite(m.freq)?(m.freq>=3.5?`Частота ≈ ${m.freq.toFixed(1)} — перегрев`:`Частота ≈ ${m.freq.toFixed(1)}`):"Частота — нет данных"],
    ["Затраты / CPM", `${fMoney(m.spend,m.currency)} / ${fMoney(m.cpm,m.currency)}`, isFinite(m.cpm)?(m.cpm>40?"Дороговато":"Ниже/около среднего"):"Нет данных"],
    ["CTR", fPct(m.ctr), (m.ctr<0.01?"Ниже 1% — усиливаем хук.":"Ок/выше нормы")],
    ["Реакции", fNum(m.reactions), m.reactions&&m.impressions?`ER ${(m.reactions/m.impressions*100).toFixed(2)}%`:"Нет данных"],
    ["Клики (оценка)", fNum(m.clicksEst), "CTR × показы"],
    ["CPC (оценка)", fMoney(m.cpcEst,m.currency), "Затраты / клики"],
    ["LP / Leads / Purchases / Revenue","нет данных","Для точности подключите Ads Manager"]
  ];

  return { m, tldr, cards, scenarios, diagnostics };
}

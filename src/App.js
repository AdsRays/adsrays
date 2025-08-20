import React from "react";
import AppClassic from "./App_classic";
import AppNew from "./App_new";

/** Флаг «показать новый экран».
 *  Варианты включения:
 *  1) открыть URL с ?new=1
 *  2) в консоли браузера выполнить: localStorage.setItem('ar_new_intro','1')
 */
function useNewFlag() {
  const p = new URLSearchParams(window.location.search);
  if (p.has("new") || p.get("variant")==="new") return true; // через URL
  try { return localStorage.getItem("ar_new_intro")==="1"; } catch { return false; }
}

export default function App() {
  const useNew = useNewFlag();
  return useNew ? <AppNew /> : <AppClassic />;
}

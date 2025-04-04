import { useState } from "react";
import { Upload } from "lucide-react";

export default function MetaProfitDashboard() {
  const [aiAnswer, setAiAnswer] = useState("Привет! Я — Alex Marston, автор AdsRays. Спроси меня о чём угодно.");

  const handleAIResponse = () => {
    setAiAnswer("Ты задал отличный вопрос! Вот как тебе стоит поступить...");
  };

  return (
    <div style={{ padding: 40 }}>
      <h1><Upload style={{ width: 20, height: 20, marginRight: 8 }} /> AdsRays — Сканер рекламы</h1>
      <button onClick={handleAIResponse} style={{ marginTop: 20, padding: 10 }}>
        Получить совет
      </button>
      <p style={{ marginTop: 20 }}>{aiAnswer}</p>
    </div>
  );
}

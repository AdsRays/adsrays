
// App.js
import React, { useState } from "react";
import MetaProfitDashboard from "./MetaProfitDashboard";
import { Card, CardContent } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Textarea } from "./components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./components/ui/select";
import { Button } from "./components/ui/button";
import TopCampaignsChart from "./TopCampaignsChart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import CampaignList from "./CampaignList";

function App() {
  const [userProfile, setUserProfile] = useState({
    audience: "",
    region: "",
    niche: "",
    description: "",
  });

  const [tab, setTab] = useState("chart");

  const [manualInput, setManualInput] = useState({
    impressions: "",
    clicks: "",
    pageviews: "",
    leads: "",
    revenue: "",
  });

  const handleChange = (field, value) => {
    setUserProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleInputChange = (field, value) => {
    setManualInput((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    console.log("Сохранённый профиль:", userProfile);
    console.log("Введённые данные:", manualInput);
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-xl font-semibold">🧠 Опиши свою ЦА</h2>
          <div>
            <Label>Возраст и пол</Label>
            <Input
              placeholder="Пример: Женщины 25-45 лет"
              value={userProfile.audience}
              onChange={(e) => handleChange("audience", e.target.value)}
            />
          </div>
          <div>
            <Label>Регион</Label>
            <Input
              placeholder="Пример: США, Калифорния"
              value={userProfile.region}
              onChange={(e) => handleChange("region", e.target.value)}
            />
          </div>
          <div>
            <Label>Сфера деятельности</Label>
            <Select
              value={userProfile.niche}
              onValueChange={(value) => handleChange("niche", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите сферу" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="psychologist">Психолог</SelectItem>
                <SelectItem value="coach">Коуч / Тренер</SelectItem>
                <SelectItem value="store">Онлайн-магазин</SelectItem>
                <SelectItem value="services">Услуги (салон, клиника и т.п.)</SelectItem>
                <SelectItem value="real-estate">Недвижимость / Риелтор</SelectItem>
                <SelectItem value="infobusiness">Инфобизнес</SelectItem>
                <SelectItem value="handmade">Ремесленник / Хендмейд</SelectItem>
                <SelectItem value="other">Другое</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Расскажи о своём бизнесе</Label>
            <Textarea
              placeholder="Например: я продаю онлайн-курсы по саморазвитию и запускаю рекламу на женщин 35+ в США"
              value={userProfile.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-xl font-semibold">✍️ Введите данные вручную</h2>
          <div>
            <Label>Показы</Label>
            <Input
              placeholder="Например: 2000"
              value={manualInput.impressions}
              onChange={(e) => handleInputChange("impressions", e.target.value)}
            />
          </div>
          <div>
            <Label>Клики</Label>
            <Input
              placeholder="Например: 120"
              value={manualInput.clicks}
              onChange={(e) => handleInputChange("clicks", e.target.value)}
            />
          </div>
          <div>
            <Label>Просмотры страницы</Label>
            <Input
              placeholder="Например: 90"
              value={manualInput.pageviews}
              onChange={(e) => handleInputChange("pageviews", e.target.value)}
            />
          </div>
          <div>
            <Label>Лиды</Label>
            <Input
              placeholder="Например: 10"
              value={manualInput.leads}
              onChange={(e) => handleInputChange("leads", e.target.value)}
            />
          </div>
          <div>
            <Label>Выручка / Продажи ($)</Label>
            <Input
              placeholder="Например: 350"
              value={manualInput.revenue}
              onChange={(e) => handleInputChange("revenue", e.target.value)}
            />
          </div>
          <Button onClick={handleSave}>Сохранить данные</Button>
        </CardContent>
      </Card>

      <div className="text-center mt-8 space-y-4">
        <Tabs defaultValue="chart" value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="chart">📊 Сравнение кампаний</TabsTrigger>
            <TabsTrigger value="list">🗂 По дате (хронология)</TabsTrigger>
          </TabsList>
          <TabsContent value="chart">
            <TopCampaignsChart />
          </TabsContent>
          <TabsContent value="list">
            <CampaignList enableCheckboxes={true} showComparison={true} />
          </TabsContent>
        </Tabs>
      </div>

      <MetaProfitDashboard />
    </div>
  );
}

export default App;

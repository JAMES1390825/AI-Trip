import React, { useMemo, useState } from "react";
import { budgetLabel, cityLabel, getConfig, getProfile, paceLabel, saveProfile, toast, updateConfig } from "../../assets/js/core";

const REMINDER_OPTIONS = [
  { value: 168, label: "提前 7 天" },
  { value: 72, label: "提前 3 天" },
  { value: 48, label: "提前 2 天" },
  { value: 24, label: "提前 1 天" },
];

const DEFAULT_REMINDER_OFFSETS = [168, 72, 24];

const DEFAULTS = {
  nickname: "旅行者",
  homeCity: "",
  homeCityConfirmed: false,
  defaultBudget: "medium",
  defaultPace: "relaxed",
  reminderEnabled: true,
  reminderOffsetHours: DEFAULT_REMINDER_OFFSETS,
  amapJsKey: "",
};

function normalizeReminderOffsetHours(values: any) {
  const picked = REMINDER_OPTIONS.map((item) => item.value)
    .filter((hour) => Array.isArray(values) && values.includes(hour))
    .sort((a, b) => b - a);
  return picked.length ? picked : [...DEFAULT_REMINDER_OFFSETS];
}

function loadInitialState() {
  const profile = getProfile();
  const config = getConfig();
  return {
    ...DEFAULTS,
    ...profile,
    reminderOffsetHours: normalizeReminderOffsetHours(profile.reminderOffsetHours),
    amapJsKey: config.amapJsKey || "",
  };
}

export default function SettingsPage() {
  const [form, setForm] = useState(loadInitialState);

  const preview = useMemo(
    () => [
      `称呼：${form.nickname || "旅行者"}`,
      `默认出发地：${form.homeCity ? cityLabel(form.homeCity) : "每次询问我"}`,
      `预算偏好：${budgetLabel(form.defaultBudget)}`,
      `出行节奏：${paceLabel(form.defaultPace)}`,
      `提醒开关：${form.reminderEnabled ? "开启" : "关闭"}`,
      `提醒策略：${normalizeReminderOffsetHours(form.reminderOffsetHours)
        .map((hour) => `T-${Math.floor(hour / 24)}`)
        .join(" / ")}`,
      `地图展示：${form.amapJsKey ? "已配置授权码" : "未配置授权码"}`,
    ],
    [form]
  );

  function updateField(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function toggleReminderOffset(hour: number, checked: boolean) {
    setForm((prev: any) => {
      const current = normalizeReminderOffsetHours(prev.reminderOffsetHours);
      const next = checked ? [...current, hour] : current.filter((item: number) => item !== hour);
      return {
        ...prev,
        reminderOffsetHours: normalizeReminderOffsetHours(next),
      };
    });
  }

  function saveCurrentSettings() {
    const next = {
      ...form,
      nickname: form.nickname?.trim() || "旅行者",
      homeCityConfirmed: Boolean(form.homeCity),
      reminderOffsetHours: normalizeReminderOffsetHours(form.reminderOffsetHours),
      amapJsKey: form.amapJsKey?.trim() || "",
    };

    setForm(next);

    saveProfile({
      nickname: next.nickname,
      homeCity: next.homeCity,
      homeCityConfirmed: next.homeCityConfirmed,
      defaultBudget: next.defaultBudget,
      defaultPace: next.defaultPace,
      reminderEnabled: next.reminderEnabled,
      reminderOffsetHours: next.reminderOffsetHours,
    });

    updateConfig({ amapJsKey: next.amapJsKey });
    toast("设置已保存。", "ok");
  }

  function resetSettings() {
    setForm(DEFAULTS);
    saveProfile(DEFAULTS);
    updateConfig({ amapJsKey: "" });
    toast("已恢复默认设置。", "warn");
  }

  return (
    <main className="settings-layout">
      <section className="card settings-form">
        <h1 className="section-title" style={{ margin: 0 }}>
          个人旅行偏好
        </h1>
        <p className="section-sub">这些设置会自动作用到你下一次对话规划。</p>

        <div className="field-row">
          <label>称呼</label>
          <input className="field" placeholder="例如：小王" value={form.nickname} onChange={(e) => updateField("nickname", e.target.value)} />
        </div>

        <div className="field-row">
          <label>默认出发地</label>
          <select value={form.homeCity || ""} onChange={(e) => updateField("homeCity", e.target.value)}>
            <option value="">不预设（每次询问）</option>
            <option value="shanghai">上海</option>
            <option value="beijing">北京</option>
            <option value="hangzhou">杭州</option>
            <option value="chengdu">成都</option>
            <option value="guangzhou">广州</option>
            <option value="shenzhen">深圳</option>
            <option value="shaoxing">绍兴</option>
            <option value="suzhou">苏州</option>
            <option value="wuhan">武汉</option>
            <option value="nanjing">南京</option>
          </select>
        </div>

        <div className="field-row">
          <label>默认预算偏好</label>
          <select value={form.defaultBudget} onChange={(e) => updateField("defaultBudget", e.target.value)}>
            <option value="low">节省预算</option>
            <option value="medium">适中预算</option>
            <option value="high">体验优先</option>
          </select>
        </div>

        <div className="field-row">
          <label>默认出行节奏</label>
          <select value={form.defaultPace} onChange={(e) => updateField("defaultPace", e.target.value)}>
            <option value="relaxed">轻松慢游</option>
            <option value="compact">紧凑高效</option>
          </select>
        </div>

        <label className="switch">
          <input type="checkbox" checked={form.reminderEnabled} onChange={(e) => updateField("reminderEnabled", e.target.checked)} />
          <span>开启出行提醒（应用内提醒 + 浏览器通知）</span>
        </label>

        <div className="field-row">
          <label>提醒策略</label>
          <div className="check-row">
            {REMINDER_OPTIONS.map((item) => {
              const checked = normalizeReminderOffsetHours(form.reminderOffsetHours).includes(item.value);
              return (
                <label key={item.value} className="switch">
                  <input type="checkbox" checked={checked} onChange={(e) => toggleReminderOffset(item.value, e.target.checked)} />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
          <p className="section-sub" style={{ marginTop: -2 }}>
            默认 T-7 / T-3 / T-1，可按需调整。
          </p>
        </div>

        <div className="field-row">
          <label>地图展示授权码（可选）</label>
          <input className="field" value={form.amapJsKey || ""} onChange={(e) => updateField("amapJsKey", e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={saveCurrentSettings}>
            保存设置
          </button>
          <button className="btn secondary" onClick={resetSettings}>
            恢复默认
          </button>
        </div>
      </section>

      <aside className="card summary-panel">
        <div className="summary-head">
          <h2>当前配置预览</h2>
          <p>这里只显示会影响你行程体验的用户项。</p>
        </div>

        <div className="summary-list">
          {preview.map((line) => (
            <div key={line} className="summary-item">
              {line}
            </div>
          ))}
        </div>

        <div className="status-banner wait">小贴士：地图授权码只用于前端地图渲染，不会展示给其他用户。</div>
      </aside>
    </main>
  );
}

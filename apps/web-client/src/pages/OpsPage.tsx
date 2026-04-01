import React, { useState } from "react";
import { getConfig, healthCheck, parseError, toast, updateConfig } from "../../assets/js/core";

function initialConfig() {
  const config = getConfig();
  return {
    apiBase: config.apiBase || "",
    bootstrapSecret: config.bootstrapSecret || "",
    userId: config.userId || "",
    amapJsKey: config.amapJsKey || "",
  };
}

export default function OpsPage() {
  const [form, setForm] = useState(initialConfig);
  const [status, setStatus] = useState({ text: "等待操作", mode: "wait" });

  function updateField(key: string, value: string) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function saveOpsConfig() {
    updateConfig({
      apiBase: form.apiBase.trim(),
      bootstrapSecret: form.bootstrapSecret.trim(),
      userId: form.userId.trim(),
      amapJsKey: form.amapJsKey.trim(),
    });
    setStatus({ text: "配置已保存。", mode: "ok" });
    toast("运维配置已保存。", "ok");
  }

  async function checkHealth() {
    setStatus({ text: "正在检查服务连接...", mode: "wait" });
    try {
      const body = await healthCheck();
      setStatus({ text: `连接成功：${body?.service || "trip-api"}`, mode: "ok" });
    } catch (error) {
      setStatus({ text: parseError(error), mode: "warn" });
    }
  }

  return (
    <main className="ops-shell">
      <section className="card settings-form">
        <h1>Trip Canvas Admin 运维配置</h1>
        <p>当前仓库仅保留后台 Web 管理台，用户端将迁移到 iOS App。</p>

        <div className="field-row">
          <label>API 地址</label>
          <input className="field" value={form.apiBase} onChange={(e) => updateField("apiBase", e.target.value)} />
        </div>

        <div className="field-row">
          <label>Bootstrap Secret</label>
          <input className="field" value={form.bootstrapSecret} onChange={(e) => updateField("bootstrapSecret", e.target.value)} />
        </div>

        <div className="field-row">
          <label>调试用户 ID（可选）</label>
          <input className="field" value={form.userId} onChange={(e) => updateField("userId", e.target.value)} />
        </div>

        <div className="field-row">
          <label>Amap JS Key（可选）</label>
          <input className="field" value={form.amapJsKey} onChange={(e) => updateField("amapJsKey", e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn primary" type="button" onClick={saveOpsConfig}>
            保存配置
          </button>
          <button className="btn secondary" type="button" onClick={() => void checkHealth()}>
            检查服务连接
          </button>
        </div>

        <div className={`status-banner ${status.mode}`}>{status.text}</div>
      </section>
    </main>
  );
}

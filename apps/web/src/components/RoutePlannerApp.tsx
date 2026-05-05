"use client";

import { useEffect, useState, useTransition } from "react";
import { routeThemes } from "@/domain/theme-catalog";
import type { RouteCard as RouteCardData, SavedRouteCardSummary } from "@/domain/types";
import { RouteCard } from "./RouteCard";

const cityOptions = ["上海", "杭州", "苏州", "成都"];

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload.message || "请求失败"));
  }
  return response.json() as Promise<T>;
}

export function RoutePlannerApp() {
  const [city, setCity] = useState("杭州");
  const [themeId, setThemeId] = useState(routeThemes[0].id);
  const [startDate, setStartDate] = useState("2026-05-10");
  const [note, setNote] = useState("想拍照，别太累");
  const [routeCard, setRouteCard] = useState<RouteCardData | null>(null);
  const [saved, setSaved] = useState<SavedRouteCardSummary[]>([]);
  const [status, setStatus] = useState("选择城市和主题，生成你的第一张路线卡。");
  const [isPending, startTransition] = useTransition();

  async function loadSaved() {
    const payload = await readJson<{ items: SavedRouteCardSummary[] }>(await fetch("/api/route-cards"));
    setSaved(payload.items);
  }

  useEffect(() => {
    void loadSaved().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  function generate() {
    startTransition(async () => {
      try {
        setStatus("正在生成路线卡...");
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city, themeId, startDate, durationDays: 1, note })
          }),
        );
        setRouteCard(payload.routeCard);
        setStatus("路线卡已生成，可以保存或切换分享包装。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function save() {
    if (!routeCard) return;
    startTransition(async () => {
      try {
        await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeCard })
          }),
        );
        await loadSaved();
        setStatus("已保存路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  return (
    <div className="app-grid">
      <section className="planner-panel">
        <p className="eyebrow">AI Trip · Route Cards</p>
        <h1>把周末旅行变成一张能走的路线卡。</h1>
        <p className="hero-copy">B 型路线卡是核心体验：地图、时间线、可信度、保存和分享都围绕它展开。</p>

        <div className="form-grid">
          <label>
            城市
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              {cityOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            日期
            <input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" />
          </label>
        </div>

        <div className="theme-grid">
          {routeThemes.map((theme) => (
            <button
              className={theme.id === themeId ? "theme-button active" : "theme-button"}
              key={theme.id}
              onClick={() => setThemeId(theme.id)}
              type="button"
            >
              <strong>{theme.label}</strong>
              <span>{theme.promise}</span>
            </button>
          ))}
        </div>

        <label>
          补充偏好
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        <div className="action-row">
          <button className="primary" disabled={isPending} onClick={generate} type="button">
            {isPending ? "处理中..." : "生成路线卡"}
          </button>
          <button disabled={!routeCard || isPending} onClick={save} type="button">
            保存
          </button>
        </div>
        <p className="status">{status}</p>

        <div className="saved-list">
          <h3>已保存</h3>
          {saved.length ? (
            saved.map((item) => (
              <div className="saved-item" key={item.id}>
                <strong>{item.title}</strong>
                <span>
                  {item.city} · {item.themeLabel} · {Math.round(item.confidence * 100)}%
                </span>
              </div>
            ))
          ) : (
            <p>还没有保存的路线卡。</p>
          )}
        </div>
      </section>

      <section className="preview-panel">
        {routeCard ? (
          <>
            <RouteCard routeCard={routeCard} />
            <div className="share-placeholder">
              A 海报包装和 C 故事包装会在下一步接入；当前先保证 B 型路线卡可生成、可信、可保存。
            </div>
          </>
        ) : (
          <div className="empty-preview">生成后这里会出现 B 型可执行路线卡。</div>
        )}
      </section>
    </div>
  );
}

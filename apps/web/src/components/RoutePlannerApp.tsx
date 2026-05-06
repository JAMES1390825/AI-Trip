"use client";

import { useEffect, useState, useTransition } from "react";
import { routeThemes } from "@/domain/theme-catalog";
import type { RouteCard as RouteCardData, SavedRouteCardSummary, TripPreferenceId } from "@/domain/types";
import { RouteCard } from "./RouteCard";
import { PosterShareCard } from "./share/PosterShareCard";
import { StoryShareCard } from "./share/StoryShareCard";

type ShareMode = "poster" | "story";

const cityOptions = ["上海", "杭州", "苏州", "成都"];
const revisionQuickActions = ["少走路", "加吃饭点", "下雨改室内", "更省钱", "去掉寺庙", "压缩成半日"];
const preferenceOptions: TripPreferenceId[] = [
  "经典必玩",
  "吃喝逛",
  "亲子",
  "citywalk",
  "历史古迹",
  "小众探索",
  "拍照出片",
  "自然风光",
  "文艺展览",
  "室内备选",
  "少走路",
  "预算友好"
];
const generationStages = ["理解旅行需求", "高德搜索真实地点", "Exa 检索公开攻略证据", "校验路线与风险"];

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
  const [durationDays, setDurationDays] = useState<1 | 2>(1);
  const [note, setNote] = useState("想拍照，别太累");
  const [activeCreateMode, setActiveCreateMode] = useState<"new" | "import">("new");
  const [tripPreferences, setTripPreferences] = useState<TripPreferenceId[]>(["拍照出片", "少走路"]);
  const [importedText, setImportedText] = useState("");
  const [revisionNote, setRevisionNote] = useState("少走路一点，加一个吃饭点");
  const [routeCard, setRouteCard] = useState<RouteCardData | null>(null);
  const [saved, setSaved] = useState<SavedRouteCardSummary[]>([]);
  const [status, setStatus] = useState("选择城市和主题，生成你的第一张路线卡。");
  const [shareMode, setShareMode] = useState<ShareMode>("poster");
  const [isPending, startTransition] = useTransition();

  async function loadSaved() {
    const payload = await readJson<{ items: SavedRouteCardSummary[] }>(await fetch("/api/route-cards"));
    setSaved(payload.items);
  }

  useEffect(() => {
    void loadSaved().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  function togglePreference(preference: TripPreferenceId) {
    setTripPreferences((current) =>
      current.includes(preference) ? current.filter((item) => item !== preference) : [...current, preference],
    );
  }

  function generate() {
    startTransition(async () => {
      try {
        setStatus("正在生成真实行程：理解需求、搜索地点、检索证据、校验路线。");
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              city,
              themeId,
              startDate,
              durationDays,
              note,
              tripPreferences,
              importedText: activeCreateMode === "import" ? importedText : undefined
            })
          }),
        );
        setRouteCard(payload.routeCard);
        setStatus("真实行程已生成，可以继续编辑点位或保存。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function applyRevisionQuickAction(action: string) {
    setRevisionNote((current) => (current.trim() ? `${current.trim()}，${action}` : action));
  }

  function reviseRoute() {
    if (!routeCard) {
      setStatus("请先生成一张路线卡，再调整路线。");
      return;
    }

    const trimmedRevisionNote = revisionNote.trim();
    if (!trimmedRevisionNote) {
      setStatus("请先写一句调整要求。");
      return;
    }

    startTransition(async () => {
      try {
        setStatus("正在根据你的要求调整路线...");
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards/revise", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeCard, reviseNote: trimmedRevisionNote })
          }),
        );
        setRouteCard(payload.routeCard);
        setRevisionNote("");
        setStatus("已按要求调整路线，可以保存这一版。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function save() {
    if (!routeCard) return;
    startTransition(async () => {
      try {
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeCard })
          }),
        );
        setRouteCard(payload.routeCard);
        await loadSaved();
        setStatus("已保存路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function sharePathFor(card: RouteCardData): string {
    return `/share/${card.id}`;
  }

  function absoluteShareUrl(card: RouteCardData): string {
    if (typeof window === "undefined") return sharePathFor(card);
    return `${window.location.origin}${sharePathFor(card)}`;
  }

  async function copyShareLink(card: RouteCardData) {
    const url = absoluteShareUrl(card);
    try {
      await navigator.clipboard.writeText(url);
      setStatus("分享链接已复制。");
    } catch {
      setStatus(`复制失败，可以手动复制：${url}`);
    }
  }

  function loadSavedPreview(id: string) {
    startTransition(async () => {
      try {
        setStatus("正在载入保存的路线卡...");
        const payload = await readJson<{ routeCard: RouteCardData }>(await fetch(`/api/route-cards/${id}`));
        setRouteCard(payload.routeCard);
        setCity(payload.routeCard.city);
        setThemeId(payload.routeCard.themeId);
        setStartDate(payload.routeCard.startDate);
        setDurationDays(payload.routeCard.durationDays);
        setStatus("已载入保存的路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function deleteSaved(id: string) {
    startTransition(async () => {
      try {
        setStatus("正在删除路线卡...");
        const response = await fetch(`/api/route-cards/${id}`, { method: "DELETE" });
        if (!response.ok) {
          throw new Error("删除失败，请稍后再试。");
        }
        if (routeCard?.id === id) setRouteCard(null);
        await loadSaved();
        setStatus("已删除路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  return (
    <div className="app-grid">
      <section className="planner-panel">
        <p className="eyebrow">AI Trip · 我的行程</p>
        <h1>把一句旅行想法变成可执行行程。</h1>
        <p className="hero-copy">像在地图纸上做标注：先轻量创建，再用真实地点、公开攻略证据和路线校验生成可编辑路线卡。</p>

        <div className="create-entry-panel">
          <div>
            <p className="section-kicker">Create Desk</p>
            <h3>从哪开始规划？</h3>
          </div>
          <div className="create-entry-actions">
            <button
              aria-pressed={activeCreateMode === "new"}
              className={activeCreateMode === "new" ? "active" : ""}
              onClick={() => setActiveCreateMode("new")}
              type="button"
            >
              创建新计划
            </button>
            <button
              aria-pressed={activeCreateMode === "import"}
              className={activeCreateMode === "import" ? "active" : ""}
              onClick={() => setActiveCreateMode("import")}
              type="button"
            >
              智能导入地点/行程
            </button>
            <button aria-label="采集识别即将支持" disabled title="采集识别即将支持" type="button">
              采集识别
            </button>
          </div>
        </div>

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
          <label>
            时长
            <select value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value) as 1 | 2)}>
              <option value={1}>1日</option>
              <option value={2}>2日</option>
            </select>
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

        <div className="preference-chip-panel">
          <div>
            <p className="section-kicker">Planning Chips</p>
            <h3>点几枚旅行偏好</h3>
            <p>芯片会参与需求理解和真实地点检索，方便快速表达这趟旅行的风格。</p>
          </div>
          <div className="preference-chip-grid">
            {preferenceOptions.map((preference) => (
              <button
                aria-pressed={tripPreferences.includes(preference)}
                className={tripPreferences.includes(preference) ? "preference-chip active" : "preference-chip"}
                key={preference}
                onClick={() => togglePreference(preference)}
                type="button"
              >
                {preference}
              </button>
            ))}
          </div>
        </div>

        {activeCreateMode === "import" ? (
          <label>
            智能导入内容
            <textarea
              placeholder="粘贴朋友发来的地点清单、旧行程、攻略摘录或备忘录。"
              value={importedText}
              onChange={(event) => setImportedText(event.target.value)}
            />
          </label>
        ) : null}

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
        <div className="generation-progress-panel">
          <p className="section-kicker">Progress Ledger</p>
          <ol>
            {generationStages.map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ol>
          <p>这些是诚实的规划阶段提示；不展示未接入来源，也不冒充小红书官方搜索。</p>
        </div>

        <div className="revision-panel">
          <div>
            <p className="section-kicker">Route Workbench</p>
            <h3>调整路线</h3>
            <p>生成后不用重填需求，可以继续要求它少走路、加饭点、改室内或压缩行程。</p>
          </div>
          <div className="revision-quick-actions">
            {revisionQuickActions.map((action) => (
              <button key={action} onClick={() => applyRevisionQuickAction(action)} type="button">
                {action}
              </button>
            ))}
          </div>
          <label>
            调整要求
            <textarea
              placeholder="例如：少走路一点，中午加一个本地吃饭点，下午尽量室内"
              value={revisionNote}
              onChange={(event) => setRevisionNote(event.target.value)}
            />
          </label>
          <button className="revision-submit" disabled={!routeCard || isPending} onClick={reviseRoute} type="button">
            重新调整路线
          </button>
          {routeCard?.revisionSummary ? <p className="revision-summary">{routeCard.revisionSummary}</p> : null}
        </div>

        <div className="saved-list">
          <h3>已保存</h3>
          {saved.length ? (
            saved.map((item) => (
              <div className="saved-item" key={item.id}>
                <strong>{item.title}</strong>
                <span>
                  {item.city} · {item.themeLabel} · {Math.round(item.confidence * 100)}%
                </span>
                <div className="saved-actions">
                  <button onClick={() => loadSavedPreview(item.id)} type="button" disabled={isPending}>
                    预览
                  </button>
                  <a href={item.sharePath} target="_blank" rel="noreferrer">
                    打开 / 分享
                  </a>
                  <button onClick={() => deleteSaved(item.id)} type="button" disabled={isPending}>
                    删除
                  </button>
                </div>
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
            <div className="share-actions">
              <a href={sharePathFor(routeCard)} target="_blank" rel="noreferrer">
                打开分享页
              </a>
              <button onClick={() => void copyShareLink(routeCard)} type="button">
                复制分享链接
              </button>
              <button onClick={generate} type="button" disabled={isPending}>
                再生成一版
              </button>
            </div>
            <div className="share-switch">
              <button className={shareMode === "poster" ? "active" : ""} onClick={() => setShareMode("poster")} type="button">
                海报包装
              </button>
              <button className={shareMode === "story" ? "active" : ""} onClick={() => setShareMode("story")} type="button">
                故事包装
              </button>
            </div>
            {shareMode === "poster" ? <PosterShareCard routeCard={routeCard} /> : <StoryShareCard routeCard={routeCard} />}
          </>
        ) : (
          <div className="empty-preview">生成后这里会出现 B 型可执行路线卡。</div>
        )}
      </section>
    </div>
  );
}

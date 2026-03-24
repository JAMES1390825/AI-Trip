import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  buildInitialDraft,
  cityLabel,
  ensureToken,
  getCurrentItinerary,
  itineraryDateLabel,
  listSavedPlans,
  saveDraft,
  setSelectedPlanId,
  toast,
  trackEvent,
} from "../../assets/js/core";

type RecentState = {
  status: "loading" | "ok" | "empty";
  plan: any;
  isLocal: boolean;
};

function startDateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fillPreset(preset: Record<string, any>) {
  return {
    ...buildInitialDraft(),
    ...preset,
    start_date: preset.start_date || startDateAfter(18),
  };
}

const SCENES = [
  {
    scene: "weekend",
    title: "周末轻松散心",
    desc: "周五下班出发，2 天不赶路，重点放在美食和漫步。",
    tag: "周末常用",
    preset: {
      origin_city: "shanghai",
      destination: "hangzhou",
      days: 2,
      budget_level: "medium",
      pace: "relaxed",
      travel_styles: ["food", "nature"],
    },
  },
  {
    scene: "couple",
    title: "情侣浪漫路线",
    desc: "3 天双人行，白天打卡，晚上看夜景，体验感优先。",
    tag: "热门选择",
    preset: {
      origin_city: "beijing",
      destination: "shanghai",
      days: 3,
      budget_level: "high",
      pace: "relaxed",
      companions: ["情侣"],
      travel_styles: ["night", "food"],
    },
  },
  {
    scene: "family",
    title: "亲子不赶路",
    desc: "白天核心景点 + 休息节奏，减少长途奔波和排队焦虑。",
    tag: "亲子友好",
    preset: {
      origin_city: "chengdu",
      destination: "beijing",
      days: 4,
      budget_level: "medium",
      pace: "relaxed",
      companions: ["家庭"],
      travel_styles: ["history", "food"],
    },
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [recent, setRecent] = useState<RecentState>({ status: "loading", plan: null, isLocal: false });

  const ideaPreset = useMemo(() => {
    const idea = params.get("idea");
    const mapping: Record<string, Record<string, any>> = {
      citywalk: { travel_styles: ["nature", "food"], pace: "relaxed", days: 2 },
      history: { travel_styles: ["history"], pace: "relaxed", days: 3 },
      food: { travel_styles: ["food"], pace: "compact", days: 2 },
      night: { travel_styles: ["night", "food"], pace: "compact", days: 2 },
    };
    return idea ? mapping[idea] || null : null;
  }, [params]);

  useEffect(() => {
    if (!ideaPreset) return;
    saveDraft(fillPreset(ideaPreset));
    toast("灵感已带入，去聊天页继续补充目的地。", "ok");
  }, [ideaPreset]);

  useEffect(() => {
    let mounted = true;

    async function loadRecent() {
      try {
        await ensureToken();
        const list = await listSavedPlans(1);
        if (mounted && Array.isArray(list) && list.length > 0) {
          setSelectedPlanId(list[0].id || "");
          setRecent({ status: "ok", plan: list[0], isLocal: false });
          return;
        }
      } catch {
        // ignore and fallback to local itinerary
      }

      const local = getCurrentItinerary();
      if (mounted && local) {
        setRecent({
          status: "ok",
          plan: { id: "", destination: local.destination, start_date: local.start_date, itinerary: local },
          isLocal: true,
        });
        return;
      }

      if (mounted) {
        setRecent({ status: "empty", plan: null, isLocal: false });
      }
    }

    void loadRecent();
    return () => {
      mounted = false;
    };
  }, []);

  function goPlanWithPreset(preset: Record<string, any>, source: string) {
    const normalized = preset || {};
    const hasPreset =
      Boolean(normalized.destination) ||
      Boolean(normalized.days) ||
      Boolean(normalized.origin_city) ||
      Boolean(normalized.travel_styles?.length);

    saveDraft(fillPreset(normalized));
    void trackEvent("home_started", { source });
    navigate(hasPreset ? "/plan?preset=1" : "/plan");
  }

  return (
    <>
      <section className="hero">
        <div>
          <p className="hero-mark">Chinese city trip planner</p>
          <h1>一句话说需求，90 秒拿到可执行行程</h1>
          <p>不用填写复杂表单，像聊天一样告诉我需求，我会自动生成分时段行程并支持随时局部调整。</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => goPlanWithPreset({}, "hero_cta")}>
              开始规划新行程
            </button>
            <button className="btn secondary" onClick={() => navigate("/trips")}>
              查看我的行程
            </button>
          </div>
        </div>
        <div>
          <div className="hero-stat">
            <strong>90 秒</strong>
            <span>目标采集时长</span>
          </div>
          <div className="hero-stat" style={{ marginTop: 10 }}>
            <strong>小时级</strong>
            <span>可执行时间线</span>
          </div>
          <div className="hero-stat" style={{ marginTop: 10 }}>
            <strong>地图联动</strong>
            <span>行程与点位一体展示</span>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">想怎么出发？先选一个场景</h2>
        <p className="section-sub">点击任意场景会自动带入规划页，你可以继续补充细节。</p>
        <div className="home-grid">
          {SCENES.map((item) => (
            <button key={item.scene} className="scene-card" onClick={() => goPlanWithPreset(item.preset, item.scene)}>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
              <span className="tag">{item.tag}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section card soft">
        <div className="card-body">
          <h2 className="section-title">继续上次行程</h2>
          <p className="section-sub">系统会优先展示你最近的一次规划。</p>
          <div className="recent-card">
            {recent.status === "loading" && (
              <div className="recent-copy">
                <h3>正在读取你的行程...</h3>
                <p>如果暂时没有历史记录，可以直接开始新规划。</p>
              </div>
            )}

            {recent.status === "empty" && (
              <>
                <div className="recent-copy">
                  <h3>还没有保存记录</h3>
                  <p>先发起一次新规划，保存后就能在这里快速继续。</p>
                </div>
                <button className="btn secondary" onClick={() => goPlanWithPreset({}, "recent_empty")}>
                  去开始规划
                </button>
              </>
            )}

            {recent.status === "ok" && recent.plan && (
              <>
                <div className="recent-copy">
                  <h3>{cityLabel(recent.plan.destination || "")} · 最近一次规划</h3>
                  <p>{recent.plan.start_date || itineraryDateLabel(recent.plan.itinerary) || "日期待定"}</p>
                  {recent.isLocal && <p>这是你本地最近一次行程（尚未保存到云端）。</p>}
                </div>
                <button
                  className="btn primary"
                  onClick={() => navigate(recent.plan.id ? `/trip?id=${encodeURIComponent(recent.plan.id)}` : "/trip")}
                >
                  继续查看
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="section card soft">
        <div className="card-body">
          <h2 className="section-title">今天的灵感</h2>
          <p className="section-sub">还没有明确想法也没关系，从灵感入口开始。</p>
          <div className="quick-links">
            <Link to="/?idea=citywalk">城市漫游 + 小众咖啡线</Link>
            <Link to="/?idea=history">历史博物馆深度线</Link>
            <Link to="/?idea=food">只为好吃而去的美食线</Link>
            <Link to="/?idea=night">夜景和夜游路线</Link>
          </div>
        </div>
      </section>
    </>
  );
}

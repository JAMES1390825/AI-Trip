import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  cityLabel,
  closePlanShare,
  createPlanShare,
  deleteSavedPlan,
  getCurrentItinerary,
  itineraryDateLabel,
  itineraryTitle,
  listSavedPlans,
  parseError,
  setSelectedPlanId,
  summarizeSavedPlan,
  toast,
  trackEvent,
} from "../../assets/js/core";

export default function TripsPage() {
  const [trips, setTrips] = useState<any[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [shareByPlan, setShareByPlan] = useState<Record<string, any>>({});
  const [shareBusyPlanId, setShareBusyPlanId] = useState("");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return trips;
    return trips.filter((item) => {
      const pool = [item.destination || "", cityLabel(item.destination || ""), item.start_date || "", item.id || ""]
        .join(" ")
        .toLowerCase();
      return pool.includes(text);
    });
  }, [keyword, trips]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const list = await listSavedPlans(30);
        if (!mounted) return;
        setTrips(Array.isArray(list) ? list : []);
      } catch (error) {
        toast(parseError(error), "warn", 3600);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  async function showSummary(planId: string) {
    try {
      const body = await summarizeSavedPlan(planId);
      window.alert(body?.summary || "暂无摘要。");
    } catch (error) {
      toast(parseError(error), "error");
    }
  }

  async function removeTrip(planId: string) {
    if (!window.confirm("确认删除这条行程吗？删除后无法恢复。")) {
      return;
    }

    try {
      await deleteSavedPlan(planId);
      setTrips((prev) => prev.filter((item) => item.id !== planId));
      setShareByPlan((prev) => {
        const next = { ...prev };
        delete next[planId];
        return next;
      });
      toast("已删除行程。", "ok");
    } catch (error) {
      toast(parseError(error), "error");
    }
  }

  async function createShare(planId: string) {
    if (!planId || shareBusyPlanId) return;
    setShareBusyPlanId(planId);
    try {
      const payload = await createPlanShare(planId, 168);
      const sharePath = String(payload?.share_path || "");
      const shareUrl = sharePath ? `${window.location.origin}${sharePath}` : "";
      const shareInfo = {
        token: String(payload?.token || ""),
        sharePath,
        shareUrl,
        expiresAt: String(payload?.expires_at || ""),
      };
      setShareByPlan((prev) => ({
        ...prev,
        [planId]: shareInfo,
      }));
      if (shareUrl && navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast("已创建分享链接，并复制到剪贴板。", "ok");
        } catch {
          toast("已创建分享链接。", "ok");
        }
      } else {
        toast("已创建分享链接。", "ok");
      }
      void trackEvent("plan_share_created", { plan_id: planId });
    } catch (error) {
      toast(parseError(error), "error");
    } finally {
      setShareBusyPlanId("");
    }
  }

  async function closeShare(planId: string) {
    const current = shareByPlan[planId];
    const token = String(current?.token || "");
    if (!token) {
      toast("当前会话尚未创建分享链接，无法直接关闭。", "warn");
      return;
    }

    setShareBusyPlanId(planId);
    try {
      await closePlanShare(planId, token);
      setShareByPlan((prev) => {
        const next = { ...prev };
        delete next[planId];
        return next;
      });
      toast("分享链接已关闭。", "ok");
      void trackEvent("plan_share_closed", { plan_id: planId });
    } catch (error) {
      toast(parseError(error), "error");
    } finally {
      setShareBusyPlanId("");
    }
  }

  const local = !trips.length ? getCurrentItinerary() : null;

  return (
    <section className="card">
      <div className="card-body">
        <div className="trips-top">
          <div>
            <h1 className="section-title" style={{ margin: 0 }}>
              已保存行程
            </h1>
            <p className="section-sub">继续编辑、查看摘要或删除旧计划。</p>
          </div>

          <div className="trips-search">
            <input className="field" placeholder="搜索城市或日期" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Link className="btn primary" to="/plan">
              新建行程
            </Link>
          </div>
        </div>

        {!loading && !filtered.length && !local && <div className="empty-block">暂无保存记录，先去规划第一趟旅行吧。</div>}

        <div className="trips-grid">
          {filtered.map((item) => {
            const destination = cityLabel(item.destination || "");
            const dateText = item.start_date || "日期待定";
            const updatedText = item.updated_at ? String(item.updated_at).replace("T", " ").slice(0, 16) : "最近更新时间未知";
            const dayHint = item.granularity === "hourly" ? "按小时行程" : "关键时段行程";

            return (
              <article className="trip-card" key={item.id}>
                <h3>{destination}</h3>
                <p>{dateText}</p>
                <p>
                  {dayHint} · {updatedText}
                </p>

                <div className="actions">
                  <button
                    className="btn primary"
                    onClick={() => {
                      setSelectedPlanId(item.id || "");
                      void trackEvent("trip_revisited", { plan_id: item.id || "" });
                      navigate(`/trip?id=${encodeURIComponent(item.id || "")}`);
                    }}
                  >
                    继续编辑
                  </button>

                  <button className="btn secondary" onClick={() => void showSummary(item.id)}>
                    查看摘要
                  </button>

                  <button className="btn text" onClick={() => void removeTrip(item.id)}>
                    删除
                  </button>
                </div>

                <div className="share-box">
                  <div style={{ fontSize: "0.82rem", color: "#4b647a" }}>只读分享</div>
                  <div className="actions" style={{ marginTop: "8px" }}>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => void createShare(item.id)}
                      disabled={shareBusyPlanId === item.id}
                    >
                      {shareBusyPlanId === item.id ? "处理中..." : "创建链接"}
                    </button>
                    <button className="btn text" type="button" onClick={() => void closeShare(item.id)} disabled={shareBusyPlanId === item.id}>
                      关闭链接
                    </button>
                  </div>

                  {!!shareByPlan[item.id]?.shareUrl && (
                    <div className="share-link-row">
                      <a href={shareByPlan[item.id].shareUrl} target="_blank" rel="noreferrer" className="inline-link">
                        访问分享页
                      </a>
                      <span>
                        {String(shareByPlan[item.id]?.expiresAt || "").replace("T", " ").slice(0, 16)
                          ? `有效期至 ${String(shareByPlan[item.id].expiresAt).replace("T", " ").slice(0, 16)}`
                          : ""}
                      </span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}

          {!loading && !filtered.length && local && (
            <article className="trip-card">
              <h3>{itineraryTitle(local)}</h3>
              <p>{itineraryDateLabel(local)}</p>
              <p>这是你本地最近一次生成的行程（未保存到云端）。</p>
              <div className="actions">
                <Link className="btn primary" to="/trip">
                  查看当前行程
                </Link>
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}





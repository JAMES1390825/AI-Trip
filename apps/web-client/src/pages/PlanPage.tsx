import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  chatIntakeNext,
  clearDraft,
  draftToSummary,
  generatePlan,
  generatePlanVariants,
  getDraft,
  healthCheck,
  localIntakeResponse,
  missingRequiredFields,
  parseError,
  saveCurrentItinerary,
  saveDraft,
  toast,
  trackEvent,
} from "../../assets/js/core";

type ChatTurn = {
  role: "assistant" | "user";
  message: string;
};

const GREETINGS: ChatTurn[] = [
  { role: "assistant", message: "\u4f60\u597d\uff0c\u6211\u662f\u4f60\u7684\u65c5\u884c\u52a9\u624b\u3002\u5148\u544a\u8bc9\u6211\u4f60\u60f3\u600e\u4e48\u51fa\u53d1\u3002" },
  {
    role: "assistant",
    message:
      "\u4f60\u53ef\u4ee5\u4e00\u53e5\u8bdd\u8bf4\u5b8c\uff1a\u4ece\u54ea\u51fa\u53d1\u3001\u53bb\u54ea\u3001\u73a9\u51e0\u5929\u3001\u9884\u7b97\u548c\u8282\u594f\u3002",
  },
];

const DEFAULT_CHOICES = [
  "\u4e94\u4e00\u4ece\u4e0a\u6d77\u53bb\u5317\u4eac\u73a9 3 \u5929\uff0c\u9884\u7b97\u9002\u4e2d\uff0c\u8282\u594f\u8f7b\u677e",
  "\u4e0b\u5468\u4ece\u676d\u5dde\u53bb\u6210\u90fd\u73a9 4 \u5929\uff0c\u4f53\u9a8c\u4f18\u5148",
  "\u6211\u60f3\u505a\u4e00\u8d9f\u4eb2\u5b50\u6162\u8282\u594f\u65c5\u884c",
];

export default function PlanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const chatRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sendingRef = useRef(false);

  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState<any>(null);
  const [chatStarted, setChatStarted] = useState(false);
  const [completedTracked, setCompletedTracked] = useState(false);
  const [localFallbackUsed, setLocalFallbackUsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [variantPlans, setVariantPlans] = useState<any[]>([]);
  const [readyHintShown, setReadyHintShown] = useState(false);
  const [choices, setChoices] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [startedAt, setStartedAt] = useState(0);

  const summary = useMemo(() => draftToSummary(draft), [draft]);
  const missing = useMemo(() => missingRequiredFields(draft), [draft]);
  const ready = missing.length === 0;
  const busy = generating || sending;

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const keep = query.get("preset") === "1" || query.get("resume") === "1";
    setDraft(keep ? saveDraft(getDraft()) : clearDraft());
    setHistory(GREETINGS);
    setChoices(DEFAULT_CHOICES);
    setSending(false);
    sendingRef.current = false;
    setGenerating(false);
    setVariantPlans([]);
    setReadyHintShown(false);
  }, [location.search]);

  useEffect(() => {
    if (!chatRef.current) return;
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [history]);

  useEffect(() => {
    if (sending) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [sending]);

  function trackChatStarted() {
    if (chatStarted) return;
    setChatStarted(true);
    setStartedAt(Date.now());
    void trackEvent("chat_started", { source: "web-react" });
  }

  function trackChatCompleted() {
    if (completedTracked || !ready) return;
    setCompletedTracked(true);
    const durationMs = startedAt ? Date.now() - startedAt : undefined;
    void trackEvent("chat_completed", {
      duration_ms: durationMs,
      turn_count: history.filter((item) => item.role === "user").length,
    });
  }

  function appendTurn(role: "assistant" | "user", message: string) {
    const normalized = String(message || "").trim();
    if (!normalized) return;
    setHistory((prev) => [...prev, { role, message: normalized }]);
  }

  async function startGenerate(source: string) {
    if (generating || sendingRef.current) return;
    if (!ready) {
      toast("\u8fd8\u5dee\u5c11\u91cf\u4fe1\u606f\uff0c\u7ee7\u7eed\u8865\u5145\u540e\u6211\u5c31\u80fd\u751f\u6210\u3002", "warn");
      return;
    }

    setGenerating(true);
    try {
      await healthCheck();
      void trackEvent("plan_requested", {
        source,
        destination: draft?.destination,
        days: draft?.days,
      });

      const variantPayload = await generatePlanVariants(draft, 2);
      const plans = Array.isArray(variantPayload?.plans) ? variantPayload.plans : [];
      if (plans.length > 0) {
        setVariantPlans(plans);
        void trackEvent("plan_variants_viewed", {
          source,
          count: plans.length,
        });
        toast("已生成多套方案，请先选择一套再进入行程页。", "ok");
        return;
      }

      const itinerary = await generatePlan(draft);
      saveCurrentItinerary(itinerary);
      void trackEvent("plan_generated", { source, destination: itinerary.destination });
      toast("\u884c\u7a0b\u5df2\u751f\u6210\uff0c\u6b63\u5728\u8fdb\u5165\u8be6\u60c5\u9875\u3002", "ok");
      navigate("/trip");
    } catch (error) {
      toast(parseError(error), "error", 3600);
    } finally {
      setGenerating(false);
    }
  }

  function applyVariant(index: number) {
    const selected = variantPlans[index];
    const itinerary = selected?.itinerary || null;
    if (!itinerary) {
      toast("当前方案不可用，请重新生成。", "warn");
      return;
    }
    saveCurrentItinerary(itinerary);
    void trackEvent("plan_variant_selected", {
      plan_variant: String(selected?.plan_variant || "balanced"),
      index,
    });
    toast("已选择该方案，正在进入行程页。", "ok");
    navigate("/trip");
  }

  async function applyResponse(response: any) {
    const nextDraft = saveDraft(response.updated_draft || draft);
    setDraft(nextDraft);
    appendTurn("assistant", response.assistant_message || "\u6211\u7ee7\u7eed\u6574\u7406\u4e00\u4e0b\u3002");
    setChoices(response.suggested_options || []);

    const missingFields = missingRequiredFields(nextDraft);
    if (missingFields.length === 0) {
      trackChatCompleted();
      if (!readyHintShown) {
        appendTurn("assistant", "\u4fe1\u606f\u5df2\u8865\u9f50\uff0c\u8bf7\u70b9\u51fb\u53f3\u4fa7\u6309\u94ae\u624b\u52a8\u751f\u6210\u884c\u7a0b\u3002");
        setReadyHintShown(true);
      }
    } else {
      setReadyHintShown(false);
    }
  }

  async function sendMessage(raw: string) {
    const text = String(raw || "").trim();
    if (!text || busy || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);

    trackChatStarted();
    setVariantPlans([]);
    setInput("");
    appendTurn("user", text);
    setChoices([]);

    void trackEvent("chat_turn_submitted", {
      turn_index: history.filter((item) => item.role === "user").length + 1,
    });

    try {
      const response = await chatIntakeNext([...history, { role: "user", message: text }], draft);
      await applyResponse(response);
    } catch (error) {
      if (!localFallbackUsed) {
        setLocalFallbackUsed(true);
        appendTurn("assistant", "\u7f51\u7edc\u6709\u6ce2\u52a8\uff0c\u6211\u5148\u7528\u672c\u5730\u89c4\u5219\u5e2e\u4f60\u6574\u7406\uff0c\u4e0d\u5f71\u54cd\u672c\u6b21\u89c4\u5212\u3002");
        void trackEvent("chat_fallback_used", { source: "web-react" });
      }
      const fallback = localIntakeResponse(text, draft);
      await applyResponse(fallback);
      console.warn("chat intake fallback", error);
    } finally {
      sendingRef.current = false;
      setSending(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }

  function resetConversation() {
    setDraft(clearDraft());
    setHistory(GREETINGS);
    setChoices(DEFAULT_CHOICES);
    setChatStarted(false);
    setCompletedTracked(false);
    setLocalFallbackUsed(false);
    setSending(false);
    sendingRef.current = false;
    setGenerating(false);
    setVariantPlans([]);
    setReadyHintShown(false);
    toast("\u5df2\u91cd\u7f6e\u4e3a\u65b0\u7684\u4f1a\u8bdd\u3002", "ok");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  return (
    <main className="chat-layout">
      <section className="card chat-panel">
        <div className="chat-top">
          <h1>{"\u4e00\u8d77\u628a\u8fd9\u8d9f\u65c5\u884c\u804a\u6e05\u695a"}</h1>
          <p>{"\u4f60\u5148\u4e00\u6b65\u6b65\u8865\u5168\u4fe1\u606f\uff0c\u786e\u8ba4\u540e\u518d\u624b\u52a8\u70b9\u51fb\u201c\u7acb\u5373\u751f\u6210\u884c\u7a0b\u201d\u3002"}</p>
        </div>

        <div className="chat-stream" ref={chatRef}>
          {history.map((turn, idx) => (
            <div key={`${turn.role}-${idx}`} className={`bubble ${turn.role === "user" ? "user" : "ai"}`}>
              {turn.message}
            </div>
          ))}
        </div>

        <div className="choice-wrap">
          {choices.map((option) => (
            <button key={option} className="choice-btn" onClick={() => void sendMessage(option)} disabled={busy}>
              {option}
            </button>
          ))}
        </div>

        <form
          className="chat-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            placeholder={"\u4f8b\u5982\uff1a\u4e94\u4e00\u4ece\u4e0a\u6d77\u53bb\u5317\u4eac\u73a9 3 \u5929\uff0c\u9884\u7b97\u9002\u4e2d\uff0c\u8282\u594f\u8f7b\u677e"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {"\u53d1\u9001"}
          </button>
        </form>
      </section>

      <aside className="card summary-panel">
        <div className="summary-head">
          <h2>{"\u5df2\u786e\u8ba4\u6761\u4ef6"}</h2>
          <p>{"\u8fd9\u91cc\u4f1a\u81ea\u52a8\u6c47\u603b\u672c\u8f6e\u804a\u5929\u7ed3\u679c\uff0c\u4f60\u786e\u8ba4\u540e\u624b\u52a8\u751f\u6210\u3002"}</p>
        </div>

        <div className={`status-banner ${ready ? "ok" : "wait"}`}>
          {ready
            ? "\u4fe1\u606f\u9f50\u5168\uff0c\u4f60\u53ef\u4ee5\u624b\u52a8\u70b9\u51fb\u201c\u7acb\u5373\u751f\u6210\u884c\u7a0b\u201d\u3002"
            : `\u8fd8\u5dee ${missing.length} \u9879\u5173\u952e\u4fe1\u606f\uff0c\u7ee7\u7eed\u804a\u4e24\u53e5\u5373\u53ef\u5b8c\u6210\u3002`}
        </div>

        <div className="summary-list">
          {summary.map((line: string) => (
            <div key={line} className="summary-item">
              {line}
            </div>
          ))}
        </div>

        {!!variantPlans.length && (
          <div className="variant-grid">
            {variantPlans.map((plan: any, idx: number) => {
              const itinerary = plan?.itinerary || {};
              const days = Array.isArray(itinerary.days) ? itinerary.days.length : Number(itinerary.request_snapshot?.days || 0);
              const variant = String(plan?.plan_variant || itinerary?.plan_variant || "balanced");
              const budget = Number(itinerary.estimated_cost || 0);
              return (
                <article key={`variant-${variant}-${idx}`} className="variant-card">
                  <h3>{variant === "experience" ? "体验优先" : "平衡方案"}</h3>
                  <p>{days || "-"} 天 · 预估 ¥{budget.toFixed(0)}</p>
                  <button className="btn secondary" type="button" onClick={() => applyVariant(idx)}>
                    选择此方案
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <div className="intent-wrap">
          {ready && (
            <button className="btn primary" type="button" disabled={busy} onClick={() => void startGenerate("chat_manual")}>
              {generating ? "\u6b63\u5728\u751f\u6210..." : "\u7acb\u5373\u751f\u6210\u884c\u7a0b"}
            </button>
          )}

          <button className="btn secondary" type="button" onClick={resetConversation}>
            {"\u91cd\u65b0\u5f00\u59cb"}
          </button>

          <button
            className="btn text"
            type="button"
            onClick={() => {
              setInput("\u4ece\u4e0a\u6d77\u53bb\u5317\u4eac\u73a9 3 \u5929\uff0c\u9884\u7b97\u9002\u4e2d\uff0c5\u67088\u65e5\u51fa\u53d1\uff0c\u8282\u594f\u8f7b\u677e");
            }}
          >
            {"\u5e26\u5165\u4e00\u4e2a\u793a\u4f8b\u9700\u6c42"}
          </button>
        </div>
      </aside>
    </main>
  );
}






// @ts-nocheck

export const REQUIRED_FIELDS = [
  "origin_city",
  "destination",
  "days",
  "budget_level",
  "start_date",
  "pace",
];

const STORAGE_KEYS = {
  config: "trip_web_config_v3",
  profile: "trip_web_profile_v3",
  draft: "trip_web_draft_v3",
  itinerary: "trip_web_current_itinerary_v3",
  selectedPlanId: "trip_web_selected_plan_id_v3",
  auth: "trip_web_auth_v3",
};

const DEFAULT_CONFIG = {
  apiBase: "http://127.0.0.1:8080",
  bootstrapSecret: "dev-bootstrap-secret",
  amapJsKey: "",
  userId: "",
};

const DEFAULT_PROFILE = {
  nickname: "旅行者",
  homeCity: "",
  homeCityConfirmed: false,
  defaultBudget: "medium",
  defaultPace: "relaxed",
  reminderEnabled: true,
  reminderOffsetHours: [168, 72, 24],
};

const ALLOWED_REMINDER_OFFSET_HOURS = [24, 48, 72, 168];

const CITY_ALIAS = {
  beijing: ["北京", "beijing", "北京市"],
  tianjin: ["天津", "tianjin", "天津市"],
  shanghai: ["上海", "shanghai", "上海市"],
  hangzhou: ["杭州", "hangzhou", "杭州市"],
  chengdu: ["成都", "chengdu", "成都市"],
  guangzhou: ["广州", "guangzhou", "广州市"],
  shenzhen: ["深圳", "shenzhen", "深圳市"],
  xi_an: ["西安", "xian", "xi'an", "xi an", "西安市"],
  shaoxing: ["绍兴", "shaoxing", "绍兴市"],
  suzhou: ["苏州", "suzhou", "苏州市"],
  wuhan: ["武汉", "wuhan", "武汉市"],
  nanjing: ["南京", "nanjing", "南京市"],
};

const CITY_DISPLAY = {
  beijing: "北京",
  tianjin: "天津",
  shanghai: "上海",
  hangzhou: "杭州",
  chengdu: "成都",
  guangzhou: "广州",
  shenzhen: "深圳",
  xi_an: "西安",
  shaoxing: "绍兴",
  suzhou: "苏州",
  wuhan: "武汉",
  nanjing: "南京",
};

const BUDGET_DISPLAY = {
  low: "节省预算",
  medium: "适中预算",
  high: "体验优先",
};

const PACE_DISPLAY = {
  relaxed: "轻松慢游",
  compact: "紧凑高效",
};

let runtimeToken = "";
let runtimeTokenExpiresAt = "";

function safeParseJSON(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readStore(key, fallback) {
  return safeParseJSON(localStorage.getItem(key), fallback);
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function randomUserId() {
  return `traveler-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureUserId(config) {
  const merged = { ...DEFAULT_CONFIG, ...(config || {}) };
  if (!merged.userId) {
    merged.userId = randomUserId();
    writeStore(STORAGE_KEYS.config, merged);
  }
  return merged;
}

function splitCsv(value) {
  if (!value) return [];
  return String(value)
    .split(/[，,、]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeList(values) {
  if (!values) return [];
  const arr = Array.isArray(values) ? values : [values];
  return arr
    .flatMap((item) => splitCsv(String(item || "")))
    .map((item) => String(item).trim())
    .filter((item, index, list) => item && list.indexOf(item) === index);
}

function normalizeReminderOffsetHours(values) {
  const arr = Array.isArray(values) ? values : [];
  const out = arr
    .map((value) => Number(value))
    .filter((value, index, list) => Number.isInteger(value) && ALLOWED_REMINDER_OFFSET_HOURS.includes(value) && list.indexOf(value) === index)
    .sort((a, b) => b - a);
  return out.length ? out : [...DEFAULT_PROFILE.reminderOffsetHours];
}

export function normalizeCity(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  for (const [city, aliases] of Object.entries(CITY_ALIAS)) {
    if (aliases.some((alias) => alias.toLowerCase() === lower)) {
      return city;
    }
  }
  return raw;
}

export function normalizeBudget(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text.includes("low") || text.includes("省") || text.includes("节约")) return "low";
  if (text.includes("high") || text.includes("高") || text.includes("体验")) return "high";
  if (text.includes("medium") || text.includes("中") || text.includes("适中")) return "medium";
  return "";
}

export function normalizePace(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text.includes("relaxed") || text.includes("轻松") || text.includes("慢")) return "relaxed";
  if (text.includes("compact") || text.includes("紧凑") || text.includes("高效")) return "compact";
  return "";
}

export function normalizeDate(value) {
  const text = String(value || "")
    .trim()
    .replace(/[年/]/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "");

  const m = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return "";
  const mm = String(Number(m[2])).padStart(2, "0");
  const dd = String(Number(m[3])).padStart(2, "0");
  return `${m[1]}-${mm}-${dd}`;
}

export function cityLabel(value) {
  const normalized = normalizeCity(value);
  return CITY_DISPLAY[normalized] || value || "-";
}

export function budgetLabel(value) {
  return BUDGET_DISPLAY[normalizeBudget(value)] || "未设置";
}

export function paceLabel(value) {
  return PACE_DISPLAY[normalizePace(value)] || "未设置";
}

function defaultStartDate(daysLater = 15) {
  const date = new Date();
  date.setDate(date.getDate() + daysLater);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getConfig() {
  return ensureUserId(readStore(STORAGE_KEYS.config, DEFAULT_CONFIG));
}

export function updateConfig(patch) {
  const next = ensureUserId({ ...getConfig(), ...(patch || {}) });
  writeStore(STORAGE_KEYS.config, next);
  return next;
}

export function getProfile() {
  const merged = { ...DEFAULT_PROFILE, ...(readStore(STORAGE_KEYS.profile, {}) || {}) };
  return {
    ...merged,
    reminderOffsetHours: normalizeReminderOffsetHours(merged.reminderOffsetHours),
  };
}

export function saveProfile(profile) {
  const next = { ...DEFAULT_PROFILE, ...(profile || {}) };
  next.reminderOffsetHours = normalizeReminderOffsetHours(next.reminderOffsetHours);
  writeStore(STORAGE_KEYS.profile, next);
  return next;
}

export function getUserId() {
  return getConfig().userId;
}

export function emptyDraft() {
  return {
    origin_city: "",
    destination: "",
    days: null,
    budget_level: "",
    companions: [],
    travel_styles: [],
    must_go: [],
    avoid: [],
    start_date: "",
    pace: "",
    user_id: getUserId(),
  };
}

export function normalizeDraft(input) {
  const source = input || {};
  const days = Number(source.days);
  return {
    origin_city: normalizeCity(source.origin_city || source.originCity || ""),
    destination: normalizeCity(source.destination || ""),
    days: Number.isInteger(days) && days >= 1 && days <= 14 ? days : null,
    budget_level: normalizeBudget(source.budget_level || source.budgetLevel || ""),
    companions: normalizeList(source.companions),
    travel_styles: normalizeList(source.travel_styles || source.travelStyles),
    must_go: normalizeList(source.must_go || source.mustGo),
    avoid: normalizeList(source.avoid),
    start_date: normalizeDate(source.start_date || source.startDate || ""),
    pace: normalizePace(source.pace),
    user_id: getUserId(),
  };
}

export function buildInitialDraft() {
  const profile = getProfile();
  return normalizeDraft({
    origin_city: profile.homeCityConfirmed ? profile.homeCity : "",
    destination: "",
    days: null,
    budget_level: profile.defaultBudget,
    pace: profile.defaultPace,
    start_date: defaultStartDate(15),
    user_id: getUserId(),
  });
}

export function getDraft() {
  const draft = readStore(STORAGE_KEYS.draft, null);
  return draft ? normalizeDraft(draft) : buildInitialDraft();
}

export function saveDraft(draft) {
  const normalized = normalizeDraft(draft);
  writeStore(STORAGE_KEYS.draft, normalized);
  return normalized;
}

export function clearDraft() {
  const draft = buildInitialDraft();
  writeStore(STORAGE_KEYS.draft, draft);
  return draft;
}

export function missingRequiredFields(draft) {
  const normalized = normalizeDraft(draft);
  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (!normalized[field]) {
      missing.push(field);
    }
  }
  return missing;
}

function questionForField(field) {
  switch (field) {
    case "origin_city":
      return "你从哪座城市出发？";
    case "destination":
      return "这次最想去哪座城市玩？";
    case "days":
      return "计划玩几天？";
    case "budget_level":
      return "预算更偏省钱、适中还是体验优先？";
    case "start_date":
      return "预计哪天出发？";
    case "pace":
      return "你希望轻松慢游还是紧凑高效？";
    default:
      return "再补充一点信息，我就可以继续。";
  }
}

function optionsForField(field) {
  switch (field) {
    case "origin_city":
      return ["北京", "上海", "杭州"];
    case "destination":
      return ["北京", "上海", "成都"];
    case "days":
      return ["2天", "3天", "4天"];
    case "budget_level":
      return ["节省预算", "适中预算", "体验优先"];
    case "pace":
      return ["轻松慢游", "紧凑高效"];
    case "start_date":
      return [defaultStartDate(7), defaultStartDate(14)];
    default:
      return ["继续"];
  }
}

function knownCityCode(value) {
  const code = normalizeCity(value);
  if (CITY_DISPLAY[code]) return code;
  return "";
}

const CITY_STOPWORDS = new Set([
  "你好",
  "您好",
  "哈喽",
  "谢谢",
  "好的",
  "可以",
  "安排",
  "行程",
  "旅行",
  "旅游",
  "继续",
  "出发",
]);

const CITY_KEYWORD_RE = /[从去到玩天预算节奏出发旅行旅游]/u;

function parseLooseCityInput(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const compact = raw
    .replace(/[，,。.!！?？~～\s]/g, "")
    .replace(/[啊呀呢吧哈啦哦喔嘛]$/u, "");
  if (!compact) return "";
  const known = knownCityCode(compact);
  if (known) return known;

  const city = compact.replace(/市$/u, "");
  if (!/^[\u4e00-\u9fa5]{2,4}$/u.test(city)) return "";
  if (CITY_STOPWORDS.has(city)) return "";
  if (CITY_KEYWORD_RE.test(city)) return "";
  return normalizeCity(city);
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  return String(value).trim() !== "";
}

function fieldJustFilled(before, after) {
  return !hasValue(before) && hasValue(after);
}

function fieldConfirmLabel(field, value) {
  switch (field) {
    case "origin_city":
      return `出发地记为${cityLabel(value)}`;
    case "destination":
      return `目的地记为${cityLabel(value)}`;
    case "days":
      return `${value}天`;
    case "budget_level":
      return `预算偏好为${budgetLabel(value)}`;
    case "start_date":
      return `出发日期为${String(value)}`;
    case "pace":
      return `节奏偏好为${paceLabel(value)}`;
    default:
      return "";
  }
}

function buildAssistantMessage(previousDraft, updatedDraft, missing) {
  const prev = normalizeDraft(previousDraft || emptyDraft());
  const next = normalizeDraft(updatedDraft || emptyDraft());
  const confirmations = [];

  for (const field of REQUIRED_FIELDS) {
    if (fieldJustFilled(prev[field], next[field])) {
      const label = fieldConfirmLabel(field, next[field]);
      if (label) confirmations.push(label);
    }
  }

  const detail = confirmations.join("，");
  const style = (confirmations.length * 2 + (missing?.length || 0)) % 3;

  if (!missing?.length) {
    if (confirmations.length) {
      switch (style) {
        case 0:
          return `太好了，${detail}。信息齐全了，你可以开始生成行程。`;
        case 1:
          return `明白了，${detail}。现在信息都齐了，可以直接生成行程。`;
        default:
          return `收到，${detail}。条件已经完整，点一下就能生成行程。`;
      }
    }
    return "信息齐全了，你可以开始生成行程。";
  }

  const nextQuestion = questionForField(missing[0]);
  if (confirmations.length) {
    switch (style) {
      case 0:
        return `收到，${detail}。${nextQuestion}`;
      case 1:
        return `好嘞，${detail}。接下来想再确认一下：${nextQuestion}`;
      default:
        return `明白，${detail}。那我们继续：${nextQuestion}`;
    }
  }
  switch (style) {
    case 0:
      return `好的，${nextQuestion}`;
    case 1:
      return `我们继续，${nextQuestion}`;
    default:
      return `${nextQuestion}`;
  }
}

function extractByRegex(text, regex) {
  const match = text.match(regex);
  return match ? String(match[1] || "").trim() : "";
}

function extractDateFromText(text) {
  const match = String(text || "").match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!match) return "";
  return normalizeDate(`${match[1]}-${match[2]}-${match[3]}`);
}

function fillDraftFromMessage(message, draft) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  const next = normalizeDraft(draft || emptyDraft());

  if (!next.origin_city) {
    const originCandidate =
      extractByRegex(text, /从\s*([A-Za-z\u4e00-\u9fa5]{2,20}?)(?=\s*(?:出发|去|到|玩|逛|旅游|旅行|$|[，,。.!！?？]))/) ||
      extractByRegex(text, /从\s*([A-Za-z\u4e00-\u9fa5]{2,20})\s*出发/) ||
      extractByRegex(text, /([A-Za-z\u4e00-\u9fa5]{2,20})\s*出发/);
    if (originCandidate) {
      next.origin_city = normalizeCity(originCandidate);
    }
  }

  if (!next.destination) {
    const destinationCandidate =
      extractByRegex(text, /去\s*([A-Za-z\u4e00-\u9fa5]{2,20})/) || extractByRegex(text, /到\s*([A-Za-z\u4e00-\u9fa5]{2,20})/);
    if (destinationCandidate) {
      next.destination = normalizeCity(destinationCandidate);
    }
  }

  const cityOnly = parseLooseCityInput(text);
  if (cityOnly) {
    if (!next.origin_city) {
      next.origin_city = cityOnly;
    } else if (!next.destination) {
      next.destination = cityOnly;
    }
  }

  if (!next.days) {
    const daysMatch = text.match(/(\d{1,2})\s*天/);
    if (daysMatch) {
      const days = Number(daysMatch[1]);
      if (Number.isInteger(days) && days >= 1 && days <= 14) {
        next.days = days;
      }
    }
  }

  if (!next.budget_level) {
    next.budget_level = normalizeBudget(text);
  }

  if (!next.pace) {
    next.pace = normalizePace(text);
  }

  if (!next.start_date) {
    next.start_date = extractDateFromText(text);
  }

  if (!next.travel_styles?.length) {
    const styles = [];
    if (lower.includes("美食") || lower.includes("food")) styles.push("food");
    if (lower.includes("历史") || lower.includes("博物馆") || lower.includes("history")) styles.push("history");
    if (lower.includes("夜") || lower.includes("night")) styles.push("night");
    if (lower.includes("自然") || lower.includes("citywalk") || lower.includes("nature")) styles.push("nature");
    if (styles.length) next.travel_styles = styles;
  }

  return normalizeDraft(next);
}

export function localIntakeResponse(message, draft) {
  const previousDraft = normalizeDraft(draft || emptyDraft());
  const updatedDraft = fillDraftFromMessage(message, previousDraft);
  const missing = missingRequiredFields(updatedDraft);
  const ready = missing.length === 0;
  return {
    assistant_message: buildAssistantMessage(previousDraft, updatedDraft, missing),
    updated_draft: updatedDraft,
    missing_fields: missing,
    suggested_options: ready ? ["立即生成行程", "再补充一点偏好"] : optionsForField(missing[0]),
    ready_to_generate: ready,
    fallback_mode: "rules",
    intent: "task",
    assistant_mode: "planner",
    next_action: ready ? "READY_TO_GENERATE" : "ASK_ONE_QUESTION",
    next_question: ready ? null : questionForField(missing[0]),
    soft_handoff_to_task: false,
  };
}

export function draftToSummary(draft) {
  const source = normalizeDraft(draft);
  return [
    `出发地：${cityLabel(source.origin_city)}`,
    `目的地：${cityLabel(source.destination)}`,
    `天数：${source.days || "未确定"}`,
    `预算：${budgetLabel(source.budget_level)}`,
    `出发日期：${source.start_date || "未确定"}`,
    `节奏：${paceLabel(source.pace)}`,
  ];
}

export function draftToPlanRequest(draft) {
  const source = normalizeDraft(draft);
  return {
    origin_city: source.origin_city,
    destination: source.destination,
    days: source.days,
    budget_level: source.budget_level,
    companions: source.companions,
    travel_styles: source.travel_styles,
    must_go: source.must_go,
    avoid: source.avoid,
    start_date: source.start_date,
    pace: source.pace,
    user_id: getUserId(),
  };
}

function getAuthCache() {
  return readStore(STORAGE_KEYS.auth, { accessToken: "", expiresAt: "" });
}

function saveAuthCache(accessToken, expiresAt) {
  runtimeToken = accessToken;
  runtimeTokenExpiresAt = expiresAt;
  writeStore(STORAGE_KEYS.auth, { accessToken, expiresAt });
}

function clearAuthCache() {
  runtimeToken = "";
  runtimeTokenExpiresAt = "";
  writeStore(STORAGE_KEYS.auth, { accessToken: "", expiresAt: "" });
}

function isTokenValid(expiresAt) {
  if (!expiresAt) return false;
  const expMs = Date.parse(expiresAt);
  if (!Number.isFinite(expMs)) return false;
  return expMs - Date.now() > 60_000;
}

function apiBaseUrl() {
  return String(getConfig().apiBase || "").trim().replace(/\/+$/, "");
}

function apiUrl(path) {
  if (String(path).startsWith("http://") || String(path).startsWith("https://")) {
    return String(path);
  }
  const normalizedPath = String(path).startsWith("/") ? String(path) : `/${path}`;
  return `${apiBaseUrl()}${normalizedPath}`;
}

async function rawFetch(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 15000);
  const method = options.method || "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: options.headers || {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    return { response, payload };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`${method} 请求超时（>${timeoutMs}ms）`);
    }
    if (error instanceof TypeError || String(error).toLowerCase().includes("failed to fetch")) {
      throw new Error("无法连接行程服务。请确认 trip-api 已启动，并在 /ops 检查 API 地址（默认 http://127.0.0.1:8080）。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function issueToken() {
  const payload = {
    user_id: getUserId(),
    role: "USER",
    client_secret: getConfig().bootstrapSecret,
  };

  const { response, payload: body } = await rawFetch(apiUrl("/api/v1/auth/token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    timeoutMs: 4500,
  });

  if (!response.ok) {
    throw new Error(`登录失败 (${response.status})`);
  }
  if (!body || !body.access_token) {
    throw new Error("登录失败：未返回 access_token");
  }

  saveAuthCache(body.access_token, body.expires_at || "");
  return body.access_token;
}

export async function ensureToken(force = false) {
  if (!force && runtimeToken && isTokenValid(runtimeTokenExpiresAt)) {
    return runtimeToken;
  }

  const cache = getAuthCache();
  if (!force && cache.accessToken && isTokenValid(cache.expiresAt)) {
    runtimeToken = cache.accessToken;
    runtimeTokenExpiresAt = cache.expiresAt;
    return runtimeToken;
  }

  return issueToken();
}

export async function apiRequest(path, options = {}) {
  const method = options.method || "GET";
  const authRequired = options.auth !== false;

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  if (authRequired) {
    const token = await ensureToken();
    headers.Authorization = `Bearer ${token}`;
  }

  let result = await rawFetch(apiUrl(path), {
    method,
    headers,
    body: options.body,
    timeoutMs: options.timeoutMs || 15000,
  });

  if (result.response.status === 401 && authRequired) {
    clearAuthCache();
    const token = await ensureToken(true);
    headers.Authorization = `Bearer ${token}`;
    result = await rawFetch(apiUrl(path), {
      method,
      headers,
      body: options.body,
      timeoutMs: options.timeoutMs || 15000,
    });
  }

  if (!result.response.ok) {
    const detail =
      typeof result.payload === "string"
        ? result.payload
        : result.payload?.message || result.payload?.error || JSON.stringify(result.payload || {});
    throw new Error(`${method} ${path} 失败 (${result.response.status})${detail ? `：${detail}` : ""}`);
  }

  return result.payload;
}

export async function healthCheck() {
  return apiRequest("/api/v1/health", { auth: false });
}

export async function chatIntakeNext(history, draft, locale = "zh-CN") {
  return apiRequest("/api/v1/chat/intake/next", {
    method: "POST",
    body: {
      history: Array.isArray(history) ? history : [],
      draft_plan_request: normalizeDraft(draft),
      locale,
      user_id: getUserId(),
    },
    timeoutMs: 5000,
  });
}

export async function generatePlan(draft) {
  return apiRequest("/api/v1/plans/generate", {
    method: "POST",
    body: draftToPlanRequest(draft),
  });
}

export async function generatePlanVariants(draft, variants = 2) {
  const count = Number(variants);
  if (!Number.isInteger(count) || (count !== 1 && count !== 2)) {
    throw new Error("variants 必须是 1 或 2。");
  }
  return apiRequest("/api/v1/plans/generate", {
    method: "POST",
    body: {
      ...draftToPlanRequest(draft),
      variants: count,
    },
  });
}

export async function replanPlan(itinerary, patch) {
  return apiRequest("/api/v1/plans/replan", {
    method: "POST",
    body: { itinerary, patch },
  });
}

export async function savePlan(itinerary) {
  return apiRequest("/api/v1/plans/save", {
    method: "POST",
    body: { user_id: getUserId(), itinerary },
  });
}

export async function listSavedPlans(limit = 20) {
  return apiRequest(`/api/v1/plans/saved?limit=${Number(limit) || 20}`);
}

export async function loadSavedPlan(id) {
  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(id)}`);
}

export async function deleteSavedPlan(id) {
  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function summarizeSavedPlan(id) {
  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(id)}/summary`);
}

export async function listPlanVersions(id, limit = 20) {
  const safeLimit = Number(limit) || 20;
  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(id)}/versions?limit=${safeLimit}`);
}

export async function getPreTripTasks(planId) {
  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(planId)}/tasks`);
}

export async function replacePreTripTasks(planId, tasks) {
  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(planId)}/tasks`, {
    method: "PUT",
    body: {
      tasks: Array.isArray(tasks) ? tasks : [],
    },
  });
}

export async function getPlanExecution(planId, date) {
  const normalizedDate = normalizeDate(date || "");
  if (!normalizedDate) {
    throw new Error("date 必须是 YYYY-MM-DD 格式。");
  }
  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(planId)}/execution?date=${encodeURIComponent(normalizedDate)}`);
}

export async function replacePlanExecution(planId, date, updates) {
  const normalizedDate = normalizeDate(date || "");
  if (!normalizedDate) {
    throw new Error("date 必须是 YYYY-MM-DD 格式。");
  }
  const updateList = Array.isArray(updates) ? updates : [];
  if (!updateList.length) {
    throw new Error("updates 不能为空。");
  }
  const normalizedUpdates = updateList.map((item, idx) => {
    const dayIndex = Number(item?.day_index);
    const blockId = String(item?.block_id || "").trim();
    const status = String(item?.status || "").trim().toLowerCase();
    if (!Number.isInteger(dayIndex) || dayIndex < 0) {
      throw new Error(`updates[${idx}].day_index 必须是非负整数。`);
    }
    if (!blockId) {
      throw new Error(`updates[${idx}].block_id 不能为空。`);
    }
    if (!["pending", "done", "skipped"].includes(status)) {
      throw new Error(`updates[${idx}].status 仅支持 pending/done/skipped。`);
    }
    return {
      day_index: dayIndex,
      block_id: blockId,
      status,
    };
  });

  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(planId)}/execution`, {
    method: "PUT",
    body: {
      date: normalizedDate,
      updates: normalizedUpdates,
    },
  });
}

export async function getPlanDiff(planId, fromVersion, toVersion) {
  const from = Number(fromVersion);
  const to = Number(toVersion);
  if (!Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < 1) {
    throw new Error("from_version/to_version 必须是正整数。");
  }
  if (from === to) {
    throw new Error("from_version 和 to_version 不能相同。");
  }
  return apiRequest(
    `/api/v1/plans/saved/${encodeURIComponent(planId)}/diff?from_version=${from}&to_version=${to}`,
  );
}

export async function createPlanShare(planId, expiresInHours = 168) {
  const hours = Number(expiresInHours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
    throw new Error("expires_in_hours 必须在 1 到 720 之间。");
  }
  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(planId)}/share`, {
    method: "POST",
    body: {
      expires_in_hours: hours,
    },
  });
}

export async function closePlanShare(planId, token) {
  return apiRequest(`/api/v1/plans/saved/${encodeURIComponent(planId)}/share/${encodeURIComponent(token)}`, {
    method: "DELETE",
  });
}

export async function getSharedPlan(token) {
  return apiRequest(`/api/v1/share/${encodeURIComponent(token)}`, {
    auth: false,
  });
}

export async function revertPlan(savedPlanId, targetVersion) {
  const version = Number(targetVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("target_version 必须是正整数。");
  }
  return apiRequest("/api/v1/plans/revert", {
    method: "POST",
    body: {
      saved_plan_id: String(savedPlanId || "").trim(),
      target_version: version,
    },
  });
}

export async function trackEvent(eventName, metadata = {}) {
  try {
    const cache = getAuthCache();
    const token =
      runtimeToken && isTokenValid(runtimeTokenExpiresAt)
        ? runtimeToken
        : cache.accessToken && isTokenValid(cache.expiresAt)
          ? cache.accessToken
          : "";

    if (!token) return;

    if (!runtimeToken) {
      runtimeToken = token;
      runtimeTokenExpiresAt = cache.expiresAt || runtimeTokenExpiresAt;
    }

    await apiRequest("/api/v1/events", {
      method: "POST",
      auth: false,
      timeoutMs: 2500,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        event_name: eventName,
        metadata,
      },
    });
  } catch {
    // telemetry should not block UI
  }
}

export function saveCurrentItinerary(itinerary) {
  writeStore(STORAGE_KEYS.itinerary, itinerary || null);
  return itinerary;
}

export function getCurrentItinerary() {
  return readStore(STORAGE_KEYS.itinerary, null);
}

export function setSelectedPlanId(planId) {
  writeStore(STORAGE_KEYS.selectedPlanId, String(planId || ""));
}

export function getSelectedPlanId() {
  return readStore(STORAGE_KEYS.selectedPlanId, "");
}

export function itineraryTitle(itinerary) {
  if (!itinerary) return "未命名行程";
  const destination = cityLabel(itinerary.destination || itinerary.request_snapshot?.destination || "");
  const dayCount = Array.isArray(itinerary.days) ? itinerary.days.length : 0;
  return dayCount ? `${destination} ${dayCount}天行程` : `${destination} 行程`;
}

export function itineraryDateLabel(itinerary) {
  if (!itinerary?.days || itinerary.days.length === 0) {
    return itinerary?.start_date || "日期待定";
  }
  const start = itinerary.days[0]?.date || itinerary.start_date || "";
  const end = itinerary.days[itinerary.days.length - 1]?.date || start;
  return start && end ? `${start} 至 ${end}` : "日期待定";
}

export function padHour(hour) {
  return String(hour).padStart(2, "0");
}

export function collectMapPoints(itinerary) {
  const points = [];
  (itinerary?.days || []).forEach((day, dayIndex) => {
    (day.blocks || []).forEach((block, blockIndex) => {
      if (block.poi_lat == null || block.poi_lon == null) return;
      points.push({
        key: `${Number(day.day_index ?? dayIndex)}-${blockIndex}`,
        dayIndex: Number(day.day_index ?? dayIndex),
        blockIndex,
        poi: block.poi || block.title || "行程点位",
        lat: Number(block.poi_lat),
        lon: Number(block.poi_lon),
      });
    });
  });
  return points;
}

export function byId(id) {
  return document.getElementById(id);
}

export function toast(message, level = "ok", timeoutMs = 2600) {
  const zone = byId("toastZone");
  if (!zone) return;

  const node = document.createElement("div");
  node.className = `toast ${level}`;
  node.textContent = String(message || "");
  zone.appendChild(node);

  setTimeout(() => {
    node.remove();
  }, timeoutMs);
}

export function parseError(error) {
  if (!error) return "请求失败，请稍后重试。";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const message = error.message || "";
    if (message.toLowerCase().includes("failed to fetch")) {
      return "无法连接行程服务。请确认 trip-api 已启动，并检查 /ops 中的 API 地址。";
    }
    return message;
  }
  return String(error);
}




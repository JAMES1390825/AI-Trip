import { getConfig } from "./storage";

type ApiRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

type RawFetchResult = {
  response: Response;
  payload: unknown;
};

function apiBaseUrl(): string {
  return String(getConfig().apiBase || "").trim().replace(/\/+$/, "");
}

function apiUrl(path: string): string {
  if (String(path).startsWith("http://") || String(path).startsWith("https://")) {
    return String(path);
  }
  const normalizedPath = String(path).startsWith("/") ? String(path) : `/${path}`;
  return `${apiBaseUrl()}${normalizedPath}`;
}

function parseJsonLike(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rawFetch(url: string, options: ApiRequestOptions = {}): Promise<RawFetchResult> {
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
    const payload = parseJsonLike(text);

    return { response, payload };
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError") {
      throw new Error(`${method} 请求超时（>${timeoutMs}ms）`);
    }
    if (error instanceof TypeError || String(error).toLowerCase().includes("failed to fetch")) {
      throw new Error("无法连接 trip-api 服务。请确认后端已启动，并检查后台 API 地址（默认 http://127.0.0.1:8080）。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractErrorDetail(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const body = payload as { message?: unknown; error?: unknown };
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.error === "string" && body.error.trim()) return body.error;
    return JSON.stringify(payload);
  }
  return "";
}

export async function apiRequest<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method || "GET";

  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  const result = await rawFetch(apiUrl(path), {
    method,
    headers,
    body: options.body,
    timeoutMs: options.timeoutMs || 15000,
  });

  if (!result.response.ok) {
    const detail = extractErrorDetail(result.payload);
    throw new Error(`${method} ${path} 失败 (${result.response.status})${detail ? `：${detail}` : ""}`);
  }

  return result.payload as T;
}

export async function healthCheck() {
  return apiRequest<{ status?: string; service?: string; scope?: string }>("/api/v1/health");
}

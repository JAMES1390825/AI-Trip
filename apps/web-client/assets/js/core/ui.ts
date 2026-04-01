export function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function toast(message: unknown, level = "ok", timeoutMs = 2600): void {
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

export function parseError(error: unknown): string {
  if (!error) return "请求失败，请稍后重试。";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const message = error.message || "";
    if (message.toLowerCase().includes("failed to fetch")) {
      return "无法连接 trip-api 服务。请确认后端已启动，并检查后台配置中的 API 地址。";
    }
    return message;
  }
  return String(error);
}

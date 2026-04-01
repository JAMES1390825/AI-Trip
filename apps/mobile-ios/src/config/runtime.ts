const defaultApiBase = "http://127.0.0.1:8080";
const defaultBootstrapSecret = "dev-bootstrap-secret";
const defaultUserId = "ios-user-local";

function cleanBase(input: string): string {
  return String(input || "").trim().replace(/\/+$/, "");
}

export const RUNTIME_CONFIG = {
  apiBase: cleanBase(process.env.EXPO_PUBLIC_API_BASE || defaultApiBase),
  bootstrapSecret: String(process.env.EXPO_PUBLIC_BOOTSTRAP_SECRET || defaultBootstrapSecret).trim(),
  userId: String(process.env.EXPO_PUBLIC_USER_ID || defaultUserId).trim(),
};

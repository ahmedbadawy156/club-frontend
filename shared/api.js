// fetch wrapper for the three service APIs.
//
//   const data = await api("membership", "/members", { query: { search } });
//
// Adds the access token unless { auth: false }. Throws ApiError for non-2xx
// responses. The site holds no API keys.

import { config, isConfigured } from "./config.js";
import { clearSession, getAccessToken } from "./auth.js";

const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(status, code, body, retryAfter) {
    super(code || `HTTP ${status}`);
    this.status = status;
    this.code = code || null;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

export async function api(service, path, options = {}) {
  const { method = "GET", body, query, auth = true } = options;

  if (!isConfigured(service)) {
    throw new ApiError(0, "service_not_configured", null, null);
  }
  const { apiUrl } = config[service];

  const url = new URL(apiUrl + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await getAccessToken();
    if (!token) throw new ApiError(401, "session_expired", null, null);
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "network_error", null, null);
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    // A rejected token means the session is no longer usable.
    if (auth && res.status === 401) clearSession();
    throw new ApiError(
      res.status,
      data?.error ?? null,
      data,
      res.headers.get("Retry-After"),
    );
  }
  return data;
}

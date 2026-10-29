const NETWORK_ERROR_MESSAGE = "Não deu para falar com o servidor. Confira a internet e tente de novo.";

export const API_URL: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function isPlatformEnabled(): boolean {
  return API_URL !== "";
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

interface AuthHooks {
  getToken: () => string | null;
  onUnauthorized: () => void;
}

let authHooks: AuthHooks = { getToken: () => null, onUnauthorized: () => undefined };

export function configureApiAuth(hooks: AuthHooks): void {
  authHooks = hooks;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

function isErrorBody(value: unknown): value is { error: { code: string; message: string; fields?: Record<string, string> } } {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string";
}

async function send(method: Method, path: string, options: RequestOptions): Promise<Response> {
  if (!isPlatformEnabled()) throw new ApiError(0, "sem-servidor", "A plataforma de aulas não está configurada neste aplicativo.");
  const headers: Record<string, string> = {};
  const token = authHooks.getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method, headers, body, signal: options.signal ?? null });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "rede", NETWORK_ERROR_MESSAGE);
  }
  if (response.ok) return response;
  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 401 && token) authHooks.onUnauthorized();
  if (isErrorBody(payload)) throw new ApiError(response.status, payload.error.code, payload.error.message, payload.error.fields ?? {});
  throw new ApiError(response.status, "erro", `O servidor respondeu com erro ${response.status}.`);
}

export async function apiRequest<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(method, path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await send("GET", path, signal ? { signal } : {});
  return response.blob();
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>("GET", path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => apiRequest<T>("POST", path, { body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>("PATCH", path, { body }),
  delete: <T = void>(path: string, body?: unknown) => apiRequest<T>("DELETE", path, { body }),
  upload: <T>(path: string, form: FormData) => apiRequest<T>("POST", path, { form }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Algo deu errado. Tente de novo.";
}

export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

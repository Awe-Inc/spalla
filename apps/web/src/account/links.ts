export function signupLink(params: Record<string, string>, origin: string = window.location.origin, basePath: string = import.meta.env.BASE_URL): string {
  const base = `${origin}${basePath.replace(/\/$/, "")}`;
  return `${base}/criar-conta?${new URLSearchParams(params).toString()}`;
}

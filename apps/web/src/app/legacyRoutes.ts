export const LEGACY_REDIRECTS: readonly (readonly [string, string])[] = [
  ["/praticar", "/estudar"],
  ["/musicas", "/repertorio"],
  ["/estante", "/repertorio/estante"],
  ["/progresso/modulo", "/estudar/modulo"],
  ["/progresso", "/voce"],
  ["/configuracoes", "/voce/ajustes"],
  ["/ferramentas/latencia", "/voce/ajustes/atraso"],
  ["/conta", "/voce/conta"],
];

export function legacyTarget(pathname: string): string | null {
  for (const [from, to] of LEGACY_REDIRECTS) {
    if (pathname === from || pathname.startsWith(`${from}/`)) return `${to}${pathname.slice(from.length)}`;
  }
  return null;
}

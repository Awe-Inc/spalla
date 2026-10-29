import { Icon } from "./icons";

export const PLATFORM_NAME = "Spalla";

export function Wordmark({ size = "title" }: { size?: "title" | "heading" }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <Icon name="hoje" className={size === "title" ? "size-7 text-primary" : "size-6 text-primary"} />
      <span className={`font-display leading-none ${size === "title" ? "text-title" : "text-heading"}`}>{PLATFORM_NAME}</span>
    </span>
  );
}

import type { ReactNode } from "react";

import { PageHeader } from "@/design/layout";

const BACK = { to: "/ferramentas", label: "Ferramentas" };

interface ToolLayoutProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  isWide?: boolean;
  children: ReactNode;
}

export function ToolLayout({ title, description, actions, isWide = false, children }: ToolLayoutProps) {
  return (
    <>
      <PageHeader back={BACK} title={title} description={description} actions={actions} />
      <div className={`grid w-full min-w-0 gap-6 ${isWide ? "max-w-5xl" : "max-w-2xl"}`}>{children}</div>
    </>
  );
}

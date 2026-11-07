import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backupFileName, buildBackup, serializeBackup } from "@/data/backup";

const fake = vi.hoisted(() => ({ exportBackup: vi.fn(async () => undefined) }));

vi.mock("@/core/useCore", () => ({ useCore: () => ({ status: "loading" }) }));
vi.mock("@/data/backup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/backup")>()),
  exportBackup: fake.exportBackup,
}));

import { DadosCard } from "./DadosCard";

function backupFile(text: string): File {
  const file = new File([text], "spalla.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => text });
  return file;
}

describe("DadosCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("needs the core to export the history", () => {
    render(<DadosCard />);
    expect(screen.getByRole("button", { name: "Exportar histórico (CSV)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exportar backup" })).toBeEnabled();
  });

  it("reports when the backup was downloaded and when it failed", async () => {
    render(<DadosCard />);
    fireEvent.click(screen.getByRole("button", { name: "Exportar backup" }));
    expect(await screen.findByText("Backup baixado.")).toBeInTheDocument();
    fake.exportBackup.mockRejectedValueOnce(new Error("Sem espaço."));
    fireEvent.click(screen.getByRole("button", { name: "Exportar backup" }));
    expect(await screen.findByText("Sem espaço.")).toBeInTheDocument();
  });

  it("asks to confirm before restoring a valid backup", async () => {
    render(<DadosCard />);
    const text = serializeBackup(await buildBackup());
    fireEvent.change(screen.getByLabelText("Escolher backup (.json)"), { target: { files: [backupFile(text)] } });
    expect(await screen.findByText(/Backup lido: spalla\.json/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restaurar backup" })).toBeInTheDocument();
  });

  it("refuses a file that is not a backup and offers nothing to restore", async () => {
    render(<DadosCard />);
    fireEvent.change(screen.getByLabelText("Escolher backup (.json)"), { target: { files: [backupFile("{não é json")] } });
    await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: "Restaurar backup" })).not.toBeInTheDocument();
  });
});

describe("backupFileName", () => {
  it("uses the local day, even late at night", () => {
    expect(backupFileName(new Date(2026, 10, 6, 23, 30))).toBe("spalla-backup-2026-11-06.json");
  });
});

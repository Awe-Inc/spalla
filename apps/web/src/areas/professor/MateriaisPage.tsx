import { useState, type FormEvent } from "react";

import { api, errorMessage } from "@/api/client";
import { openPdf } from "@/account/files";
import type { MaterialKind, TeacherClass, TeacherMaterial } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { Badge, FIELD_CLASS, FormError, formatDate, LINK_SECONDARY_CLASS, LoadState, Notice, TextAreaField, TextField } from "@/account/ui";
import { Button, Card, EmptyState, PageTitle } from "@/design/components";

import { safeExternalUrl } from "@/areas/aulas/lessons";
import { formatBytes, looksLikePdf, MATERIAL_KIND_LABELS, MAX_PDF_BYTES } from "./teaching";

function ClassChecklist({ classes, selected, onChange }: { classes: TeacherClass[]; selected: string[]; onChange: (ids: string[]) => void }) {
  if (classes.length === 0) return <p className="text-caption text-ink-muted">Sem turmas ainda. O material fica guardado e pode ser anexado a tarefas de alunos individuais depois.</p>;
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-caption font-medium text-ink">Compartilhar com as turmas</legend>
      {classes.map((klass) => (
        <label key={klass.id} className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-surface-soft">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={selected.includes(klass.id)}
            onChange={(event) => onChange(event.target.checked ? [...selected, klass.id] : selected.filter((id) => id !== klass.id))}
          />
          <span className="text-body text-ink">{klass.name}</span>
        </label>
      ))}
    </fieldset>
  );
}

function NewMaterialForm({ classes, onCreated, onCancel }: { classes: TeacherClass[]; onCreated: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<MaterialKind>("pdf");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function send(): Promise<void> {
    if (kind === "pdf") {
      if (!file) throw new Error("Escolha um arquivo PDF.");
      if (file.size > MAX_PDF_BYTES) throw new Error(`O PDF tem ${formatBytes(file.size)}; o limite é ${formatBytes(MAX_PDF_BYTES)}.`);
      if (!(await looksLikePdf(file))) throw new Error("Esse arquivo não é um PDF.");
      const form = new FormData();
      form.append("title", title.trim() || file.name.replace(/\.pdf$/i, ""));
      form.append("classIds", classIds.join(","));
      form.append("file", file, file.name);
      await api.upload("/teacher/materials/pdf", form);
      return;
    }
    if (kind === "link") {
      await api.post("/teacher/materials", { kind, title: title.trim(), url: url.trim(), body: body.trim(), classIds });
      return;
    }
    await api.post("/teacher/materials", { kind, title: title.trim(), body: body.trim(), classIds });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await send();
      onCreated();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Novo material">
      <form onSubmit={submit} className="grid gap-4">
        <div role="radiogroup" aria-label="Tipo de material" className="flex flex-wrap gap-2">
          {(["pdf", "link", "text"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              className={`h-11 rounded-pill px-5 text-body font-semibold transition-colors duration-fast ease-spalla md:h-10 ${kind === option ? "bg-primary text-on-primary" : "bg-surface-soft text-ink hover:bg-surface-sunken"}`}
              onClick={() => setKind(option)}
            >
              {MATERIAL_KIND_LABELS[option]}
            </button>
          ))}
        </div>
        {kind === "pdf" ? (
          <label className="grid gap-1 text-caption font-medium text-ink">
            Arquivo PDF (até {formatBytes(MAX_PDF_BYTES)})
            <input type="file" accept="application/pdf,.pdf" className={`${FIELD_CLASS} py-2`} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
        ) : null}
        <TextField label={kind === "pdf" ? "Título (opcional)" : "Título"} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
        {kind === "link" ? <TextField label="Endereço" type="url" placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} /> : null}
        {kind !== "pdf" ? (
          <TextAreaField
            label={kind === "text" ? "Texto" : "Descrição (opcional)"}
            maxLength={kind === "text" ? 20000 : 4000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        ) : null}
        <ClassChecklist classes={classes} selected={classIds} onChange={setClassIds} />
        <FormError message={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Enviando…" : "Salvar material"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MaterialRow({ material, classes, onChanged }: { material: TeacherMaterial; classes: TeacherClass[]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(material.title);
  const [classIds, setClassIds] = useState(material.classIds);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shared = classes.filter((klass) => material.classIds.includes(klass.id));
  const linkUrl = safeExternalUrl(material.url);

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setEditing(false);
      setConfirming(false);
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <li className="grid gap-3 rounded-lg bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{MATERIAL_KIND_LABELS[material.kind]}</Badge>
            <h2 className="text-heading font-semibold text-ink">{material.title}</h2>
          </div>
          <p className="text-caption text-ink-muted">
            {formatDate(material.createdAt)}
            {material.fileSize ? ` · ${formatBytes(material.fileSize)}` : ""}
            {shared.length > 0 ? ` · ${shared.map((klass) => klass.name).join(", ")}` : " · não compartilhado"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {material.kind === "pdf" && material.fileId ? (
            <Button onClick={() => void act(() => openPdf(material.fileId!))}>Abrir</Button>
          ) : null}
          {material.kind === "link" && linkUrl ? (
            <a href={linkUrl} target="_blank" rel="noopener noreferrer" className={LINK_SECONDARY_CLASS}>
              Abrir link
            </a>
          ) : null}
          <Button variant="ghost" onClick={() => setEditing((value) => !value)}>
            {editing ? "Fechar" : "Editar"}
          </Button>
        </div>
      </div>
      {material.kind === "text" && material.body && !editing ? <p className="line-clamp-4 whitespace-pre-line text-body text-ink-muted">{material.body}</p> : null}
      {editing ? (
        <div className="grid gap-4 border-t border-hairline pt-4">
          <TextField label="Título" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
          <ClassChecklist classes={classes} selected={classIds} onChange={setClassIds} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={title.trim().length < 2} onClick={() => void act(() => api.patch(`/teacher/materials/${material.id}`, { title: title.trim(), classIds }))}>
              Salvar
            </Button>
            {confirming ? (
              <>
                <span className="text-body text-ink">Apagar de vez? Some das tarefas também.</span>
                <Button variant="ghost" onClick={() => void act(() => api.delete(`/teacher/materials/${material.id}`))}>
                  Apagar
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Manter
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Apagar material
              </Button>
            )}
          </div>
        </div>
      ) : null}
      <FormError message={error} />
    </li>
  );
}

export function MateriaisPage() {
  const materials = useApiData((signal) => api.get<TeacherMaterial[]>("/teacher/materials", signal), []);
  const classesData = useApiData((signal) => api.get<TeacherClass[]>("/teacher/classes", signal), []);
  const classes = classesData.data ?? [];
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  return (
    <div className="grid gap-6">
      <PageTitle title="Materiais" eyebrow="Área do professor">
        {creating ? null : (
          <Button variant="primary" onClick={() => setCreating(true)}>
            Novo material
          </Button>
        )}
      </PageTitle>
      {creating ? (
        <NewMaterialForm
          classes={classes}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setCreated(true);
            materials.reload();
          }}
        />
      ) : null}
      {created ? <Notice>Material salvo. Os alunos das turmas marcadas já veem em Minhas aulas.</Notice> : null}
      <LoadState {...materials}>
        {(list) =>
          list.length === 0 ? (
            creating ? null : (
              <EmptyState
                title="Nenhum material ainda"
                description="Envie partituras e apostilas em PDF, links de vídeo ou textos de orientação. Compartilhe com uma turma ou anexe a uma tarefa."
                action={
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    Enviar o primeiro material
                  </Button>
                }
              />
            )
          ) : (
            <ul className="grid gap-3">
              {list.map((material) => (
                <MaterialRow key={`${material.id}-${material.title}-${material.classIds.join()}`} material={material} classes={classes} onChanged={materials.reload} />
              ))}
            </ul>
          )
        }
      </LoadState>
    </div>
  );
}

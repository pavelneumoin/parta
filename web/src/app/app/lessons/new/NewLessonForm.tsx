"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import {
  createLessonAction,
  type CreateLessonState,
} from "../actions";

const INITIAL: CreateLessonState = { ok: false };

const TEMPLATES = [
  { value: "blank_grid",  title: "Клетка",      sub: "Универсальная подложка для алгебры и выкладок" },
  { value: "blank_coord", title: "Координаты",  sub: "Декартова плоскость с осями — для графиков" },
  { value: "blank_lined", title: "Линии",       sub: "Горизонтальные строки — для теории и записей" },
  { value: "pdf",         title: "Свой PDF",    sub: "Загрузите рабочий лист — каждый ученик получит копию" },
];

export type NewLessonFormProps = {
  classes: { id: string; name: string }[];
  defaultClassId?: string;
};

export function NewLessonForm({ classes, defaultClassId }: NewLessonFormProps) {
  const [state, formAction, pending] = useActionState(createLessonAction, INITIAL);
  const [picked, setPicked] = useState("blank_grid");

  // PDF state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfTemplateId, setPdfTemplateId] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const uploadPdf = async (file: File) => {
    setPdfError(null);
    setPdfUploading(true);
    setPdfTemplateId(null);
    setPdfPageCount(null);
    setPdfFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/templates/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) {
        const map: Record<string, string> = {
          wrong_type: "Файл не PDF",
          size: "Размер больше 8 МБ",
          bad_pdf: "Не удалось прочитать PDF",
          page_count: "В PDF слишком много страниц (макс. 10)",
          no_file: "Файл не передан",
        };
        setPdfError(map[data.error] ?? `Ошибка: ${data.error || r.status}`);
        return;
      }
      setPdfTemplateId(data.templateId);
      setPdfPageCount(data.pageCount);
    } catch (e) {
      setPdfError((e as Error).message);
    } finally {
      setPdfUploading(false);
    }
  };

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink/80">Название урока</span>
        <input
          name="title"
          required
          placeholder="Линейные уравнения"
          className={`px-3 py-2.5 rounded-lg border bg-paper outline-none focus:border-accent transition ${
            state.fieldErrors?.title ? "border-red" : "border-rule"
          }`}
        />
        {state.fieldErrors?.title && (
          <span className="text-red text-xs">{state.fieldErrors.title}</span>
        )}
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink/80">Когда (необязательно)</span>
          <input
            name="scheduledFor"
            type="datetime-local"
            defaultValue={defaultDatetimeLocal()}
            className="px-3 py-2.5 rounded-lg border border-rule bg-paper outline-none focus:border-accent transition"
          />
          <span className="text-dim text-xs">
            Урок появится в секции «Сегодня» на дашборде. Можно оставить пустым.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink/80">Класс (необязательно)</span>
          <select
            name="classId"
            defaultValue={defaultClassId ?? ""}
            className="px-3 py-2.5 rounded-lg border border-rule bg-paper outline-none focus:border-accent transition"
          >
            <option value="">— не привязан —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-dim text-xs">
            Можно будет выбрать класс при «▶ Начать», но если задать — кнопка станет одним кликом.
          </span>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm text-ink/80 mb-2">Шаблон</legend>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {TEMPLATES.map((t) => (
            <label
              key={t.value}
              className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                picked === t.value
                  ? "border-accent bg-accent/5"
                  : "border-rule hover:bg-chalk"
              }`}
            >
              <input
                type="radio"
                name="templateKind"
                value={t.value}
                checked={picked === t.value}
                onChange={() => setPicked(t.value)}
                className="sr-only"
              />
              <div className="font-medium">{t.title}</div>
              <div className="text-xs text-dim mt-1">{t.sub}</div>
              <TemplateMini kind={t.value} />
            </label>
          ))}
        </div>
        {state.fieldErrors?.templateKind && (
          <span className="text-red text-xs mt-1 block">{state.fieldErrors.templateKind}</span>
        )}
      </fieldset>

      {picked === "pdf" && (
        <div className="rounded-xl border border-rule bg-paper p-4">
          <div className="text-sm font-medium mb-2">PDF-файл</div>
          <p className="text-xs text-dim mb-3">
            До 8 МБ, до 10 страниц. Каждая страница станет одним «листом» в
            рабочем пространстве ученика.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPdf(f);
            }}
          />
          {!pdfTemplateId && !pdfUploading && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-lg border border-rule hover:bg-chalk transition text-sm"
            >
              Выбрать PDF…
            </button>
          )}
          {pdfUploading && (
            <div className="text-sm text-dim">
              Загружаем «{pdfFileName}»…
            </div>
          )}
          {pdfTemplateId && pdfPageCount != null && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">{pdfFileName}</div>
                <div className="text-dim text-xs">
                  Загружен · {pdfPageCount}{" "}
                  {pdfPageCount === 1 ? "страница" : "страниц"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPdfTemplateId(null);
                  setPdfPageCount(null);
                  setPdfFileName(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs text-dim hover:text-red transition"
              >
                Сменить
              </button>
            </div>
          )}
          {pdfError && (
            <p className="text-red text-xs mt-2">{pdfError}</p>
          )}
          {pdfTemplateId && (
            <input type="hidden" name="templateId" value={pdfTemplateId} />
          )}
        </div>
      )}

      <label className="flex flex-col gap-1.5 max-w-xs">
        <span className="text-sm text-ink/80">Сколько страниц</span>
        <input
          name="pageCount"
          type="number"
          min={1}
          max={10}
          value={
            picked === "pdf" && pdfPageCount != null ? pdfPageCount : undefined
          }
          defaultValue={picked === "pdf" ? undefined : 1}
          disabled={picked === "pdf"}
          onChange={() => {}}
          className="px-3 py-2.5 rounded-lg border border-rule bg-paper outline-none focus:border-accent transition disabled:bg-chalk disabled:text-dim"
        />
        {picked === "pdf" && (
          <span className="text-dim text-xs">Берём из PDF автоматически</span>
        )}
      </label>

      <div className="flex justify-end gap-3 mt-2">
        <Link
          href="/app/lessons"
          className="px-4 py-2.5 rounded-xl border border-rule hover:bg-rule/40 transition"
        >
          Отмена
        </Link>
        <button
          type="submit"
          disabled={pending || (picked === "pdf" && !pdfTemplateId)}
          className="px-5 py-2.5 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover disabled:opacity-60 transition"
        >
          {pending ? "Создаём…" : "Создать урок"}
        </button>
      </div>
    </form>
  );
}

function defaultDatetimeLocal(): string {
  // ставим завтра в 9:00 как сильный дефолт — большинство уроков утренние
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TemplateMini({ kind }: { kind: string }) {
  if (kind === "pdf") {
    return (
      <div className="mt-3 h-16 rounded bg-paper border border-rule flex items-center justify-center text-ink/40">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      </div>
    );
  }
  const bg =
    kind === "blank_grid"
      ? "linear-gradient(to right, #d8dee9 1px, transparent 1px), linear-gradient(to bottom, #d8dee9 1px, transparent 1px)"
      : kind === "blank_coord"
      ? "linear-gradient(to right, #d8dee9 1px, transparent 1px), linear-gradient(to bottom, #d8dee9 1px, transparent 1px)"
      : "linear-gradient(to bottom, transparent calc(100% - 1px), #d8dee9 calc(100% - 1px))";
  return (
    <div
      className="mt-3 h-16 rounded bg-paper border border-rule relative"
      style={{ backgroundImage: bg, backgroundSize: kind === "blank_lined" ? "100% 12px" : "8px 8px" }}
    >
      {kind === "blank_coord" && (
        <>
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-ink/40" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-ink/40" />
        </>
      )}
    </div>
  );
}

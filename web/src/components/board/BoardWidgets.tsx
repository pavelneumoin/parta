"use client";

// Слой предметных виджетов поверх листа: учитель создаёт/двигает/настраивает,
// ученики видят live (поллинг). Координаты — в долях размера листа.

import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_SUBJECTS, INSTRUMENTS, type BoardSubject } from "@/lib/board/registry";
import { InstrumentBody } from "./instruments";

type WidgetDto = {
  id: string;
  kind: string;
  pageIndex: number;
  xFrac: number;
  yFrac: number;
  state: Record<string, unknown> | null;
  workspaceId: string | null;
  updatedAt: string;
};

type Props = {
  sessionId: string;
  isTeacher: boolean;
  pageIndex: number;
  drawerOpen: boolean;
  onDrawerClose: () => void;
  sessionClosed: boolean;
};

const POLL_MS = 3_500;
const STATE_DEBOUNCE_MS = 450;
const JSON_HEADERS = { "content-type": "application/json" };

export function BoardWidgets(props: Props) {
  const [widgets, setWidgets] = useState<WidgetDto[]>([]);
  const layerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const base = `/api/sessions/${props.sessionId}/widgets`;

  /* ---------------- загрузка + поллинг ---------------- */
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(base, { cache: "no-store" });
        if (!r.ok || stop) return;
        const data = (await r.json()) as { widgets: WidgetDto[] };
        setWidgets((old) =>
          data.widgets.map((w) =>
            w.id === draggingRef.current || debounceRef.current.has(w.id)
              ? old.find((o) => o.id === w.id) ?? w // не затираем локальные правки
              : w,
          ),
        );
      } catch {
        /* сеть мигнула — следующий тик поправит */
      }
    };
    load();
    const i = setInterval(load, POLL_MS);
    return () => { stop = true; clearInterval(i); };
  }, [base]);

  /* ---------------- мутации учителя ---------------- */
  const patch = useCallback(
    (id: string, body: Record<string, unknown>) => {
      fetch(`${base}/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) })
        .catch(() => {});
    },
    [base],
  );

  const commitState = (id: string, statePatch: Record<string, unknown>) => {
    setWidgets((ws) =>
      ws.map((w) => (w.id === id ? { ...w, state: { ...(w.state ?? {}), ...statePatch } } : w)),
    );
    const timers = debounceRef.current;
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        setWidgets((ws) => {
          const w = ws.find((x) => x.id === id);
          if (w) patch(id, { state: w.state ?? {} });
          return ws;
        });
      }, STATE_DEBOUNCE_MS),
    );
  };

  const remove = (id: string) => {
    setWidgets((ws) => ws.filter((w) => w.id !== id));
    fetch(`${base}/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const create = async (kind: string) => {
    props.onDrawerClose();
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          kind,
          pageIndex: props.pageIndex,
          xFrac: 0.3 + Math.random() * 0.1,
          yFrac: 0.12 + Math.random() * 0.08,
        }),
      });
      if (!r.ok) return;
      const { widget } = (await r.json()) as { widget: WidgetDto };
      setWidgets((ws) => [...ws, widget]);
    } catch {
      /* ignore */
    }
  };

  const startDrag = (w: WidgetDto) => (e: React.PointerEvent) => {
    if (!props.isTeacher) return;
    e.preventDefault();
    draggingRef.current = w.id;
    const layer = layerRef.current!;
    const move = (ev: PointerEvent) => {
      const r = layer.getBoundingClientRect();
      const xFrac = Math.min(0.97, Math.max(0, (ev.clientX - r.left) / r.width - 0.04));
      const yFrac = Math.min(0.97, Math.max(0, (ev.clientY - r.top) / r.height - 0.015));
      setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, xFrac, yFrac } : x)));
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setWidgets((ws) => {
        const cur = ws.find((x) => x.id === w.id);
        if (cur) patch(w.id, { xFrac: cur.xFrac, yFrac: cur.yFrac });
        return ws;
      });
      draggingRef.current = null;
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };

  const visible = widgets.filter((w) => w.pageIndex === props.pageIndex);

  return (
    <>
      {/* слой виджетов: сам не ловит указатель, ловят только рамки */}
      <div ref={layerRef} className="absolute inset-0 z-10 pointer-events-none">
        {visible.map((w) => (
          <div
            key={w.id}
            className="absolute pointer-events-auto rounded-xl bg-paper border border-rule shadow-lg"
            style={{ left: `${w.xFrac * 100}%`, top: `${w.yFrac * 100}%` }}
          >
            <div
              className={`flex items-center gap-2 pl-3 pr-1.5 py-1.5 border-b border-rule rounded-t-xl bg-chalk ${
                props.isTeacher ? "cursor-grab active:cursor-grabbing" : ""
              }`}
              onPointerDown={startDrag(w)}
            >
              <b className="text-[11px] flex-1 whitespace-nowrap select-none">
                {INSTRUMENTS.find((i) => i.kind === w.kind)?.name ?? w.kind}
              </b>
              {w.workspaceId && props.isTeacher && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold uppercase tracking-wide">
                  адресно
                </span>
              )}
              {props.isTeacher && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => remove(w.id)}
                  className="w-6 h-6 grid place-items-center rounded-md text-dim hover:bg-paper hover:text-red text-sm leading-none"
                  aria-label="Убрать инструмент"
                >
                  ×
                </button>
              )}
            </div>
            <div className="p-3">
              <InstrumentBody
                kind={w.kind}
                state={w.state ?? {}}
                readOnly={!props.isTeacher || props.sessionClosed}
                onState={(p) => commitState(w.id, p)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* сундучок предметных инструментов (учитель) */}
      {props.isTeacher && props.drawerOpen && (
        <InstrumentDrawer onPick={create} onClose={props.onDrawerClose} />
      )}
    </>
  );
}

function InstrumentDrawer({ onPick, onClose }: { onPick: (kind: string) => void; onClose: () => void }) {
  const [subject, setSubject] = useState<BoardSubject>("math");
  return (
    <div className="absolute left-3 top-14 z-30 w-[280px] rounded-xl bg-paper border border-rule shadow-xl overflow-hidden">
      <div className="flex items-center justify-between pl-3 pr-1.5 py-2 border-b border-rule bg-chalk">
        <b className="text-xs">Предметные инструменты</b>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 grid place-items-center rounded-md text-dim hover:text-ink text-sm"
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
      <div className="flex flex-wrap gap-1 px-2 pt-2">
        {BOARD_SUBJECTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubject(s.id)}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
              subject === s.id ? "bg-accent/15 text-accent" : "text-dim hover:bg-chalk"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2 max-h-[46vh] overflow-y-auto">
        {INSTRUMENTS.filter((i) => i.subject === subject).map((i) => (
          <button
            key={i.kind}
            type="button"
            onClick={() => onPick(i.kind)}
            className="flex flex-col items-center gap-1.5 px-1.5 py-2.5 rounded-lg bg-chalk hover:bg-rule/70 transition text-[11px] font-semibold text-center leading-tight"
          >
            <svg
              viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor"
              strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
              dangerouslySetInnerHTML={{ __html: i.icon }}
            />
            {i.name}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { TemplateBackground } from "@/components/TemplateBackground";
import { PdfBackground } from "@/components/PdfBackground";
import {
  StrokeRecord,
  drawStroke,
  uuid,
} from "@/lib/stroke";
import { drawPreviewBackground } from "@/lib/preview";
import { STAMPS, STAMP_SIZE, stampToStrokes, type StampKind } from "@/lib/stamps";

type Props = {
  workspaceId: string;
  studentName: string;
  lessonTitle: string;
  templateKind: string;
  pageCount: number;
  templateFileId: string | null;
  sessionClosed: boolean;
  sessionId: string;
  joinCode: string;
  initialHandRaised: boolean;
  initialSubmitted: boolean;
};

const COLORS = [
  { name: "Чёрный", hex: "#0c0d10" },
  { name: "Красный", hex: "#d11a2a" },
  { name: "Синий", hex: "#1f5fc9" },
  { name: "Зелёный", hex: "#2e8b3d" },
  { name: "Фиолетовый", hex: "#7a3ed1" },
  { name: "Оранжевый", hex: "#e67e22" },
];

const SIZES = [
  { label: "Тонко", value: 2.5 },
  { label: "Средне", value: 4.5 },
  { label: "Толсто", value: 8 },
];

const MARKER_COLORS = [
  { name: "Жёлтый", hex: "rgba(255, 222, 60, 0.4)" },
  { name: "Зелёный", hex: "rgba(80, 220, 130, 0.4)" },
  { name: "Розовый", hex: "rgba(255, 110, 180, 0.4)" },
];

const MARKER_SIZE = 14;

// Учительские штампы (STAMPS, STAMP_SIZE, StampKind) вынесены в @/lib/stamps,
// чтобы их можно было импортировать в тестах и в API-валидации.

const FLUSH_MS = 600;
const ACTIVITY_MS = 8_000;

export function StudentCanvas(props: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);

  // мутабельное состояние через refs — не триггерит re-render
  const toolRef = useRef<"pen" | "eraser" | "marker" | "stamp" | "lasso" | "line">("pen");
  const stampKindRef = useRef<StampKind>("plus");
  const markerColorRef = useRef<string>(MARKER_COLORS[0]!.hex);
  const colorRef = useRef<string>(COLORS[0]!.hex);
  const sizeRef = useRef<number>(SIZES[1]!.value);
  const lassoPathRef = useRef<[number, number][] | null>(null);
  const lineStartRef = useRef<[number, number, number] | null>(null);
  const palmRejectRef = useRef<boolean>(true);
  const strokesRef = useRef<StrokeRecord[]>([]);
  const pendingFlushRef = useRef<StrokeRecord[]>([]);
  const currentRef = useRef<{
    id: string;
    points: [number, number, number][];
    color: string;
    size: number;
    simulatePressure: boolean;
  } | null>(null);
  const activePointerRef = useRef<number | null>(null);
  // флаг для snapshot — после каждого нового штриха ставим true; отправили — false
  const dirtyForPreviewRef = useRef<boolean>(false);
  // ref для растеризованного PDF (передаём в PdfBackground)
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // очередь штрихов на soft-delete (соберёт ластик, flush — в том же цикле что pendingFlushRef)
  const pendingDeleteRef = useRef<string[]>([]);
  // зеркало closed в ref — pointer handlers внутри стабильного useEffect читают актуальное значение
  const closedRef = useRef<boolean>(props.sessionClosed);
  const frozenRef = useRef<boolean>(false);
  const [frozenUntil, setFrozenUntil] = useState<number | null>(null);
  // зеркало токена — pointer handlers различают студента (есть токен) и учителя (нет)
  const tokenRef = useRef<string | null>(null);
  // текущая страница (0-based) — отражена в state ниже; ref для pointer handlers
  const pageRef = useRef<number>(0);

  // отображаемое в UI
  const [tool, setTool] = useState<"pen" | "eraser" | "marker" | "stamp" | "lasso" | "line">("pen");
  const [stampKind, setStampKind] = useState<StampKind>("plus");
  const [markerColorIdx, setMarkerColorIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // лассо-выделение
  const [lassoSelectedIds, setLassoSelectedIds] = useState<string[]>([]);
  const [colorIdx, setColorIdx] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [palmReject, setPalmReject] = useState(true);
  // когда понимаем, что мы учитель — переключаем дефолтный цвет на красный
  const teacherDefaultAppliedRef = useRef(false);
  // current page для multi-page PDF
  const [currentPage, setCurrentPage] = useState(0);
  // поднятая рука (только для ученика)
  const [handRaised, setHandRaised] = useState(props.initialHandRaised);
  // сдал работу (только для ученика)
  const [submitted, setSubmitted] = useState(props.initialSubmitted);
  const submittedRef = useRef<boolean>(props.initialSubmitted);
  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  // комментарии учителя: список + UI
  const [comments, setComments] = useState<{ id: string; text: string; pageIndex: number; createdAt: string }[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentPosting, setCommentPosting] = useState(false);
  // broadcast-режим для учителя: штрихи летят на /api/sessions/[id]/broadcast и
  // размножаются по всем workspace'ам сессии
  const [broadcast, setBroadcast] = useState(false);
  const broadcastRef = useRef(false);
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // sessionClosed как state — обновляется в polling из 410-ответа activity-ping
  const [closed, setClosed] = useState<boolean>(props.sessionClosed);

  // ищем токен ученика для ИМЕННО этой сессии (по joinCode).
  // если токена нет — открывшая сторона = учитель, ходящий по мозаике.
  useEffect(() => {
    try {
      const t = localStorage.getItem(`parta:student:${props.joinCode}`);
      if (t) setToken(t);
    } catch {
      // приватный режим — рисуем локально без синка
    }
  }, [props.joinCode]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // роль зрителя — определяется наличием токена и доступна только клиенту.
  // на сервере и до подгрузки localStorage считаем по умолчанию «ученик».
  const [viewerRole, setViewerRole] = useState<"student" | "teacher">("student");
  useEffect(() => {
    // короткая задержка — даём первому useEffect выше сетнуть токен
    const t = setTimeout(() => {
      try {
        const stored = localStorage.getItem(`parta:student:${props.joinCode}`);
        setViewerRole(stored ? "student" : "teacher");
      } catch {
        setViewerRole("teacher");
      }
    }, 0);
    return () => clearTimeout(t);
  }, [props.joinCode]);

  // обновляем refs при изменении UI-state
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    stampKindRef.current = stampKind;
  }, [stampKind]);
  useEffect(() => {
    markerColorRef.current = MARKER_COLORS[markerColorIdx]?.hex ?? MARKER_COLORS[0]!.hex;
  }, [markerColorIdx]);
  useEffect(() => {
    colorRef.current = COLORS[colorIdx]!.hex;
  }, [colorIdx]);
  useEffect(() => {
    sizeRef.current = SIZES[sizeIdx]!.value;
  }, [sizeIdx]);
  useEffect(() => {
    palmRejectRef.current = palmReject;
  }, [palmReject]);
  useEffect(() => {
    closedRef.current = closed;
  }, [closed]);
  useEffect(() => {
    pageRef.current = currentPage;
    // триггерим redraw внутри стабильного useEffect канваса
    stageRef.current?.dispatchEvent(new CustomEvent("parta:page-changed"));
    // новая страница → следующий snapshot должен отправить её
    dirtyForPreviewRef.current = true;
  }, [currentPage]);
  useEffect(() => {
    broadcastRef.current = broadcast;
  }, [broadcast]);
  // учитель — красный по умолчанию, один раз
  useEffect(() => {
    if (viewerRole === "teacher" && !teacherDefaultAppliedRef.current) {
      teacherDefaultAppliedRef.current = true;
      setColorIdx(1); // красный из COLORS[1]
    }
  }, [viewerRole]);

  // загрузка существующих штрихов при монтировании
  // токен опционален: если его нет, сервер попробует авторизовать учителя по сессии
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers["x-anon-token"] = token;
        const r = await fetch(
          `/api/workspaces/${props.workspaceId}/strokes`,
          { headers },
        );
        if (!r.ok) {
          if (!cancelled) setSyncError(`init: HTTP ${r.status}`);
          return;
        }
        const data = await r.json();
        if (cancelled) return;
        const main = mainRef.current!.getContext("2d")!;
        const page = pageRef.current;
        for (const s of data.strokes as StrokeRecord[]) {
          strokesRef.current.push(s);
          if ((s.pageIndex ?? 0) === page) drawStroke(main, s);
        }
        setCount(strokesRef.current.length);
      } catch (e) {
        if (!cancelled) setSyncError("init: " + (e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.workspaceId, token]);

  // setup canvas (один раз)
  useEffect(() => {
    const stage = stageRef.current!;
    const main = mainRef.current!;
    const live = liveRef.current!;
    const mainCtx = main.getContext("2d")!;
    const liveCtx = live.getContext("2d")!;

    const redraw = () => {
      const w = stage.clientWidth, h = stage.clientHeight;
      mainCtx.clearRect(0, 0, w, h);
      const page = pageRef.current;
      for (const s of strokesRef.current) {
        if ((s.pageIndex ?? 0) === page) drawStroke(mainCtx, s);
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      for (const [c, ctx] of [
        [main, mainCtx],
        [live, liveCtx],
      ] as const) {
        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);
        c.style.width = w + "px";
        c.style.height = h + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);

    // listener для смены страницы — стилус не активен, перерисовываем main
    const onPageChanged = () => redraw();
    stage.addEventListener("parta:page-changed", onPageChanged);

    const localPoint = (ev: PointerEvent): [number, number, number] => {
      const rect = stage.getBoundingClientRect();
      return [
        ev.clientX - rect.left,
        ev.clientY - rect.top,
        ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5,
      ];
    };

    const acceptPointer = (ev: PointerEvent) => {
      if (ev.pointerType === "pen" || ev.pointerType === "eraser") return true;
      if (ev.pointerType === "mouse") return true;
      if (ev.pointerType === "touch") return !palmRejectRef.current;
      return true;
    };

    const eraseAt = (x: number, y: number) => {
      const r = 14;
      const page = pageRef.current;
      const removedIds: string[] = [];
      strokesRef.current = strokesRef.current.filter((s) => {
        // ластик трогает только штрихи текущей страницы
        if ((s.pageIndex ?? 0) !== page) return true;
        for (const p of s.points) {
          const dx = p[0] - x, dy = p[1] - y;
          if (dx * dx + dy * dy <= r * r) {
            removedIds.push(s.id);
            return false;
          }
        }
        return true;
      });
      if (removedIds.length > 0) {
        redraw();
        setCount(strokesRef.current.length);
        dirtyForPreviewRef.current = true;
        // отправляем soft-delete на сервер (батчем через flush-цикл)
        pendingDeleteRef.current.push(...removedIds);
      }
    };

    const placeStamp = (cx: number, cy: number) => {
      const kind = stampKindRef.current;
      const strokes = stampToStrokes(kind, cx, cy);
      if (strokes.length === 0) return;
      const color = colorRef.current;
      const page = pageRef.current;
      // Учитель (без anon-токена) → teacher; ученик → student. Сервер всё равно enforce'ит.
      const layer: "student" | "teacher" = tokenRef.current ? "student" : "teacher";
      for (const points of strokes) {
        const rec: StrokeRecord = {
          id: uuid(),
          points,
          color,
          size: STAMP_SIZE,
          simulatePressure: false,
          layer,
          pageIndex: page,
        };
        strokesRef.current.push(rec);
        pendingFlushRef.current.push(rec);
        drawStroke(mainCtx, rec);
      }
      setCount(strokesRef.current.length);
      dirtyForPreviewRef.current = true;
    };

    const onDown = (ev: PointerEvent) => {
      if (closedRef.current) return;
      // ученик после submit больше не пишет; учитель — пишет всегда
      if (submittedRef.current && tokenRef.current) return;
      // заморозка — ученики read-only; учитель пишет всегда
      if (frozenRef.current && tokenRef.current) return;
      if (!acceptPointer(ev)) return;
      if (activePointerRef.current !== null) return;
      activePointerRef.current = ev.pointerId;
      stage.setPointerCapture(ev.pointerId);

      const t = toolRef.current;
      const isEraser = t === "eraser" || ev.pointerType === "eraser";
      const isMarker = t === "marker";
      const isStamp = t === "stamp";
      const isLasso = t === "lasso";
      const isLine = t === "line";
      const pt = localPoint(ev);
      if (isEraser) {
        eraseAt(pt[0], pt[1]);
        currentRef.current = null;
        return;
      }
      if (isStamp) {
        placeStamp(pt[0], pt[1]);
        currentRef.current = null;
        return;
      }
      if (isLasso) {
        lassoPathRef.current = [[pt[0], pt[1]]];
        setLassoSelectedIds([]);
        return;
      }
      if (isLine) {
        lineStartRef.current = pt;
        currentRef.current = {
          id: uuid(),
          points: [pt, pt],
          color: colorRef.current,
          size: sizeRef.current,
          simulatePressure: false,
        };
        return;
      }
      currentRef.current = {
        id: uuid(),
        points: [pt],
        color: isMarker ? markerColorRef.current : colorRef.current,
        size: isMarker ? MARKER_SIZE : sizeRef.current,
        simulatePressure: !(ev.pressure && ev.pressure > 0) && ev.pointerType !== "pen",
      };
    };

    let liveScheduled = false;
    const scheduleLive = () => {
      if (liveScheduled) return;
      liveScheduled = true;
      requestAnimationFrame(() => {
        liveScheduled = false;
        if (!currentRef.current) return;
        const w = stage.clientWidth, h = stage.clientHeight;
        liveCtx.clearRect(0, 0, w, h);
        drawStroke(liveCtx, currentRef.current as StrokeRecord);
      });
    };

    const drawLassoLive = () => {
      const path = lassoPathRef.current;
      if (!path || path.length < 2) return;
      const w = stage.clientWidth, h = stage.clientHeight;
      liveCtx.clearRect(0, 0, w, h);
      liveCtx.save();
      liveCtx.strokeStyle = "rgba(31, 95, 201, 0.9)";
      liveCtx.lineWidth = 1.5;
      liveCtx.setLineDash([6, 4]);
      liveCtx.beginPath();
      liveCtx.moveTo(path[0]![0], path[0]![1]);
      for (let i = 1; i < path.length; i++) {
        liveCtx.lineTo(path[i]![0], path[i]![1]);
      }
      liveCtx.stroke();
      liveCtx.restore();
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== activePointerRef.current) return;
      const t = toolRef.current;
      const isEraser = t === "eraser" || ev.pointerType === "eraser";
      const isLasso = t === "lasso";
      const isLine = t === "line";
      const events = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];

      if (isEraser) {
        for (const e of events) {
          const pt = localPoint(e);
          eraseAt(pt[0], pt[1]);
        }
        return;
      }
      if (isLasso) {
        const path = lassoPathRef.current;
        if (!path) return;
        for (const e of events) {
          const pt = localPoint(e);
          path.push([pt[0], pt[1]]);
        }
        requestAnimationFrame(drawLassoLive);
        return;
      }
      if (isLine) {
        if (!currentRef.current || !lineStartRef.current) return;
        const pt = localPoint(ev);
        currentRef.current.points = [lineStartRef.current, pt];
        scheduleLive();
        return;
      }
      if (!currentRef.current) return;
      for (const e of events) {
        currentRef.current.points.push(localPoint(e));
      }
      scheduleLive();
    };

    // Проверка: точка внутри полигона (ray casting)
    const pointInPoly = (px: number, py: number, poly: [number, number][]) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i]![0], yi = poly[i]![1];
        const xj = poly[j]![0], yj = poly[j]![1];
        const intersect =
          yi > py !== yj > py &&
          px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };

    const finalizeLasso = () => {
      const path = lassoPathRef.current;
      lassoPathRef.current = null;
      const w = stage.clientWidth, h = stage.clientHeight;
      liveCtx.clearRect(0, 0, w, h);
      if (!path || path.length < 3) {
        setLassoSelectedIds([]);
        return;
      }
      const page = pageRef.current;
      const selected: string[] = [];
      const layer: "student" | "teacher" = tokenRef.current ? "student" : "teacher";
      for (const s of strokesRef.current) {
        if ((s.pageIndex ?? 0) !== page) continue;
        // ученик может удалить только свои штрихи; учитель — все
        if (layer === "student" && s.layer === "teacher") continue;
        const inside = s.points.some((p) => pointInPoly(p[0], p[1], path));
        if (inside) selected.push(s.id);
      }
      setLassoSelectedIds(selected);
      // подсветим выбранные пунктиром
      if (selected.length > 0) {
        liveCtx.save();
        liveCtx.strokeStyle = "rgba(31, 95, 201, 0.75)";
        liveCtx.lineWidth = 2;
        liveCtx.setLineDash([4, 3]);
        const setSel = new Set(selected);
        for (const s of strokesRef.current) {
          if (!setSel.has(s.id)) continue;
          if (s.points.length < 2) continue;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of s.points) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
          }
          liveCtx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
        }
        liveCtx.restore();
      }
    };

    const finalizeStroke = () => {
      if (toolRef.current === "lasso") {
        finalizeLasso();
        return;
      }
      if (toolRef.current === "line") {
        lineStartRef.current = null;
      }
      if (!currentRef.current) return;
      const cur = currentRef.current;
      if (cur.points.length >= 2) {
        const rec: StrokeRecord = {
          ...cur,
          layer: tokenRef.current ? "student" : "teacher",
          pageIndex: pageRef.current,
        };
        strokesRef.current.push(rec);
        pendingFlushRef.current.push(rec);
        drawStroke(mainCtx, rec);
        setCount(strokesRef.current.length);
        dirtyForPreviewRef.current = true;
      }
      currentRef.current = null;
      const w = stage.clientWidth, h = stage.clientHeight;
      liveCtx.clearRect(0, 0, w, h);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== activePointerRef.current) return;
      activePointerRef.current = null;
      finalizeStroke();
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("pointerleave", onUp);

    // блокируем gestures Safari
    const blockGesture = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", blockGesture as EventListener);
    document.addEventListener("gesturechange", blockGesture as EventListener);
    document.addEventListener("gestureend", blockGesture as EventListener);

    return () => {
      window.removeEventListener("resize", resize);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("pointerleave", onUp);
      stage.removeEventListener("parta:page-changed", onPageChanged);
      document.removeEventListener("gesturestart", blockGesture as EventListener);
      document.removeEventListener("gesturechange", blockGesture as EventListener);
      document.removeEventListener("gestureend", blockGesture as EventListener);
    };
    // setup всего один раз — closedRef внутри читает актуальное значение
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // flush очередь штрихов и delete на сервер
  // токен опционален: учитель синкается по сессии-куке (его штрихи попадут в layer=teacher)
  useEffect(() => {
    let cancelled = false;
    const headersFor = (json: boolean) => {
      const h: Record<string, string> = {};
      if (json) h["content-type"] = "application/json";
      if (token) h["x-anon-token"] = token;
      return h;
    };
    const tick = async () => {
      if (cancelled) return;

      // 1) добавляемые штрихи
      const queue = pendingFlushRef.current;
      if (queue.length > 0) {
        const batch = queue.splice(0, queue.length);
        setSyncing(true);
        try {
          // если учитель в broadcast-режиме — шлём пачкой на endpoint, который
          // размножит по всем workspace'ам класса
          const useBroadcast = broadcastRef.current;
          const r = useBroadcast
            ? await fetch(`/api/sessions/${props.sessionId}/broadcast`, {
                method: "POST",
                headers: headersFor(true),
                body: JSON.stringify({
                  strokes: batch.map(({ color, size, simulatePressure, points, pageIndex }) => ({
                    color,
                    size,
                    simulatePressure,
                    points,
                    pageIndex: pageIndex ?? 0,
                  })),
                }),
              })
            : await fetch(`/api/strokes`, {
                method: "POST",
                headers: headersFor(true),
                body: JSON.stringify({
                  strokes: batch.map((s) => ({
                    ...s,
                    workspaceId: props.workspaceId,
                  })),
                }),
              });
          if (r.status === 410) {
            setClosed(true);
            setSyncError(null);
            return;
          }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          setSyncError(null);
        } catch (e) {
          pendingFlushRef.current.unshift(...batch);
          setSyncError((e as Error).message);
        } finally {
          setSyncing(false);
        }
      }

      // 2) удалённые ID
      const delQueue = pendingDeleteRef.current;
      if (delQueue.length > 0) {
        const batch = delQueue.splice(0, delQueue.length);
        try {
          const r = await fetch(`/api/strokes/delete`, {
            method: "POST",
            headers: headersFor(true),
            body: JSON.stringify({
              workspaceId: props.workspaceId,
              strokeIds: batch,
            }),
          });
          if (r.status === 410) {
            setClosed(true);
            return;
          }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        } catch (e) {
          pendingDeleteRef.current.unshift(...batch);
          setSyncError((e as Error).message);
        }
      }

      setTimeout(tick, FLUSH_MS);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [props.workspaceId, token]);

  // activity ping — только ученик (у него есть anon-токен)
  // 410 от сервера означает session_closed → мгновенно блокируем ввод
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const ping = async () => {
      try {
        const r = await fetch(`/api/workspaces/${props.workspaceId}/join`, {
          method: "POST",
          headers: { "x-anon-token": token },
        });
        if (cancelled) return;
        if (r.status === 410) setClosed(true);
      } catch {
        // сеть пропала — игнорим, следующий тик попробует
      }
    };
    // первый тик сразу, потом по интервалу
    ping();
    const i = setInterval(ping, ACTIVITY_MS);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [props.workspaceId, token]);

  // ученик подтягивает учительские штрихи (overlay) в real-time
  useEffect(() => {
    if (!token) return; // только ученик
    if (closed) return;

    let cancelled = false;
    let lastSyncedAt: string | null = null;
    const POLL_MS = 3000;

    const tick = async () => {
      if (cancelled) return;
      try {
        const url =
          `/api/workspaces/${props.workspaceId}/strokes` +
          (lastSyncedAt ? `?since=${encodeURIComponent(lastSyncedAt)}` : "");
        const r = await fetch(url, { headers: { "x-anon-token": token } });
        if (cancelled) return;
        if (r.status === 410) {
          setClosed(true);
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        lastSyncedAt = data.now ?? lastSyncedAt;
        // freeze sync
        if (data.freezeUntil) {
          const until = new Date(data.freezeUntil).getTime();
          if (until > Date.now()) {
            setFrozenUntil(until);
            frozenRef.current = true;
          } else {
            setFrozenUntil(null);
            frozenRef.current = false;
          }
        } else {
          setFrozenUntil(null);
          frozenRef.current = false;
        }
        const main = mainRef.current?.getContext("2d");
        if (!main) return;
        // фильтруем: только учительские штрихи, которых ещё нет у нас
        const known = new Set(strokesRef.current.map((s) => s.id));
        const page = pageRef.current;
        for (const s of data.strokes as (StrokeRecord & { layer?: string })[]) {
          if (s.layer !== "teacher") continue;
          if (known.has(s.id)) continue;
          strokesRef.current.push(s);
          if ((s.pageIndex ?? 0) === page) drawStroke(main, s);
        }
        setCount(strokesRef.current.length);
        setSyncError(null);
      } catch (e) {
        if (!cancelled) setSyncError("overlay: " + (e as Error).message);
      } finally {
        if (!cancelled) setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [props.workspaceId, token, closed]);

  // periodic preview snapshot — только ученик, только если есть изменения
  useEffect(() => {
    if (!token) return;
    if (closed) return;

    const PREVIEW_W = 200;
    const PREVIEW_H = 280;
    const PREVIEW_MS = 4000;

    const snapshot = async () => {
      if (!dirtyForPreviewRef.current) return;
      const stage = stageRef.current;
      if (!stage) return;
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      if (sw === 0 || sh === 0) return;

      const off = document.createElement("canvas");
      off.width = PREVIEW_W;
      off.height = PREVIEW_H;
      const oc = off.getContext("2d");
      if (!oc) return;

      // белый фон
      oc.fillStyle = "#ffffff";
      oc.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

      // подложка
      if (props.templateKind === "pdf" && pdfCanvasRef.current) {
        // вставляем растеризованный PDF (centered, fit)
        const pdfC = pdfCanvasRef.current;
        if (pdfC.width > 0 && pdfC.height > 0) {
          const fit = Math.min(
            PREVIEW_W / pdfC.width,
            PREVIEW_H / pdfC.height,
          );
          const dw = pdfC.width * fit;
          const dh = pdfC.height * fit;
          const dx = (PREVIEW_W - dw) / 2;
          const dy = (PREVIEW_H - dh) / 2;
          oc.drawImage(pdfC, dx, dy, dw, dh);
        }
      } else {
        drawPreviewBackground(oc, props.templateKind, PREVIEW_W, PREVIEW_H);
      }

      // штрихи в масштабе stage → preview
      // в мозаике показываем только страницу 0 (главная для preview-мозаики)
      const sx = PREVIEW_W / sw;
      const sy = PREVIEW_H / sh;
      oc.setTransform(sx, 0, 0, sy, 0, 0);
      const snapshotPage = pageRef.current;
      for (const s of strokesRef.current) {
        if ((s.pageIndex ?? 0) !== snapshotPage) continue;
        drawStroke(oc, s);
      }
      oc.setTransform(1, 0, 0, 1, 0, 0);

      // отметим dirty=false ДО отправки, чтобы если пользователь продолжит писать,
      // следующий тик снова сделает снимок
      dirtyForPreviewRef.current = false;

      const blob: Blob | null = await new Promise((resolve) =>
        off.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) return;

      const dataUrl: string = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(blob);
      });
      const base64 = dataUrl.split(",")[1];
      if (!base64) return;

      try {
        const r = await fetch(`/api/workspaces/${props.workspaceId}/preview`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-anon-token": token,
          },
          body: JSON.stringify({ pageIndex: snapshotPage, pngBase64: base64 }),
        });
        if (r.status === 410) setClosed(true);
      } catch {
        // если не отправилось — следующий тик попробует снова (вернём dirty)
        dirtyForPreviewRef.current = true;
      }
    };

    const i = setInterval(snapshot, PREVIEW_MS);
    return () => clearInterval(i);
  }, [props.workspaceId, token, props.templateKind, closed]);

  // Загружаем комментарии учителя — один раз при монтировании, потом по poll раз в 10 сек
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers["x-anon-token"] = token;
        const r = await fetch(
          `/api/workspaces/${props.workspaceId}/comments`,
          { headers },
        );
        if (cancelled || !r.ok) return;
        const data = await r.json();
        if (!cancelled) setComments(data.comments ?? []);
      } catch {
        // сеть — игнорим
      }
    };
    load();
    const i = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [props.workspaceId, token]);

  const isTeacher = viewerRole === "teacher";

  // экспорт текущей страницы как PNG в высоком разрешении
  const exportCurrentPage = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (sw === 0 || sh === 0) return;

    // целевое разрешение: A4 при 150 DPI = 1240×1754
    const TW = 1240;
    const TH = 1754;

    const off = document.createElement("canvas");
    off.width = TW;
    off.height = TH;
    const oc = off.getContext("2d");
    if (!oc) return;

    oc.fillStyle = "#ffffff";
    oc.fillRect(0, 0, TW, TH);

    if (props.templateKind === "pdf" && pdfCanvasRef.current) {
      const pdfC = pdfCanvasRef.current;
      if (pdfC.width > 0 && pdfC.height > 0) {
        const fit = Math.min(TW / pdfC.width, TH / pdfC.height);
        const dw = pdfC.width * fit;
        const dh = pdfC.height * fit;
        const dx = (TW - dw) / 2;
        const dy = (TH - dh) / 2;
        oc.drawImage(pdfC, dx, dy, dw, dh);
      }
    } else {
      drawPreviewBackground(oc, props.templateKind, TW, TH);
    }

    const sx = TW / sw;
    const sy = TH / sh;
    oc.setTransform(sx, 0, 0, sy, 0, 0);
    const page = pageRef.current;
    for (const s of strokesRef.current) {
      if ((s.pageIndex ?? 0) === page) drawStroke(oc, s);
    }
    oc.setTransform(1, 0, 0, 1, 0, 0);

    const blob: Blob | null = await new Promise((resolve) =>
      off.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = props.studentName.replace(/[\\/:*?"<>|]/g, "_");
    a.href = url;
    a.download = `${safeName} — ${props.lessonTitle} — стр ${currentPage + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <>
      <header
        className={`flex items-center justify-between px-3 py-2 border-b z-20 ${
          isTeacher ? "border-red/30 bg-red/10" : "border-rule bg-paper"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isTeacher ? (
            <a
              href={`/app/session/${props.sessionId}`}
              className="px-2 py-1 rounded-md bg-paper border border-rule text-xs hover:bg-chalk transition"
              title="Вернуться к мозаике класса"
            >
              ← к классу
            </a>
          ) : (
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="6" width="22" height="16" rx="2" fill="#1a1f2b" />
              <rect x="3" y="22" width="22" height="2" rx="1" fill="#1e6f5c" />
            </svg>
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{props.lessonTitle}</div>
            <div className="text-xs text-dim truncate">
              {isTeacher ? `Подсказка ученику · ${props.studentName}` : props.studentName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {!isTeacher && !closed && !submitted && (
            <button
              onClick={async () => {
                if (!token) return;
                const next = !handRaised;
                setHandRaised(next);
                try {
                  await fetch(`/api/workspaces/${props.workspaceId}/hand`, {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                      "x-anon-token": token,
                    },
                    body: JSON.stringify({ raised: next }),
                  });
                } catch {
                  setHandRaised(!next);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                handRaised
                  ? "bg-red text-paper"
                  : "bg-rule/40 text-ink hover:bg-rule/70"
              }`}
              title={handRaised ? "Опустить руку" : "Позвать учителя"}
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden className="mr-1">
                <path fillRule="evenodd" d="M9 3a1 1 0 012 0v5.5a.5.5 0 001 0V4a1 1 0 112 0v4.5a.5.5 0 001 0V6a1 1 0 112 0v5a7 7 0 11-14 0V9a1 1 0 012 0v2.5a.5.5 0 001 0V4a1 1 0 012 0v4.5a.5.5 0 001 0V3z" clipRule="evenodd" />
              </svg>
              {handRaised ? "Рука поднята" : "Рука"}
            </button>
          )}
          {!isTeacher && !closed && !submitted && !confirmSubmit && (
            <button
              onClick={() => setConfirmSubmit(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green text-paper hover:opacity-90 transition"
              title="Завершить работу и сдать учителю"
            >
              Сдать работу
            </button>
          )}
          {!isTeacher && !closed && !submitted && confirmSubmit && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-dim">После сдачи не изменить.</span>
              <button
                onClick={() => setConfirmSubmit(false)}
                className="px-2 py-1 rounded-lg border border-rule hover:bg-rule/40 transition text-xs"
              >
                Отмена
              </button>
              <button
                onClick={async () => {
                  if (!token) return;
                  setConfirmSubmit(false);
                  try {
                    const r = await fetch(
                      `/api/workspaces/${props.workspaceId}/submit`,
                      {
                        method: "POST",
                        headers: { "x-anon-token": token },
                      },
                    );
                    if (r.ok) {
                      setSubmitted(true);
                      setHandRaised(false);
                    }
                  } catch {
                    // молча — кнопка осталась активной
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green text-paper hover:opacity-90 transition"
              >
                Да, сдать
              </button>
            </div>
          )}
          {!isTeacher && submitted && (
            <span className="px-2 py-1 rounded bg-green text-paper text-sm font-medium">
              Работа сдана
            </span>
          )}
          {isTeacher && (
            <>
              <span className="px-2 py-1 rounded bg-red text-paper">режим учителя</span>
              <button
                onClick={() => setBroadcast((v) => !v)}
                className={`px-2 py-1 rounded border transition ${
                  broadcast
                    ? "bg-accent text-paper border-accent"
                    : "border-rule hover:bg-rule/40"
                }`}
                title={
                  broadcast
                    ? "Сейчас вы пишете всему классу. Кликните, чтобы вернуться к подсказке одному ученику."
                    : "Перейти в режим «подсказка всему классу»: следующие штрихи появятся у всех учеников."
                }
              >
                {broadcast ? "↗ всем" : "одному"}
              </button>
              <button
                onClick={exportCurrentPage}
                className="px-2 py-1 rounded border border-rule hover:bg-rule/40 transition"
                title="Скачать текущую страницу как PNG"
              >
                ↓ PNG
              </button>
              <button
                onClick={() => setCommentOpen((v) => !v)}
                className={`px-2 py-1 rounded border transition ${
                  commentOpen ? "bg-accent text-paper border-accent" : "border-rule hover:bg-rule/40"
                }`}
                title="Добавить текстовый комментарий к работе ученика"
              >
                💬 Заметка
              </button>
            </>
          )}
          {closed && (
            <span className="px-2 py-1 rounded bg-red text-paper">урок закрыт</span>
          )}
          <ZoomControls zoom={zoom} setZoom={setZoom} />
          <FullscreenButton
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
          />
          <span
            className={`px-2 py-1 rounded ${
              syncError ? "bg-red text-paper" : syncing ? "bg-accent text-paper" : "bg-rule/40 text-dim"
            }`}
          >
            {syncError ? "ошибка синка" : syncing ? "синк…" : `${count} штрихов`}
          </span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <Toolbar
          tool={tool}
          setTool={setTool}
          colorIdx={colorIdx}
          setColorIdx={setColorIdx}
          sizeIdx={sizeIdx}
          setSizeIdx={setSizeIdx}
          markerColorIdx={markerColorIdx}
          setMarkerColorIdx={setMarkerColorIdx}
          stampKind={stampKind}
          setStampKind={setStampKind}
          isTeacher={isTeacher}
          palmReject={palmReject}
          setPalmReject={setPalmReject}
          disabled={closed}
        />
        <div
          className="relative flex-1 overflow-auto bg-chalk"
          style={{ touchAction: zoom !== 1 ? "auto" : "none" }}
        >
        <div
          ref={stageRef}
          className="relative bg-paper origin-top-left"
          style={{
            touchAction: "none",
            width: zoom !== 1 ? `${100 * zoom}%` : "100%",
            height: zoom !== 1 ? `${100 * zoom}%` : "100%",
            minHeight: "100%",
          }}
        >
          {props.templateKind === "pdf" && props.templateFileId ? (
            <PdfBackground
              url={
                `/api/templates/${props.templateFileId}/file` +
                (token ? `?t=${encodeURIComponent(token)}` : "")
              }
              pageIndex={currentPage}
              canvasRef={pdfCanvasRef}
              className="absolute inset-0 pointer-events-none flex items-start justify-center"
            />
          ) : (
            <TemplateBackground
              kind={props.templateKind}
              className="absolute inset-0 pointer-events-none"
            />
          )}
          <canvas
            ref={mainRef}
            className="absolute inset-0"
            style={{ touchAction: "none" }}
          />
          <canvas
            ref={liveRef}
            className="absolute inset-0 pointer-events-none"
          />

          {lassoSelectedIds.length > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-full bg-accent text-paper text-sm shadow-lg z-20">
              <span className="font-medium">{lassoSelectedIds.length} штрихов выбрано</span>
              <button
                onClick={() => {
                  const selSet = new Set(lassoSelectedIds);
                  strokesRef.current = strokesRef.current.filter((s) => !selSet.has(s.id));
                  pendingDeleteRef.current.push(...lassoSelectedIds);
                  setLassoSelectedIds([]);
                  const stage = stageRef.current;
                  if (!stage) return;
                  const w = stage.clientWidth, h = stage.clientHeight;
                  const main = mainRef.current?.getContext("2d");
                  const live = liveRef.current?.getContext("2d");
                  if (main) {
                    main.clearRect(0, 0, w, h);
                    const page = pageRef.current;
                    for (const s of strokesRef.current) {
                      if ((s.pageIndex ?? 0) === page) drawStroke(main, s);
                    }
                  }
                  if (live) live.clearRect(0, 0, w, h);
                  setCount(strokesRef.current.length);
                  dirtyForPreviewRef.current = true;
                }}
                className="px-2 py-1 rounded bg-paper/20 hover:bg-paper/30 transition text-xs font-medium"
                title="Удалить выделенные штрихи"
              >
                🗑 Удалить
              </button>
              <button
                onClick={() => {
                  setLassoSelectedIds([]);
                  const stage = stageRef.current;
                  const live = liveRef.current?.getContext("2d");
                  if (stage && live) live.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
                }}
                className="px-2 py-1 rounded hover:bg-paper/20 transition text-xs"
                title="Снять выделение"
              >
                ✕
              </button>
            </div>
          )}

          {props.pageCount > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-full bg-toolbar text-paper text-sm shadow-lg">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-toolbarHover disabled:opacity-40 disabled:cursor-not-allowed"
                title="Предыдущая страница"
              >
                ‹
              </button>
              <span className="px-2 font-mono text-xs">
                {currentPage + 1} / {props.pageCount}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(props.pageCount - 1, p + 1))
                }
                disabled={currentPage === props.pageCount - 1}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-toolbarHover disabled:opacity-40 disabled:cursor-not-allowed"
                title="Следующая страница"
              >
                ›
              </button>
            </div>
          )}

          {/* Заметки учителя: учитель видит панель ввода, ученик — read-only карточки */}
          {isTeacher && commentOpen && (
            <div className="absolute bottom-4 right-4 z-30 w-72 rounded-xl bg-paper border border-rule shadow-xl p-4">
              <p className="text-xs font-semibold mb-2 text-dim uppercase tracking-wide">
                Текстовый комментарий
              </p>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Напишите замечание или подсказку…"
                rows={3}
                className="w-full px-2.5 py-2 rounded-lg border border-rule bg-chalk text-sm outline-none focus:border-accent transition resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setCommentOpen(false)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-rule hover:bg-rule/40 transition text-xs"
                >
                  Отмена
                </button>
                <button
                  disabled={commentPosting || commentText.trim().length === 0}
                  onClick={async () => {
                    const text = commentText.trim();
                    if (!text) return;
                    setCommentPosting(true);
                    try {
                      const r = await fetch(
                        `/api/workspaces/${props.workspaceId}/comments`,
                        {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ text, pageIndex: pageRef.current }),
                        },
                      );
                      if (r.ok) {
                        const data = await r.json();
                        setComments((prev) => [...prev, data.comment]);
                        setCommentText("");
                        setCommentOpen(false);
                      }
                    } catch {
                      // молча
                    } finally {
                      setCommentPosting(false);
                    }
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-accent text-paper hover:opacity-90 transition text-xs font-medium disabled:opacity-50"
                >
                  {commentPosting ? "Отправка…" : "Отправить"}
                </button>
              </div>
              {comments.filter((c) => (c.pageIndex ?? 0) === currentPage).length > 0 && (
                <div className="mt-3 pt-3 border-t border-rule">
                  <p className="text-xs text-dim mb-1.5">Ранее оставлено:</p>
                  <ul className="space-y-1.5 max-h-28 overflow-y-auto">
                    {comments
                      .filter((c) => (c.pageIndex ?? 0) === currentPage)
                      .map((c) => (
                        <li key={c.id} className="text-xs bg-chalk rounded-lg px-2.5 py-1.5">
                          {c.text}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!isTeacher && comments.filter((c) => (c.pageIndex ?? 0) === currentPage).length > 0 && (
            <div className="absolute top-3 right-3 z-20 w-64">
              <div className="rounded-xl bg-paper border border-accent/30 shadow-md p-3">
                <p className="text-xs font-semibold mb-2 text-accent uppercase tracking-wide">
                  Замечания учителя
                </p>
                <ul className="space-y-2">
                  {comments
                    .filter((c) => (c.pageIndex ?? 0) === currentPage)
                    .map((c) => (
                      <li
                        key={c.id}
                        className="text-sm bg-chalk rounded-lg px-3 py-2 leading-snug"
                      >
                        {c.text}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          )}

          {/* Финал-экран: только для ученика, после закрытия урока */}
          {frozenUntil != null && !isTeacher && !closed && (
            <FrozenOverlay until={frozenUntil} />
          )}
          {closed && !isTeacher && (
            <div className="absolute inset-0 z-30 bg-chalk/85 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto max-w-md w-full mx-4 rounded-2xl bg-paper border border-rule shadow-xl p-8 text-center">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="text-2xl font-semibold tracking-tight mb-2">
                  Урок завершён
                </h2>
                <p className="text-dim mb-6">
                  Учитель закрыл доступ. Ваша работа сохранена.
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-chalk px-4 py-3">
                    <div className="text-dim text-xs uppercase tracking-wide">
                      штрихов
                    </div>
                    <div className="text-2xl font-semibold mt-1">{count}</div>
                  </div>
                  <div className="rounded-xl bg-chalk px-4 py-3">
                    <div className="text-dim text-xs uppercase tracking-wide">
                      страниц
                    </div>
                    <div className="text-2xl font-semibold mt-1">
                      {props.pageCount}
                    </div>
                  </div>
                </div>
                <p className="text-dim text-xs mt-6">{props.studentName}</p>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}

function Toolbar({
  tool,
  setTool,
  colorIdx,
  setColorIdx,
  sizeIdx,
  setSizeIdx,
  markerColorIdx,
  setMarkerColorIdx,
  stampKind,
  setStampKind,
  isTeacher,
  palmReject,
  setPalmReject,
  disabled,
}: {
  tool: "pen" | "eraser" | "marker" | "stamp" | "lasso" | "line";
  setTool: (t: "pen" | "eraser" | "marker" | "stamp" | "lasso" | "line") => void;
  colorIdx: number;
  setColorIdx: (i: number) => void;
  sizeIdx: number;
  setSizeIdx: (i: number) => void;
  markerColorIdx: number;
  setMarkerColorIdx: (i: number) => void;
  stampKind: StampKind;
  setStampKind: (k: StampKind) => void;
  isTeacher: boolean;
  palmReject: boolean;
  setPalmReject: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="w-14 bg-toolbar flex flex-col items-center py-2 gap-1.5 z-10 overflow-y-auto">
      {COLORS.map((c, i) => (
        <button
          key={c.hex}
          disabled={disabled}
          onClick={() => {
            setTool("pen");
            setColorIdx(i);
          }}
          className={`w-11 h-11 rounded-lg flex items-center justify-center disabled:opacity-50 flex-shrink-0 ${
            tool === "pen" && colorIdx === i ? "bg-toolbarActive" : "hover:bg-toolbarHover"
          }`}
          title={c.name}
        >
          <span
            className={`w-6 h-6 rounded-full border-2 ${
              tool === "pen" && colorIdx === i ? "border-paper" : "border-paper/20"
            }`}
            style={{ background: c.hex }}
          />
        </button>
      ))}
      <div className="w-7 h-px bg-paper/10" />

      {/* Маркер: одна кнопка-переключатель + если активен — выбор цвета ниже */}
      <button
        disabled={disabled}
        onClick={() => setTool(tool === "marker" ? "pen" : "marker")}
        className={`w-11 h-11 rounded-lg flex items-center justify-center text-paper disabled:opacity-50 flex-shrink-0 ${
          tool === "marker" ? "bg-toolbarActive" : "hover:bg-toolbarHover"
        }`}
        title="Маркер (полупрозрачный)"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l-6 6v3h3l6-6" />
          <path d="M21 7l-9 9-4-4 9-9z" fill="rgba(255,222,60,0.8)" />
        </svg>
      </button>
      {tool === "marker" && (
        <div className="flex flex-col gap-1">
          {MARKER_COLORS.map((c, i) => (
            <button
              key={c.hex}
              onClick={() => setMarkerColorIdx(i)}
              className={`w-11 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                markerColorIdx === i ? "bg-toolbarActive" : "hover:bg-toolbarHover"
              }`}
              title={c.name}
            >
              <span
                className="w-6 h-3 rounded-sm"
                style={{ background: c.hex.replace("0.4", "1") }}
              />
            </button>
          ))}
        </div>
      )}
      <div className="w-7 h-px bg-paper/10" />

      <button
        disabled={disabled}
        onClick={() => {
          const next = (sizeIdx + 1) % SIZES.length;
          setSizeIdx(next);
        }}
        className="w-11 h-11 rounded-lg flex items-center justify-center hover:bg-toolbarHover disabled:opacity-50 flex-shrink-0"
        title={`Толщина: ${SIZES[sizeIdx]!.label}`}
      >
        <span
          className="rounded-full bg-paper"
          style={{
            width: SIZES[sizeIdx]!.value * 2,
            height: SIZES[sizeIdx]!.value * 2,
          }}
        />
      </button>
      <div className="w-7 h-px bg-paper/10" />
      <button
        disabled={disabled}
        onClick={() => setTool(tool === "eraser" ? "pen" : "eraser")}
        className={`w-11 h-11 rounded-lg flex items-center justify-center text-paper disabled:opacity-50 flex-shrink-0 ${
          tool === "eraser" ? "bg-toolbarActive" : "hover:bg-toolbarHover"
        }`}
        title="Ластик"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6L19 21H7" />
          <path d="M9 11l8-8a2 2 0 0 1 3 3l-8 8" />
        </svg>
      </button>
      <button
        disabled={disabled}
        onClick={() => setTool(tool === "line" ? "pen" : "line")}
        className={`w-11 h-11 rounded-lg flex items-center justify-center text-paper disabled:opacity-50 flex-shrink-0 ${
          tool === "line" ? "bg-toolbarActive" : "hover:bg-toolbarHover"
        }`}
        title="Прямая (линейка)"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="20" x2="20" y2="4" />
          <circle cx="4" cy="20" r="1.5" fill="currentColor" />
          <circle cx="20" cy="4" r="1.5" fill="currentColor" />
        </svg>
      </button>
      <button
        disabled={disabled}
        onClick={() => setTool(tool === "lasso" ? "pen" : "lasso")}
        className={`w-11 h-11 rounded-lg flex items-center justify-center text-paper disabled:opacity-50 flex-shrink-0 ${
          tool === "lasso" ? "bg-toolbarActive" : "hover:bg-toolbarHover"
        }`}
        title="Лассо — обведи штрихи, чтобы удалить"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2">
          <path d="M12 4c5 0 9 3 9 7 0 3-3 5-7 5h-3c-2 0-3 1-3 3l1 2" />
        </svg>
      </button>

      {isTeacher && (
        <>
          <div className="w-7 h-px bg-paper/10" />
          <button
            disabled={disabled}
            onClick={() => setTool(tool === "stamp" ? "pen" : "stamp")}
            className={`w-11 h-11 rounded-lg flex items-center justify-center text-paper disabled:opacity-50 flex-shrink-0 ${
              tool === "stamp" ? "bg-toolbarActive" : "hover:bg-toolbarHover"
            }`}
            title="Штампы учителя — кликни по работе, чтобы поставить отметку"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12" />
              <path d="M18 6l-12 12" opacity="0" />
              <path d="M4 13l5 5 11-11" />
            </svg>
          </button>
          {tool === "stamp" && (
            <div className="flex flex-col gap-1">
              {(Object.keys(STAMPS) as StampKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setStampKind(k)}
                  className={`w-11 h-9 rounded-md flex items-center justify-center flex-shrink-0 text-paper font-semibold text-lg ${
                    stampKind === k ? "bg-toolbarActive" : "hover:bg-toolbarHover"
                  }`}
                  title={STAMPS[k].label}
                  aria-label={STAMPS[k].label}
                >
                  <StampGlyph kind={k} />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex-1" />
      <button
        onClick={() => setPalmReject(!palmReject)}
        className={`w-11 h-11 rounded-lg flex items-center justify-center text-paper text-[10px] font-medium flex-shrink-0 ${
          palmReject ? "bg-accent" : "hover:bg-toolbarHover"
        }`}
        title={palmReject ? "Только перо" : "Перо + палец"}
      >
        {palmReject ? "PEN" : "ANY"}
      </button>
    </div>
  );
}

function StampGlyph({ kind }: { kind: StampKind }) {
  if (kind === "plus") {
    return (
      <svg viewBox="-16 -16 32 32" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
        <path d="M-10 0 L10 0" />
        <path d="M0 -10 L0 10" />
      </svg>
    );
  }
  if (kind === "minus") {
    return (
      <svg viewBox="-16 -16 32 32" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
        <path d="M-10 0 L10 0" />
      </svg>
    );
  }
  if (kind === "question") {
    return (
      <svg viewBox="-16 -16 32 32" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M-6 -8 L-2 -12 L4 -12 L8 -8 L4 -4 L0 -1 L0 4" />
        <circle cx="0" cy="11" r="0.5" fill="currentColor" />
      </svg>
    );
  }
  // check
  return (
    <svg viewBox="-16 -16 32 32" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M-10 0 L-3 8 L10 -8" />
    </svg>
  );
}

function ZoomControls({
  zoom,
  setZoom,
}: {
  zoom: number;
  setZoom: (v: number) => void;
}) {
  const step = (delta: number) => {
    const next = Math.round((zoom + delta) * 100) / 100;
    setZoom(Math.min(2, Math.max(0.5, next)));
  };
  return (
    <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg border border-rule bg-paper">
      <button
        onClick={() => step(-0.25)}
        className="w-6 h-6 rounded hover:bg-rule/40 text-base leading-none"
        title="Уменьшить"
        disabled={zoom <= 0.5}
      >
        −
      </button>
      <button
        onClick={() => setZoom(1)}
        className="px-2 text-xs font-mono min-w-[3rem]"
        title="Сбросить зум"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => step(0.25)}
        className="w-6 h-6 rounded hover:bg-rule/40 text-base leading-none"
        title="Увеличить"
        disabled={zoom >= 2}
      >
        +
      </button>
    </div>
  );
}

function FullscreenButton({
  isFullscreen,
  setIsFullscreen,
}: {
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
}) {
  return (
    <button
      onClick={async () => {
        try {
          if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
            setIsFullscreen(true);
          } else {
            await document.exitFullscreen();
            setIsFullscreen(false);
          }
        } catch (e) {
          console.error("fullscreen toggle failed", e);
        }
      }}
      className="w-7 h-7 rounded border border-rule hover:bg-rule/40 flex items-center justify-center"
      title={isFullscreen ? "Выйти из полноэкранного режима" : "На весь экран"}
    >
      {isFullscreen ? "⛶" : "⛶"}
    </button>
  );
}

function FrozenOverlay({ until }: { until: number }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((until - Date.now()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => {
      setLeft(Math.max(0, Math.round((until - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [until]);
  return (
    <div className="absolute inset-0 z-30 bg-blue/15 backdrop-blur-[1px] flex items-start justify-center pointer-events-none">
      <div className="mt-6 px-5 py-3 rounded-2xl bg-blue text-paper shadow-xl flex items-center gap-3">
        <span className="text-2xl">❄️</span>
        <div>
          <div className="font-semibold">Класс заморожен</div>
          <div className="text-sm text-paper/80">
            Подожди {left} сек — учитель что-то покажет
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TemplateBackground } from "@/components/TemplateBackground";
import { PdfBackground } from "@/components/PdfBackground";
import {
  type BrushKind,
  StrokeRecord,
  drawStroke,
  strokePointsForViewport,
  uuid,
} from "@/lib/stroke";
import { drawPreviewBackground } from "@/lib/preview";
import { STAMPS, STAMP_SIZE, stampToStrokes, type StampKind } from "@/lib/stamps";
import { BoardWidgets } from "@/components/board/BoardWidgets";
import {
  appendStabilizedPoint,
  clientToNormalizedPoint,
  collectPointerSamples,
  ensureTapStroke,
  isPenEraser,
  isLikelyPalm,
  shouldAcceptPointer,
  shouldSimulatePressure,
  type InputMode,
  type PointerSampleSource,
  type StabilizationLevel,
} from "@/lib/inkInput";
import {
  createInkHistoryState,
  reduceInkHistory,
  type InkEffect,
} from "@/lib/inkHistory";
import {
  loadInkOutbox,
  mergeInkOutboxes,
  saveInkOutbox,
} from "@/lib/inkOutbox";

type Props = {
  workspaceId: string;
  studentName: string;
  lessonTitle: string;
  templateKind: string;
  pageCount: number;
  templateFileId: string | null;
  sessionClosed: boolean;
  sessionId: string;
  viewerRole: "student" | "teacher";
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
  // Alpha хранится в 8-digit HEX: Canvas его понимает, и такой цвет проходит
  // серверную валидацию. Старый rgba(...) приводил к вечному HTTP 400.
  { name: "Жёлтый", hex: "#ffde3c66", solid: "#ffde3c" },
  { name: "Зелёный", hex: "#50dc8266", solid: "#50dc82" },
  { name: "Розовый", hex: "#ff6eb466", solid: "#ff6eb4" },
];

const MARKER_SIZE = 14;

// Учительские штампы (STAMPS, STAMP_SIZE, StampKind) вынесены в @/lib/stamps,
// чтобы их можно было импортировать в тестах и в API-валидации.

const FLUSH_MS = 600;
const ACTIVITY_MS = 8_000;
const ACCESS_REJECTED_STATUSES = new Set([400, 401, 403]);
const BROADCAST_REPLICA_ID = /^[0-9a-f]{64}$/;

function isReadOnlyBroadcastStroke(stroke: StrokeRecord): boolean {
  return (
    stroke.delivery === "broadcast" ||
    (stroke.layer === "teacher" && BROADCAST_REPLICA_ID.test(stroke.id))
  );
}

export function StudentCanvas(props: Props) {
  const isTeacher = props.viewerRole === "teacher";
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const eraserCursorRef = useRef<HTMLDivElement>(null);

  // мутабельное состояние через refs — не триггерит re-render
  const toolRef = useRef<"pen" | "eraser" | "marker" | "stamp" | "lasso" | "line">("pen");
  const stampKindRef = useRef<StampKind>("plus");
  const markerColorRef = useRef<string>(MARKER_COLORS[0]!.hex);
  const colorRef = useRef<string>(COLORS[0]!.hex);
  const sizeRef = useRef<number>(SIZES[1]!.value);
  const lassoPathRef = useRef<[number, number][] | null>(null);
  const lineStartRef = useRef<[number, number, number] | null>(null);
  const inputModeRef = useRef<InputMode>("auto");
  const stabilizationRef = useRef<StabilizationLevel>("neat");
  const lastPenAtRef = useRef<number | null>(null);
  const penDetectedRef = useRef(false);
  const preferencesLoadedRef = useRef(false);
  const strokesRef = useRef<StrokeRecord[]>([]);
  const pendingFlushRef = useRef<StrokeRecord[]>([]);
  const currentRef = useRef<{
    id: string;
    points: [number, number, number][];
    color: string;
    size: number;
    simulatePressure: boolean;
    brushKind: BrushKind;
    coordinateSpace: "normalized";
    renderVersion: 2;
    delivery: "workspace" | "broadcast";
  } | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const activePointerTypeRef = useRef<string | null>(null);
  // флаг для snapshot — после каждого нового штриха ставим true; отправили — false
  const dirtyForPreviewRef = useRef<boolean>(false);
  // ref для растеризованного PDF (передаём в PdfBackground)
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // очередь штрихов на soft-delete (соберёт ластик, flush — в том же цикле что pendingFlushRef)
  const pendingDeleteRef = useRef<string[]>([]);
  const inFlightCreatesRef = useRef<StrokeRecord[]>([]);
  const inFlightDeletesRef = useRef<string[]>([]);
  const pendingRequestRef = useRef(0);
  const attemptedStrokeIdsRef = useRef(new Set<string>());
  const fatalWriteRef = useRef(false);
  const syncFailureCountRef = useRef(0);
  const boardReadyRef = useRef(false);
  const recoveryTombstonesRef = useRef(new Set<string>());
  const recoveredSubmittedOutboxRef = useRef(false);
  const outboxUnavailableRef = useRef(false);
  const outboxWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const historyRef = useRef(createInkHistoryState());
  const eraserHistoryRef = useRef<StrokeRecord[]>([]);
  // зеркало блокировки в ref — pointer handlers внутри стабильного useEffect
  // немедленно прекращают ввод и при закрытии урока, и после сброса доступа.
  const closedRef = useRef<boolean>(props.sessionClosed);
  const accessRevokedRef = useRef<boolean>(false);
  const frozenRef = useRef<boolean>(false);
  const [frozenUntil, setFrozenUntil] = useState<number | null>(null);
  // Стабильная роль для pointer handlers внутри эффекта, который монтируется один раз.
  const viewerRoleRef = useRef<"student" | "teacher">(props.viewerRole);
  // текущая страница (0-based) — отражена в state ниже; ref для pointer handlers
  const pageRef = useRef<number>(0);

  // отображаемое в UI
  const [tool, setTool] = useState<"pen" | "eraser" | "marker" | "stamp" | "lasso" | "line">("pen");
  const [stampKind, setStampKind] = useState<StampKind>("plus");
  const [markerColorIdx, setMarkerColorIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [renderQualityZoom, setRenderQualityZoom] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [pdfAspectRatio, setPdfAspectRatio] = useState(1 / Math.SQRT2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // лассо-выделение
  const [lassoSelectedIds, setLassoSelectedIds] = useState<string[]>([]);
  const [colorIdx, setColorIdx] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [inputMode, setInputMode] = useState<InputMode>("auto");
  const [stabilization, setStabilization] =
    useState<StabilizationLevel>("neat");
  // когда понимаем, что мы учитель — переключаем дефолтный цвет на красный
  const teacherDefaultAppliedRef = useRef(false);
  // current page для multi-page PDF
  const [currentPage, setCurrentPage] = useState(0);
  // поднятая рука (только для ученика)
  const [handRaised, setHandRaised] = useState(props.initialHandRaised);
  // сдал работу (только для ученика)
  const [submitted, setSubmitted] = useState(props.initialSubmitted);
  const [submitting, setSubmitting] = useState(false);
  const [submitUncertain, setSubmitUncertain] = useState(false);
  const submitUncertainRef = useRef(false);
  const submittedRef = useRef<boolean>(props.initialSubmitted);
  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  // сундучок предметных инструментов (учитель)
  const [instrumentsOpen, setInstrumentsOpen] = useState(false);
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
  const [outboxReady, setOutboxReady] = useState(false);
  const [initialSnapshotReady, setInitialSnapshotReady] = useState(false);
  const [initialSnapshotError, setInitialSnapshotError] =
    useState<string | null>(null);
  const [initialLoadAttempt, setInitialLoadAttempt] = useState(0);
  const [localOnlyChanges, setLocalOnlyChanges] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [accessResetState, setAccessResetState] = useState<
    "idle" | "busy" | "success" | "error"
  >("idle");
  // sessionClosed как state — обновляется из 410-ответов API
  const [closed, setClosed] = useState<boolean>(props.sessionClosed);
  // Отдельное состояние: сброс входа учителем не означает завершение урока.
  const [accessRevoked, setAccessRevoked] = useState(false);
  const canvasLocked = closed || (!isTeacher && accessRevoked);
  const markClosed = useCallback(() => {
    closedRef.current = true;
    setClosed(true);
  }, []);
  const boardReady = outboxReady && initialSnapshotReady;
  const interactionLocked =
    canvasLocked ||
    !boardReady ||
    submitting ||
    (!isTeacher &&
      (submitted || submitUncertain || frozenUntil != null));
  const hasUnconfirmedChanges =
    localOnlyChanges ||
    fatalWriteRef.current ||
    pendingFlushRef.current.length > 0 ||
    pendingDeleteRef.current.length > 0 ||
    inFlightCreatesRef.current.length > 0 ||
    inFlightDeletesRef.current.length > 0;

  useEffect(() => {
    boardReadyRef.current = boardReady;
  }, [boardReady]);

  useEffect(() => {
    if (!interactionLocked) return;
    lassoPathRef.current = null;
    setLassoSelectedIds([]);
  }, [interactionLocked]);

  const persistOutboxSnapshot = useCallback(() => {
    const creates = [
      ...inFlightCreatesRef.current,
      ...pendingFlushRef.current,
    ];
    const deletes = [
      ...inFlightDeletesRef.current,
      ...pendingDeleteRef.current,
    ];
    const write = outboxWriteChainRef.current
      .catch(() => {
        // A later complete snapshot may recover from a transient IDB error.
      })
      .then(() =>
        saveInkOutbox(props.workspaceId, creates, deletes),
      );
    outboxWriteChainRef.current = write;
    return write;
  }, [props.workspaceId]);

  const persistOutboxInBackground = useCallback(() => {
    void persistOutboxSnapshot().catch(() => {
      outboxUnavailableRef.current = true;
      setSyncError(
        "Локальная резервная копия недоступна. Не закрывайте вкладку до сохранения.",
      );
    });
  }, [persistOutboxSnapshot]);

  const enqueueStrokeDeletes = useCallback((strokeIds: readonly string[]) => {
    if (strokeIds.length === 0) return;
    const ids = new Set(strokeIds);
    for (const id of ids) recoveryTombstonesRef.current.add(id);
    const cancelledBeforeFlush = new Set<string>();
    pendingFlushRef.current = pendingFlushRef.current.filter((stroke) => {
      if (!ids.has(stroke.id)) return true;
      // После network/5xx результат create неизвестен: сервер мог commit'нуть
      // штрих до потери ответа. Такой create обязан дойти до idempotent ACK,
      // и только затем выполнится delete.
      if (attemptedStrokeIdsRef.current.has(stroke.id)) return true;
      cancelledBeforeFlush.add(stroke.id);
      return false;
    });
    const alreadyQueued = new Set(pendingDeleteRef.current);
    for (const id of ids) {
      if (!cancelledBeforeFlush.has(id) && !alreadyQueued.has(id)) {
        pendingDeleteRef.current.push(id);
      }
    }
    persistOutboxInBackground();
  }, [persistOutboxInBackground]);

  const recordHistory = useCallback(
    (type: "add" | "delete", strokes: readonly StrokeRecord[]) => {
      if (strokes.length === 0) return;
      // Broadcast creates different server ids in every workspace. Until the
      // API exposes a group id, pretending that a local undo removes it for
      // the whole class would be misleading.
      if (
        type === "add" &&
        strokes.some((stroke) => stroke.delivery === "broadcast")
      ) {
        // Broadcast пока является общей подсказкой без group-delete API.
        // Очищаем локальную историю как явный barrier: Undo после переключения
        // обратно не должен неожиданно удалять более старый личный штрих.
        historyRef.current = createInkHistoryState();
        setHistoryRevision((revision) => revision + 1);
        return;
      }
      const nextHistory = reduceInkHistory(
        historyRef.current,
        { type, strokes },
        uuid,
      ).state;
      historyRef.current = {
        undo: nextHistory.undo.slice(-100),
        redo: nextHistory.redo,
      };
      setHistoryRevision((revision) => revision + 1);
    },
    [],
  );

  const applyHistoryEffects = useCallback(
    (effects: readonly InkEffect[]) => {
      for (const effect of effects) {
        if (effect.type === "add") {
          strokesRef.current.push(...effect.strokes);
          pendingFlushRef.current.push(...effect.strokes);
          continue;
        }
        const ids = new Set(effect.strokeIds);
        strokesRef.current = strokesRef.current.filter(
          (stroke) => !ids.has(stroke.id),
        );
        enqueueStrokeDeletes(effect.strokeIds);
      }

      const stage = stageRef.current;
      const main = mainRef.current?.getContext("2d");
      const live = liveRef.current?.getContext("2d");
      if (stage && main) {
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        main.clearRect(0, 0, width, height);
        for (const stroke of strokesRef.current) {
          if ((stroke.pageIndex ?? 0) !== pageRef.current) continue;
          drawStroke(main, stroke, { width, height });
        }
        live?.clearRect(0, 0, width, height);
      }
      setCount(strokesRef.current.length);
      dirtyForPreviewRef.current = true;
      persistOutboxInBackground();
    },
    [enqueueStrokeDeletes, persistOutboxInBackground],
  );

  const undoInk = useCallback(() => {
    const result = reduceInkHistory(historyRef.current, { type: "undo" }, uuid);
    historyRef.current = result.state;
    applyHistoryEffects(result.effects);
    setHistoryRevision((revision) => revision + 1);
  }, [applyHistoryEffects]);

  const redoInk = useCallback(() => {
    const result = reduceInkHistory(historyRef.current, { type: "redo" }, uuid);
    historyRef.current = result.state;
    applyHistoryEffects(result.effects);
    setHistoryRevision((revision) => revision + 1);
  }, [applyHistoryEffects]);

  const revokeStudentAccess = useCallback(() => {
    setLocalOnlyChanges(
      fatalWriteRef.current ||
        pendingFlushRef.current.length > 0 ||
        pendingDeleteRef.current.length > 0 ||
        inFlightCreatesRef.current.length > 0 ||
        inFlightDeletesRef.current.length > 0,
    );
    accessRevokedRef.current = true;
    closedRef.current = true;
    currentRef.current = null;
    activePointerRef.current = null;
    activePointerTypeRef.current = null;
    pendingFlushRef.current.length = 0;
    pendingDeleteRef.current.length = 0;
    inFlightCreatesRef.current = [];
    inFlightDeletesRef.current = [];
    attemptedStrokeIdsRef.current.clear();
    fatalWriteRef.current = false;
    submitUncertainRef.current = false;
    dirtyForPreviewRef.current = false;
    setConfirmSubmit(false);
    setSubmitUncertain(false);
    setSyncing(false);
    setSyncError(null);
    setAccessRevoked(true);
  }, []);

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
    inputModeRef.current = inputMode;
    if (!preferencesLoadedRef.current) return;
    try {
      window.localStorage.setItem("parta:input-mode", inputMode);
    } catch {
      // Private mode may disable storage; the in-memory preference still works.
    }
  }, [inputMode]);
  useEffect(() => {
    stabilizationRef.current = stabilization;
    if (!preferencesLoadedRef.current) return;
    try {
      window.localStorage.setItem("parta:stabilization", stabilization);
    } catch {
      // See the input-mode storage note above.
    }
  }, [stabilization]);
  useEffect(() => {
    try {
      const savedMode = window.localStorage.getItem("parta:input-mode");
      if (savedMode === "auto" || savedMode === "pen" || savedMode === "touch") {
        setInputMode(savedMode);
      }
      const savedStabilization = window.localStorage.getItem(
        "parta:stabilization",
      );
      if (
        savedStabilization === "natural" ||
        savedStabilization === "neat"
      ) {
        setStabilization(savedStabilization);
      }
    } catch {
      // Defaults are intentionally safe for shared/school tablets.
    } finally {
      preferencesLoadedRef.current = true;
    }
  }, []);
  useEffect(() => {
    closedRef.current = closed || (!isTeacher && accessRevoked);
  }, [closed, accessRevoked, isTeacher]);
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
  useEffect(() => {
    zoomRef.current = zoom;
    // CSS-transform обновляется сразу, а дорогую переаллокацию backing canvas
    // делаем только после короткой паузы в pinch/trackpad-жесте.
    const timer = window.setTimeout(() => {
      setRenderQualityZoom(zoom);
      stageRef.current?.dispatchEvent(new CustomEvent("parta:zoom-changed"));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [zoom]);

  // Базовый размер листа не зависит от zoom. Zoom масштабирует уже готовый
  // лист через transform, поэтому координаты пера остаются стабильными.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const width = Math.max(1, Math.round(viewport.clientWidth));
      const height = Math.max(1, Math.round(viewport.clientHeight));
      setViewportSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
      const nextBoard =
        props.templateKind === "pdf"
          ? (() => {
              const availableWidth = Math.max(1, width - 24);
              const availableHeight = Math.max(1, height - 24);
              // В landscape важнее крупное письмо: PDF стартует «по ширине»
              // и прокручивается вертикально. В portrait показываем страницу
              // целиком, чтобы не терять контекст задания.
              const pageWidth =
                width > height * 1.1
                  ? availableWidth
                  : Math.min(
                      availableWidth,
                      availableHeight * pdfAspectRatio,
                    );
              return {
                width: Math.max(1, Math.round(pageWidth)),
                height: Math.max(1, Math.round(pageWidth / pdfAspectRatio)),
              };
            })()
          : { width, height };
      setBoardSize((prev) =>
        prev.width === nextBoard.width && prev.height === nextBoard.height
          ? prev
          : nextBoard,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [props.templateKind, pdfAspectRatio]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const next = zoomRef.current * Math.exp(-event.deltaY * 0.002);
      setZoom(Math.min(2.5, Math.max(0.5, Math.round(next * 100) / 100)));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, [contenteditable='true']") ||
        (!event.ctrlKey && !event.metaKey)
      ) {
        return;
      }
      if (event.key.toLowerCase() !== "z" && event.key.toLowerCase() !== "y") {
        return;
      }
      if (interactionLocked || broadcast) {
        return;
      }
      event.preventDefault();
      if (event.key.toLowerCase() === "y" || event.shiftKey) redoInk();
      else undoInk();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    interactionLocked,
    broadcast,
    redoInk,
    undoInk,
  ]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  // учитель — красный по умолчанию, один раз
  useEffect(() => {
    if (isTeacher && !teacherDefaultAppliedRef.current) {
      teacherDefaultAppliedRef.current = true;
      setColorIdx(1); // красный из COLORS[1]
    }
  }, [isTeacher]);

  // Durable outbox загружается до разрешения ввода. Если вкладка была закрыта
  // между росчерком и HTTP ACK, локальные операции возвращаются в очередь и
  // повторяются идемпотентно.
  useEffect(() => {
    let cancelled = false;
    setOutboxReady(false);
    setInitialSnapshotReady(false);
    setInitialSnapshotError(null);
    recoveryTombstonesRef.current.clear();
    recoveredSubmittedOutboxRef.current = false;
    outboxUnavailableRef.current = false;
    (async () => {
      try {
        const persisted = await loadInkOutbox(props.workspaceId);
        if (cancelled) return;
        const merged = mergeInkOutboxes(
          {
            creates: pendingFlushRef.current,
            deletes: pendingDeleteRef.current,
          },
          persisted,
        );
        pendingFlushRef.current = merged.creates;
        pendingDeleteRef.current = merged.deletes;
        recoveryTombstonesRef.current = new Set(merged.deletes);

        const deleted = new Set(merged.deletes);
        const known = new Set<string>();
        strokesRef.current = strokesRef.current.filter((stroke) => {
          if (deleted.has(stroke.id) || known.has(stroke.id)) return false;
          known.add(stroke.id);
          return true;
        });
        for (const stroke of merged.creates) {
          if (deleted.has(stroke.id) || known.has(stroke.id)) continue;
          known.add(stroke.id);
          strokesRef.current.push(stroke);
        }

        const stage = stageRef.current;
        const main = mainRef.current?.getContext("2d");
        if (stage && main) {
          const width = stage.clientWidth;
          const height = stage.clientHeight;
          main.clearRect(0, 0, width, height);
          for (const stroke of strokesRef.current) {
            if ((stroke.pageIndex ?? 0) === pageRef.current) {
              drawStroke(main, stroke, { width, height });
            }
          }
        }
        setCount(strokesRef.current.length);
        if (
          (merged.creates.length > 0 || merged.deletes.length > 0) &&
          (!isTeacher && (submittedRef.current || closedRef.current))
        ) {
          recoveredSubmittedOutboxRef.current = submittedRef.current;
          fatalWriteRef.current = true;
          setLocalOnlyChanges(true);
          setSyncError(
            "На устройстве остались несинхронизированные штрихи. Работа уже закрыта для записи.",
          );
        }
      } catch {
        outboxUnavailableRef.current = true;
        setSyncError(
          "Локальная резервная копия недоступна. Не закрывайте вкладку до сохранения.",
        );
      } finally {
        if (!cancelled) {
          setOutboxReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.workspaceId, isTeacher]);

  // загрузка существующих штрихов при монтировании
  useEffect(() => {
    if (!outboxReady) return;
    let cancelled = false;
    setInitialSnapshotReady(false);
    setInitialSnapshotError(null);
    (async () => {
      try {
        const r = await fetch(`/api/workspaces/${props.workspaceId}/strokes`);
        if (!r.ok) {
          if (
            (r.status === 401 || r.status === 403) &&
            !isTeacher
          ) {
            revokeStudentAccess();
            return;
          }
          throw new Error(`HTTP ${r.status}`);
        }
        const data = await r.json();
        if (cancelled) return;
        if (data.closedAt) markClosed();
        if (data.freezeUntil) {
          const until = new Date(data.freezeUntil).getTime();
          if (Number.isFinite(until) && until > Date.now()) {
            frozenRef.current = true;
            setFrozenUntil(until);
          } else {
            frozenRef.current = false;
            setFrozenUntil(null);
          }
        } else {
          frozenRef.current = false;
          setFrozenUntil(null);
        }
        const main = mainRef.current!.getContext("2d")!;
        const page = pageRef.current;
        const stage = stageRef.current!;
        const viewport = {
          width: stage.clientWidth,
          height: stage.clientHeight,
        };
        const known = new Set(strokesRef.current.map((stroke) => stroke.id));
        const pendingDeletes = new Set([
          ...pendingDeleteRef.current,
          ...inFlightDeletesRef.current,
          ...recoveryTombstonesRef.current,
        ]);
        for (const s of data.strokes as StrokeRecord[]) {
          if (known.has(s.id) || pendingDeletes.has(s.id)) continue;
          known.add(s.id);
          strokesRef.current.push(s);
          if ((s.pageIndex ?? 0) === page) drawStroke(main, s, viewport);
        }
        setCount(strokesRef.current.length);
        setInitialSnapshotReady(true);
        setInitialSnapshotError(null);
        if (
          !fatalWriteRef.current &&
          !submitUncertainRef.current &&
          !outboxUnavailableRef.current
        ) {
          setSyncError(null);
        }
      } catch (e) {
        if (!cancelled) {
          const message =
            "Не удалось восстановить работу с сервера. Проверьте связь.";
          setInitialSnapshotError(message);
          setSyncError(`${message} ${(e as Error).message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    props.workspaceId,
    outboxReady,
    initialLoadAttempt,
    isTeacher,
    markClosed,
    revokeStudentAccess,
  ]);

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
      const viewport = { width: w, height: h };
      for (const s of strokesRef.current) {
        if ((s.pageIndex ?? 0) === page) drawStroke(mainCtx, s, viewport);
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      // При увеличении листа даём canvas дополнительное разрешение, но
      // ограничиваем общий scale, чтобы школьный iPad не упёрся в память.
      const pixelScale = Math.min(
        3,
        dpr * Math.max(1, zoomRef.current),
      );
      for (const [c, ctx] of [
        [main, mainCtx],
        [live, liveCtx],
      ] as const) {
        c.width = Math.floor(w * pixelScale);
        c.height = Math.floor(h * pixelScale);
        c.style.width = w + "px";
        c.style.height = h + "px";
        ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
      }
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    // listener для смены страницы — стилус не активен, перерисовываем main
    const onPageChanged = () => redraw();
    stage.addEventListener("parta:page-changed", onPageChanged);
    stage.addEventListener("parta:zoom-changed", resize);

    const localPoint = (
      ev: PointerSampleSource,
    ): [number, number, number] => {
      const rect = stage.getBoundingClientRect();
      return clientToNormalizedPoint(ev, rect);
    };

    const viewportPoint = (
      point: [number, number, number],
    ): [number, number] => [
      point[0] * stage.clientWidth,
      point[1] * stage.clientHeight,
    ];

    const acceptPointer = (ev: PointerEvent) => {
      if (ev.pointerType === "pen") {
        penDetectedRef.current = true;
        lastPenAtRef.current = ev.timeStamp;
      }
      return shouldAcceptPointer(ev, {
        mode: inputModeRef.current,
        now: ev.timeStamp,
        activePointerId: activePointerRef.current,
        lastPenAt: lastPenAtRef.current,
      });
    };

    let eraseRedrawScheduled = false;
    const scheduleEraseRedraw = () => {
      if (eraseRedrawScheduled) return;
      eraseRedrawScheduled = true;
      requestAnimationFrame(() => {
        eraseRedrawScheduled = false;
        redraw();
        setCount(strokesRef.current.length);
      });
    };

    const eraseAt = (normalizedX: number, normalizedY: number) => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      const x = normalizedX * width;
      const y = normalizedY * height;
      const r = 18;
      const page = pageRef.current;
      const removedIds: string[] = [];
      strokesRef.current = strokesRef.current.filter((s) => {
        // ластик трогает только штрихи текущей страницы
        if ((s.pageIndex ?? 0) !== page) return true;
        // Общая подсказка уже размножена с другими server-id по всему классу.
        // До появления group-delete её нельзя притворно стирать только локально.
        if (isReadOnlyBroadcastStroke(s)) return true;
        // Ученик не может стереть подсказку учителя даже локально.
        if (viewerRoleRef.current === "student" && s.layer === "teacher") {
          return true;
        }
        const points = strokePointsForViewport(s, { width, height });
        const hitRadius =
          r +
          (s.coordinateSpace === "normalized"
            ? s.size * Math.min(width, height)
            : s.size) /
            2;
        const hitRadiusSq = hitRadius * hitRadius;
        for (let i = 0; i < points.length; i++) {
          const point = points[i]!;
          const next = points[i + 1];
          let hit = false;
          if (!next) {
            const dx = point[0] - x;
            const dy = point[1] - y;
            hit = dx * dx + dy * dy <= hitRadiusSq;
          } else {
            const vx = next[0] - point[0];
            const vy = next[1] - point[1];
            const lengthSq = vx * vx + vy * vy;
            const t =
              lengthSq === 0
                ? 0
                : Math.min(
                    1,
                    Math.max(
                      0,
                      ((x - point[0]) * vx + (y - point[1]) * vy) / lengthSq,
                    ),
                  );
            const dx = point[0] + t * vx - x;
            const dy = point[1] + t * vy - y;
            hit = dx * dx + dy * dy <= hitRadiusSq;
          }
          if (hit) {
            removedIds.push(s.id);
            eraserHistoryRef.current.push(s);
            return false;
          }
        }
        return true;
      });
      if (removedIds.length > 0) {
        scheduleEraseRedraw();
        dirtyForPreviewRef.current = true;
        // Если штрих ещё не успел уйти на сервер, отменяем create локально.
        // Иначе ставим идемпотентный soft-delete после create.
        enqueueStrokeDeletes(removedIds);
      }
    };

    const placeStamp = (normalizedX: number, normalizedY: number) => {
      const kind = stampKindRef.current;
      const width = Math.max(stage.clientWidth, 1);
      const height = Math.max(stage.clientHeight, 1);
      const strokes = stampToStrokes(
        kind,
        normalizedX * width,
        normalizedY * height,
      );
      if (strokes.length === 0) return;
      const color = colorRef.current;
      const page = pageRef.current;
      const layer: "student" | "teacher" = viewerRoleRef.current;
      const minDimension = Math.min(width, height);
      const placed: StrokeRecord[] = [];
      for (const points of strokes) {
        const rec: StrokeRecord = {
          id: uuid(),
          points: points.map(([x, y, pressure]) => [
            x / width,
            y / height,
            pressure,
          ]),
          color,
          size: STAMP_SIZE / minDimension,
          simulatePressure: false,
          layer,
          pageIndex: page,
          coordinateSpace: "normalized",
          brushKind: "shape",
          renderVersion: 2,
          delivery:
            layer === "teacher" && broadcastRef.current
              ? "broadcast"
              : "workspace",
        };
        strokesRef.current.push(rec);
        pendingFlushRef.current.push(rec);
        placed.push(rec);
        drawStroke(mainCtx, rec, {
          width: stage.clientWidth,
          height: stage.clientHeight,
        });
      }
      setCount(strokesRef.current.length);
      dirtyForPreviewRef.current = true;
      recordHistory("add", placed);
      persistOutboxInBackground();
    };

    type TouchPosition = { clientX: number; clientY: number };
    type GestureState = {
      startCenterX: number;
      startCenterY: number;
      startDistance: number;
      startZoom: number;
      startScrollLeft: number;
      startScrollTop: number;
      anchorX: number;
      anchorY: number;
    };
    const touchPointers = new Map<number, TouchPosition>();
    let gestureState: GestureState | null = null;

    const touchGeometry = () => {
      const points = [...touchPointers.values()];
      if (points.length === 0) return null;
      const centerX =
        points.reduce((sum, point) => sum + point.clientX, 0) / points.length;
      const centerY =
        points.reduce((sum, point) => sum + point.clientY, 0) / points.length;
      const distance =
        points.length >= 2
          ? Math.hypot(
              points[1]!.clientX - points[0]!.clientX,
              points[1]!.clientY - points[0]!.clientY,
            )
          : 0;
      return { centerX, centerY, distance };
    };

    const restartGesture = () => {
      const viewport = viewportRef.current;
      const geometry = touchGeometry();
      if (!viewport || !geometry) {
        gestureState = null;
        return;
      }
      const stageRect = stage.getBoundingClientRect();
      gestureState = {
        startCenterX: geometry.centerX,
        startCenterY: geometry.centerY,
        startDistance: geometry.distance,
        startZoom: zoomRef.current,
        startScrollLeft: viewport.scrollLeft,
        startScrollTop: viewport.scrollTop,
        anchorX: Math.min(
          1,
          Math.max(
            0,
            (geometry.centerX - stageRect.left) /
              Math.max(stageRect.width, 1),
          ),
        ),
        anchorY: Math.min(
          1,
          Math.max(
            0,
            (geometry.centerY - stageRect.top) /
              Math.max(stageRect.height, 1),
          ),
        ),
      };
    };

    const commitEraserHistory = () => {
      if (eraserHistoryRef.current.length === 0) return;
      const unique = [
        ...new Map(
          eraserHistoryRef.current.map((stroke) => [stroke.id, stroke]),
        ).values(),
      ];
      recordHistory("delete", unique);
      eraserHistoryRef.current = [];
    };

    const cancelInkForGesture = () => {
      commitEraserHistory();
      currentRef.current = null;
      lassoPathRef.current = null;
      lineStartRef.current = null;
      activePointerRef.current = null;
      activePointerTypeRef.current = null;
      liveCtx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
    };

    const shouldNavigateWithFirstTouch = (ev: PointerEvent) => {
      if (inputModeRef.current === "pen") return true;
      if (inputModeRef.current !== "auto") return false;
      if (penDetectedRef.current) return true;
      const lastPenAt = lastPenAtRef.current;
      return (
        lastPenAt != null &&
        ev.timeStamp >= lastPenAt &&
        ev.timeStamp - lastPenAt < 900
      );
    };

    const beginTouchGesture = (ev: PointerEvent): boolean => {
      if (ev.pointerType !== "touch" || isLikelyPalm(ev)) return false;
      // Касание во время активного росчерка стилусом — ладонь, а не жест.
      if (
        activePointerRef.current !== null &&
        activePointerTypeRef.current === "pen"
      ) {
        return true;
      }

      touchPointers.set(ev.pointerId, {
        clientX: ev.clientX,
        clientY: ev.clientY,
      });
      const shouldNavigate =
        touchPointers.size >= 2 || shouldNavigateWithFirstTouch(ev);
      if (!shouldNavigate) return false;

      if (activePointerRef.current !== null) cancelInkForGesture();
      try {
        stage.setPointerCapture(ev.pointerId);
      } catch {
        // Capture may already belong to the first touch; the gesture still works.
      }
      restartGesture();
      ev.preventDefault();
      return true;
    };

    const moveTouchGesture = (ev: PointerEvent): boolean => {
      if (ev.pointerType !== "touch" || !touchPointers.has(ev.pointerId)) {
        return false;
      }
      touchPointers.set(ev.pointerId, {
        clientX: ev.clientX,
        clientY: ev.clientY,
      });
      if (!gestureState) return false;

      const viewport = viewportRef.current;
      const geometry = touchGeometry();
      if (!viewport || !geometry) return true;
      ev.preventDefault();

      if (
        touchPointers.size >= 2 &&
        gestureState.startDistance > 0 &&
        geometry.distance > 0
      ) {
        const nextZoom = Math.min(
          2.5,
          Math.max(
            0.5,
            Math.round(
              gestureState.startZoom *
                (geometry.distance / gestureState.startDistance) *
                100,
            ) / 100,
          ),
        );
        const viewportRect = viewport.getBoundingClientRect();
        const currentLocalX = geometry.centerX - viewportRect.left;
        const currentLocalY = geometry.centerY - viewportRect.top;
        const nextStageLeft = Math.max(
          0,
          (viewport.clientWidth - stage.clientWidth * nextZoom) / 2,
        );
        const nextStageTop = Math.max(
          0,
          (viewport.clientHeight - stage.clientHeight * nextZoom) / 2,
        );
        const anchorX = gestureState.anchorX;
        const anchorY = gestureState.anchorY;
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        requestAnimationFrame(() => {
          viewport.scrollLeft =
            nextStageLeft +
            anchorX * stage.clientWidth * nextZoom -
            currentLocalX;
          viewport.scrollTop =
            nextStageTop +
            anchorY * stage.clientHeight * nextZoom -
            currentLocalY;
        });
      } else {
        viewport.scrollLeft =
          gestureState.startScrollLeft -
          (geometry.centerX - gestureState.startCenterX);
        viewport.scrollTop =
          gestureState.startScrollTop -
          (geometry.centerY - gestureState.startCenterY);
      }
      return true;
    };

    const endTouchGesture = (ev: PointerEvent): boolean => {
      if (ev.pointerType !== "touch" || !touchPointers.has(ev.pointerId)) {
        return false;
      }
      const wasGesture = gestureState !== null;
      touchPointers.delete(ev.pointerId);
      if (wasGesture) restartGesture();
      return wasGesture;
    };

    const onDown = (ev: PointerEvent) => {
      // Перо всегда приоритетнее пальцев: если ребёнок положил палец раньше,
      // лист не должен продолжать уезжать под начинающимся росчерком.
      if (ev.pointerType === "pen" && touchPointers.size > 0) {
        cancelInkForGesture();
        for (const pointerId of touchPointers.keys()) {
          try {
            if (stage.hasPointerCapture(pointerId)) {
              stage.releasePointerCapture(pointerId);
            }
          } catch {
            // Pointer мог уже завершиться между событиями.
          }
        }
        touchPointers.clear();
        gestureState = null;
      }
      if (beginTouchGesture(ev)) return;
      if (closedRef.current) return;
      if (!boardReadyRef.current) return;
      // ученик после submit больше не пишет; учитель — пишет всегда
      if (submittedRef.current && viewerRoleRef.current === "student") return;
      // заморозка — ученики read-only; учитель пишет всегда
      if (frozenRef.current && viewerRoleRef.current === "student") return;
      if (!acceptPointer(ev)) return;
      if (activePointerRef.current !== null) return;
      ev.preventDefault();
      activePointerRef.current = ev.pointerId;
      activePointerTypeRef.current = ev.pointerType;
      stage.setPointerCapture(ev.pointerId);

      const t = toolRef.current;
      const isEraser = t === "eraser" || isPenEraser(ev);
      const isMarker = t === "marker";
      const isStamp = t === "stamp";
      const isLasso = t === "lasso";
      const isLine = t === "line";
      const pt = localPoint(ev);
      if (isEraser) {
        eraserHistoryRef.current = [];
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
        lassoPathRef.current = [viewportPoint(pt)];
        setLassoSelectedIds([]);
        return;
      }
      if (isLine) {
        lineStartRef.current = pt;
        currentRef.current = {
          id: uuid(),
          points: [pt, pt],
          color: colorRef.current,
          size:
            sizeRef.current /
            Math.max(1, Math.min(stage.clientWidth, stage.clientHeight)),
          simulatePressure: false,
          brushKind: "shape",
          coordinateSpace: "normalized",
          renderVersion: 2,
          delivery:
            viewerRoleRef.current === "teacher" && broadcastRef.current
              ? "broadcast"
              : "workspace",
        };
        return;
      }
      currentRef.current = {
        id: uuid(),
        points: [pt],
        color: isMarker ? markerColorRef.current : colorRef.current,
        size:
          (isMarker ? MARKER_SIZE : sizeRef.current) /
          Math.max(1, Math.min(stage.clientWidth, stage.clientHeight)),
        simulatePressure: isMarker ? false : shouldSimulatePressure(ev),
        brushKind: isMarker ? "marker" : "pen",
        coordinateSpace: "normalized",
        renderVersion: 2,
        delivery:
          viewerRoleRef.current === "teacher" && broadcastRef.current
            ? "broadcast"
            : "workspace",
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
        drawStroke(
          liveCtx,
          currentRef.current as StrokeRecord,
          { width: w, height: h },
          false,
        );
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
      if (moveTouchGesture(ev)) return;
      const eraserCursor = eraserCursorRef.current;
      const hardwareEraser = isPenEraser(ev);
      if (eraserCursor) {
        if (toolRef.current === "eraser" || hardwareEraser) {
          const point = localPoint(ev);
          const [x, y] = viewportPoint(point);
          eraserCursor.style.transform = `translate(${x - 18}px, ${y - 18}px)`;
          eraserCursor.style.opacity = "1";
        } else {
          eraserCursor.style.opacity = "0";
        }
      }
      if (ev.pointerId !== activePointerRef.current) return;
      const t = toolRef.current;
      const isEraser = t === "eraser" || hardwareEraser;
      const isLasso = t === "lasso";
      const isLine = t === "line";
      const events = collectPointerSamples(
        ev as unknown as PointerSampleSource,
      );

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
          path.push(viewportPoint(pt));
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
        appendStabilizedPoint(
          currentRef.current.points,
          localPoint(e),
          {
            width: Math.max(stage.clientWidth, 1),
            height: Math.max(stage.clientHeight, 1),
          },
          stabilizationRef.current,
        );
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
      const layer: "student" | "teacher" = viewerRoleRef.current;
      for (const s of strokesRef.current) {
        if ((s.pageIndex ?? 0) !== page) continue;
        if (isReadOnlyBroadcastStroke(s)) continue;
        // ученик может удалить только свои штрихи; учитель — все
        if (layer === "student" && s.layer === "teacher") continue;
        const points = strokePointsForViewport(s, {
          width: stage.clientWidth,
          height: stage.clientHeight,
        });
        const inside = points.some((p) => pointInPoly(p[0], p[1], path));
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
          const points = strokePointsForViewport(s, {
            width: stage.clientWidth,
            height: stage.clientHeight,
          });
          if (points.length < 2) continue;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of points) {
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
      // Тап — полноценный штрих: без этого пропадают точки, двоеточия и
      // десятичные разделители. Вторая точка почти совпадает с первой.
      cur.points = ensureTapStroke(cur.points);
      if (cur.points.length >= 2) {
        const rec: StrokeRecord = {
          ...cur,
          layer: viewerRoleRef.current,
          pageIndex: pageRef.current,
        };
        strokesRef.current.push(rec);
        pendingFlushRef.current.push(rec);
        drawStroke(mainCtx, rec, {
          width: stage.clientWidth,
          height: stage.clientHeight,
        });
        setCount(strokesRef.current.length);
        dirtyForPreviewRef.current = true;
        recordHistory("add", [rec]);
        persistOutboxInBackground();
      }
      currentRef.current = null;
      const w = stage.clientWidth, h = stage.clientHeight;
      liveCtx.clearRect(0, 0, w, h);
    };

    const onUp = (ev: PointerEvent) => {
      if (endTouchGesture(ev)) return;
      if (ev.pointerId !== activePointerRef.current) return;
      // PointerUp нередко содержит последнюю coalesced-точку, которой не было
      // в предыдущем move. Без неё быстрый росчерк визуально обрывается.
      if (
        currentRef.current &&
        toolRef.current === "line" &&
        lineStartRef.current
      ) {
        currentRef.current.points = [lineStartRef.current, localPoint(ev)];
      } else if (
        currentRef.current &&
        toolRef.current !== "lasso"
      ) {
        const samples = collectPointerSamples(
          ev as unknown as PointerSampleSource,
        );
        for (const sample of samples) {
          appendStabilizedPoint(
            currentRef.current.points,
            localPoint(sample),
            {
              width: Math.max(stage.clientWidth, 1),
              height: Math.max(stage.clientHeight, 1),
            },
            stabilizationRef.current,
          );
        }
      }
      activePointerRef.current = null;
      activePointerTypeRef.current = null;
      finalizeStroke();
      commitEraserHistory();
    };

    const onCancel = (ev: PointerEvent) => {
      if (endTouchGesture(ev)) return;
      if (ev.pointerId !== activePointerRef.current) return;
      // ОС может прислать cancel стилусу при системном жесте/уведомлении.
      // Уже видимый росчерк пера сохраняем; touch-cancel по-прежнему
      // отбрасываем, чтобы ладонь не оставляла случайную линию.
      if (activePointerTypeRef.current === "pen") {
        onUp(ev);
        return;
      }
      activePointerRef.current = null;
      activePointerTypeRef.current = null;
      currentRef.current = null;
      lassoPathRef.current = null;
      lineStartRef.current = null;
      commitEraserHistory();
      liveCtx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
    };

    const onPointerLeave = () => {
      if (eraserCursorRef.current) eraserCursorRef.current.style.opacity = "0";
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onCancel);
    stage.addEventListener("lostpointercapture", onUp);
    stage.addEventListener("pointerleave", onPointerLeave);

    // блокируем gestures Safari
    const blockGesture = (e: Event) => e.preventDefault();
    stage.addEventListener("gesturestart", blockGesture as EventListener);
    stage.addEventListener("gesturechange", blockGesture as EventListener);
    stage.addEventListener("gestureend", blockGesture as EventListener);

    return () => {
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onCancel);
      stage.removeEventListener("lostpointercapture", onUp);
      stage.removeEventListener("pointerleave", onPointerLeave);
      stage.removeEventListener("parta:page-changed", onPageChanged);
      stage.removeEventListener("parta:zoom-changed", resize);
      stage.removeEventListener("gesturestart", blockGesture as EventListener);
      stage.removeEventListener("gesturechange", blockGesture as EventListener);
      stage.removeEventListener("gestureend", blockGesture as EventListener);
    };
    // setup всего один раз — closedRef внутри читает актуальное значение
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // flush очередь штрихов и delete на сервер
  useEffect(() => {
    if (!boardReady || (!isTeacher && accessRevoked)) return;

    let cancelled = false;
    const retryDelay = (response?: Response) => {
      syncFailureCountRef.current = Math.min(
        syncFailureCountRef.current + 1,
        6,
      );
      const exponential = Math.min(
        15_000,
        900 * 2 ** (syncFailureCountRef.current - 1),
      );
      const retryAfter = response?.headers.get("retry-after");
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
      const serverDelay = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1_000
        : 0;
      return Math.max(exponential, serverDelay) + Math.round(Math.random() * 350);
    };
    const requeueCreates = (batch: readonly StrokeRecord[]) => {
      const queued = new Set(pendingFlushRef.current.map((stroke) => stroke.id));
      const missing = batch.filter((stroke) => !queued.has(stroke.id));
      if (missing.length > 0) pendingFlushRef.current.unshift(...missing);
      inFlightCreatesRef.current = [];
      persistOutboxInBackground();
    };
    const clearRecoveredStateIfSynced = () => {
      if (
        recoveredSubmittedOutboxRef.current &&
        pendingFlushRef.current.length === 0 &&
        pendingDeleteRef.current.length === 0 &&
        inFlightCreatesRef.current.length === 0 &&
        inFlightDeletesRef.current.length === 0
      ) {
        recoveredSubmittedOutboxRef.current = false;
        fatalWriteRef.current = false;
        setLocalOnlyChanges(false);
        if (
          !submitUncertainRef.current &&
          !outboxUnavailableRef.current
        ) {
          setSyncError(null);
        }
      }
    };
    const finishCreates = (batch: readonly StrokeRecord[]) => {
      for (const stroke of batch) attemptedStrokeIdsRef.current.delete(stroke.id);
      inFlightCreatesRef.current = [];
      persistOutboxInBackground();
      clearRecoveredStateIfSynced();
    };
    const requeueDeletes = (batch: readonly string[]) => {
      // Возвращаем каждый отсутствующий id отдельно. Проверка всего batch через
      // `.some()` теряла B, если во время запроса в очередь повторно попал A.
      const queued = new Set(pendingDeleteRef.current);
      const missing = batch.filter((id) => !queued.has(id));
      if (missing.length > 0) pendingDeleteRef.current.unshift(...missing);
      inFlightDeletesRef.current = [];
      persistOutboxInBackground();
    };
    const finishDeletes = (
      _batch: readonly string[],
      acknowledged: boolean,
    ) => {
      // Tombstones остаются до размонтирования. Polling GET мог стартовать до
      // delete commit и вернуться уже после ACK; постоянный локальный набор не
      // даст такому устаревшему ответу воскресить штрих.
      inFlightDeletesRef.current = [];
      persistOutboxInBackground();
      if (acknowledged) clearRecoveredStateIfSynced();
    };

    const tick = async () => {
      if (cancelled || (!isTeacher && accessRevokedRef.current)) return;
      if (closedRef.current) return;
      let nextTickDelay = FLUSH_MS;

      // 1) добавляемые штрихи
      const queue = pendingFlushRef.current;
      let createBatchBlocked = false;
      if (queue.length > 0) {
        const useBroadcast = queue[0]?.delivery === "broadcast";
        // Обычный endpoint принимает 80, broadcast — 20. Target фиксируется
        // в момент рисования, поэтому переключение «одному/всем» не переносит
        // уже нарисованный штрих в другой поток.
        const batchLimit = useBroadcast ? 20 : 80;
        const batch: StrokeRecord[] = [];
        while (
          queue.length > 0 &&
          batch.length < batchLimit &&
          (queue[0]?.delivery === "broadcast") === useBroadcast
        ) {
          batch.push(queue.shift()!);
        }
        for (const stroke of batch) {
          attemptedStrokeIdsRef.current.add(stroke.id);
        }
        inFlightCreatesRef.current = batch;
        try {
          // Journal first, network second: закрытие вкладки во время fetch не
          // должно потерять уже нарисованный росчерк.
          await persistOutboxSnapshot();
        } catch {
          setSyncError(
            "Локальная резервная копия недоступна. Не закрывайте вкладку до сохранения.",
          );
        }
        setSyncing(true);
        pendingRequestRef.current += 1;
        try {
          // если учитель в broadcast-режиме — шлём пачкой на endpoint, который
          // размножит по всем workspace'ам класса
          const r = useBroadcast
            ? await fetch(`/api/sessions/${props.sessionId}/broadcast`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  strokes: batch.map(({
                    id,
                    color,
                    size,
                    simulatePressure,
                    points,
                    pageIndex,
                    coordinateSpace,
                    brushKind,
                    renderVersion,
                  }) => ({
                    id,
                    color,
                    size,
                    simulatePressure,
                    points,
                    pageIndex: pageIndex ?? 0,
                    coordinateSpace: coordinateSpace ?? "legacy",
                    brushKind: brushKind ?? "legacy",
                    renderVersion: renderVersion ?? 1,
                  })),
                }),
              })
            : await fetch(`/api/strokes`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  strokes: batch.map((s) => ({
                    ...s,
                    workspaceId: props.workspaceId,
                  })),
                }),
              });
          const errorBody = !r.ok ? await r.json().catch(() => null) : null;
          if (r.status === 410) {
            for (const stroke of batch) attemptedStrokeIdsRef.current.delete(stroke.id);
            requeueCreates(batch);
            fatalWriteRef.current = true;
            markClosed();
            setSyncError("Урок закрыт раньше, чем последние штрихи были отправлены");
            return;
          }
          if (
            r.status === 409 &&
            errorBody?.error === "already_submitted" &&
            !isTeacher
          ) {
            for (const stroke of batch) attemptedStrokeIdsRef.current.delete(stroke.id);
            requeueCreates(batch);
            fatalWriteRef.current = true;
            setSubmitted(true);
            setSyncError("Работа уже сдана; последние локальные штрихи не отправлены");
            return;
          }
          if (r.status === 423) {
            for (const stroke of batch) attemptedStrokeIdsRef.current.delete(stroke.id);
            const until = errorBody?.until
              ? new Date(errorBody.until).getTime()
              : null;
            if (until && Number.isFinite(until)) setFrozenUntil(until);
            frozenRef.current = true;
            requeueCreates(batch);
            createBatchBlocked = true;
            nextTickDelay = Math.min(
              5_000,
              Math.max(1_500, (until ?? Date.now() + 3_000) - Date.now()),
            );
            setSyncError("Учитель временно поставил работу на паузу");
          } else if ((r.status === 401 || r.status === 403) && !isTeacher) {
            // Durable snapshot уже содержит batch и останется для восстановления
            // после повторного входа с новым кодом доступа.
            inFlightCreatesRef.current = [];
            revokeStudentAccess();
            return;
          } else if (!r.ok) {
            const retryable =
              r.status === 429 ||
              r.status >= 500 ||
              errorBody?.error === "write_conflict";
            if (retryable) {
              requeueCreates(batch);
              createBatchBlocked = true;
              nextTickDelay = retryDelay(r);
            } else {
              finishCreates(batch);
              fatalWriteRef.current = true;
            }
            setSyncError(
              retryable
                ? `Сеть отвечает нестабильно (HTTP ${r.status})`
                : `Не удалось сохранить один штрих (HTTP ${r.status})`,
            );
          } else {
            syncFailureCountRef.current = 0;
            finishCreates(batch);
            if (
              !fatalWriteRef.current &&
              !outboxUnavailableRef.current
            ) {
              setSyncError(null);
            }
          }
        } catch (e) {
          requeueCreates(batch);
          createBatchBlocked = true;
          nextTickDelay = retryDelay();
          setSyncError(
            "Связь потеряна. Штрихи сохранены на устройстве и будут отправлены автоматически.",
          );
        } finally {
          pendingRequestRef.current -= 1;
          setSyncing(false);
        }
      }

      // 2) удалённые ID
      const delQueue = pendingDeleteRef.current;
      // Delete всегда идёт после подтверждённого create. Иначе потерянный
      // ответ create мог бы «воскресить» уже отменённый штрих при retry.
      if (!createBatchBlocked && delQueue.length > 0) {
        const batch = [...new Set(delQueue.splice(0, 200))];
        inFlightDeletesRef.current = batch;
        try {
          await persistOutboxSnapshot();
        } catch {
          setSyncError(
            "Локальная резервная копия недоступна. Не закрывайте вкладку до сохранения.",
          );
        }
        setSyncing(true);
        pendingRequestRef.current += 1;
        try {
          const r = await fetch(`/api/strokes/delete`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              workspaceId: props.workspaceId,
              strokeIds: batch,
            }),
          });
          const errorBody = !r.ok ? await r.json().catch(() => null) : null;
          if (r.status === 410) {
            requeueDeletes(batch);
            fatalWriteRef.current = true;
            markClosed();
            setSyncError("Урок закрыт раньше, чем изменения были отправлены");
            return;
          }
          if (
            r.status === 409 &&
            errorBody?.error === "already_submitted" &&
            !isTeacher
          ) {
            requeueDeletes(batch);
            fatalWriteRef.current = true;
            setSubmitted(true);
            setSyncError("Работа уже сдана; последние изменения не отправлены");
            return;
          }
          if (r.status === 423) {
            frozenRef.current = true;
            requeueDeletes(batch);
            nextTickDelay = 5_000;
          } else if ((r.status === 401 || r.status === 403) && !isTeacher) {
            inFlightDeletesRef.current = [];
            revokeStudentAccess();
            return;
          } else if (!r.ok) {
            const retryable =
              r.status === 429 ||
              r.status >= 500 ||
              errorBody?.error === "write_conflict";
            if (retryable) {
              requeueDeletes(batch);
              nextTickDelay = retryDelay(r);
            } else {
              finishDeletes(batch, false);
              fatalWriteRef.current = true;
            }
            setSyncError(`Не удалось удалить штрих (HTTP ${r.status})`);
          } else {
            syncFailureCountRef.current = 0;
            finishDeletes(batch, true);
            if (
              !fatalWriteRef.current &&
              !outboxUnavailableRef.current
            ) {
              setSyncError(null);
            }
          }
        } catch (e) {
          // Для network error статус неизвестен — операция безопасно
          // повторяется, soft-delete идемпотентен.
          requeueDeletes(batch);
          nextTickDelay = retryDelay();
          setSyncError(
            "Связь потеряна. Изменения сохранены на устройстве и будут отправлены автоматически.",
          );
        } finally {
          pendingRequestRef.current -= 1;
          setSyncing(false);
        }
      }

      setTimeout(tick, nextTickDelay);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [
    props.sessionId,
    props.workspaceId,
    isTeacher,
    accessRevoked,
    boardReady,
    persistOutboxInBackground,
    persistOutboxSnapshot,
    markClosed,
    revokeStudentAccess,
  ]);

  // Последний safety net для mobile Safari/Android: IndexedDB остаётся
  // источником восстановления, а небольшой keepalive-batch получает шанс
  // дойти до сервера даже при закрытии вкладки.
  useEffect(() => {
    if (!outboxReady) return;

    const hasPendingWrites = () =>
      inFlightCreatesRef.current.length > 0 ||
      pendingFlushRef.current.length > 0 ||
      inFlightDeletesRef.current.length > 0 ||
      pendingDeleteRef.current.length > 0;

    const flushKeepalive = () => {
      if (!hasPendingWrites()) return;
      persistOutboxInBackground();

      const snapshot = mergeInkOutboxes({
        creates: [
          ...inFlightCreatesRef.current,
          ...pendingFlushRef.current,
        ],
        deletes: [
          ...inFlightDeletesRef.current,
          ...pendingDeleteRef.current,
        ],
      });
      const firstDelivery = snapshot.creates[0]?.delivery ?? "workspace";
      const createLimit = firstDelivery === "broadcast" ? 20 : 80;
      const creates = snapshot.creates
        .filter(
          (stroke) => (stroke.delivery ?? "workspace") === firstDelivery,
        )
        .slice(0, createLimit);
      if (creates.length > 0) {
        const target =
          firstDelivery === "broadcast"
            ? `/api/sessions/${props.sessionId}/broadcast`
            : "/api/strokes";
        const body =
          firstDelivery === "broadcast"
            ? JSON.stringify({
                strokes: creates.map(({
                  id,
                  color,
                  size,
                  simulatePressure,
                  points,
                  pageIndex,
                  coordinateSpace,
                  brushKind,
                  renderVersion,
                }) => ({
                  id,
                  color,
                  size,
                  simulatePressure,
                  points,
                  pageIndex: pageIndex ?? 0,
                  coordinateSpace: coordinateSpace ?? "legacy",
                  brushKind: brushKind ?? "legacy",
                  renderVersion: renderVersion ?? 1,
                })),
              })
            : JSON.stringify({
                strokes: creates.map((stroke) => ({
                  ...stroke,
                  workspaceId: props.workspaceId,
                })),
              });
        if (body.length < 60_000) {
          void fetch(target, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => undefined);
        }
      }

      // Keepalive-запросы выполняются независимо и могут поменяться местами.
      // Если есть create, delete оставляем durable outbox следующему запуску,
      // сохраняя обязательный порядок create → delete.
      const deletes =
        snapshot.creates.length === 0 ? snapshot.deletes.slice(0, 200) : [];
      if (deletes.length > 0) {
        const body = JSON.stringify({
          workspaceId: props.workspaceId,
          strokeIds: deletes,
        });
        if (body.length < 60_000) {
          void fetch("/api/strokes/delete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => undefined);
        }
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingWrites()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushKeepalive();
    };

    window.addEventListener("pagehide", flushKeepalive);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushKeepalive);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    outboxReady,
    persistOutboxInBackground,
    props.sessionId,
    props.workspaceId,
  ]);

  // Activity ping поддерживает живой статус ученика и быстро узнаёт о закрытии урока.
  useEffect(() => {
    if (isTeacher || accessRevoked) return;

    let cancelled = false;
    const ping = async () => {
      try {
        const response = await fetch(
          `/api/workspaces/${props.workspaceId}/join`,
          { method: "POST" },
        );
        if (cancelled) return;
        if (response.status === 410) {
          markClosed();
          return;
        }
        if (ACCESS_REJECTED_STATUSES.has(response.status)) {
          revokeStudentAccess();
        }
      } catch {
        // Сеть могла мигнуть — следующий тик повторит запрос.
      }
    };

    ping();
    const interval = setInterval(ping, ACTIVITY_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    props.workspaceId,
    isTeacher,
    accessRevoked,
    markClosed,
    revokeStudentAccess,
  ]);

  // ученик подтягивает учительские штрихи (overlay) в real-time
  useEffect(() => {
    if (isTeacher) return;
    if (closed || accessRevoked) return;
    if (!boardReady) return;

    let cancelled = false;
    let lastSyncedAt: string | null = null;
    const POLL_MS = 3000;

    const tick = async () => {
      if (cancelled || accessRevokedRef.current) return;
      try {
        const url =
          `/api/workspaces/${props.workspaceId}/strokes` +
          (lastSyncedAt ? `?since=${encodeURIComponent(lastSyncedAt)}` : "");
        const r = await fetch(url);
        if (cancelled) return;
        if (r.status === 410) {
          markClosed();
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (data.now) {
          // Небольшое overlap-окно закрывает редкий race: транзакция могла
          // получить timestamp до cursor, но commit'нуться после выборки.
          // Дубликаты безопасно отсекаются по Stroke.id ниже.
          const cursor = new Date(data.now).getTime();
          lastSyncedAt = Number.isFinite(cursor)
            ? new Date(cursor - 5_000).toISOString()
            : lastSyncedAt;
        }
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
        const deletedIds = new Set<string>(data.deletedStrokeIds ?? []);
        if (deletedIds.size > 0) {
          strokesRef.current = strokesRef.current.filter(
            (stroke) => !deletedIds.has(stroke.id),
          );
        }
        // фильтруем: только учительские штрихи, которых ещё нет у нас
        const known = new Set(strokesRef.current.map((s) => s.id));
        const locallyDeleted = new Set([
          ...pendingDeleteRef.current,
          ...inFlightDeletesRef.current,
          ...recoveryTombstonesRef.current,
        ]);
        const page = pageRef.current;
        const added: StrokeRecord[] = [];
        for (const s of data.strokes as (StrokeRecord & { layer?: string })[]) {
          if (s.layer !== "teacher") continue;
          if (known.has(s.id)) continue;
          if (locallyDeleted.has(s.id)) continue;
          strokesRef.current.push(s);
          added.push(s);
        }
        const stage = stageRef.current;
        if (stage && deletedIds.size > 0) {
          const width = stage.clientWidth;
          const height = stage.clientHeight;
          main.clearRect(0, 0, width, height);
          for (const stroke of strokesRef.current) {
            if ((stroke.pageIndex ?? 0) === page) {
              drawStroke(main, stroke, { width, height });
            }
          }
        } else if (stage) {
          for (const stroke of added) {
            if ((stroke.pageIndex ?? 0) === page) {
              drawStroke(main, stroke, {
                width: stage.clientWidth,
                height: stage.clientHeight,
              });
            }
          }
        }
        setCount(strokesRef.current.length);
        if (
          !fatalWriteRef.current &&
          !submitUncertainRef.current &&
          !outboxUnavailableRef.current
        ) {
          setSyncError(null);
        }
      } catch (e) {
        if (!cancelled && !submitUncertainRef.current) {
          setSyncError("overlay: " + (e as Error).message);
        }
      } finally {
        if (!cancelled && !accessRevokedRef.current) setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [
    props.workspaceId,
    isTeacher,
    closed,
    accessRevoked,
    boardReady,
    markClosed,
  ]);

  // periodic preview snapshot — только ученик, только если есть изменения
  useEffect(() => {
    if (isTeacher) return;
    if (closed || accessRevoked) return;
    if (!boardReady) return;

    const PREVIEW_W = 200;
    const PREVIEW_H = 280;
    const PREVIEW_MS = 4000;

    const snapshot = async () => {
      if (accessRevokedRef.current) return;
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
      if (props.templateKind === "pdf") {
        const fit = Math.min(PREVIEW_W / sw, PREVIEW_H / sh);
        const dx = (PREVIEW_W - sw * fit) / 2;
        const dy = (PREVIEW_H - sh * fit) / 2;
        oc.setTransform(fit, 0, 0, fit, dx, dy);
      } else {
        const sx = PREVIEW_W / sw;
        const sy = PREVIEW_H / sh;
        oc.setTransform(sx, 0, 0, sy, 0, 0);
      }
      const snapshotPage = pageRef.current;
      for (const s of strokesRef.current) {
        if ((s.pageIndex ?? 0) !== snapshotPage) continue;
        drawStroke(oc, s, { width: sw, height: sh });
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
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pageIndex: snapshotPage, pngBase64: base64 }),
        });
        if (r.status === 410) markClosed();
      } catch {
        // если не отправилось — следующий тик попробует снова (вернём dirty)
        dirtyForPreviewRef.current = true;
      }
    };

    const i = setInterval(snapshot, PREVIEW_MS);
    return () => clearInterval(i);
  }, [
    props.workspaceId,
    props.templateKind,
    isTeacher,
    closed,
    accessRevoked,
    boardReady,
    markClosed,
  ]);

  // Загружаем комментарии учителя — один раз при монтировании, потом по poll раз в 10 сек
  useEffect(() => {
    if (!isTeacher && (closed || accessRevoked)) return;

    let cancelled = false;
    const load = async () => {
      if (!isTeacher && accessRevokedRef.current) return;
      try {
        const r = await fetch(`/api/workspaces/${props.workspaceId}/comments`);
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
  }, [props.workspaceId, isTeacher, closed, accessRevoked]);

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

    if (props.templateKind === "pdf") {
      const fit = Math.min(TW / sw, TH / sh);
      const dx = (TW - sw * fit) / 2;
      const dy = (TH - sh * fit) / 2;
      oc.setTransform(fit, 0, 0, fit, dx, dy);
    } else {
      const sx = TW / sw;
      const sy = TH / sh;
      oc.setTransform(sx, 0, 0, sy, 0, 0);
    }
    const page = pageRef.current;
    for (const s of strokesRef.current) {
      if ((s.pageIndex ?? 0) === page) {
        drawStroke(oc, s, { width: sw, height: sh });
      }
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

  const resetStudentAccess = async () => {
    if (
      !window.confirm(
        `Сбросить вход ученика «${props.studentName}»? На текущем устройстве лист закроется, и ученик сможет войти заново.`,
      )
    ) {
      return;
    }

    setAccessResetState("busy");
    try {
      const response = await fetch(
        `/api/workspaces/${props.workspaceId}/access/reset`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setAccessResetState("success");
    } catch {
      setAccessResetState("error");
    }
  };

  const waitForPendingWrites = async () => {
    const deadline = Date.now() + 6_000;
    while (
      Date.now() < deadline &&
      (pendingFlushRef.current.length > 0 ||
        pendingDeleteRef.current.length > 0 ||
        inFlightCreatesRef.current.length > 0 ||
        inFlightDeletesRef.current.length > 0 ||
        pendingRequestRef.current > 0)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const memoryIsSynced =
      pendingFlushRef.current.length === 0 &&
      pendingDeleteRef.current.length === 0 &&
      inFlightCreatesRef.current.length === 0 &&
      inFlightDeletesRef.current.length === 0 &&
      pendingRequestRef.current === 0 &&
      !fatalWriteRef.current;
    if (!memoryIsSynced) return false;

    try {
      await outboxWriteChainRef.current;
      // Explicitly persist the empty authoritative snapshot before submit.
      // This prevents a stale queued create from being replayed after reload.
      await persistOutboxSnapshot();
      return true;
    } catch {
      // Память уже пуста только после server ACK. Даже если IndexedDB сейчас
      // недоступна, submit безопасен; возможный stale replay подтверждается
      // exact-idempotency API и не создаёт новых штрихов.
      outboxUnavailableRef.current = true;
      return true;
    }
  };

  const submitWork = async () => {
    if (!boardReady || canvasLocked || submitted) {
      setSyncError("Сначала дождитесь восстановления работы");
      return;
    }
    setSubmitting(true);
    setSubmitUncertain(false);
    submitUncertainRef.current = false;
    setConfirmSubmit(false);
    // Block new pointer input while the last local batch is being flushed.
    submittedRef.current = true;

    const synced = await waitForPendingWrites();
    if (!synced) {
      submittedRef.current = false;
      setSubmitting(false);
      setConfirmSubmit(true);
      setSyncError("Не удалось сохранить последние штрихи. Проверьте связь.");
      return;
    }

    let ambiguousFailure = false;
    let lastError = "Не удалось сдать работу";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8_000);
        let response: Response;
        try {
          response = await fetch(
            `/api/workspaces/${props.workspaceId}/submit`,
            { method: "POST", signal: controller.signal },
          );
        } finally {
          window.clearTimeout(timeout);
        }
        if (response.ok) {
          try {
            await saveInkOutbox(props.workspaceId, [], []);
          } catch {
            // Сервер уже подтвердил все штрихи и submit. Если очистка IDB не
            // удалась, exact duplicate replay также подтверждается API.
          }
          setSubmitted(true);
          submitUncertainRef.current = false;
          setHandRaised(false);
          setSyncError(null);
          setSubmitting(false);
          return;
        }

        lastError = `Не удалось подтвердить сдачу (HTTP ${response.status})`;
        if (response.status === 410) {
          markClosed();
          ambiguousFailure = false;
          break;
        }
        if (
          (response.status === 401 || response.status === 403) &&
          !isTeacher
        ) {
          revokeStudentAccess();
          ambiguousFailure = false;
          break;
        }
        // 5xx мог быть отправлен уже после commit. 409/429 гарантируют, что
        // переход не был выполнен, и после последней попытки можно повторить.
        ambiguousFailure = response.status >= 500;
      } catch {
        // Потерянный ответ не сообщает, выполнил ли сервер submit.
        ambiguousFailure = true;
        lastError = "Сервер не подтвердил сдачу из-за потери связи";
      }

      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * 2 ** attempt),
        );
      }
    }

    setSubmitting(false);
    if (ambiguousFailure) {
      // Не разрешаем продолжать письмо: сервер мог уже сделать лист
      // неизменяемым. Повторный POST безопасен благодаря idempotent submit.
      submittedRef.current = true;
      submitUncertainRef.current = true;
      setSubmitUncertain(true);
      setSyncError(
        `${lastError}. Штрихи сохранены; нажмите «Проверить сдачу».`,
      );
    } else if (!closedRef.current && !accessRevokedRef.current) {
      submittedRef.current = false;
      setConfirmSubmit(true);
      setSyncError(lastError);
    }
  };

  return (
    <>
      <header
        className={`z-20 flex min-h-[52px] items-center justify-between gap-2 border-b px-3 py-2 ${
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
        <div className="flex min-w-0 items-center justify-end gap-2 text-xs">
          {!isTeacher &&
            !canvasLocked &&
            boardReady &&
            !submitted &&
            !submitUncertain && (
            <button
              onClick={async () => {
                const next = !handRaised;
                setHandRaised(next);
                try {
                  const response = await fetch(
                    `/api/workspaces/${props.workspaceId}/hand`,
                    {
                    method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ raised: next }),
                    },
                  );
                  if (!response.ok) setHandRaised(!next);
                } catch {
                  setHandRaised(!next);
                }
              }}
              className={`min-h-11 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
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
          {!isTeacher &&
            !canvasLocked &&
            boardReady &&
            !submitted &&
            !submitUncertain &&
            !submitting &&
            !confirmSubmit && (
            <button
              onClick={() => setConfirmSubmit(true)}
              className="min-h-11 px-3 py-1.5 rounded-lg text-sm font-medium bg-green text-paper hover:opacity-90 transition"
              title="Завершить работу и сдать учителю"
            >
              Сдать работу
            </button>
          )}
          {!isTeacher &&
            !canvasLocked &&
            boardReady &&
            !submitted &&
            !submitUncertain &&
            !submitting &&
            confirmSubmit && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-dim">После сдачи не изменить.</span>
              <button
                onClick={() => setConfirmSubmit(false)}
                className="min-h-11 px-2 py-1 rounded-lg border border-rule hover:bg-rule/40 transition text-xs"
              >
                Отмена
              </button>
              <button
                onClick={submitWork}
                className="min-h-11 px-3 py-1.5 rounded-lg text-sm font-medium bg-green text-paper hover:opacity-90 transition"
              >
                Да, сдать
              </button>
            </div>
          )}
          {!isTeacher && submitting && (
            <span className="px-2 py-1 rounded bg-accent text-paper text-sm font-medium">
              Сохраняем и сдаём…
            </span>
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
                type="button"
                onClick={resetStudentAccess}
                disabled={accessResetState === "busy"}
                className={`px-2 py-1 rounded border transition disabled:opacity-60 ${
                  accessResetState === "success"
                    ? "border-green bg-green/10 text-green"
                    : accessResetState === "error"
                      ? "border-red bg-red/10 text-red"
                      : "border-rule hover:bg-rule/40"
                }`}
                title="Отвязать устройство ученика и разрешить новый вход"
                aria-live="polite"
              >
                {accessResetState === "busy"
                  ? "Сбрасываем…"
                  : accessResetState === "success"
                    ? "Вход сброшен ✓"
                    : accessResetState === "error"
                      ? "Не удалось — повторить"
                      : "Сбросить вход ученика"}
              </button>
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
          {!isTeacher && accessRevoked ? (
            <span className="px-2 py-1 rounded bg-red text-paper">
              доступ к листу сброшен
            </span>
          ) : closed ? (
            <span className="px-2 py-1 rounded bg-red text-paper">урок закрыт</span>
          ) : null}
          <div className="hidden sm:block">
            <ZoomControls zoom={zoom} setZoom={setZoom} />
          </div>
          <div className="hidden md:block">
            <FullscreenButton
              isFullscreen={isFullscreen}
              setIsFullscreen={setIsFullscreen}
            />
          </div>
          <span
            className={`hidden whitespace-nowrap rounded px-2 py-1 sm:inline-flex ${
              !boardReady
                ? "bg-accent text-paper"
                : syncError
                ? submitUncertain
                  ? "bg-accent text-paper"
                  : "bg-red text-paper"
                : syncing ||
                    pendingFlushRef.current.length > 0 ||
                    pendingDeleteRef.current.length > 0 ||
                    inFlightCreatesRef.current.length > 0 ||
                    inFlightDeletesRef.current.length > 0 ||
                    pendingRequestRef.current > 0
                  ? "bg-accent text-paper"
                  : "bg-green/10 text-green"
            }`}
            title={syncError ?? `${count} штрихов на доске`}
            aria-live={syncError && !submitUncertain ? "assertive" : "off"}
          >
            {!boardReady
              ? "Восстанавливаю…"
              : syncError
              ? submitUncertain
                ? "Проверяем сдачу"
                : "Не сохранено"
              : syncing ||
                  pendingFlushRef.current.length > 0 ||
                  pendingDeleteRef.current.length > 0 ||
                  inFlightCreatesRef.current.length > 0 ||
                  inFlightDeletesRef.current.length > 0 ||
                  pendingRequestRef.current > 0
                ? "Сохраняю…"
                : "Сохранено ✓"}
          </span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col-reverse lg:flex-row">
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
          inputMode={inputMode}
          setInputMode={setInputMode}
          stabilization={stabilization}
          setStabilization={setStabilization}
          canUndo={
            !broadcast &&
            historyRevision >= 0 &&
            historyRef.current.undo.length > 0
          }
          canRedo={
            !broadcast &&
            historyRevision >= 0 &&
            historyRef.current.redo.length > 0
          }
          onUndo={undoInk}
          onRedo={redoInk}
          disabled={interactionLocked}
        />
        <div
          className="relative min-h-0 flex-1 bg-chalk"
          aria-busy={!boardReady}
        >
        {!boardReady && !canvasLocked && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-chalk/90 p-4 backdrop-blur-sm"
            role={initialSnapshotError ? "alert" : "status"}
            aria-live={initialSnapshotError ? "assertive" : "polite"}
          >
            <div className="w-full max-w-sm rounded-2xl border border-rule bg-paper p-6 text-center shadow-xl">
              <div className="mb-3 text-lg font-semibold">
                {initialSnapshotError
                  ? "Не удалось открыть работу"
                  : "Восстанавливаем работу…"}
              </div>
              <p className="text-sm text-dim">
                {initialSnapshotError ??
                  "Возвращаем сохранённые штрихи и проверяем данные с сервера."}
              </p>
              {initialSnapshotError && (
                <button
                  type="button"
                  onClick={() => setInitialLoadAttempt((attempt) => attempt + 1)}
                  className="mt-5 min-h-11 rounded-xl bg-accent px-5 py-2.5 font-medium text-paper transition hover:opacity-90"
                >
                  Повторить
                </button>
              )}
            </div>
          </div>
        )}
        {submitting && !canvasLocked && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-chalk/75 p-4 backdrop-blur-[1px]"
            role="status"
            aria-live="polite"
          >
            <div className="rounded-2xl border border-rule bg-paper px-6 py-5 text-center shadow-xl">
              <div className="font-semibold">Сохраняем и сдаём работу…</div>
              <p className="mt-1 text-sm text-dim">
                Не закрывайте страницу ещё несколько секунд.
              </p>
            </div>
          </div>
        )}
        {submitUncertain && !submitted && !canvasLocked && !submitting && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-chalk/85 p-4 backdrop-blur-sm"
            role="status"
            aria-live="polite"
          >
            <div className="w-full max-w-md rounded-2xl border border-accent/30 bg-paper p-6 text-center shadow-xl">
              <h2 className="text-xl font-semibold">Штрихи сохранены</h2>
              <p className="mt-2 text-sm leading-relaxed text-dim">
                Связь прервалась именно во время сдачи. Писать дальше пока
                нельзя — безопасно проверьте, дошло ли подтверждение учителю.
              </p>
              <button
                type="button"
                onClick={submitWork}
                className="mt-5 min-h-11 rounded-xl bg-accent px-5 py-2.5 font-medium text-paper transition hover:opacity-90"
              >
                Проверить сдачу
              </button>
            </div>
          </div>
        )}
        <div
          ref={viewportRef}
          className="absolute inset-0 overflow-auto bg-chalk"
          style={{ touchAction: "none", overscrollBehavior: "contain" }}
        >
        <div
          className="relative"
          style={{
            width:
              boardSize.width > 0 && viewportSize.width > 0
                ? `${Math.max(viewportSize.width, boardSize.width * zoom)}px`
                : `${zoom * 100}%`,
            height:
              boardSize.height > 0 && viewportSize.height > 0
                ? `${Math.max(viewportSize.height, boardSize.height * zoom)}px`
                : `${zoom * 100}%`,
            minWidth: "100%",
            minHeight: "100%",
          }}
        >
        <div
          ref={stageRef}
          className="relative bg-paper origin-top-left"
          style={{
            touchAction: "none",
            width: boardSize.width > 0 ? `${boardSize.width}px` : "100%",
            height: boardSize.height > 0 ? `${boardSize.height}px` : "100%",
            minHeight: boardSize.height > 0 ? undefined : "100%",
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            position: boardSize.width > 0 ? "absolute" : "relative",
            left:
              boardSize.width > 0 && viewportSize.width > 0
                ? `${Math.max(
                    0,
                    (viewportSize.width - boardSize.width * zoom) / 2,
                  )}px`
                : undefined,
            top:
              boardSize.height > 0 && viewportSize.height > 0
                ? `${Math.max(
                    0,
                    (viewportSize.height - boardSize.height * zoom) / 2,
                  )}px`
                : undefined,
            boxShadow:
              props.templateKind === "pdf"
                ? "0 10px 35px rgba(15, 17, 21, 0.14)"
                : undefined,
            cursor: tool === "eraser" ? "none" : "crosshair",
          }}
        >
          {props.templateKind === "pdf" && props.templateFileId ? (
            <PdfBackground
              url={`/api/templates/${props.templateFileId}/file`}
              pageIndex={currentPage}
              canvasRef={pdfCanvasRef}
              onAspectRatioChange={setPdfAspectRatio}
              qualityScale={renderQualityZoom}
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
          <div
            ref={eraserCursorRef}
            className="pointer-events-none absolute left-0 top-0 z-20 h-9 w-9 rounded-full border-2 border-ink/55 bg-paper/25 opacity-0 shadow-sm transition-opacity"
            aria-hidden="true"
          />

          {/* Предметные виджеты: учитель управляет, ученики видят live */}
          {(isTeacher || !accessRevoked) && (
            <BoardWidgets
              sessionId={props.sessionId}
              isTeacher={isTeacher}
              pageIndex={currentPage}
              drawerOpen={instrumentsOpen}
              onDrawerClose={() => setInstrumentsOpen(false)}
              sessionClosed={closed}
            />
          )}
        </div>
        </div>
        </div>
          {isTeacher && !closed && (
            <button
              type="button"
              onClick={() => setInstrumentsOpen((o) => !o)}
              title="Предметные инструменты: график, тригокруг, таймер…"
              className={`absolute left-3 top-3 z-30 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold shadow-lg transition ${
                instrumentsOpen
                  ? "bg-accent text-paper border-accent"
                  : "bg-paper border-rule hover:bg-chalk"
              }`}
            >
              <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor"
                strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h16M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M4 8l2-4h12l2 4M12 12v4m-2-2h4" />
              </svg>
              Инструменты
            </button>
          )}

          {lassoSelectedIds.length > 0 && !interactionLocked && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-full bg-accent text-paper text-sm shadow-lg z-20">
              <span className="font-medium">{lassoSelectedIds.length} штрихов выбрано</span>
              <button
                 onClick={() => {
                   if (interactionLocked) {
                     setLassoSelectedIds([]);
                     return;
                   }
                   const selSet = new Set(lassoSelectedIds);
                  const removed = strokesRef.current.filter((s) =>
                    selSet.has(s.id),
                  );
                  strokesRef.current = strokesRef.current.filter((s) => !selSet.has(s.id));
                  enqueueStrokeDeletes(lassoSelectedIds);
                  recordHistory("delete", removed);
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
                      if ((s.pageIndex ?? 0) === page) {
                        drawStroke(main, s, { width: w, height: h });
                      }
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
                className="flex h-11 w-11 items-center justify-center rounded-full text-lg hover:bg-toolbarHover disabled:cursor-not-allowed disabled:opacity-40"
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
                className="flex h-11 w-11 items-center justify-center rounded-full text-lg hover:bg-toolbarHover disabled:cursor-not-allowed disabled:opacity-40"
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
          {frozenUntil != null && !isTeacher && !closed && !accessRevoked && (
            <FrozenOverlay until={frozenUntil} />
          )}
          {accessRevoked && !isTeacher && (
            <div
              className="absolute inset-0 z-40 flex items-center justify-center bg-chalk/90 backdrop-blur-sm"
              role="alert"
              aria-live="assertive"
            >
              <div className="pointer-events-auto max-w-md w-full mx-4 rounded-2xl bg-paper border border-red/30 shadow-xl p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red/10 text-2xl text-red">
                  ↻
                </div>
                <h2 className="text-2xl font-semibold tracking-tight mb-2">
                  Доступ к листу сброшен
                </h2>
                <p className="text-dim mb-6">
                  {hasUnconfirmedChanges
                    ? "Учитель отвязал это устройство. Последние изменения сохранены только на этом устройстве; войдите заново, чтобы отправить их."
                    : "Учитель отвязал это устройство. Подтверждённая работа сохранена; чтобы продолжить, войдите в урок заново."}
                </p>
                <a
                  href="/"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-3 font-medium text-paper transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  Вернуться и ввести код
                </a>
              </div>
            </div>
          )}
          {closed && !isTeacher && !accessRevoked && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center bg-chalk/85 backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <div className="pointer-events-auto max-w-md w-full mx-4 rounded-2xl bg-paper border border-rule shadow-xl p-8 text-center">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="text-2xl font-semibold tracking-tight mb-2">
                  Урок завершён
                </h2>
                <p className="text-dim mb-6">
                  {hasUnconfirmedChanges
                    ? "Учитель закрыл доступ. Последние изменения остались только на этом устройстве и ещё не подтверждены сервером."
                    : "Учитель закрыл доступ. Ваша работа подтверждена сервером."}
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
  inputMode,
  setInputMode,
  stabilization,
  setStabilization,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
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
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;
  stabilization: StabilizationLevel;
  setStabilization: (level: StabilizationLevel) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  disabled: boolean;
}) {
  const [panel, setPanel] = useState<"pen" | "marker" | "more" | null>(null);

  useEffect(() => {
    if (disabled) setPanel(null);
  }, [disabled]);
  useEffect(() => {
    if (!panel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [panel]);

  const chooseTool = (
    nextTool: "pen" | "eraser" | "marker" | "stamp" | "lasso" | "line",
    nextPanel: "pen" | "marker" | "more" | null = null,
  ) => {
    if (disabled) return;
    if (nextPanel && tool !== nextTool) {
      setTool(nextTool);
      setPanel(null);
      return;
    }
    if (tool === nextTool && panel === nextPanel && nextPanel) {
      setPanel(null);
      return;
    }
    setTool(nextTool);
    setPanel(nextPanel);
  };

  return (
    <div
      className="relative z-40 flex h-[calc(68px+env(safe-area-inset-bottom))] w-full flex-row items-center justify-around gap-1 overflow-visible bg-toolbar px-2 pb-[env(safe-area-inset-bottom)] lg:h-auto lg:w-[72px] lg:flex-col lg:justify-start lg:px-2 lg:py-3 lg:pb-3"
      aria-label="Инструменты доски"
      role="toolbar"
    >
      {panel && (
        <div
          className="absolute bottom-[calc(100%+8px)] left-2 right-2 z-50 max-h-[min(70dvh,520px)] overflow-y-auto rounded-2xl border border-rule bg-paper p-4 text-ink shadow-2xl lg:bottom-auto lg:left-[calc(100%+8px)] lg:right-auto lg:top-2 lg:w-[352px]"
          role="dialog"
          aria-label="Настройки инструмента"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                {panel === "pen"
                  ? "Перо"
                  : panel === "marker"
                    ? "Маркер"
                    : "Ещё инструменты"}
              </p>
              <p className="text-xs text-dim">
                {panel === "pen"
                  ? "Настрой цвет, толщину и плавность"
                  : panel === "marker"
                    ? "Выделяй важное, не закрывая текст"
                    : "Линии, выделение и режим устройства"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-chalk"
              aria-label="Закрыть настройки"
            >
              ✕
            </button>
          </div>

          {panel === "pen" && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">
                  Цвет
                </p>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((color, index) => (
                    <button
                      key={color.hex}
                      type="button"
                      onClick={() => {
                        setColorIdx(index);
                        setTool("pen");
                      }}
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 ${
                        colorIdx === index
                          ? "border-accent bg-chalk"
                          : "border-rule hover:border-dim/40"
                      }`}
                      aria-label={color.name}
                      aria-pressed={colorIdx === index}
                    >
                      <span
                        className="h-6 w-6 rounded-full border border-black/10"
                        style={{ backgroundColor: color.hex }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">
                  Толщина
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {SIZES.map((size, index) => (
                    <button
                      key={size.value}
                      type="button"
                      onClick={() => setSizeIdx(index)}
                      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border text-xs font-medium ${
                        sizeIdx === index
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-rule hover:bg-chalk"
                      }`}
                      aria-pressed={sizeIdx === index}
                    >
                      <span
                        className="rounded-full bg-current"
                        style={{
                          width: Math.max(4, size.value),
                          height: Math.max(4, size.value),
                        }}
                      />
                      {size.label}
                    </button>
                  ))}
                </div>
              </div>

              <SegmentedChoice
                label="Почерк"
                value={stabilization}
                options={[
                  {
                    value: "neat",
                    label: "Аккуратный",
                    hint: "сглаживает дрожание",
                  },
                  {
                    value: "natural",
                    label: "Естественный",
                    hint: "точнее повторяет руку",
                  },
                ]}
                onChange={(value) =>
                  setStabilization(value as StabilizationLevel)
                }
              />
              <InputModeChoice value={inputMode} onChange={setInputMode} />
            </div>
          )}

          {panel === "marker" && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">
                Цвет маркера
              </p>
              <div className="grid grid-cols-3 gap-2">
                {MARKER_COLORS.map((color, index) => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => {
                      setMarkerColorIdx(index);
                      setTool("marker");
                    }}
                    className={`flex min-h-14 items-center justify-center rounded-xl border-2 ${
                      markerColorIdx === index
                        ? "border-accent bg-chalk"
                        : "border-rule hover:border-dim/40"
                    }`}
                    aria-label={color.name}
                    aria-pressed={markerColorIdx === index}
                  >
                    <span
                      className="h-4 w-14 -rotate-2 rounded"
                      style={{ backgroundColor: color.solid }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {panel === "more" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => chooseTool("line", null)}
                  className={`min-h-14 rounded-xl border px-3 text-sm font-medium ${
                    tool === "line"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-rule hover:bg-chalk"
                  }`}
                  aria-pressed={tool === "line"}
                >
                  ╱&nbsp; Прямая
                </button>
                <button
                  type="button"
                  onClick={() => chooseTool("lasso", null)}
                  className={`min-h-14 rounded-xl border px-3 text-sm font-medium ${
                    tool === "lasso"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-rule hover:bg-chalk"
                  }`}
                  aria-pressed={tool === "lasso"}
                >
                  ◌&nbsp; Лассо
                </button>
              </div>

              {isTeacher && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">
                    Штампы учителя
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(STAMPS) as StampKind[]).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          setStampKind(kind);
                          setTool("stamp");
                          setPanel(null);
                        }}
                        className={`flex min-h-12 items-center justify-center rounded-xl border ${
                          tool === "stamp" && stampKind === kind
                            ? "border-accent bg-accent text-paper"
                            : "border-rule hover:bg-chalk"
                        }`}
                        aria-label={STAMPS[kind].label}
                      >
                        <StampGlyph kind={kind} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <InputModeChoice value={inputMode} onChange={setInputMode} />
            </div>
          )}
        </div>
      )}

      <ToolbarButton
        label="Перо"
        active={tool === "pen"}
        expanded={panel === "pen"}
        disabled={disabled}
        onClick={() => chooseTool("pen", "pen")}
        icon={
          <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4l6 6L8 22H2v-6L14 4z" />
            <path d="M12 6l6 6" />
          </svg>
        }
      />
      <ToolbarButton
        label="Маркер"
        active={tool === "marker"}
        expanded={panel === "marker"}
        disabled={disabled}
        onClick={() => chooseTool("marker", "marker")}
        icon={
          <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l-6 6v3h3l6-6" />
            <path d="M21 7l-9 9-4-4 9-9z" fill="#ffde3c" />
          </svg>
        }
      />
      <ToolbarButton
        label="Ластик"
        active={tool === "eraser"}
        disabled={disabled}
        onClick={() => chooseTool("eraser")}
        icon={
          <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l6-6L19 21H7" />
            <path d="M9 11l8-8a2 2 0 0 1 3 3l-8 8" />
          </svg>
        }
      />
      <ToolbarButton
        label="Отменить"
        disabled={disabled || !canUndo}
        onClick={onUndo}
        icon={<span className="text-2xl leading-none">↶</span>}
      />
      <ToolbarButton
        label="Вернуть"
        disabled={disabled || !canRedo}
        onClick={onRedo}
        icon={<span className="text-2xl leading-none">↷</span>}
      />
      <ToolbarButton
        label="Ещё"
        active={panel === "more" || tool === "line" || tool === "lasso" || tool === "stamp"}
        expanded={panel === "more"}
        disabled={disabled}
        onClick={() => setPanel((current) => (current === "more" ? null : "more"))}
        icon={<span className="text-2xl leading-none">•••</span>}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  icon,
  active,
  expanded,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-14 min-w-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-paper transition lg:w-14 lg:flex-none ${
        active ? "bg-toolbarActive" : "hover:bg-toolbarHover"
      } disabled:cursor-not-allowed disabled:opacity-35`}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
    >
      {icon}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

function SegmentedChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; hint: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-14 rounded-xl border px-3 py-2 text-left ${
              value === option.value
                ? "border-accent bg-accent/10 text-accent"
                : "border-rule hover:bg-chalk"
            }`}
            aria-pressed={value === option.value}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="block text-[11px] leading-tight text-dim">
              {option.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InputModeChoice({
  value,
  onChange,
}: {
  value: InputMode;
  onChange: (mode: InputMode) => void;
}) {
  const modes: Array<{
    value: InputMode;
    label: string;
    hint: string;
  }> = [
    { value: "auto", label: "Авто", hint: "лучший выбор" },
    { value: "pen", label: "Стилус", hint: "ладонь не пишет" },
    { value: "touch", label: "Палец", hint: "без стилуса" },
  ];
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">
        Как пишем
      </p>
      <div className="grid grid-cols-3 gap-2">
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className={`min-h-14 rounded-xl border px-2 py-2 ${
              value === mode.value
                ? "border-accent bg-accent/10 text-accent"
                : "border-rule hover:bg-chalk"
            }`}
            aria-pressed={value === mode.value}
          >
            <span className="block text-xs font-semibold">{mode.label}</span>
            <span className="block text-[10px] leading-tight text-dim">
              {mode.hint}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-dim">
        Два пальца перемещают и масштабируют лист. В «Авто» после обнаружения
        стилуса один палец двигает лист, а ладонь не оставляет следов.
      </p>
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
    setZoom(Math.min(2.5, Math.max(0.5, next)));
  };
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-rule bg-paper p-0.5">
      <button
        onClick={() => step(-0.25)}
        className="h-9 w-9 rounded-lg text-lg leading-none hover:bg-rule/40 disabled:opacity-40"
        title="Уменьшить"
        disabled={zoom <= 0.5}
      >
        −
      </button>
      <button
        onClick={() => setZoom(1)}
        className="min-h-9 min-w-[3.25rem] rounded-lg px-2 font-mono text-xs hover:bg-rule/40"
        title="Сбросить зум"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => step(0.25)}
        className="h-9 w-9 rounded-lg text-lg leading-none hover:bg-rule/40 disabled:opacity-40"
        title="Увеличить"
        disabled={zoom >= 2.5}
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
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-rule hover:bg-rule/40"
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
    <div
      className="absolute inset-0 z-30 flex items-start justify-center bg-blue/15 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">
        Класс временно заморожен. Дождитесь разрешения учителя.
      </span>
      <div
        className="mt-6 flex items-center gap-3 rounded-2xl bg-blue px-5 py-3 text-paper shadow-xl"
        aria-hidden="true"
      >
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

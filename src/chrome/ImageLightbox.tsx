import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { LAYER } from "../lib/layers";
import { t } from "../i18n";
import { Undo2, X } from "./icons";

type Tool = "pen" | "highlight";

type Stroke = {
  color: string;
  width: number;
  alpha: number;
  points: { x: number; y: number }[];
};

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"];

/** Pen widths as a fraction of the image's long edge, order = UI order. */
const PEN_WIDTHS = [0.8, 1.8, 3.5];
const PEN_WIDTH_LABELS = ["Thin stroke", "Medium stroke", "Thick stroke"];

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
  /** When set, the toolbar offers "Add to chat" with the annotated PNG. */
  onAnnotate?: (dataUrl: string) => void;
};

export function ImageLightbox({ src, alt, onClose, onAnnotate }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<Stroke | null>(null);
  const frameRef = useRef<number | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [tool, setTool] = useState<Tool>("pen");
  const [widthIndex, setWidthIndex] = useState(0);
  const [count, setCount] = useState(0);

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const strokes = activeRef.current
      ? [...strokesRef.current, activeRef.current]
      : strokesRef.current;
    for (const stroke of strokes) drawStroke(ctx, stroke);
  };

  const schedule = () => {
    if (frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      draw();
    });
  };

  useLayoutEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const sync = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      draw();
    };
    sync();
    image.addEventListener("load", sync);
    return () => image.removeEventListener("load", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        strokesRef.current.pop();
        setCount(strokesRef.current.length);
        draw();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointFor = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!onAnnotate) return;
    const point = pointFor(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const canvas = canvasRef.current!;
    const base = Math.max(canvas.width, canvas.height) / 100;
    const strokeWidth = base * PEN_WIDTHS[widthIndex];
    activeRef.current = {
      color,
      width: tool === "highlight" ? strokeWidth * 3 : strokeWidth,
      alpha: tool === "highlight" ? 0.32 : 1,
      points: [point],
    };
    schedule();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    const point = pointFor(event);
    if (!point) return;
    activeRef.current.points.push(point);
    schedule();
  };

  const onPointerUp = () => {
    if (!activeRef.current) return;
    strokesRef.current.push(activeRef.current);
    activeRef.current = null;
    setCount(strokesRef.current.length);
    draw();
  };

  const clear = () => {
    strokesRef.current = [];
    activeRef.current = null;
    setCount(0);
    draw();
  };

  const undo = () => {
    strokesRef.current.pop();
    setCount(strokesRef.current.length);
    draw();
  };

  const addToChat = () => {
    const image = imageRef.current;
    if (!image || !onAnnotate) return;
    const out = document.createElement("canvas");
    out.width = image.naturalWidth;
    out.height = image.naturalHeight;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, 0, 0);
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
    onAnnotate(out.toDataURL("image/png"));
    onClose();
  };

  const showTools = Boolean(onAnnotate);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Image preview: {name}", { name: alt })}
      className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 backdrop-blur-sm"
      style={{ zIndex: LAYER.dialog }}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative inline-block max-h-[80vh] max-w-full">
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          draggable={false}
          className="block max-h-[80vh] max-w-full select-none object-contain shadow-2xl"
        />
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full ${
            showTools ? "cursor-crosshair touch-none" : "pointer-events-none"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {showTools ? (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2 py-1 opacity-80 shadow-lg backdrop-blur-md transition-opacity hover:opacity-100">
          {COLORS.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={t("Draw color")}
              data-no-tooltip
              onClick={() => setColor(value)}
              className={`size-4 rounded-full ring-offset-2 ring-offset-black/60 ${
                color === value ? "ring-2 ring-white/80" : ""
              }`}
              style={{ backgroundColor: value }}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-white/15" />
          {PEN_WIDTHS.map((_, index) => (
            <button
              key={PEN_WIDTH_LABELS[index]}
              type="button"
              data-no-tooltip
              aria-label={t(PEN_WIDTH_LABELS[index])}
              onClick={() => setWidthIndex(index)}
              className={`grid size-6 place-items-center rounded-full ${
                widthIndex === index
                  ? "bg-white/20"
                  : "hover:bg-white/10"
              }`}
            >
              <span
                className="rounded-full bg-white"
                style={{ width: 4 + index * 3, height: 4 + index * 3 }}
              />
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/15" />
          <button
            type="button"
            data-no-tooltip
            onClick={() => setTool("pen")}
            className={`h-6 rounded-full px-2 text-[11px] ${
              tool === "pen"
                ? "bg-white/20 text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {t("Pen")}
          </button>
          <button
            type="button"
            data-no-tooltip
            onClick={() => setTool("highlight")}
            className={`h-6 rounded-full px-2 text-[11px] ${
              tool === "highlight"
                ? "bg-white/20 text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {t("Highlight")}
          </button>
          <span className="mx-1 h-4 w-px bg-white/15" />
          <button
            type="button"
            data-no-tooltip
            disabled={count === 0}
            onClick={undo}
            className="grid size-6 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Undo2 className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            data-no-tooltip
            disabled={count === 0}
            onClick={clear}
            className="h-6 rounded-full px-2 text-[11px] text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            {t("Clear")}
          </button>
          <button
            type="button"
            data-no-tooltip
            onClick={addToChat}
            className="h-6 rounded-full bg-white px-2.5 text-[11px] font-medium text-black hover:bg-white/90"
          >
            {t("Add to chat")}
          </button>
        </div>
      ) : null}

      <button
        ref={closeRef}
        type="button"
        aria-label={t("Close image preview")}
        title={t("Close")}
        onClick={onClose}
        className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-white/15 bg-black/45 text-white/80 shadow-lg backdrop-blur-md hover:bg-black/65 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <X className="size-4" strokeWidth={2} />
      </button>
    </div>,
    document.body,
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) return;
  ctx.save();
  ctx.globalAlpha = stroke.alpha;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const [first, ...rest] = stroke.points;
  ctx.moveTo(first.x, first.y);
  for (const point of rest) ctx.lineTo(point.x, point.y);
  if (rest.length === 0) ctx.lineTo(first.x + 0.01, first.y + 0.01);
  ctx.stroke();
  ctx.restore();
}

import React, { useEffect, useRef, useState } from "react";

const BASE = 32;            // werkcanvas in pixels
const PREVIEW = 512;        // viewport size in px
const MAX_HISTORY = 20;     // undo/redo diepte

type Tool = "brush" | "erase";

export default function App() {
  const [color, setColor] = useState("#ff0077");
  const [tool, setTool] = useState<Tool>("brush");
  const [isDrawing, setIsDrawing] = useState(false);

  // offscreen 32×32 werkcanvas
  const workRef = useRef<HTMLCanvasElement | null>(null);
  // zichtbare preview (geschaald)
  const viewRef = useRef<HTMLCanvasElement | null>(null);

  // undo/redo
  const historyRef = useRef<ImageData[]>([]);
  const futureRef = useRef<ImageData[]>([]);

  useEffect(() => {
    const work = document.createElement("canvas");
    work.width = BASE;
    work.height = BASE;
    workRef.current = work;

    pushHistory();
    drawPreview();
  }, []);

  // ---------- helpers ----------
  function getCtx32(): CanvasRenderingContext2D {
    const ctx = workRef.current!.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  function pushHistory() {
    const ctx = getCtx32();
    const snap = ctx.getImageData(0, 0, BASE, BASE);
    historyRef.current.push(snap);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    futureRef.current = [];
  }

  function undo() {
    if (historyRef.current.length <= 1) return;
    const ctx = getCtx32();
    const current = ctx.getImageData(0, 0, BASE, BASE);
    futureRef.current.push(current);

    historyRef.current.pop();
    const prev = historyRef.current[historyRef.current.length - 1];
    ctx.putImageData(prev, 0, 0);
    drawPreview();
  }

  function redo() {
    if (!futureRef.current.length) return;
    const ctx = getCtx32();
    const next = futureRef.current.pop()!;
    historyRef.current.push(next);
    ctx.putImageData(next, 0, 0);
    drawPreview();
  }

  function drawPixel(x: number, y: number) {
    if (x < 0 || y < 0 || x >= BASE || y >= BASE) return;
    const ctx = getCtx32();
    if (tool === "brush") {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    } else {
      const img = ctx.getImageData(x, y, 1, 1);
      img.data[3] = 0; // alpha 0 → transparant
      ctx.putImageData(img, x, y);
    }
  }

  function drawCheckerboard(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    size: number
  ) {
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        const even = ((x / size) + (y / size)) % 2 === 0;
        ctx.fillStyle = even ? "#eee" : "#fff";
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  function drawPreview() {
    const view = viewRef.current!;
    const vctx = view.getContext("2d")!;
    vctx.imageSmoothingEnabled = false;

    vctx.clearRect(0, 0, PREVIEW, PREVIEW);
    drawCheckerboard(vctx, PREVIEW, PREVIEW, 16);

    vctx.drawImage(workRef.current!, 0, 0, PREVIEW, PREVIEW);

    // grid overlay
    vctx.save();
    vctx.strokeStyle = "rgba(0,0,0,0.15)";
    vctx.lineWidth = 1;
    const cell = PREVIEW / BASE;
    for (let i = 1; i < BASE; i++) {
      vctx.beginPath();
      vctx.moveTo(i * cell + 0.5, 0);
      vctx.lineTo(i * cell + 0.5, PREVIEW);
      vctx.stroke();

      vctx.beginPath();
      vctx.moveTo(0, i * cell + 0.5);
      vctx.lineTo(PREVIEW, i * cell + 0.5);
      vctx.stroke();
    }
    vctx.restore();
  }

  function screenToCell(clientX: number, clientY: number) {
    const rect = viewRef.current!.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const cell = PREVIEW / BASE;
    const x = Math.floor(sx / cell);
    const y = Math.floor(sy / cell);
    return { x, y };
  }

  function clearAll() {
    if (!workRef.current) return;
    pushHistory();
    const ctx = getCtx32();
    ctx.clearRect(0, 0, BASE, BASE);
    drawPreview();
  }

  function fillAll() {
    if (!workRef.current) return;
    pushHistory();
    const ctx = getCtx32();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, BASE, BASE);
    drawPreview();
  }

  function exportPNG() {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = PREVIEW;
    exportCanvas.height = PREVIEW;
    const ex = exportCanvas.getContext("2d")!;
    ex.imageSmoothingEnabled = false;
    ex.clearRect(0, 0, PREVIEW, PREVIEW);
    ex.drawImage(workRef.current!, 0, 0, PREVIEW, PREVIEW);

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pixel-avatar.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  // ---------- Pointer Events (simpel & één codepad) ----------
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    setIsDrawing(true);
    pushHistory();
    const { x, y } = screenToCell(e.clientX, e.clientY);
    drawPixel(x, y);
    drawPreview();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const { x, y } = screenToCell(e.clientX, e.clientY);
    drawPixel(x, y);
    drawPreview();
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    setIsDrawing(false);
    try {
      (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {}
  }

  useEffect(() => {
    if (workRef.current) drawPreview();
  }, [tool, color]);

  return (
    <div className="font-sans p-4 max-w-[1000px] mx-auto">
      <h1 className="text-2xl font-semibold">Pixelart Avatar — Minimal Editor (32×32)</h1>
      <p className="text-gray-600 mt-1">Brush & erase, color picker, undo/redo, PNG export.</p>

      <div className="flex gap-5 items-start flex-wrap">
        <div className="w-[512px] max-w-full">
          <canvas
            ref={viewRef}
            width={PREVIEW}
            height={PREVIEW}
            className="w-full h-auto [image-rendering:pixelated] border border-gray-200 bg-[#fafafa] [touch-action:none]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        <div className="min-w-[240px] flex-1">
          <div className="grid gap-3">
            <label className="flex items-center gap-2">
              <span className="w-20">Kleur</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <span className="font-mono">{color.toUpperCase()}</span>
            </label>

            <div>
              <strong>Tool</strong>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setTool("brush")}
                  className={`px-3 py-1 border ${tool === "brush" ? "border-black bg-white" : "border-gray-300 bg-gray-100"}`}
                >
                  ✏️ Brush
                </button>
                <button
                  onClick={() => setTool("erase")}
                  className={`px-3 py-1 border ${tool === "erase" ? "border-black bg-white" : "border-gray-300 bg-gray-100"}`}
                >
                  🧽 Erase
                </button>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button onClick={undo}>↩️ Undo</button>
              <button onClick={redo}>↪️ Redo</button>
              <button onClick={clearAll}>🗑️ Clear</button>
              <button onClick={fillAll}>🎨 Fill</button>
              <button onClick={exportPNG} className="ml-auto">⬇️ Export PNG</button>
            </div>

            <details>
              <summary>Tips</summary>
              <ul className="mt-2 text-gray-600 list-disc pl-6">
                <li>Teken in het grote vak; elke cel is 1 pixel van 32×32.</li>
                <li>Transparantie zie je als schaakbord.</li>
                <li>PNG export schaalt automatisch naar {PREVIEW}×{PREVIEW}.</li>
              </ul>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

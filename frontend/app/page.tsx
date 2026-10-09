"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  Sparkles,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  FileCode2,
  Loader2,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Palette,
  Scissors,
  Wand2,
  Sliders,
  Layers,
  ChevronDown,
  ChevronUp,
  Move,
  Hand,
  Zap,
  FileArchive,
  Combine,
  Pipette,
  Check,
} from "lucide-react";
import { ReactCompareSlider, ReactCompareSliderHandle } from "react-compare-slider";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type DetailLevel = "low" | "medium" | "high";

export default function Home() {
  // Estados de Imagen
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [vectorUrl, setVectorUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string>("");
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Parámetros de Vectorización
  const [removeBackground, setRemoveBackground] = useState<boolean>(false);
  const [colorCount, setColorCount] = useState<number>(0);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("medium");
  const [superResolution, setSuperResolution] = useState<boolean>(false);
  const [isLowRes, setIsLowRes] = useState<boolean>(false);

  // Editor Interactivo de Paleta
  const [customPalette, setCustomPalette] = useState<string[]>([]);
  const [originalPalette, setOriginalPalette] = useState<string[]>([]);
  const [isExtractingPalette, setIsExtractingPalette] = useState<boolean>(false);
  const [selectedColorIndices, setSelectedColorIndices] = useState<number[]>([]);

  // Estados de UI y Canvas
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(100);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Estados de Exportación PRO
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [isExportingDxf, setIsExportingDxf] = useState<boolean>(false);
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<number>(zoom);
  const panRef = useRef<{ x: number; y: number }>(pan);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
  }>({
    startX: 0,
    startY: 0,
    initialPanX: 0,
    initialPanY: 0,
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sincronización de refs para los event listeners nativos
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // Listener nativo no-pasivo para Zoom con scroll del ratón (Wheel)
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!file) return;

      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);

      const zoomDelta = -e.deltaY;
      const factor = Math.exp(zoomDelta * 0.0018);
      const currentZoom = zoomRef.current;

      // Rango dinámico sin tope de 300% (hasta 3000% y mínimo 20%)
      let newZoom = Math.round(currentZoom * factor);
      if (newZoom < 20) newZoom = 20;
      if (newZoom > 3000) newZoom = 3000;

      if (newZoom !== currentZoom) {
        const scaleChange = newZoom / currentZoom;
        const currentPan = panRef.current;

        // Proyección anclada hacia la posición del cursor
        const newPanX = mouseX - (mouseX - currentPan.x) * scaleChange;
        const newPanY = mouseY - (mouseY - currentPan.y) * scaleChange;

        zoomRef.current = newZoom;
        panRef.current = { x: newPanX, y: newPanY };
        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [file]);

  // Eventos globales de arrastre con ratón (MouseMove y MouseUp)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - panStartRef.current.startX;
      const dy = e.clientY - panStartRef.current.startY;
      const nextPan = {
        x: panStartRef.current.initialPanX + dx,
        y: panStartRef.current.initialPanY + dy,
      };
      panRef.current = nextPan;
      setPan(nextPan);
    };

    const handleMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Soporte para modo mano al mantener la barra espaciadora
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !e.repeat &&
        (e.target === document.body || e.target === canvasContainerRef.current)
      ) {
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Cerrar menú de exportación al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#export-dropdown-container")) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      window.addEventListener("click", handleClickOutside);
    }
    return () => {
      window.removeEventListener("click", handleClickOutside);
    };
  }, [showExportMenu]);

  // Limpieza de Object URLs para evitar fugas de memoria
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (vectorUrl) URL.revokeObjectURL(vectorUrl);
    };
  }, [previewUrl, vectorUrl]);

  // Extracción automática de paleta al cambiar cantidad de colores o eliminar fondo
  useEffect(() => {
    if (!file || colorCount <= 0) {
      setCustomPalette([]);
      setOriginalPalette([]);
      setSelectedColorIndices([]);
      return;
    }

    let isCancelled = false;

    const fetchPalette = async () => {
      setIsExtractingPalette(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("color_count", colorCount.toString());
        formData.append("remove_background", removeBackground ? "true" : "false");

        const res = await fetch(`${BACKEND_URL}/api/palette`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Fallo al analizar paleta");

        const data = await res.json();
        if (!isCancelled && data.colors && Array.isArray(data.colors)) {
          setCustomPalette(data.colors);
          setOriginalPalette(data.colors);
          setSelectedColorIndices([]);
        }
      } catch (err) {
        console.error("Error al extraer paleta K-Means:", err);
      } finally {
        if (!isCancelled) setIsExtractingPalette(false);
      }
    };

    fetchPalette();

    return () => {
      isCancelled = true;
    };
  }, [file, colorCount, removeBackground]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleSelectFile = (selectedFile: File) => {
    const validExtensions = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];
    const fileName = selectedFile.name.toLowerCase();
    const isValidExt = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValidExt) {
      setError(
        "Formato no compatible. Por favor sube una imagen PNG, JPG, JPEG, WEBP o BMP."
      );
      return;
    }

    if (selectedFile.size > 15 * 1024 * 1024) {
      setError("La imagen excede el límite de 15 MB.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (vectorUrl) URL.revokeObjectURL(vectorUrl);

    setError(null);
    setFile(selectedFile);
    setFileSize(formatBytes(selectedFile.size));
    setVectorUrl(null);
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setSelectedColorIndices([]);
    setShowExportMenu(false);

    const originalUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(originalUrl);

    // Detección de resolución e inspección para sugerir Super-Resolución 4x
    const imgTest = new window.Image();
    imgTest.src = originalUrl;
    imgTest.onload = () => {
      const w = imgTest.naturalWidth;
      const h = imgTest.naturalHeight;
      setImageDimensions({ width: w, height: h });
      const isSmall = w < 600 || h < 600;
      setIsLowRes(isSmall);
      if (isSmall) {
        setSuperResolution(true);
      }
    };
  };

  const handleVectorize = async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setShowExportMenu(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("remove_background", removeBackground ? "true" : "false");
      formData.append("color_count", colorCount.toString());
      formData.append("detail_level", detailLevel);
      formData.append("super_resolution", superResolution ? "true" : "false");

      if (colorCount > 0 && customPalette.length > 0) {
        formData.append("custom_palette", customPalette.join(","));
      }

      const response = await fetch(`${BACKEND_URL}/api/vectorize`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let detailMessage = "Error en el servidor al vectorizar la imagen.";
        try {
          const errJson = await response.json();
          if (errJson?.detail) detailMessage = errJson.detail;
        } catch {
          // Respuesta no JSON
        }
        throw new Error(detailMessage);
      }

      const svgBlob = await response.blob();
      if (vectorUrl) URL.revokeObjectURL(vectorUrl);

      const svgUrl = URL.createObjectURL(svgBlob);
      setVectorUrl(svgUrl);
    } catch (err: unknown) {
      console.error("Error durante vectorización:", err);
      if (err instanceof Error) {
        if (err.message.includes("fetch") || err.name === "TypeError") {
          setError(
            "No fue posible conectar con el servidor backend (FastAPI en http://localhost:8000). Comprueba que esté en ejecución."
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("Ocurrió un error inesperado al procesar la imagen.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Edición y Fusión de la Paleta
  const handleColorChange = (index: number, newHex: string) => {
    setCustomPalette((prev) => {
      const next = [...prev];
      next[index] = newHex.toUpperCase();
      return next;
    });
  };

  const toggleSelectColor = (index: number) => {
    setSelectedColorIndices((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      } else {
        if (prev.length >= 2) {
          return [prev[1], index];
        }
        return [...prev, index];
      }
    });
  };

  const handleMergeColors = () => {
    if (selectedColorIndices.length !== 2) return;
    const [targetIdx, sourceIdx] = selectedColorIndices;
    const targetColor = customPalette[targetIdx];
    // Elimina el color de origen y conserva el color destino
    const newPalette = customPalette.filter((_, idx) => idx !== sourceIdx);
    setCustomPalette(newPalette);
    setSelectedColorIndices([]);
  };

  const handleResetPalette = () => {
    setCustomPalette([...originalPalette]);
    setSelectedColorIndices([]);
  };

  // Descargas y Exportaciones
  const handleDownloadSvg = () => {
    if (!vectorUrl || !file) return;
    const baseName =
      file.name.substring(0, file.name.lastIndexOf(".")) || "vectorizado";
    const downloadName = `${baseName}_traceai.svg`;

    const link = document.createElement("a");
    link.href = vectorUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleDownloadDxf = async () => {
    if (!vectorUrl || !file) return;
    setIsExportingDxf(true);
    setShowExportMenu(false);
    try {
      const svgRes = await fetch(vectorUrl);
      const svgText = await svgRes.text();
      const baseName =
        file.name.substring(0, file.name.lastIndexOf(".")) || "vectorizado";

      const formData = new FormData();
      formData.append("svg_content", svgText);
      formData.append("filename", `${baseName}_traceai`);

      const response = await fetch(`${BACKEND_URL}/api/export/dxf`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Error en el servidor al generar DXF.");

      const dxfBlob = await response.blob();
      const downloadUrl = URL.createObjectURL(dxfBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${baseName}_traceai.dxf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Error al exportar DXF:", err);
      setError("No fue posible generar el archivo DXF.");
    } finally {
      setIsExportingDxf(false);
    }
  };

  const handleDownloadLayersZip = async () => {
    if (!vectorUrl || !file) return;
    setIsExportingZip(true);
    setShowExportMenu(false);
    try {
      const svgRes = await fetch(vectorUrl);
      const svgText = await svgRes.text();
      const baseName =
        file.name.substring(0, file.name.lastIndexOf(".")) || "vectorizado";

      const formData = new FormData();
      formData.append("svg_content", svgText);
      formData.append("filename", `${baseName}_traceai`);

      const response = await fetch(`${BACKEND_URL}/api/export/layers-zip`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok)
        throw new Error("Error en el servidor al generar el ZIP por capas.");

      const zipBlob = await response.blob();
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${baseName}_traceai_capas.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Error al exportar capas ZIP:", err);
      setError("No fue posible generar el archivo ZIP por capas.");
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (vectorUrl) URL.revokeObjectURL(vectorUrl);
    setFile(null);
    setPreviewUrl(null);
    setVectorUrl(null);
    setError(null);
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setSuperResolution(false);
    setIsLowRes(false);
    setImageDimensions(null);
    setCustomPalette([]);
    setOriginalPalette([]);
    setSelectedColorIndices([]);
    setShowExportMenu(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!file) return;

    const target = e.target as HTMLElement;
    // No iniciar arrastre si se interactúa con controles o el tirador del slider
    if (
      target.closest('[data-rcs="handle"]') ||
      target.closest("button") ||
      target.closest("select") ||
      target.closest("input")
    ) {
      return;
    }

    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      isPanningRef.current = true;
      panStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialPanX: pan.x,
        initialPanY: pan.y,
      };
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!file) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-rcs="handle"]') ||
      target.closest("button") ||
      target.closest("select")
    ) {
      return;
    }
    setZoom(100);
    setPan({ x: 0, y: 0 });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Barra Superior / Header Studio */}
      <header className="h-14 border-b border-white/5 bg-[#0A0E1A]/90 backdrop-blur-xl px-5 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-white/10">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-tight text-lg text-white">
              Trace<span className="text-cyan-400">AI</span>
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-indigo-300">
              Studio Pro
            </span>
          </div>
        </div>

        {file && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-slate-300">
            <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium truncate max-w-xs">{file.name}</span>
            <span className="text-slate-500 font-mono">({fileSize})</span>
            {imageDimensions && (
              <span className="text-cyan-400/80 font-mono text-[11px]">
                [{imageDimensions.width}x{imageDimensions.height}px]
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            API Online
          </span>

          {file && (
            <button
              onClick={handleReset}
              className="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Nueva Imagen</span>
            </button>
          )}
        </div>
      </header>

      {/* Contenedor Principal en Dos Columnas (Sidebar + Canvas) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* ======================================================== */}
        {/* SIDEBAR IZQUIERDO: Panel de Controles                    */}
        {/* ======================================================== */}
        <aside className="w-full lg:w-88 xl:w-96 border-b lg:border-b-0 lg:border-r border-white/5 bg-[#090D18]/95 backdrop-blur-xl flex flex-col justify-between shrink-0 z-20 overflow-y-auto">
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Parámetros de IA</span>
              </div>
              <span className="text-[11px] text-cyan-400 font-mono">Pro v0.3</span>
            </div>

            {/* Control 0: Super-Resolución IA 4x (Real-ESRGAN) */}
            <div
              className={`rounded-xl border p-4 transition-all ${
                superResolution
                  ? "border-amber-500/30 bg-amber-500/[0.04]"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      superResolution
                        ? "bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10"
                        : "bg-white/5 border border-white/10 text-slate-400"
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <label
                      htmlFor="super-res-toggle"
                      className="text-xs font-semibold text-slate-200 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Super-Resolución 4x (IA)</span>
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Reconstruye píxeles con Real-ESRGAN
                    </p>
                  </div>
                </div>

                <button
                  id="super-res-toggle"
                  type="button"
                  role="switch"
                  aria-checked={superResolution}
                  onClick={() => setSuperResolution(!superResolution)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                    superResolution ? "bg-amber-500" : "bg-slate-700/60"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                      superResolution ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {isLowRes && (
                <div className="mt-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 animate-in fade-in">
                  <Sparkles className="w-3 h-3 shrink-0 animate-pulse" />
                  <span>Imagen baja resolución detectada • 4x activado</span>
                </div>
              )}
            </div>

            {/* Control 1: Eliminar Fondo con IA */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Scissors className="w-4 h-4" />
                  </div>
                  <div>
                    <label
                      htmlFor="remove-bg-toggle"
                      className="text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Eliminar Fondo (IA)
                    </label>
                    <p className="text-[11px] text-slate-400">Aísla el sujeto con rembg</p>
                  </div>
                </div>

                <button
                  id="remove-bg-toggle"
                  type="button"
                  role="switch"
                  aria-checked={removeBackground}
                  onClick={() => setRemoveBackground(!removeBackground)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                    removeBackground ? "bg-indigo-600" : "bg-slate-700/60"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                      removeBackground ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Control 2: Paleta de Colores y Editor Interactivo */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <Palette className="w-4 h-4 text-purple-400" />
                  <span>Paleta de Colores</span>
                </div>
                {colorCount > 0 && customPalette.length > 0 && (
                  <button
                    onClick={handleResetPalette}
                    title="Restablecer a colores detectados inicialmente"
                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Restablecer</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Cuantiza con K-Means para aislar plastas sólidas de color.
              </p>

              <div className="relative">
                <select
                  value={colorCount}
                  onChange={(e) => setColorCount(Number(e.target.value))}
                  className="w-full bg-[#0d1222] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                >
                  <option value={0}>Automático (Sin forzar paleta)</option>
                  <option value={2}>2 Colores (Bicolor / Silueta)</option>
                  <option value={4}>4 Colores (Logo minimalista)</option>
                  <option value={8}>8 Colores (Paleta intermedia)</option>
                  <option value={16}>16 Colores (Detalle rico)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>

              {/* EDITOR INTERACTIVO DE PALETA (K-Means + Edición Hex + Fusión) */}
              {colorCount > 0 && file && (
                <div className="pt-2 border-t border-white/5 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                      <Pipette className="w-3 h-3 text-cyan-400" />
                      <span>Colores Detectados ({customPalette.length}):</span>
                    </span>
                    {isExtractingPalette && (
                      <span className="text-[10px] text-cyan-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Analizando...</span>
                      </span>
                    )}
                  </div>

                  {customPalette.length > 0 && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-4 gap-2 bg-[#080C16] p-2.5 rounded-xl border border-white/5">
                        {customPalette.map((colorHex, idx) => {
                          const isSelected = selectedColorIndices.includes(idx);
                          return (
                            <div
                              key={`${idx}-${colorHex}`}
                              className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all ${
                                isSelected
                                  ? "border-cyan-400 bg-cyan-500/10 shadow-sm shadow-cyan-500/20"
                                  : "border-white/5 bg-white/[0.02] hover:border-white/20"
                              }`}
                            >
                              <div className="relative group">
                                <label
                                  htmlFor={`color-input-${idx}`}
                                  className="block w-7 h-7 rounded-full cursor-pointer shadow-inner border border-white/20 transition-transform group-hover:scale-105"
                                  style={{ backgroundColor: colorHex }}
                                  title={`Editar ${colorHex} (Clic para cambiar)`}
                                />
                                <input
                                  id={`color-input-${idx}`}
                                  type="color"
                                  value={colorHex}
                                  onChange={(e) =>
                                    handleColorChange(idx, e.target.value)
                                  }
                                  className="sr-only"
                                />
                              </div>

                              <span className="text-[9px] font-mono text-slate-300 font-semibold tracking-tighter truncate max-w-[50px]">
                                {colorHex}
                              </span>

                              <button
                                type="button"
                                onClick={() => toggleSelectColor(idx)}
                                title={
                                  isSelected
                                    ? "Deseleccionar para fusión"
                                    : "Seleccionar para fusionar con otro color"
                                }
                                className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                                  isSelected
                                    ? "bg-cyan-500 text-black font-bold"
                                    : "bg-white/5 hover:bg-white/10 text-slate-400"
                                }`}
                              >
                                {isSelected ? "Sel" : "Unir"}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Botón de Fusión de Colores */}
                      {selectedColorIndices.length === 2 && (
                        <button
                          type="button"
                          onClick={handleMergeColors}
                          className="w-full py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-md shadow-purple-500/20 transition-all animate-in fade-in"
                        >
                          <Combine className="w-3.5 h-3.5" />
                          <span>
                            Fusionar{" "}
                            {customPalette[selectedColorIndices[0]]} +{" "}
                            {customPalette[selectedColorIndices[1]]}
                          </span>
                        </button>
                      )}

                      <p className="text-[10px] text-slate-400 leading-tight">
                        • Haz clic en el círculo para cambiar el tono Hex.
                        <br />• Selecciona 2 colores para fusionarlos en uno solo.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Control 3: Nivel de Detalle (Segment Control) */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/10 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Nivel de Detalle</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Ajusta el suavizado de curvas Bézier y descarte de ruido.
              </p>

              <div className="grid grid-cols-3 gap-1.5 bg-[#0d1222] p-1 rounded-xl border border-white/10">
                {(["low", "medium", "high"] as DetailLevel[]).map((level) => {
                  const labels = {
                    low: "Bajo",
                    medium: "Medio",
                    high: "Alto",
                  };
                  const isSelected = detailLevel === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setDetailLevel(level)}
                      className={`py-1.5 text-xs font-medium rounded-lg transition-all ${
                        isSelected
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                      }`}
                    >
                      {labels[level]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Botón Principal / CTA de Vectorización */}
          <div className="p-5 border-t border-white/5 bg-[#090D18] space-y-3">
            <button
              onClick={handleVectorize}
              disabled={!file || isLoading}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg ${
                !file
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"
                  : isLoading
                  ? "bg-indigo-600/50 text-indigo-200 cursor-wait border border-indigo-500/30"
                  : "bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white shadow-indigo-500/25 hover:scale-[1.01] active:scale-[0.99]"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>
                    {superResolution
                      ? "Escalando 4x y Vectorizando..."
                      : "Vectorizando con IA..."}
                  </span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 text-white" />
                  <span>{vectorUrl ? "Re-vectorizar" : "Vectorizar"}</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* ======================================================== */}
        {/* CANVAS PRINCIPAL: Área de Visualización y Comparativa   */}
        {/* ======================================================== */}
        <main
          ref={canvasContainerRef}
          className={`flex-1 relative flex items-center justify-center overflow-hidden p-6 select-none ${
            file
              ? isPanning
                ? "cursor-grabbing"
                : isSpacePressed
                ? "cursor-grab"
                : "cursor-grab"
              : "cursor-default"
          }`}
          style={{
            backgroundColor: "#070A12",
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Alerta de Error flotante */}
          {error && (
            <div className="absolute top-6 left-6 right-6 max-w-xl mx-auto z-40 bg-red-500/15 border border-red-500/40 rounded-xl p-3.5 flex items-start gap-3 text-red-200 backdrop-blur-xl shadow-xl shadow-red-950/30 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <span className="font-semibold block text-red-300">Error:</span>
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-400 hover:text-white underline shrink-0 ml-2"
              >
                Descartar
              </button>
            </div>
          )}

          {/* Estado 1: VACÍO (Drag & Drop) */}
          {!file && (
            <div className="w-full max-w-lg z-10 animate-in fade-in duration-300">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleSelectFile(e.target.files[0]);
                  }
                }}
                accept=".png,.jpg,.jpeg,.webp,.bmp,image/*"
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className={`group rounded-3xl border-2 border-dashed p-12 sm:p-16 text-center cursor-pointer transition-all duration-300 backdrop-blur-2xl ${
                  isDragging
                    ? "border-cyan-400 bg-indigo-500/15 scale-[1.02] shadow-2xl shadow-cyan-500/20"
                    : "border-indigo-500/30 bg-white/[0.02] hover:border-indigo-400/60 hover:bg-white/[0.04] shadow-2xl shadow-indigo-950/40"
                }`}
              >
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 group-hover:text-cyan-300 transition-all duration-300 shadow-inner">
                    <UploadCloud className="w-8 h-8" />
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {isDragging
                        ? "¡Suelta tu imagen aquí!"
                        : "Arrastra una imagen o haz clic para explorar"}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Soporta PNG, JPG, JPEG, WEBP y BMP (Hasta 15 MB)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300">
                      PNG
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300">
                      JPG
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300">
                      WEBP
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-mono text-indigo-300">
                      → SVG / DXF / ZIP
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Estado 2: IMAGEN CARGADA (Pre-vectorización) */}
          {file && !vectorUrl && (
            <div className="w-full h-full flex flex-col items-center justify-center relative z-10 animate-in fade-in duration-300">
              <div
                className="max-w-2xl max-h-[75vh] p-4 rounded-2xl border border-white/10 bg-[#0B0F19]/80 backdrop-blur-xl shadow-2xl flex items-center justify-center overflow-hidden"
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom / 100})`,
                  transition: isPanning
                    ? "none"
                    : "transform 0.15s cubic-bezier(0.2, 0, 0, 1)",
                  transformOrigin: "center center",
                  willChange: isPanning ? "transform" : "auto",
                }}
              >
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Previsualización original"
                    draggable={false}
                    className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-md select-none pointer-events-none"
                  />
                )}
              </div>

              {!isLoading && (
                <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 backdrop-blur-md pointer-events-none">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span>
                    Ajusta los parámetros a la izquierda y presiona{" "}
                    <strong>Vectorizar</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Estado 3: VECTORIZADO (Comparador Visual react-compare-slider) */}
          {file && vectorUrl && isMounted && (
            <div
              className="w-full h-full max-w-4xl max-h-[80vh] flex items-center justify-center relative z-10"
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom / 100})`,
                transition: isPanning
                  ? "none"
                  : "transform 0.15s cubic-bezier(0.2, 0, 0, 1)",
                transformOrigin: "center center",
                willChange: isPanning ? "transform" : "auto",
              }}
            >
              <div className="w-full h-full rounded-2xl overflow-hidden border border-indigo-500/30 bg-[#0B0F19] shadow-2xl shadow-indigo-950/50 flex flex-col">
                <ReactCompareSlider
                  itemOne={
                    <div className="w-full h-full flex items-center justify-center bg-black/40 p-4 select-none relative">
                      <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-md bg-black/70 border border-white/10 text-[11px] font-medium text-slate-300 backdrop-blur-md pointer-events-none">
                        Original (Ráster)
                      </div>
                      {previewUrl && (
                        <img
                          src={previewUrl}
                          alt="Imagen original"
                          draggable={false}
                          className="max-h-[68vh] max-w-full object-contain pointer-events-none select-none"
                        />
                      )}
                    </div>
                  }
                  itemTwo={
                    <div
                      className="w-full h-full flex items-center justify-center p-4 select-none relative"
                      style={{
                        backgroundColor: "#0B0F19",
                        backgroundImage:
                          "radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
                        backgroundSize: "16px 16px",
                      }}
                    >
                      <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-[11px] font-semibold text-cyan-300 backdrop-blur-md pointer-events-none">
                        Vectorizado (SVG)
                      </div>
                      <img
                        src={vectorUrl}
                        alt="SVG Vectorizado"
                        draggable={false}
                        className="max-h-[68vh] max-w-full object-contain pointer-events-none filter drop-shadow-md select-none"
                      />
                    </div>
                  }
                  handle={
                    <ReactCompareSliderHandle
                      buttonStyle={{
                        backdropFilter: "blur(8px)",
                        background: "#6366f1",
                        border: "2px solid #a5b4fc",
                        boxShadow: "0 0 15px rgba(99, 102, 241, 0.6)",
                        width: "36px",
                        height: "36px",
                        cursor: "ew-resize",
                      }}
                      linesStyle={{
                        backgroundColor: "#6366f1",
                        width: "2px",
                      }}
                    />
                  }
                  className="w-full h-full flex-1"
                />
              </div>
            </div>
          )}

          {/* Overlay de Carga durante Vectorización */}
          {isLoading && (
            <div className="absolute inset-0 bg-[#070A12]/80 backdrop-blur-md z-30 flex flex-col items-center justify-center animate-in fade-in duration-200">
              <div className="relative mb-5">
                <div className="w-16 h-16 rounded-full border-3 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Wand2 className="w-6 h-6 text-cyan-400 animate-pulse" />
                </div>
              </div>
              <p className="text-base font-bold text-white tracking-tight">
                {superResolution
                  ? "Escalando 4x con IA & Vectorizando..."
                  : "Generando Vectores con IA..."}
              </p>
              <p className="text-xs text-slate-400 mt-1.5">
                {superResolution ? "Super-Resolución Real-ESRGAN • " : ""}
                {removeBackground
                  ? "Aislando fondo con rembg • "
                  : colorCount > 0
                  ? `Cuantizando a ${customPalette.length || colorCount} colores • `
                  : "Segmentando colores • "}
                Trazando curvas Bézier ({detailLevel})
              </p>
            </div>
          )}

          {/* Barra de Herramientas Flotante sobre el Canvas (Zoom & Pan & Exportación PRO) */}
          {file && (
            <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 bg-[#0B0F19]/90 border border-white/10 rounded-2xl p-1.5 backdrop-blur-xl shadow-2xl">
              {/* Indicador de ayuda */}
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 text-[11px] text-slate-400 font-medium border-r border-white/10 select-none">
                <Move className="w-3.5 h-3.5 text-cyan-400" />
                <span>Scroll: Zoom • Arrastrar: Mover</span>
              </div>

              <div className="flex items-center gap-1 border-r border-white/10 pr-2">
                <button
                  onClick={() => setZoom((z) => Math.max(20, Math.round(z / 1.25)))}
                  title="Alejar (Zoom Out)"
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono text-slate-300 min-w-12 text-center select-none font-semibold">
                  {zoom}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(3000, Math.round(z * 1.25)))}
                  title="Acercar (Zoom In - sin tope)"
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setZoom(100);
                    setPan({ x: 0, y: 0 });
                  }}
                  title="Restablecer Vista (100% y centrado - o doble clic)"
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Menú de Exportación PRO (SVG, DXF, Capas ZIP) */}
              {vectorUrl && (
                <div id="export-dropdown-container" className="relative">
                  <div className="flex items-center">
                    <button
                      onClick={handleDownloadSvg}
                      title="Descargar archivo SVG estándar"
                      className="px-3 py-1.5 rounded-l-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar SVG</span>
                    </button>
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      title="Opciones avanzadas de exportación (DXF, Capas ZIP)"
                      className="px-2 py-1.5 rounded-r-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs border-l border-white/20 transition-all"
                    >
                      {showExportMenu ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronUp className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Menú Flotante Hacia Arriba */}
                  {showExportMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl bg-[#0B0F19] border border-white/15 p-2 shadow-2xl backdrop-blur-2xl z-50 space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <div className="px-2.5 py-1 text-[10px] font-mono text-slate-400 uppercase tracking-wider border-b border-white/5">
                        Opciones de Exportación PRO
                      </div>

                      <button
                        onClick={handleDownloadSvg}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/5 text-xs text-slate-200 hover:text-white flex items-center gap-2.5 transition-colors"
                      >
                        <FileCode2 className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div>
                          <div className="font-semibold">Descargar SVG</div>
                          <div className="text-[10px] text-slate-400">
                            Vectores estándar para web y diseño
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={handleDownloadDxf}
                        disabled={isExportingDxf}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/5 text-xs text-slate-200 hover:text-white flex items-center gap-2.5 transition-colors disabled:opacity-50"
                      >
                        {isExportingDxf ? (
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                        ) : (
                          <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                        )}
                        <div>
                          <div className="font-semibold">Descargar DXF</div>
                          <div className="text-[10px] text-slate-400">
                            AutoCAD, corte láser y CNC
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={handleDownloadLayersZip}
                        disabled={isExportingZip}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/5 text-xs text-slate-200 hover:text-white flex items-center gap-2.5 transition-colors disabled:opacity-50"
                      >
                        {isExportingZip ? (
                          <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
                        ) : (
                          <FileArchive className="w-4 h-4 text-purple-400 shrink-0" />
                        )}
                        <div>
                          <div className="font-semibold">Separar por Capas (.ZIP)</div>
                          <div className="text-[10px] text-slate-400">
                            Archivos independientes por color
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

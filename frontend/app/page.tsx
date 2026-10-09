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
  ArrowRight,
  Layers,
  Eye,
  SlidersHorizontal,
} from "lucide-react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [vectorUrl, setVectorUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [fileSize, setFileSize] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (vectorUrl) URL.revokeObjectURL(vectorUrl);
    };
  }, [previewUrl, vectorUrl]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const processFile = async (selectedFile: File) => {
    // Validar tipo de archivo
    const validExtensions = [".png", ".jpg", ".jpeg"];
    const fileName = selectedFile.name.toLowerCase();
    const isValidExt = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValidExt) {
      setError(
        "Formato no válido. Por favor selecciona una imagen en formato .png, .jpg o .jpeg."
      );
      return;
    }

    // Validar tamaño máximo (15 MB)
    const MAX_SIZE = 15 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE) {
      setError(
        "La imagen excede el tamaño máximo permitido de 15 MB."
      );
      return;
    }

    // Limpiar estados previos
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (vectorUrl) URL.revokeObjectURL(vectorUrl);

    setError(null);
    setFile(selectedFile);
    setFileSize(formatBytes(selectedFile.size));

    // Crear URL de previsualización para la imagen original
    const originalPreview = URL.createObjectURL(selectedFile);
    setPreviewUrl(originalPreview);

    // Iniciar petición al backend
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${BACKEND_URL}/api/vectorize`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let detailMessage = "Error en el servidor al vectorizar la imagen.";
        try {
          const errorJson = await response.json();
          if (errorJson?.detail) {
            detailMessage = errorJson.detail;
          }
        } catch {
          // Si no es JSON (ej. 502/503), conservar mensaje predeterminado
        }
        throw new Error(detailMessage);
      }

      // Convertir respuesta a Blob SVG y crear Object URL
      const svgBlob = await response.blob();
      const svgObjectUrl = URL.createObjectURL(svgBlob);
      setVectorUrl(svgObjectUrl);
    } catch (err: unknown) {
      console.error("Error durante la vectorización:", err);
      if (err instanceof Error) {
        if (err.message.includes("fetch") || err.name === "TypeError") {
          setError(
            "No fue posible conectar con el servidor backend (FastAPI en http://localhost:8000). Asegúrate de que el servidor esté activo."
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
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleDownloadSvg = () => {
    if (!vectorUrl || !file) return;

    // Nombre de archivo sanitizado con extensión .svg
    const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || "vectorizado";
    const downloadName = `${baseName}.svg`;

    const link = document.createElement("a");
    link.href = vectorUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (vectorUrl) URL.revokeObjectURL(vectorUrl);
    setFile(null);
    setPreviewUrl(null);
    setVectorUrl(null);
    setError(null);
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#070A12] text-white flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Luces y gradientes ambientales de fondo */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[480px] bg-gradient-to-br from-indigo-600/25 via-purple-600/20 to-cyan-500/10 blur-[140px] rounded-full" />
      <div className="pointer-events-none absolute top-1/2 -right-40 w-[500px] h-[500px] bg-indigo-900/15 blur-[140px] rounded-full" />
      <div className="pointer-events-none absolute bottom-0 -left-40 w-[450px] h-[450px] bg-purple-900/15 blur-[130px] rounded-full" />

      {/* Header de navegación */}
      <header className="relative z-20 border-b border-white/5 backdrop-blur-xl bg-[#070A12]/80 sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/10">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold tracking-tight text-xl text-white">
              Trace<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Mean Shift + VTracer</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              FastAPI Online
            </span>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 text-center max-w-5xl mx-auto w-full">
        {/* Cabecera / Hero */}
        <div className="mb-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-6 backdrop-blur-sm shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Vectorización inteligente de imágenes a SVG</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-100 to-slate-400 pb-2">
            TraceAI
          </h1>

          <p className="mt-3 text-base sm:text-lg md:text-xl text-slate-300 font-light leading-relaxed">
            Convierte tus imágenes a SVG con IA en segundos
          </p>
        </div>

        {/* Mensaje de Error Amigable */}
        {error && (
          <div className="mb-8 w-full max-w-2xl bg-red-500/10 border border-red-500/30 rounded-2xl p-4 sm:p-5 text-left flex items-start gap-3 text-red-200 backdrop-blur-md shadow-lg shadow-red-950/20 animate-in fade-in slide-in-from-top-2 duration-200">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">Ocurrió un problema</p>
              <p className="text-xs sm:text-sm text-red-200/90 mt-1 leading-normal">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-400 hover:text-white underline underline-offset-2 shrink-0 ml-2"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Estado: CARGANDO */}
        {isLoading && (
          <div className="w-full max-w-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-indigo-500/30 rounded-3xl p-10 sm:p-14 backdrop-blur-2xl shadow-2xl shadow-indigo-950/50 flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin flex items-center justify-center" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-cyan-400 animate-pulse" />
              </div>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Procesando imagen con IA...
            </h3>
            <p className="text-sm text-slate-400 mt-2 max-w-md text-center">
              Segmentando colores con Mean Shift y generando curvas Bézier de alta precisión.
            </p>

            <div className="mt-8 flex items-center gap-6 text-xs text-slate-400">
              <div className="flex items-center gap-1.5 text-indigo-400">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                <span>Preprocesamiento OpenCV</span>
              </div>
              <span className="text-slate-600">→</span>
              <div className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>Vectorización VTracer</span>
              </div>
            </div>
          </div>
        )}

        {/* Estado: RESULTADO (Antes y Después + Descarga) */}
        {!isLoading && vectorUrl && (
          <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-6 px-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">¡Vectorización Completada!</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {file?.name} ({fileSize})
              </span>
            </div>

            {/* Comparativa: Antes y Después */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tarjeta: ANTES (Original) */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl flex flex-col justify-between text-left">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-medium text-slate-300">
                      <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                      Original (Mapa de bits)
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 uppercase">
                      {file?.name.split(".").pop()}
                    </span>
                  </div>

                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center p-3">
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt="Imagen original"
                        className="max-h-full max-w-full object-contain rounded-lg"
                      />
                    )}
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-400 flex justify-between items-center px-1">
                  <span>Píxeles rasterizados</span>
                  <span className="font-mono">{fileSize}</span>
                </div>
              </div>

              {/* Tarjeta: DESPUÉS (SVG Vectorizado) */}
              <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-500/[0.05] to-transparent p-5 backdrop-blur-xl flex flex-col justify-between text-left shadow-xl shadow-indigo-950/30">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-xs font-medium text-indigo-300">
                      <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />
                      Resultado (Vector SVG)
                    </span>
                    <span className="text-[11px] font-mono text-cyan-400 font-bold">
                      SVG Escalable
                    </span>
                  </div>

                  {/* Visualizador con fondo de tablero para visualizar transparencias */}
                  <div
                    className="relative aspect-square w-full rounded-xl overflow-hidden border border-indigo-500/20 flex items-center justify-center p-3"
                    style={{
                      backgroundColor: "#0d1117",
                      backgroundImage:
                        "radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
                      backgroundSize: "16px 16px",
                    }}
                  >
                    <img
                      src={vectorUrl}
                      alt="Vector SVG generado"
                      className="max-h-full max-w-full object-contain filter drop-shadow-md"
                    />
                  </div>
                </div>

                <div className="mt-3 text-xs text-indigo-300 flex justify-between items-center px-1 font-medium">
                  <span>Curvas Bézier exactas</span>
                  <span className="text-cyan-400">Sin pérdida de calidad</span>
                </div>
              </div>
            </div>

            {/* Barra de Acciones */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleDownloadSvg}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Download className="w-4 h-4 text-white" />
                <span>Descargar SVG</span>
              </button>

              <button
                onClick={handleReset}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white font-medium text-sm flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw className="w-4 h-4 text-slate-400" />
                <span>Vectorizar otra imagen</span>
              </button>
            </div>
          </div>
        )}

        {/* Estado: ÁREA DE DRAG & DROP (Cuando no hay resultado ni carga activa) */}
        {!isLoading && !vectorUrl && (
          <div className="w-full max-w-xl">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`group relative rounded-3xl border-2 border-dashed transition-all duration-300 p-10 sm:p-14 cursor-pointer text-center select-none backdrop-blur-2xl ${
                isDragging
                  ? "border-cyan-400 bg-indigo-500/15 scale-[1.02] shadow-2xl shadow-cyan-500/20"
                  : "border-indigo-500/30 bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:border-indigo-400/60 hover:bg-white/[0.06] shadow-2xl shadow-indigo-950/40"
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-5">
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-inner ${
                    isDragging
                      ? "bg-cyan-500/20 text-cyan-300 scale-110"
                      : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-110 group-hover:text-cyan-300"
                  }`}
                >
                  <UploadCloud className="w-8 h-8" />
                </div>

                <div>
                  <p className="text-base sm:text-lg font-semibold text-slate-100 group-hover:text-white">
                    {isDragging
                      ? "¡Suelta tu imagen aquí!"
                      : "Arrastra tu imagen aquí o haz clic para explorar"}
                  </p>
                  <p className="mt-1.5 text-xs sm:text-sm text-slate-400">
                    Soporta formatos PNG, JPG o JPEG (Hasta 15 MB)
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <span className="px-3 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-slate-300">
                    PNG
                  </span>
                  <span className="px-3 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-slate-300">
                    JPG
                  </span>
                  <span className="px-3 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-slate-300">
                    JPEG
                  </span>
                  <span className="px-3 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-xs font-mono text-indigo-300">
                    → SVG Vector
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tarjetas de Características Destacadas */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-4xl text-left">
          <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm hover:border-white/10 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div className="text-sm font-semibold text-slate-200 mb-1">
              Filtro Mean Shift
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Segmenta degradados y elimina ruido complejo transformando la imagen en regiones limpias y homogéneas.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm hover:border-white/10 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="text-sm font-semibold text-slate-200 mb-1">
              Curvas Bézier Suaves
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Trazado spline exacto con preservación de esquinas y descarte automático de polígonos residuales.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm hover:border-white/10 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3">
              <FileCode2 className="w-4 h-4" />
            </div>
            <div className="text-sm font-semibold text-slate-200 mb-1">
              SVG Listo para Producción
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Descarga directa de archivos vectoriales listos para Figma, Illustrator o código HTML/React.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-slate-500">
        <p>© 2026 TraceAI SaaS. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

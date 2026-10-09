import React from "react";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#090D16] text-white flex flex-col justify-between">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[480px] bg-gradient-to-br from-indigo-600/30 via-purple-600/20 to-cyan-500/10 blur-[130px] rounded-full" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[420px] h-[360px] bg-indigo-900/15 blur-[120px] rounded-full" />

      {/* Navigation Header */}
      <header className="relative z-10 border-b border-white/5 backdrop-blur-md bg-white/[0.01]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg
                className="w-4 h-4 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-bold tracking-tight text-lg text-white">
              Trace<span className="text-indigo-400">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              API v0.1 Online
            </span>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-4xl mx-auto w-full">
        {/* Release / Tech Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-8 backdrop-blur-sm shadow-sm">
          <span className="text-cyan-400">✨</span> Motor de Vectorización IA & Algoritmos de Precisión
        </div>

        {/* Required Centered Title */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-100 to-slate-400 pb-3">
          TraceAI
        </h1>

        {/* Required Centered Subtitle */}
        <p className="mt-4 text-lg sm:text-xl md:text-2xl text-slate-300 font-light max-w-2xl leading-relaxed">
          Convierte tus imágenes a SVG con IA en segundos
        </p>

        {/* Minimalist interactive dropzone preview */}
        <div className="mt-12 w-full max-w-xl">
          <div className="group relative rounded-2xl border border-dashed border-indigo-500/30 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 backdrop-blur-xl transition-all duration-300 hover:border-indigo-400/60 hover:bg-white/[0.06] shadow-2xl shadow-indigo-950/40">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 group-hover:text-cyan-300 transition-all duration-300 shadow-inner">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-200">
                  Arrastra tu archivo aquí o haz clic para explorar
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Soporta PNG, JPG, JPEG, WEBP (Hasta 10MB)
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300">
                  PNG → SVG
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300">
                  Lossless Paths
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300">
                  Ultra Fast
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl text-left">
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="text-indigo-400 text-sm font-semibold mb-1">⚡ Ultra Rápido</div>
            <p className="text-xs text-slate-400">Vectorización instantánea acelerada por FastAPI y vtracer.</p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="text-purple-400 text-sm font-semibold mb-1">🎯 Curvas Bézier</div>
            <p className="text-xs text-slate-400">Trazos matemáticamente exactos y escalables sin distorsión.</p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="text-cyan-400 text-sm font-semibold mb-1">📦 Exportación SVG</div>
            <p className="text-xs text-slate-400">Descarga código vectorial listo para desarrollo web y diseño.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-slate-400">
        <p>© 2026 TraceAI SaaS. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

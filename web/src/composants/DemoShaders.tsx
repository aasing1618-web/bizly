import { useState } from "react";
import { WaterRippleImage } from "@/components/ui/water-ripple-image";
import { ShaderBackground } from "@/components/ui/oceanic-currents";
import { HandwritingSvg } from "@/components/ui/handwriting-svg";

export function DemoShaders() {
  const [vueActive, setVueActive] = useState<"ripple" | "oceanic" | "handwriting">("handwriting");

  return (
    <div className="space-y-6">
      <div className="bizly-card p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <span className="pill-tag pill-indigo mb-2">Composants UI interactifs</span>
            <h2 className="text-lg font-bold text-slate-900">Démonstration des Composants UI</h2>
            <p className="text-xs text-slate-500 font-medium">
              Intégration de <code className="text-indigo-600 font-bold">handwriting-svg.tsx</code>, <code className="text-indigo-600 font-bold">water-ripple-image.tsx</code> et <code className="text-indigo-600 font-bold">oceanic-currents.tsx</code>
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setVueActive("handwriting")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                vueActive === "handwriting"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              ✍️ Handwriting SVG
            </button>
            <button
              type="button"
              onClick={() => setVueActive("oceanic")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                vueActive === "oceanic"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🌊 Oceanic Currents
            </button>
            <button
              type="button"
              onClick={() => setVueActive("ripple")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                vueActive === "ripple"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              💧 Water Ripple
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 shadow-inner min-h-[420px] relative bg-slate-950 flex items-center justify-center">
          {vueActive === "handwriting" ? (
            <div className="relative w-full h-[450px] bg-slate-900 flex flex-col items-center justify-center p-8 space-y-4 rounded-2xl">
              <span className="pill-tag pill-pink">Animation SVG & Opentype.js</span>
              <HandwritingSvg
                text="Bizly"
                width={360}
                height={160}
                fontSize={80}
                strokeWidth={1.5}
                duration={3}
                className="text-amber-400"
              />
              <p className="text-xs text-slate-400 font-medium">
                Écriture manuscrite vectorielle animée avec <code className="text-amber-300">framer-motion</code> & <code className="text-amber-300">opentype.js</code>
              </p>
            </div>
          ) : vueActive === "oceanic" ? (
            <div className="relative w-full h-[450px] overflow-hidden rounded-2xl">
              <ShaderBackground className="absolute inset-0 w-full h-full" />
              <div className="relative z-10 p-8 flex flex-col items-center justify-center h-full text-center text-white space-y-4 bg-slate-950/20 backdrop-blur-[2px]">
                <span className="pill-tag bg-white/20 text-white border-white/30 backdrop-blur-md">
                  WebGL 1.0 Fragment Shader
                </span>
                <h3 className="text-2xl font-extrabold tracking-tight text-white drop-shadow-md">
                  Oceanic Currents Background
                </h3>
                <p className="text-sm text-slate-100 max-w-md font-medium leading-relaxed drop-shadow-xs">
                  Shader d'arrière-plan animé en temps réel avec distorsion FBM et rendu fluide.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-[450px] overflow-hidden rounded-2xl">
              <WaterRippleImage
                blueish={0.5}
                scale={7}
                illumination={0.18}
                surfaceDistortion={0.05}
                waterDistortion={0.03}
                src="https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=1170"
                className="w-full h-full"
              />
              <div className="absolute top-4 left-4 z-10">
                <span className="pill-tag bg-white/90 text-slate-800 border-white shadow-md font-bold backdrop-blur-sm">
                  💧 Ripple Surface Effect
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

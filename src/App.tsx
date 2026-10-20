/**
 * @file App.tsx
 * @description Bandar Bukit Raja (BBR) 125-Acre Smart Wetland & Flood Mitigation
 * Digital Twin Command Center Dashboard.
 *
 * Redesigned single-screen top-to-bottom architecture:
 *   - Header: Real-time MYT clock + decoupled Mode Switcher (LIVE vs SIMULATION)
 *   - Upper Hero (55%): Full-width 3D Digital Twin viewport
 *   - Middle Strip: Mode-adaptive timeline scrubber (real-time lookahead vs simulation transport)
 *   - Lower Deck (45%): Centralized tabbed telemetry/interlock/studio + hydrograph
 */

import {
  AlertTriangle,
  Clock,
  Radio,
  Sliders,
  Terminal,
  Waves,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { WetlandSceneCanvas } from './components/3d/WetlandSceneCanvas';
import { CentralCommandDeck } from './components/dashboard/CentralCommandDeck';
import { SimulationPlayerBar } from './components/dashboard/SimulationPlayerBar';
import { SwaggerConsoleModal } from './components/dashboard/SwaggerConsoleModal';
import {
  BBR_LATITUDE,
  BBR_LONGITUDE,
  WETLAND_AREA_M2,
} from './constants/hydrologyConstants';
import { useSimulationStore } from './store/simulationStore';
import { formatClockWithSeconds, formatFullDate } from './utils/timeFormat';

export default function App() {
  const state = useSimulationStore();
  const { activeScenario, appMode, scenarioError } = state;

  // Live wall-clock ticker for header display
  const [wallNowMs, setWallNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setWallNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-surface-950 font-sans text-slate-100 lg:h-screen lg:overflow-hidden">
      {/* Top Command Center Header */}
      <header className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 bg-slate-900/95 px-4 py-2 backdrop-blur">
        {/* Left: Branding & Coordinates */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25">
            <Waves className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white sm:text-base">
                Bandar Bukit Raja (BBR) 智慧防洪与湿地数字孪生管控中心
              </h1>
              <span className="hidden rounded-full border border-cyan-700/70 bg-cyan-950/80 px-2 py-0.5 font-mono text-[10px] text-cyan-300 sm:inline-block">
                125-Acre Digital Twin
              </span>
            </div>
            <p className="font-mono text-[10px] text-slate-400">
              坐标: {BBR_LATITUDE}°N, {BBR_LONGITUDE}°E (巴生 Klang) · 面积:{' '}
              {Math.round(WETLAND_AREA_M2).toLocaleString()} m² · 当前源:{' '}
              <span className="text-cyan-300">{activeScenario.scenarioName}</span>
            </p>
          </div>
        </div>

        {/* Center: Decoupled Operational Mode Switcher */}
        <div className="flex items-center rounded-xl border border-slate-700/80 bg-slate-950 p-1 text-xs shadow-inner">
          <button
            type="button"
            onClick={() => state.setAppMode('LIVE')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all ${
              appMode === 'LIVE'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Radio
              className={`h-3.5 w-3.5 ${
                appMode === 'LIVE' ? 'animate-pulse text-emerald-200' : ''
              }`}
            />
            真实运营模式 (Live Real-Time)
          </button>

          <button
            type="button"
            onClick={() => state.setAppMode('SIMULATION')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all ${
              appMode === 'SIMULATION'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            自定义模拟模式 (API Studio)
          </button>
        </div>

        {/* Right: Real-Time Malaysia Clock & Swagger API Console Button */}
        <div className="flex items-center gap-2.5">
          <div className="hidden items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-1.5 font-mono text-xs text-slate-300 xl:flex">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            <span>{formatFullDate(wallNowMs)}</span>
            <span className="font-bold text-cyan-300">
              {formatClockWithSeconds(wallNowMs)}
            </span>
            <span className="text-[10px] text-slate-500">MYT</span>
          </div>

          <button
            type="button"
            onClick={() => state.setSwaggerModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-purple-500/60 bg-purple-950/75 px-3 py-1.5 text-xs font-bold text-purple-200 shadow-lg transition hover:bg-purple-900/80"
          >
            <Terminal className="h-3.5 w-3.5" />
            Swagger / API 数据注入
          </button>
        </div>
      </header>

      {/* Main Command Center Workspace (Top 3D Hero + Middle Scrubber + Bottom Command Deck) */}
      <main className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col gap-2.5 px-3.5 py-2.5">
        {/* Error Alert Banner */}
        {scenarioError && (
          <div className="flex shrink-0 items-center justify-between rounded-xl border border-red-700 bg-red-950/80 px-4 py-1.5 text-xs text-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span>{scenarioError}</span>
            </div>
            <button
              type="button"
              onClick={state.clearError}
              className="rounded p-1 text-red-300 hover:bg-red-900/50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Row 1: Upper Full-Width 3D Digital Twin Viewport (~55% height) */}
        <div className="min-h-[300px] w-full flex-[55]">
          <WetlandSceneCanvas />
        </div>

        {/* Row 2: Mode-Adaptive Timeline Scrubber Strip */}
        <div className="shrink-0">
          <SimulationPlayerBar />
        </div>

        {/* Row 3: Lower Centralized Command Deck (~45% height) */}
        <div className="flex min-h-[240px] flex-[45] flex-col">
          <CentralCommandDeck />
        </div>
      </main>

      {/* Swagger / OpenAPI Custom Scenario Modal */}
      <SwaggerConsoleModal />
    </div>
  );
}

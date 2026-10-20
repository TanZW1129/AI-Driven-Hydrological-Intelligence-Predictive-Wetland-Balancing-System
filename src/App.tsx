/**
 * @file App.tsx
 * @description Bandar Bukit Raja (BBR) 125-Acre Smart Wetland & Flood Mitigation
 * Digital Twin Command Center Dashboard (Task 4).
 */

import {
  AlertTriangle,
  CloudLightning,
  CloudRain,
  RefreshCw,
  Sun,
  Terminal,
  Waves,
  Wind,
  X,
} from 'lucide-react';
import { WetlandSceneCanvas } from './components/3d/WetlandSceneCanvas';
import { HydrographChart } from './components/dashboard/HydrographChart';
import { SimulationPlayerBar } from './components/dashboard/SimulationPlayerBar';
import { SwaggerConsoleModal } from './components/dashboard/SwaggerConsoleModal';
import { TelemetryDiagnostic } from './components/dashboard/TelemetryDiagnostic';
import { TopKpiBar } from './components/dashboard/TopKpiBar';
import {
  BBR_LATITUDE,
  BBR_LONGITUDE,
  WETLAND_AREA_M2,
} from './constants/hydrologyConstants';
import { useSimulationStore } from './store/simulationStore';

export default function App() {
  const state = useSimulationStore();
  const { activeScenario, isLoadingScenario, scenarioError } = state;

  return (
    <div className="flex min-h-screen flex-col bg-surface-950 font-sans text-slate-100">
      {/* Top Command Center Header */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 bg-slate-900/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25">
            <Waves className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">
                Bandar Bukit Raja (BBR) 智慧防洪与湿地数字孪生管控中心
              </h1>
              <span className="rounded-full border border-cyan-700/70 bg-cyan-950/80 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
                125-Acre Digital Twin
              </span>
            </div>
            <p className="font-mono text-[11px] text-slate-400">
              坐标: {BBR_LATITUDE}°N, {BBR_LONGITUDE}°E (巴生 Klang) · 湿地面积:{' '}
              {Math.round(WETLAND_AREA_M2).toLocaleString()} m² · 当前源:{' '}
              <span className="text-cyan-300">{activeScenario.scenarioName}</span>
            </p>
          </div>
        </div>

        {/* Scenario Switcher & Swagger Console Trigger */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/90 p-1 text-xs">
            <button
              type="button"
              onClick={() => state.selectPresetScenario('SCENARIO_CLEAR_DAY')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition ${
                activeScenario.scenarioId === 'SCENARIO_CLEAR_DAY'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Sun className="h-3.5 w-3.5" /> 常态晴天
            </button>

            <button
              type="button"
              onClick={() => state.selectPresetScenario('SCENARIO_PRE_STORM')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition ${
                activeScenario.scenarioId === 'SCENARIO_PRE_STORM'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <CloudRain className="h-3.5 w-3.5" /> 4h后特大暴雨预警
            </button>

            <button
              type="button"
              onClick={() =>
                state.selectPresetScenario('SCENARIO_FLASH_FLOOD_HIGH_TIDE')
              }
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition ${
                activeScenario.scenarioId === 'SCENARIO_FLASH_FLOOD_HIGH_TIDE'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <CloudLightning className="h-3.5 w-3.5" /> 百年暴雨+高潮顶托
            </button>

            <button
              type="button"
              onClick={() => void state.selectLiveWeather()}
              disabled={isLoadingScenario}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition ${
                activeScenario.sourceType === 'LIVE_API'
                  ? 'bg-teal-600 text-white shadow'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {isLoadingScenario ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wind className="h-3.5 w-3.5" />
              )}
              Open-Meteo 实时天气
            </button>
          </div>

          <button
            type="button"
            onClick={() => state.setSwaggerModalOpen(true)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-lg transition ${
              activeScenario.sourceType === 'CUSTOM_SWAGGER'
                ? 'border-purple-400 bg-purple-600 text-white shadow-purple-600/30'
                : 'border-purple-500/60 bg-purple-950/70 text-purple-200 hover:bg-purple-900/80'
            }`}
          >
            <Terminal className="h-4 w-4" />
            Swagger / 自定义 API 注入
          </button>
        </div>
      </header>

      {/* Main Command Center Workspace */}
      <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-3.5 p-4">
        {/* Error Alert Banner */}
        {scenarioError && (
          <div className="flex items-center justify-between rounded-xl border border-red-700 bg-red-950/80 px-4 py-2.5 text-xs text-red-200">
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

        {/* Row 1: Top 5 KPI Cards */}
        <TopKpiBar />

        {/* Row 2: Central 3D Digital Twin + Right Analytics & Control Column */}
        <div className="grid flex-1 grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Center 3D Viewport (7 columns on desktop) */}
          <div className="flex flex-col lg:col-span-7">
            <WetlandSceneCanvas />
          </div>

          {/* Right Column: Hydrograph Chart + Telemetry & Interlock Workbench (5 columns) */}
          <div className="flex flex-col gap-3.5 lg:col-span-5">
            <HydrographChart />
            <TelemetryDiagnostic />
          </div>
        </div>

        {/* Row 3: Bottom Timeline Transport Bar */}
        <SimulationPlayerBar />
      </main>

      {/* Swagger / OpenAPI Custom Scenario Modal */}
      <SwaggerConsoleModal />
    </div>
  );
}

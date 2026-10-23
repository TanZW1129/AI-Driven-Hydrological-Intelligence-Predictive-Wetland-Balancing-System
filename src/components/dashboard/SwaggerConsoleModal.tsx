/**
 * @file SwaggerConsoleModal.tsx
 * @description Interactive Swagger / OpenAPI 3.0 Custom Scenario Console.
 * Supports:
 *   - Mode A: Raw JSON payload editor with Zod schema validation & path diagnostics
 *   - Mode B: Visual parametric storm & tidal builder (sliders)
 *   - Mode C: Remote HTTP(S) custom JSON endpoint ingestion & OpenAPI 3.0 schema viewer
 */

import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FileJson,
  Globe,
  Play,
  Sliders,
  Terminal,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  SAMPLE_CUSTOM_SWAGGER_PAYLOAD,
  SAMPLE_PARAMETRIC_PAYLOAD,
  WEATHER_OPENAPI_SPEC,
} from '../../services/weather/openApiSpec';
import { ScenarioValidationError } from '../../services/weather/scenarioValidator';
import type { StormProfileShape } from '../../services/weather/weatherTypes';
import { useSimulationStore } from '../../store/simulationStore';

type ConsoleTab = 'RAW_JSON' | 'PARAMETRIC' | 'REMOTE_OPENAPI';

export function SwaggerConsoleModal() {
  const state = useSimulationStore();
  const [tab, setTab] = useState<ConsoleTab>('RAW_JSON');

  // Mode A state
  const [jsonText, setJsonText] = useState<string>(
    JSON.stringify(SAMPLE_CUSTOM_SWAGGER_PAYLOAD, null, 2),
  );

  // Mode B state
  const [paramScenarioName, setParamScenarioName] = useState<string>(
    SAMPLE_PARAMETRIC_PAYLOAD.scenarioName ?? 'Custom Parametric Storm',
  );
  const [stormStartHour, setStormStartHour] = useState<number>(3);
  const [stormDurationHours, setStormDurationHours] = useState<number>(4);
  const [peakRainMmPerHr, setPeakRainMmPerHr] = useState<number>(90);
  const [stormProfile, setStormProfile] = useState<StormProfileShape>('TRIANGULAR');
  const [initialSoil, setInitialSoil] = useState<number>(0.5);
  const [tideMeanM, setTideMeanM] = useState<number>(1.3);
  const [tideSurgePeakM, setTideSurgePeakM] = useState<number>(0.0);

  // Mode C state
  const [customUrl, setCustomUrl] = useState<string>(
    'https://api.example.com/bbr/custom-scenario.json',
  );

  // Validation feedback
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [errorIssues, setErrorIssues] = useState<Array<{ path: string; message: string }>>([]);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  if (!state.isSwaggerModalOpen) return null;

  const clearFeedback = () => {
    setErrorBanner(null);
    setErrorIssues([]);
    setSuccessBanner(null);
  };

  const handleInjectRawJson = () => {
    clearFeedback();
    try {
      state.applyCustomJsonScenario(jsonText);
      setSuccessBanner('OpenAPI 3.0 validation passed! Successfully injected into 3D digital twin sandbox.');
    } catch (err) {
      if (err instanceof ScenarioValidationError) {
        setErrorBanner(`[${err.code}] ${err.message}`);
        setErrorIssues(err.issues);
      } else {
        setErrorBanner((err as Error).message);
      }
    }
  };

  const handleBuildParametric = () => {
    clearFeedback();
    try {
      state.applyParametricScenario({
        scenarioId: 'CUSTOM_PARAMETRIC_BUILD',
        scenarioName: paramScenarioName,
        horizonHours: 24,
        initialSoilSaturation: initialSoil,
        storm: {
          startHour: stormStartHour,
          durationHours: stormDurationHours,
          peakIntensityMmPerHr: peakRainMmPerHr,
          profile: stormProfile,
        },
        recessionTail: {
          intensityMmPerHr: 5,
          durationHours: 2,
        },
        tide: {
          meanLevelM: tideMeanM,
          amplitudeM: 0.3,
          highWaterHourOffset: stormStartHour + 1,
          ...(tideSurgePeakM > 0
            ? {
                surge: {
                  peakM: tideSurgePeakM,
                  centerHour: stormStartHour + 1,
                  durationHours: 6,
                },
              }
            : {}),
        },
      });
    } catch (err) {
      if (err instanceof ScenarioValidationError) {
        setErrorBanner(`[${err.code}] ${err.message}`);
        setErrorIssues(err.issues);
      } else {
        setErrorBanner((err as Error).message);
      }
    }
  };

  const handleFetchRemoteUrl = async () => {
    clearFeedback();
    try {
      await state.applyCustomUrlScenario(customUrl);
    } catch (err) {
      if (err instanceof ScenarioValidationError) {
        setErrorBanner(`[${err.code}] ${err.message}`);
        setErrorIssues(err.issues);
      } else {
        setErrorBanner((err as Error).message);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-600/20 p-2 text-purple-400 border border-purple-500/40">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Swagger / OpenAPI 3.0 Scenario Injection Console
                </h2>
                <span className="rounded bg-emerald-950 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-800">
                  OAS {WEATHER_OPENAPI_SPEC.openapi}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Inject custom JSON payloads or configure storm parameters to drive 3D digital twin simulation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => state.setSwaggerModalOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Sub-navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-6 pt-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              clearFeedback();
              setTab('RAW_JSON');
            }}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 transition ${
              tab === 'RAW_JSON'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <FileJson className="h-4 w-4" /> Mode A · Raw JSON Payload (Swagger Body)
          </button>

          <button
            type="button"
            onClick={() => {
              clearFeedback();
              setTab('PARAMETRIC');
            }}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 transition ${
              tab === 'PARAMETRIC'
                ? 'border-cyan-500 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="h-4 w-4" /> Mode B · Parametric Storm &amp; Tidal Builder
          </button>

          <button
            type="button"
            onClick={() => {
              clearFeedback();
              setTab('REMOTE_OPENAPI');
            }}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 transition ${
              tab === 'REMOTE_OPENAPI'
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Code2 className="h-4 w-4" /> OpenAPI 3.0 Contract &amp; Remote Endpoint
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Error / Validation Banner */}
          {errorBanner && (
            <div className="rounded-xl border border-red-700 bg-red-950/80 p-3.5 text-xs text-red-200">
              <div className="flex items-center gap-2 font-bold text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Schema Validation Blocked (Fail-Safe): {errorBanner}</span>
              </div>
              {errorIssues.length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-1 font-mono text-[11px] text-red-300">
                  {errorIssues.map((iss, idx) => (
                    <li key={idx}>
                      <strong>{iss.path}</strong>: {iss.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {successBanner && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/80 p-3 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{successBanner}</span>
            </div>
          )}

          {/* TAB 1: Mode A Raw JSON */}
          {tab === 'RAW_JSON' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono text-slate-300">
                  POST <strong className="text-purple-400">/api/v1/scenarios/custom/json</strong> — conforms to{' '}
                  <code>CustomScenarioInput</code> contract
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      clearFeedback();
                      setJsonText(JSON.stringify(SAMPLE_CUSTOM_SWAGGER_PAYLOAD, null, 2));
                    }}
                    className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                  >
                    Load Sample: Monsoon Storm + Tidal Surge
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearFeedback();
                      setJsonText(
                        JSON.stringify(
                          {
                            scenarioId: 'INVALID_DEMO',
                            scenarioName: 'Negative Rain Fail-Safe Demo',
                            hourlySeries: [{ hourOffset: 0, precipitationMmPerHr: -25 }],
                          },
                          null,
                          2,
                        ),
                      );
                    }}
                    className="rounded border border-red-800/70 bg-red-950/40 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-900/50"
                  >
                    Test Invalid Payload (Negative Rain)
                  </button>
                </div>
              </div>

              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={14}
                spellCheck={false}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 font-mono text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Note: <code>soilSaturation</code>, <code>downstreamLevelM</code>, and <code>timeIso</code> are automatically derived by hydrology &amp; tidal models if omitted.
                </span>
                <button
                  type="button"
                  onClick={handleInjectRawJson}
                  className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-600/30 transition hover:bg-purple-500"
                >
                  <Play className="h-4 w-4" /> Execute · Validate &amp; Inject
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Mode B Parametric Builder */}
          {tab === 'PARAMETRIC' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Custom Scenario Name</label>
                  <input
                    type="text"
                    value={paramScenarioName}
                    onChange={(e) => setParamScenarioName(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Storm Hyetograph Profile</label>
                  <select
                    value={stormProfile}
                    onChange={(e) => setStormProfile(e.target.value as StormProfileShape)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                  >
                    <option value="TRIANGULAR">TRIANGULAR (Single Peak)</option>
                    <option value="BLOCK">BLOCK (Uniform Sustained Storm)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Storm Start Hour (Pre-discharge Window)</span>
                    <span className="font-mono font-bold text-cyan-300">T+{stormStartHour} h</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={1}
                    value={stormStartHour}
                    onChange={(e) => setStormStartHour(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Storm Duration</span>
                    <span className="font-mono font-bold text-cyan-300">{stormDurationHours} hours</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={stormDurationHours}
                    onChange={(e) => setStormDurationHours(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Peak Rainfall Intensity (i_peak)</span>
                    <span className="font-mono font-bold text-amber-300">{peakRainMmPerHr} mm/h</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={160}
                    step={5}
                    value={peakRainMmPerHr}
                    onChange={(e) => setPeakRainMmPerHr(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Initial Soil Saturation (S_0)</span>
                    <span className="font-mono font-bold text-sky-300">
                      {(initialSoil * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={initialSoil}
                    onChange={(e) => setInitialSoil(Number(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Downstream Mean Tidal Level</span>
                    <span className="font-mono font-bold text-amber-300">{tideMeanM.toFixed(2)} m</span>
                  </div>
                  <input
                    type="range"
                    min={0.7}
                    max={2.2}
                    step={0.1}
                    value={tideMeanM}
                    onChange={(e) => setTideMeanM(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Peak Storm Surge Amplitude</span>
                    <span className="font-mono font-bold text-red-400">+{tideSurgePeakM.toFixed(2)} m</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.2}
                    step={0.1}
                    value={tideSurgePeakM}
                    onChange={(e) => setTideSurgePeakM(Number(e.target.value))}
                    className="w-full accent-red-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleBuildParametric}
                  className="flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-600/30 transition hover:bg-cyan-500"
                >
                  <Play className="h-4 w-4" /> Synthesize 24h Series &amp; Simulate
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Remote URL & OpenAPI 3.0 Spec */}
          {tab === 'REMOTE_OPENAPI' && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                  <Globe className="h-4 w-4" /> Ingest Scenario JSON from Remote HTTP(S) Endpoint
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={handleFetchRemoteUrl}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    Fetch &amp; Validate
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-300">
                  OpenAPI 3.0.3 Contract Specification (WEATHER_OPENAPI_SPEC)
                </div>
                <pre className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-[11px] text-slate-300">
                  {JSON.stringify(WEATHER_OPENAPI_SPEC, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

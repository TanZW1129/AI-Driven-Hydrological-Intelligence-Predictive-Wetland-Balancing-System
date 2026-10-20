/**
 * @file openApiSpec.ts
 * @description OpenAPI 3.0.3 specification for the BBR Smart Wetland weather
 * ingestion and custom scenario injection contracts. Exposed as a typed
 * object so the dashboard's Swagger-style console can render schemas, field
 * constraints and ready-to-edit example payloads directly.
 */

import {
  DEFAULT_SIMULATION_HORIZON_HOURS,
  DOWNSTREAM_LEVEL_MAX_M,
  DOWNSTREAM_LEVEL_MIN_M,
  MAX_PLAUSIBLE_RAINFALL_MM_PER_HR,
  MAX_SCENARIO_HORIZON_HOURS,
  TEMPERATURE_MAX_C,
  TEMPERATURE_MIN_C,
} from '../../constants/weatherConstants';
import { PRESET_SCENARIO_IDS, type CustomScenarioInput, type ParametricScenarioInput } from './weatherTypes';

/** Sample Mode-A (raw JSON) payload that operators can edit in the console. */
export const SAMPLE_CUSTOM_SWAGGER_PAYLOAD: CustomScenarioInput = {
  scenarioId: 'CUSTOM_MONSOON_BURST',
  scenarioName: 'Custom Monsoon Cloudburst + Rising Tide',
  description: 'User-injected 12 h scenario testing pre-discharge followed by a tidal surge.',
  initialSoilSaturation: 0.45,
  hourlySeries: [
    { hourOffset: 0, precipitationMmPerHr: 0, downstreamLevelM: 1.3 },
    { hourOffset: 1, precipitationMmPerHr: 0, downstreamLevelM: 1.35 },
    { hourOffset: 2, precipitationMmPerHr: 5, downstreamLevelM: 1.45 },
    { hourOffset: 3, precipitationMmPerHr: 45, downstreamLevelM: 1.7 },
    { hourOffset: 4, precipitationMmPerHr: 85, downstreamLevelM: 2.1 },
    { hourOffset: 5, precipitationMmPerHr: 95, downstreamLevelM: 2.6 },
    { hourOffset: 6, precipitationMmPerHr: 60, downstreamLevelM: 2.55 },
    { hourOffset: 7, precipitationMmPerHr: 20, downstreamLevelM: 2.3 },
    { hourOffset: 8, precipitationMmPerHr: 5, downstreamLevelM: 1.9 },
    { hourOffset: 9, precipitationMmPerHr: 0, downstreamLevelM: 1.6 },
    { hourOffset: 10, precipitationMmPerHr: 0, downstreamLevelM: 1.4 },
    { hourOffset: 11, precipitationMmPerHr: 0, downstreamLevelM: 1.3 },
  ],
};

/** Sample Mode-B (parametric visual builder) payload. */
export const SAMPLE_PARAMETRIC_PAYLOAD: ParametricScenarioInput = {
  scenarioId: 'CUSTOM_PARAMETRIC_STORM',
  scenarioName: 'Parametric 90 mm/h Storm @ +3h',
  horizonHours: DEFAULT_SIMULATION_HORIZON_HOURS,
  initialSoilSaturation: 0.5,
  storm: {
    startHour: 3,
    durationHours: 4,
    peakIntensityMmPerHr: 90,
    profile: 'TRIANGULAR',
  },
  recessionTail: {
    intensityMmPerHr: 6,
    durationHours: 2,
  },
  tide: {
    meanLevelM: 1.45,
    amplitudeM: 0.35,
    highWaterHourOffset: 5,
  },
};

export const WEATHER_OPENAPI_SPEC = Object.freeze({
  openapi: '3.0.3',
  info: {
    title: 'BBR Smart Wetland — Weather & Scenario Ingestion API',
    version: '1.0.0',
    description:
      'Enterprise data contract for feeding live Open-Meteo forecasts, preset flood benchmarks ' +
      'and user-authored custom scenarios into the Bandar Bukit Raja (BBR) wetland digital twin.',
  },
  paths: {
    '/api/v1/scenarios/live': {
      get: {
        operationId: 'loadLiveWeather',
        summary: 'Fetch live 24 h forecast for Bandar Bukit Raja from Open-Meteo',
        responses: {
          '200': {
            description: 'Normalized 24 h scenario payload',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WeatherScenarioPayload' },
              },
            },
          },
        },
      },
    },
    '/api/v1/scenarios/preset/{scenarioId}': {
      get: {
        operationId: 'loadPresetScenario',
        summary: 'Load a built-in extreme benchmark scenario',
        parameters: [
          {
            name: 'scenarioId',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: [...PRESET_SCENARIO_IDS] },
          },
        ],
        responses: {
          '200': {
            description: 'Normalized preset scenario payload',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WeatherScenarioPayload' },
              },
            },
          },
        },
      },
    },
    '/api/v1/scenarios/custom/json': {
      post: {
        operationId: 'injectCustomScenario',
        summary: 'Mode A — Validate and inject a raw hourly scenario JSON payload',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CustomScenarioInput' },
              example: SAMPLE_CUSTOM_SWAGGER_PAYLOAD,
            },
          },
        },
        responses: {
          '200': {
            description: 'Validated and normalized custom scenario',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WeatherScenarioPayload' },
              },
            },
          },
          '422': {
            description: 'Schema validation error with field-level issues',
          },
        },
      },
    },
    '/api/v1/scenarios/custom/parametric': {
      post: {
        operationId: 'buildParametricScenario',
        summary: 'Mode B — Synthesize a scenario from storm & tidal parameters',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ParametricScenarioInput' },
              example: SAMPLE_PARAMETRIC_PAYLOAD,
            },
          },
        },
        responses: {
          '200': {
            description: 'Synthesized scenario payload',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WeatherScenarioPayload' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      CustomHourlyPointInput: {
        type: 'object',
        required: ['hourOffset', 'precipitationMmPerHr'],
        additionalProperties: false,
        properties: {
          hourOffset: { type: 'integer', minimum: 0 },
          timeIso: { type: 'string', format: 'date-time' },
          precipitationMmPerHr: {
            type: 'number',
            minimum: 0,
            maximum: MAX_PLAUSIBLE_RAINFALL_MM_PER_HR,
            description: 'Hourly rainfall intensity i (mm/h)',
          },
          soilSaturation: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Optional soil saturation S in [0, 1]; derived if omitted',
          },
          downstreamLevelM: {
            type: 'number',
            minimum: DOWNSTREAM_LEVEL_MIN_M,
            maximum: DOWNSTREAM_LEVEL_MAX_M,
            description: 'Optional downstream Klang river / tidal level (m); derived if omitted',
          },
          temperatureC: { type: 'number', minimum: TEMPERATURE_MIN_C, maximum: TEMPERATURE_MAX_C },
          precipitationProbabilityPct: { type: 'number', minimum: 0, maximum: 100 },
          weatherDescription: { type: 'string', maxLength: 120 },
        },
      },
      CustomScenarioInput: {
        type: 'object',
        required: ['scenarioId', 'scenarioName', 'hourlySeries'],
        additionalProperties: false,
        properties: {
          scenarioId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
          scenarioName: { type: 'string', minLength: 1, maxLength: 120 },
          description: { type: 'string', maxLength: 500 },
          startTimeIso: { type: 'string', format: 'date-time' },
          initialSoilSaturation: { type: 'number', minimum: 0, maximum: 1 },
          hourlySeries: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_SCENARIO_HORIZON_HOURS,
            items: { $ref: '#/components/schemas/CustomHourlyPointInput' },
          },
        },
      },
      ParametricScenarioInput: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scenarioId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
          scenarioName: { type: 'string', minLength: 1, maxLength: 120 },
          description: { type: 'string', maxLength: 500 },
          horizonHours: {
            type: 'integer',
            minimum: 1,
            maximum: MAX_SCENARIO_HORIZON_HOURS,
            default: DEFAULT_SIMULATION_HORIZON_HOURS,
          },
          initialSoilSaturation: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      WeatherScenarioPayload: {
        type: 'object',
        required: ['scenarioId', 'scenarioName', 'sourceType', 'createdAt', 'hourlySeries', 'metadata'],
      },
    },
  },
});

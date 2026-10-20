/**
 * @file scenarioValidator.ts
 * @description Runtime schema validation (Zod) for every externally supplied
 * scenario payload: Swagger / OpenAPI custom JSON (Mode A) and the visual
 * parametric builder (Mode B). Invalid data is rejected with path-level
 * diagnostics and never reaches the simulation.
 */

import { z } from 'zod';
import {
  DOWNSTREAM_LEVEL_MAX_M,
  DOWNSTREAM_LEVEL_MIN_M,
  M2_TIDAL_PERIOD_HOURS,
  MAX_PLAUSIBLE_RAINFALL_MM_PER_HR,
  MAX_SCENARIO_HORIZON_HOURS,
  DEFAULT_SIMULATION_HORIZON_HOURS,
  TEMPERATURE_MAX_C,
  TEMPERATURE_MIN_C,
} from '../../constants/weatherConstants';
import type { CustomScenarioInput, ParametricScenarioInput, ValidationIssue } from './weatherTypes';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type ScenarioErrorCode = 'JSON_SYNTAX' | 'SCHEMA_VIOLATION' | 'UNSUPPORTED_URL' | 'FETCH_FAILED';

export class ScenarioValidationError extends Error {
  readonly code: ScenarioErrorCode;
  readonly issues: ValidationIssue[];

  constructor(code: ScenarioErrorCode, message: string, issues: ValidationIssue[] = [], options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ScenarioValidationError';
    this.code = code;
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const scenarioIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'must be 1–64 characters of letters, digits, "_" or "-"');

const isoDateTimeSchema = z.string().datetime({ offset: true, message: 'must be an ISO 8601 date-time' });

const rainfallSchema = z.number().finite().min(0).max(MAX_PLAUSIBLE_RAINFALL_MM_PER_HR);

const saturationSchema = z.number().finite().min(0).max(1);

const downstreamLevelSchema = z.number().finite().min(DOWNSTREAM_LEVEL_MIN_M).max(DOWNSTREAM_LEVEL_MAX_M);

// ---------------------------------------------------------------------------
// Mode A — Custom Swagger / OpenAPI JSON payload
// ---------------------------------------------------------------------------

export const customHourlyPointSchema = z
  .object({
    hourOffset: z.number().int().min(0),
    timeIso: isoDateTimeSchema.optional(),
    precipitationMmPerHr: rainfallSchema,
    soilSaturation: saturationSchema.optional(),
    downstreamLevelM: downstreamLevelSchema.optional(),
    temperatureC: z.number().finite().min(TEMPERATURE_MIN_C).max(TEMPERATURE_MAX_C).optional(),
    precipitationProbabilityPct: z.number().finite().min(0).max(100).optional(),
    weatherDescription: z.string().max(120).optional(),
  })
  .strict();

export const customScenarioSchema = z
  .object({
    scenarioId: scenarioIdSchema,
    scenarioName: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    startTimeIso: isoDateTimeSchema.optional(),
    initialSoilSaturation: saturationSchema.optional(),
    hourlySeries: z.array(customHourlyPointSchema).min(1).max(MAX_SCENARIO_HORIZON_HOURS),
    // Accepted (and ignored) so an exported payload can be edited and re-injected.
    sourceType: z.string().optional(),
    createdAt: z.string().optional(),
    metadata: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const firstGap = value.hourlySeries.findIndex((point, index) => point.hourOffset !== index);
    if (firstGap >= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hourlySeries', firstGap, 'hourOffset'],
        message: `hourOffset must be contiguous starting at 0 (expected ${firstGap}).`,
      });
    }
  });

// ---------------------------------------------------------------------------
// Mode B — Parametric visual builder
// ---------------------------------------------------------------------------

export const parametricScenarioSchema = z
  .object({
    scenarioId: scenarioIdSchema.optional(),
    scenarioName: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    horizonHours: z.number().int().min(1).max(MAX_SCENARIO_HORIZON_HOURS).default(DEFAULT_SIMULATION_HORIZON_HOURS),
    startTimeIso: isoDateTimeSchema.optional(),
    initialSoilSaturation: saturationSchema.optional(),
    storm: z
      .object({
        startHour: z.number().int().min(0),
        durationHours: z.number().int().min(1),
        peakIntensityMmPerHr: rainfallSchema,
        profile: z.enum(['BLOCK', 'TRIANGULAR']).default('BLOCK'),
      })
      .strict()
      .optional(),
    recessionTail: z
      .object({
        intensityMmPerHr: rainfallSchema,
        durationHours: z.number().int().min(1),
      })
      .strict()
      .optional(),
    tide: z
      .object({
        meanLevelM: downstreamLevelSchema,
        amplitudeM: z.number().finite().min(0).max(3),
        periodHours: z.number().finite().positive().default(M2_TIDAL_PERIOD_HOURS),
        highWaterHourOffset: z.number().finite().default(0),
        surge: z
          .object({
            peakM: z.number().finite().min(0).max(5),
            centerHour: z.number().finite(),
            durationHours: z.number().finite().positive(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.storm && value.storm.startHour >= value.horizonHours) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storm', 'startHour'],
        message: `storm.startHour must be < horizonHours (${value.horizonHours}).`,
      });
    }
  });

export type ValidatedCustomScenario = z.output<typeof customScenarioSchema>;
export type ValidatedParametricScenario = z.output<typeof parametricScenarioSchema>;

// Compile-time guards: validated output must satisfy the public contracts.
type AssertAssignable<Target, Source extends Target> = Source;
export type CustomContractGuard = AssertAssignable<CustomScenarioInput, ValidatedCustomScenario>;
export type ParametricContractGuard = AssertAssignable<ParametricScenarioInput, ValidatedParametricScenario>;

// ---------------------------------------------------------------------------
// Validation entry points
// ---------------------------------------------------------------------------

function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

function formatIssueSummary(issues: ValidationIssue[]): string {
  const preview = issues
    .slice(0, 3)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join('; ');
  const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : '';
  return `${preview}${more}`;
}

/** Parse a raw JSON string, or pass objects through unchanged. */
export function parseJsonInput(input: unknown): unknown {
  if (typeof input !== 'string') {
    return input;
  }
  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    throw new ScenarioValidationError(
      'JSON_SYNTAX',
      `Custom scenario is not valid JSON: ${(error as Error).message}`,
      [{ path: '(root)', message: (error as Error).message }],
      { cause: error },
    );
  }
}

export function validateCustomScenario(input: unknown): ValidatedCustomScenario {
  const result = customScenarioSchema.safeParse(parseJsonInput(input));
  if (!result.success) {
    const issues = toIssues(result.error);
    throw new ScenarioValidationError('SCHEMA_VIOLATION', `Custom scenario rejected — ${formatIssueSummary(issues)}`, issues);
  }
  return result.data;
}

export function validateParametricScenario(input: unknown): ValidatedParametricScenario {
  const result = parametricScenarioSchema.safeParse(parseJsonInput(input));
  if (!result.success) {
    const issues = toIssues(result.error);
    throw new ScenarioValidationError('SCHEMA_VIOLATION', `Parametric scenario rejected — ${formatIssueSummary(issues)}`, issues);
  }
  return result.data;
}

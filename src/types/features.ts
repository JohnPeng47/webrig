/**
 * Feature flag types — runtime feature toggles and model definitions.
 *
 * Permission modes retained for type compatibility but not enforced
 * in headless build (all actions auto-allowed).
 */

// ── Permission modes ──────────────────────────────────────────────

export type PermissionMode = 'allowlist' | 'auto' | 'supervised';

// ── Feature flag definitions ──────────────────────────────────────

export interface FeatureFlagDefinition {
  id: string;
  label: string;
  description: string;
  defaultValue: boolean;
  category?: FeatureFlagCategory;
}

export type FeatureFlagCategory =
  | 'debug'
  | 'experimental'
  | 'api'
  | 'ui'
  | 'permissions';

export const FEATURE_FLAGS: readonly FeatureFlagDefinition[] = [
  {
    id: 'debugMode',
    label: 'Debug mode',
    description: 'Enable verbose console logging.',
    defaultValue: false,
    category: 'debug',
  },
  {
    id: 'useSessionsAPI',
    label: 'Use Sessions API',
    description: 'Route conversations through the Anthropic Sessions API.',
    defaultValue: false,
    category: 'api',
  },
] as const;

// ── Model definitions ─────────────────────────────────────────────

export interface ModelDefinition {
  id: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsThinking?: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
}

export const AVAILABLE_MODELS: readonly ModelDefinition[] = [
  {
    id: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'claude-opus-4-20250514',
    displayName: 'Claude Opus 4',
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'claude-haiku-3-5-20241022',
    displayName: 'Claude 3.5 Haiku',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    supportsThinking: false,
    supportsTools: true,
    supportsVision: true,
  },
] as const;

export const DEFAULT_MODEL_ID = 'claude-sonnet-4-20250514';

export interface UpdateInfo {
  version: string;
  url: string;
  releaseNotes?: string;
}

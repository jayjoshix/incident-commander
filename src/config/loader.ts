/**
 * LineageLock Configuration Loader
 *
 * Loads and merges config from .lineagelock.json, env vars, and defaults.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LineageLockConfig, DEFAULT_CONFIG, ThresholdConfig } from './types';

/**
 * Deep-merge two objects. `override` values win over `base`.
 */
function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const val = override[key];
    if (val !== undefined && val !== null) {
      if (
        typeof val === 'object' &&
        !Array.isArray(val) &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key] as any, val as any);
      } else {
        result[key] = val as T[keyof T];
      }
    }
  }
  return result;
}

/**
 * Load configuration from file, env vars, and defaults.
 *
 * Priority: env vars > config file > defaults
 */
export function loadConfig(configPath?: string): LineageLockConfig {
  const resolvedPath = configPath
    || process.env.LINEAGELOCK_CONFIG_PATH
    || '.lineagelock.json';

  let fileConfig: Partial<LineageLockConfig> = {};

  const absolutePath = path.resolve(resolvedPath);
  if (fs.existsSync(absolutePath)) {
    try {
      const raw = fs.readFileSync(absolutePath, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch (err) {
      console.warn(`⚠️  Could not parse config file at ${absolutePath}: ${err}`);
    }
  }

  // Merge: defaults ← file config
  let config = deepMerge(DEFAULT_CONFIG, fileConfig);

  // Override thresholds from env vars
  const envThresholds: Partial<ThresholdConfig> = {};
  if (process.env.LINEAGELOCK_WARN_THRESHOLD) {
    envThresholds.warn = parseInt(process.env.LINEAGELOCK_WARN_THRESHOLD, 10);
  }
  if (process.env.LINEAGELOCK_FAIL_THRESHOLD) {
    envThresholds.fail = parseInt(process.env.LINEAGELOCK_FAIL_THRESHOLD, 10);
  }
  if (Object.keys(envThresholds).length > 0) {
    config = deepMerge(config, { thresholds: envThresholds } as Partial<LineageLockConfig>);
  }

  return config;
}

/**
 * Validate a loaded config for common errors.
 * Returns an array of warning messages.
 */
export function validateConfig(config: LineageLockConfig): string[] {
  const warnings: string[] = [];

  if (config.thresholds.warn >= config.thresholds.fail) {
    warnings.push(
      `Warn threshold (${config.thresholds.warn}) should be less than fail threshold (${config.thresholds.fail})`
    );
  }

  if (config.paths.sql.length === 0 && config.paths.yaml.length === 0) {
    warnings.push('No file path patterns configured — no files will be detected');
  }

  if (!config.naming.service) {
    warnings.push('No OpenMetadata service name configured in naming convention');
  }

  return warnings;
}

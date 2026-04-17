/**
 * Asset Resolver
 *
 * Maps changed file paths to OpenMetadata entity FQNs.
 * Supports explicit mappings and convention-based resolution.
 */

import * as path from 'path';
import { minimatch } from 'minimatch';
import { LineageLockConfig, AssetMapping, NamingConvention } from '../config/types';

export interface ResolutionResult {
  /** Original file path from the PR */
  filePath: string;
  /** Resolved OpenMetadata FQN, or null if unresolved */
  fqn: string | null;
  /** How the FQN was resolved */
  method: 'mapping' | 'convention' | 'unresolved';
  /** Which mapping pattern matched (if method === 'mapping') */
  matchedPattern?: string;
}

/**
 * Check whether a file path matches the configured data-model patterns.
 */
export function isDataModelFile(
  filePath: string,
  config: LineageLockConfig
): boolean {
  const allPatterns = [...config.paths.sql, ...config.paths.yaml];
  return allPatterns.some((pattern) => minimatch(filePath, pattern));
}

/**
 * Filter a list of changed files to only those matching data-model patterns.
 */
export function filterDataModelFiles(
  changedFiles: string[],
  config: LineageLockConfig
): string[] {
  return changedFiles.filter((f) => isDataModelFile(f, config));
}

/**
 * Resolve a single file path to an OpenMetadata FQN.
 *
 * Resolution order:
 * 1. Explicit mappings in config (first match wins)
 * 2. Convention-based using naming config
 */
export function resolveFileToFQN(
  filePath: string,
  config: LineageLockConfig
): ResolutionResult {
  // 1. Try explicit mappings
  if (config.mappings) {
    for (const mapping of config.mappings) {
      if (minimatch(filePath, mapping.filePattern)) {
        const entityName = deriveEntityName(filePath, config.naming);
        const fqn = mapping.fqn.replace('{name}', entityName);
        return {
          filePath,
          fqn,
          method: 'mapping',
          matchedPattern: mapping.filePattern,
        };
      }
    }
  }

  // 2. Convention-based resolution
  const entityName = deriveEntityName(filePath, config.naming);
  const { service, database, schema } = config.naming;
  const fqn = `${service}.${database}.${schema}.${entityName}`;

  return {
    filePath,
    fqn,
    method: 'convention',
  };
}

/**
 * Resolve multiple files at once.
 */
export function resolveFiles(
  changedFiles: string[],
  config: LineageLockConfig
): ResolutionResult[] {
  const dataModelFiles = filterDataModelFiles(changedFiles, config);
  return dataModelFiles.map((f) => resolveFileToFQN(f, config));
}

/**
 * Derive an entity name from a file path using the configured strategy.
 */
export function deriveEntityName(
  filePath: string,
  naming: NamingConvention
): string {
  const parsed = path.parse(filePath);

  let name: string;

  if (naming.nameStrategy === 'path') {
    // Use directory structure: models/staging/stg_orders.sql → staging.stg_orders
    const dir = parsed.dir;
    const parts = dir.split(path.sep).filter(Boolean);
    // Remove the first segment if it's a top-level folder like "models"
    const relevantParts = parts.length > 1 ? parts.slice(1) : parts;
    name = [...relevantParts, parsed.name].join('.');
  } else {
    // filename strategy: just use the basename
    name = parsed.name;
  }

  // Strip prefix if configured
  if (naming.stripPrefix && name.startsWith(naming.stripPrefix)) {
    name = name.slice(naming.stripPrefix.length);
  }

  return name;
}

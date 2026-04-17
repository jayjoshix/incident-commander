/**
 * Asset Resolver Tests
 */

import {
  isDataModelFile,
  filterDataModelFiles,
  resolveFileToFQN,
  resolveFiles,
  deriveEntityName,
} from '../../src/resolver/asset-resolver';
import { DEFAULT_CONFIG, LineageLockConfig } from '../../src/config/types';

describe('isDataModelFile', () => {
  it('should match SQL files in models/', () => {
    expect(isDataModelFile('models/fact_orders.sql', DEFAULT_CONFIG)).toBe(true);
    expect(isDataModelFile('models/staging/stg_payments.sql', DEFAULT_CONFIG)).toBe(true);
    expect(isDataModelFile('models/marts/core/fact_orders.sql', DEFAULT_CONFIG)).toBe(true);
  });

  it('should match YAML files in models/', () => {
    expect(isDataModelFile('models/schema.yml', DEFAULT_CONFIG)).toBe(true);
    expect(isDataModelFile('models/staging/schema.yaml', DEFAULT_CONFIG)).toBe(true);
  });

  it('should match SQL files in sql/', () => {
    expect(isDataModelFile('sql/migrations/001.sql', DEFAULT_CONFIG)).toBe(true);
  });

  it('should match YAML files in schemas/', () => {
    expect(isDataModelFile('schemas/orders.yml', DEFAULT_CONFIG)).toBe(true);
  });

  it('should NOT match non-data files', () => {
    expect(isDataModelFile('README.md', DEFAULT_CONFIG)).toBe(false);
    expect(isDataModelFile('package.json', DEFAULT_CONFIG)).toBe(false);
    expect(isDataModelFile('src/app.ts', DEFAULT_CONFIG)).toBe(false);
    expect(isDataModelFile('dbt_project.yml', DEFAULT_CONFIG)).toBe(false);
  });
});

describe('filterDataModelFiles', () => {
  it('should filter to only data model files', () => {
    const files = [
      'models/fact_orders.sql',
      'README.md',
      'models/schema.yml',
      'package.json',
      'src/index.ts',
    ];
    const result = filterDataModelFiles(files, DEFAULT_CONFIG);
    expect(result).toEqual(['models/fact_orders.sql', 'models/schema.yml']);
  });

  it('should return empty array when no data files', () => {
    const files = ['README.md', 'package.json'];
    const result = filterDataModelFiles(files, DEFAULT_CONFIG);
    expect(result).toEqual([]);
  });
});

describe('deriveEntityName', () => {
  it('should use filename strategy by default', () => {
    expect(deriveEntityName('models/fact_orders.sql', DEFAULT_CONFIG.naming)).toBe('fact_orders');
    expect(deriveEntityName('models/staging/stg_payments.sql', DEFAULT_CONFIG.naming)).toBe('stg_payments');
  });

  it('should use path strategy when configured', () => {
    const pathNaming = { ...DEFAULT_CONFIG.naming, nameStrategy: 'path' as const };
    expect(deriveEntityName('models/staging/stg_payments.sql', pathNaming)).toBe('staging.stg_payments');
    expect(deriveEntityName('models/marts/core/fact_orders.sql', pathNaming)).toBe('marts.core.fact_orders');
  });

  it('should strip prefix when configured', () => {
    const naming = { ...DEFAULT_CONFIG.naming, stripPrefix: 'stg_' };
    expect(deriveEntityName('models/stg_payments.sql', naming)).toBe('payments');
  });

  it('should handle YAML files', () => {
    expect(deriveEntityName('models/schema.yml', DEFAULT_CONFIG.naming)).toBe('schema');
  });
});

describe('resolveFileToFQN', () => {
  it('should resolve using convention when no mappings match', () => {
    const result = resolveFileToFQN('models/fact_orders.sql', DEFAULT_CONFIG);
    expect(result.fqn).toBe('default.default.public.fact_orders');
    expect(result.method).toBe('convention');
  });

  it('should resolve using explicit mapping when available', () => {
    const config: LineageLockConfig = {
      ...DEFAULT_CONFIG,
      mappings: [
        { filePattern: 'models/staging/**/*.sql', fqn: 'warehouse.analytics.staging.{name}' },
      ],
    };
    const result = resolveFileToFQN('models/staging/stg_payments.sql', config);
    expect(result.fqn).toBe('warehouse.analytics.staging.stg_payments');
    expect(result.method).toBe('mapping');
    expect(result.matchedPattern).toBe('models/staging/**/*.sql');
  });

  it('should prefer mapping over convention', () => {
    const config: LineageLockConfig = {
      ...DEFAULT_CONFIG,
      naming: { ...DEFAULT_CONFIG.naming, service: 'wrong_service' },
      mappings: [
        { filePattern: 'models/**/*.sql', fqn: 'correct.db.schema.{name}' },
      ],
    };
    const result = resolveFileToFQN('models/fact_orders.sql', config);
    expect(result.fqn).toBe('correct.db.schema.fact_orders');
    expect(result.method).toBe('mapping');
  });
});

describe('resolveFiles', () => {
  it('should only resolve data model files', () => {
    const files = ['models/fact_orders.sql', 'README.md', 'package.json'];
    const results = resolveFiles(files, DEFAULT_CONFIG);
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('models/fact_orders.sql');
  });

  it('should resolve multiple files', () => {
    const files = ['models/fact_orders.sql', 'models/staging/stg_payments.sql'];
    const results = resolveFiles(files, DEFAULT_CONFIG);
    expect(results).toHaveLength(2);
  });
});

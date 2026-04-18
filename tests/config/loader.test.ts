/**
 * Config Loader Tests
 */

import * as path from 'path';
import { loadConfig, validateConfig } from '../../src/config/loader';
import { DEFAULT_CONFIG } from '../../src/config/types';

describe('loadConfig', () => {
  it('should return default config when no file exists', () => {
    const config = loadConfig('/nonexistent/path/.lineagelock.json');
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('should load and merge the repo config file', () => {
    const configPath = path.resolve(__dirname, '../../.lineagelock.json');
    const config = loadConfig(configPath);

    // Should have merged values from the file
    expect(config.naming.service).toBe('acme_nexus_analytics');
    expect(config.naming.database).toBe('ANALYTICS');
    // Should still have defaults for unspecified fields
    expect(config.weights.contractViolation).toBe(40);
  });

  it('should override thresholds from env vars', () => {
    process.env.LINEAGELOCK_WARN_THRESHOLD = '50';
    process.env.LINEAGELOCK_FAIL_THRESHOLD = '90';

    const config = loadConfig('/nonexistent/path/.lineagelock.json');
    expect(config.thresholds.warn).toBe(50);
    expect(config.thresholds.fail).toBe(90);

    // Clean up
    delete process.env.LINEAGELOCK_WARN_THRESHOLD;
    delete process.env.LINEAGELOCK_FAIL_THRESHOLD;
  });
});

describe('validateConfig', () => {
  it('should return no warnings for valid config', () => {
    const warnings = validateConfig(DEFAULT_CONFIG);
    expect(warnings).toEqual([]);
  });

  it('should warn when warn >= fail threshold', () => {
    const config = {
      ...DEFAULT_CONFIG,
      thresholds: { warn: 80, fail: 50 },
    };
    const warnings = validateConfig(config);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('Warn threshold');
  });

  it('should warn when no paths configured', () => {
    const config = {
      ...DEFAULT_CONFIG,
      paths: { sql: [], yaml: [] },
    };
    const warnings = validateConfig(config);
    expect(warnings).toContainEqual(expect.stringContaining('No file path patterns'));
  });

  it('should warn when no service name', () => {
    const config = {
      ...DEFAULT_CONFIG,
      naming: { ...DEFAULT_CONFIG.naming, service: '' },
    };
    const warnings = validateConfig(config);
    expect(warnings).toContainEqual(expect.stringContaining('service name'));
  });
});

/**
 * Patch Parser Tests
 */

import { parsePatch, ChangedColumn, PatchAnalysis } from '../../src/diff/patch-parser';

describe('parsePatch', () => {
  describe('SQL patches', () => {
    it('should detect added columns in SELECT clause', () => {
      const patch = `@@ -1,3 +1,4 @@
 SELECT
   order_id,
+  new_column,
   amount`;

      const result = parsePatch('models/fact_orders.sql', patch);
      expect(result.changedColumns.length).toBeGreaterThan(0);
      expect(result.changedColumns.some(c => c.name === 'new_column')).toBe(true);
      expect(result.changedColumns.find(c => c.name === 'new_column')?.changeType).toBe('added');
    });

    it('should detect removed columns', () => {
      const patch = `@@ -1,4 +1,3 @@
 SELECT
   order_id,
-  old_column,
   amount`;

      const result = parsePatch('models/fact_orders.sql', patch);
      expect(result.changedColumns.some(c => c.name === 'old_column')).toBe(true);
      expect(result.changedColumns.find(c => c.name === 'old_column')?.changeType).toBe('removed');
    });

    it('should detect ALTER TABLE column changes', () => {
      const patch = `@@ -1,1 +1,1 @@
+ALTER TABLE orders ADD COLUMN customer_tier VARCHAR(50)`;

      const result = parsePatch('migrations/add_tier.sql', patch);
      expect(result.changedColumns.some(c => c.name === 'customer_tier')).toBe(true);
      expect(result.isStructuralChange).toBe(true);
    });

    it('should return empty for non-structural changes', () => {
      const patch = `@@ -1,1 +1,1 @@
--- Old comment
+-- New comment`;

      const result = parsePatch('models/fact_orders.sql', patch);
      expect(result.changedColumns.length).toBe(0);
      expect(result.isStructuralChange).toBe(false);
    });

    it('should handle no patch data', () => {
      const result = parsePatch('models/fact_orders.sql', undefined);
      expect(result.changedColumns.length).toBe(0);
      expect(result.changeDescription).toBe('No patch data available');
    });
  });

  describe('YAML patches', () => {
    it('should detect added columns in schema YAML', () => {
      const patch = `@@ -5,3 +5,6 @@
 columns:
   - name: order_id
     description: Primary key
+  - name: new_field
+    description: A new field
+    data_type: varchar`;

      const result = parsePatch('models/schema.yml', patch);
      expect(result.changedColumns.some(c => c.name === 'new_field')).toBe(true);
      expect(result.changedColumns.find(c => c.name === 'new_field')?.changeType).toBe('added');
      expect(result.changedColumns.find(c => c.name === 'new_field')?.confidence).toBe('high');
      expect(result.changedColumns.find(c => c.name === 'new_field')?.source).toBe('yaml-column');
    });

    it('should detect removed columns in schema YAML', () => {
      const patch = `@@ -5,6 +5,3 @@
 columns:
   - name: order_id
     description: Primary key
-  - name: old_field
-    description: Removed field
-    data_type: varchar`;

      const result = parsePatch('models/schema.yml', patch);
      expect(result.changedColumns.some(c => c.name === 'old_field')).toBe(true);
      expect(result.changedColumns.find(c => c.name === 'old_field')?.changeType).toBe('removed');
    });

    it('should detect modified column descriptions', () => {
      const patch = `@@ -5,4 +5,4 @@
 columns:
   - name: amount
-    description: Old description
+    description: New description`;

      const result = parsePatch('models/schema.yml', patch);
      expect(result.changedColumns.some(c => c.name === 'amount')).toBe(true);
    });
  });

  describe('unsupported files', () => {
    it('should handle unsupported file types gracefully', () => {
      const result = parsePatch('README.md', 'some diff');
      expect(result.changedColumns.length).toBe(0);
      expect(result.changeDescription).toContain('Unsupported');
    });
  });
});

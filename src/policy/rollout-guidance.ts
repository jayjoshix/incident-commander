/**
 * Rollout Guidance
 *
 * Generates safe migration guidance for risky schema changes.
 * Triggered when a modified/removed column has downstream column impact.
 *
 * Turns LineageLock from a blocker into a governance workflow tool:
 * "Here's how to make this change safely."
 */

import { ResolvedEntity } from '../openmetadata/types';
import { PatchAnalysis } from '../diff/patch-parser';

export interface RolloutStep {
  step: number;
  action: string;
  detail: string;
}

export interface RolloutGuidance {
  columnName: string;
  changeType: 'modified' | 'removed' | 'renamed';
  downstreamAssets: string[];
  steps: RolloutStep[];
}

/**
 * Generate rollout guidance for a changed entity.
 * Only fires when structural column changes + downstream column impact exist.
 */
export function generateRolloutGuidance(
  patch: PatchAnalysis,
  entity: ResolvedEntity
): RolloutGuidance[] {
  const results: RolloutGuidance[] = [];
  if (!entity.downstream?.columnImpact?.length) return results;

  const changedNames = new Set(patch.changedColumns.map(c => c.name.toLowerCase()));

  // Find which changed columns actually flow downstream
  const impactedColumns = patch.changedColumns.filter(col => {
    return entity.downstream!.columnImpact.some(ci =>
      ci.fromColumns.some(fc => fc.split('.').pop()?.toLowerCase() === col.name.toLowerCase())
    );
  });

  for (const col of impactedColumns) {
    if (col.changeType !== 'modified' && col.changeType !== 'removed' && col.changeType !== 'renamed') continue;

    // Which downstream assets does this column feed?
    const downstream = entity.downstream!.columnImpact
      .filter(ci => ci.fromColumns.some(fc => fc.split('.').pop()?.toLowerCase() === col.name.toLowerCase()))
      .map(ci => {
        const toCol = ci.toColumn.split('.').pop();
        const toEntity = ci.toEntity.split('.').pop();
        return `\`${toCol}\` in \`${toEntity}\``;
      });

    const dashboards = entity.downstream?.dashboards.map(d => `\`${d.name}\``) || [];
    const allAffected = [...downstream, ...dashboards];

    const steps = buildSteps(col.name, col.changeType, allAffected);
    results.push({
      columnName: col.name,
      changeType: col.changeType as 'modified' | 'removed' | 'renamed',
      downstreamAssets: allAffected,
      steps,
    });
  }

  return results;
}

function buildSteps(
  columnName: string,
  changeType: string,
  downstream: string[]
): RolloutStep[] {
  const downstreamList = downstream.slice(0, 3).join(', ') +
    (downstream.length > 3 ? `, +${downstream.length - 3} more` : '');

  if (changeType === 'removed') {
    return [
      { step: 1, action: 'Audit consumers', detail: `Verify all downstream consumers of \`${columnName}\` before removal: ${downstreamList}` },
      { step: 2, action: 'Deprecate first', detail: `Add a deprecation notice to \`${columnName}\` in OpenMetadata (column description: "Deprecated: will be removed in [date]")` },
      { step: 3, action: 'Migrate consumers', detail: `Update each downstream consumer to stop reading \`${columnName}\` before removing it` },
      { step: 4, action: 'Remove in follow-up PR', detail: `Only remove the column once all consumers are migrated and verified` },
    ];
  }

  if (changeType === 'renamed') {
    return [
      { step: 1, action: 'Add alias / dual-write', detail: `Expose both the old and new column name from this model simultaneously` },
      { step: 2, action: 'Migrate downstream', detail: `Update consumers to use the new name: ${downstreamList}` },
      { step: 3, action: 'Update OpenMetadata', detail: `Rename the column in OpenMetadata and update glossary/tag assignments` },
      { step: 4, action: 'Remove the alias', detail: `Once all consumers are migrated, remove the old column alias in a follow-up PR` },
    ];
  }

  // modified
  return [
    { step: 1, action: 'Validate downstream impact', detail: `Confirm that this change to \`${columnName}\` is backward compatible with: ${downstreamList}` },
    { step: 2, action: 'Test in staging', detail: `Run the affected pipelines and dashboards against staging before merging to production` },
    { step: 3, action: 'Update data contract', detail: `If the contract test for \`${columnName}\` exists, update expected values in OpenMetadata` },
  ];
}

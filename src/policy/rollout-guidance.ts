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

export type RolloutStrategy =
  | 'additive'           // new column added — safe, no migration needed
  | 'dual-write'         // column rename — expose both names temporarily
  | 'deprecation-window' // column removed — deprecate before deleting
  | 'contract-first'     // contract changes needed before schema change
  | 'rollback-ready';    // high-risk change with rollback triggers defined

export interface RollbackTrigger {
  condition: string;
  action: string;
}

export interface RolloutGuidanceV2 extends RolloutGuidance {
  strategy: RolloutStrategy;
  rollbackTriggers: RollbackTrigger[];
  consumerMigrationOrder: string[];
  estimatedRisk: 'low' | 'medium' | 'high';
}

/**
 * Generate rollout guidance for a changed entity (legacy API, backward-compatible).
 * Only fires when structural column changes + downstream column impact exist.
 */
export function generateRolloutGuidance(
  patch: PatchAnalysis,
  entity: ResolvedEntity
): RolloutGuidance[] {
  const results: RolloutGuidance[] = [];
  if (!entity.downstream?.columnImpact?.length) return results;

  const impactedColumns = patch.changedColumns.filter(col => {
    return entity.downstream!.columnImpact.some(ci =>
      ci.fromColumns.some(fc => fc.split('.').pop()?.toLowerCase() === col.name.toLowerCase())
    );
  });

  for (const col of impactedColumns) {
    if (col.changeType !== 'modified' && col.changeType !== 'removed' && col.changeType !== 'renamed') continue;

    const downstream = entity.downstream!.columnImpact
      .filter(ci => ci.fromColumns.some(fc => fc.split('.').pop()?.toLowerCase() === col.name.toLowerCase()))
      .map(ci => {
        const toCol = ci.toColumn.split('.').pop();
        const toEntity = ci.toEntity.split('.').pop();
        return `\`${toCol}\` in \`${toEntity}\``;
      });

    const dashboards = entity.downstream?.dashboards.map(d => `\`${d.name}\``) || [];
    const allAffected = [...downstream, ...dashboards];

    const steps = buildLegacySteps(col.name, col.changeType, allAffected);
    results.push({
      columnName: col.name,
      changeType: col.changeType as 'modified' | 'removed' | 'renamed',
      downstreamAssets: allAffected,
      steps,
    });
  }

  return results;
}

/**
 * Generate upgraded rollout guidance with strategy, rollback triggers,
 * and consumer migration ordering.
 */
export function generateRolloutGuidanceV2(
  patch: PatchAnalysis,
  entity: ResolvedEntity
): RolloutGuidanceV2[] {
  const results: RolloutGuidanceV2[] = [];
  const hasColumnImpact = (entity.downstream?.columnImpact?.length ?? 0) > 0;
  const hasDownstream = (entity.downstream?.total ?? 0) > 0;
  if (!hasColumnImpact && !hasDownstream) return results;

  for (const col of patch.changedColumns) {
    if (!['modified', 'removed', 'renamed', 'added'].includes(col.changeType)) continue;

    const downstreamCols = (entity.downstream?.columnImpact || [])
      .filter(ci => ci.fromColumns.some(fc => fc.split('.').pop()?.toLowerCase() === col.name.toLowerCase()))
      .map(ci => {
        const toCol = ci.toColumn.split('.').pop();
        const toEntity = ci.toEntity.split('.').pop();
        return `\`${toCol}\` in \`${toEntity}\``;
      });

    const dashboards = (entity.downstream?.dashboards || []).map(d => `dashboard:\`${d.name}\``);
    const mlModels = (entity.downstream?.mlModels || []).map(m => `ml:\`${m.name}\``);
    const allAffected = [...downstreamCols, ...dashboards, ...mlModels];

    if (allAffected.length === 0 && col.changeType === 'added') continue;

    const strategy = selectStrategy(col.changeType, entity);
    const steps = buildStrategySteps(col.name, col.changeType, allAffected, strategy, entity);
    const rollbackTriggers = buildRollbackTriggers(col.name, col.changeType, entity);
    const consumerOrder = buildConsumerOrder(entity);
    const risk = estimateRisk(col.changeType, allAffected.length, entity);

    results.push({
      columnName: col.name,
      changeType: col.changeType as 'modified' | 'removed' | 'renamed',
      downstreamAssets: allAffected,
      steps,
      strategy,
      rollbackTriggers,
      consumerMigrationOrder: consumerOrder,
      estimatedRisk: risk,
    });
  }

  return results;
}

function selectStrategy(changeType: string, entity: ResolvedEntity): RolloutStrategy {
  if (changeType === 'added') return 'additive';
  if (changeType === 'renamed') return 'dual-write';
  if (changeType === 'removed') return 'deprecation-window';
  if (entity.contract?.hasContract) return 'contract-first';
  if ((entity.downstream?.total ?? 0) >= 3) return 'rollback-ready';
  return 'additive';
}

function buildStrategySteps(
  columnName: string,
  changeType: string,
  downstream: string[],
  strategy: RolloutStrategy,
  entity: ResolvedEntity
): RolloutStep[] {
  const dl = downstream.slice(0, 3).join(', ') + (downstream.length > 3 ? ` +${downstream.length - 3} more` : '');
  const hasContract = entity.contract?.hasContract;
  const isTier1 = (entity.entity?.tier ?? '').includes('Tier1');

  switch (strategy) {
    case 'additive':
      return [
        { step: 1, action: 'Confirm additive safety', detail: `\`${columnName}\` is being added — verify no downstream model relies on SELECT * which would pick it up unexpectedly` },
        { step: 2, action: 'Update data contract', detail: hasContract ? `Add \`${columnName}\` to the OpenMetadata data contract test suite` : `Consider defining a data contract for this asset` },
        { step: 3, action: 'Notify downstream owners', detail: dl ? `Inform owners of ${dl} that a new column is available` : 'No downstream impact — safe to merge' },
      ];

    case 'dual-write':
      return [
        { step: 1, action: 'Expose both names simultaneously', detail: `Add \`${columnName}_new\` alongside the existing column so consumers can migrate at their own pace` },
        { step: 2, action: 'Announce deprecation of old name', detail: `Mark old column as deprecated in OpenMetadata: "Deprecated — use new name"` },
        { step: 3, action: 'Migrate consumers in order', detail: `Update downstream in order: tables → dashboards → ML models. Affected: ${dl}` },
        { step: 4, action: 'Update data contract', detail: `Rename column in OpenMetadata contract and update test expectations` },
        { step: 5, action: 'Remove old column in follow-up PR', detail: `Open a separate PR to remove the old column name after all consumers have migrated` },
      ];

    case 'deprecation-window':
      return [
        { step: 1, action: 'Set deprecation window (min 2 sprints)', detail: `Do NOT remove \`${columnName}\` in this PR. Mark it deprecated in OpenMetadata first` },
        { step: 2, action: 'Audit all consumers', detail: `Identify every query/pipeline reading \`${columnName}\`: ${dl}` },
        { step: 3, action: 'Notify and migrate consumers', detail: `Reach out to owners of affected assets. Provide the replacement column or migration path` },
        { step: 4, action: 'Verify no remaining references', detail: `Run a cross-repo grep for \`${columnName}\` before merging the removal` },
        { step: 5, action: 'Remove in dedicated PR', detail: `Submit a clean removal PR with migration evidence documented` },
      ];

    case 'contract-first':
      return [
        { step: 1, action: 'Update data contract first', detail: `Modify the OpenMetadata test suite for \`${columnName}\` BEFORE merging this schema change` },
        { step: 2, action: 'Verify contract tests pass', detail: `Re-run data quality suite in OpenMetadata to confirm new expectations are met in staging` },
        { step: 3, action: 'Validate downstream in staging', detail: `Test all downstream models with the new schema: ${dl}` },
        ...(isTier1 ? [{ step: 4, action: 'Tier-1 sign-off required', detail: `This is a Tier-1 asset — obtain explicit approval from data platform team before merging to production` }] : []),
        { step: isTier1 ? 5 : 4, action: 'Merge during low-traffic window', detail: `Coordinate merge timing to minimize incident risk` },
      ];

    case 'rollback-ready':
    default:
      return [
        { step: 1, action: 'Prepare rollback script', detail: `Write a tested revert migration for \`${columnName}\` before merging. Keep it in the PR description` },
        { step: 2, action: 'Deploy to staging first', detail: `Validate all ${downstream.length} downstream consumers against the staging version` },
        { step: 3, action: 'Set monitoring alert', detail: `Configure an alert for pipeline failures or dashboard errors within 1h of merge` },
        { step: 4, action: 'Merge with rollback readiness', detail: `Ensure on-call engineer is aware. If any consumer breaks within 2h, execute rollback script` },
        { step: 5, action: 'Post-deploy verification', detail: `Run data quality suite in OpenMetadata and verify all downstream consumers are healthy` },
      ];
  }
}

function buildRollbackTriggers(
  columnName: string,
  changeType: string,
  entity: ResolvedEntity
): RollbackTrigger[] {
  const triggers: RollbackTrigger[] = [
    {
      condition: `Any downstream pipeline fails within 2 hours of merge`,
      action: `Revert this PR immediately and notify on-call`,
    },
    {
      condition: `OpenMetadata data contract tests fail post-deploy`,
      action: `Roll back and investigate \`${columnName}\` change impact on contract`,
    },
  ];

  if ((entity.downstream?.dashboards?.length ?? 0) > 0) {
    triggers.push({
      condition: `Any dashboard dependent on \`${columnName}\` shows errors`,
      action: `Revert and coordinate with BI owners before re-attempting`,
    });
  }

  if (changeType === 'removed') {
    triggers.push({
      condition: `Any query references the removed column \`${columnName}\``,
      action: `Revert immediately — consumer migration was incomplete`,
    });
  }

  return triggers;
}

function buildConsumerOrder(entity: ResolvedEntity): string[] {
  const order: string[] = [];
  const tables = (entity.downstream?.tables || []).map(t => `table:${t.name}`);
  const pipelines = (entity.downstream?.pipelines || []).map(p => `pipeline:${p.name}`);
  const dashboards = (entity.downstream?.dashboards || []).map(d => `dashboard:${d.name}`);
  const mlModels = (entity.downstream?.mlModels || []).map(m => `ml-model:${m.name}`);
  order.push(...tables, ...pipelines, ...dashboards, ...mlModels);
  return order;
}

function estimateRisk(changeType: string, downstreamCount: number, entity: ResolvedEntity): 'low' | 'medium' | 'high' {
  if (changeType === 'removed' || changeType === 'renamed') return 'high';
  if (downstreamCount >= 3) return 'high';
  if (downstreamCount >= 1 || (entity.contract?.failingTests ?? 0) > 0) return 'medium';
  return 'low';
}

function buildLegacySteps(
  columnName: string,
  changeType: string,
  downstream: string[]
): RolloutStep[] {
  const downstreamList = downstream.slice(0, 3).join(', ') +
    (downstream.length > 3 ? `, +${downstream.length - 3} more` : '');

  if (changeType === 'removed') {
    return [
      { step: 1, action: 'Audit consumers', detail: `Verify all downstream consumers of \`${columnName}\` before removal: ${downstreamList}` },
      { step: 2, action: 'Deprecate first', detail: `Add a deprecation notice to \`${columnName}\` in OpenMetadata` },
      { step: 3, action: 'Migrate consumers', detail: `Update each downstream consumer to stop reading \`${columnName}\`` },
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

  return [
    { step: 1, action: 'Validate downstream impact', detail: `Confirm that this change to \`${columnName}\` is backward compatible with: ${downstreamList}` },
    { step: 2, action: 'Test in staging', detail: `Run the affected pipelines and dashboards against staging before merging to production` },
    { step: 3, action: 'Update data contract', detail: `If the contract test for \`${columnName}\` exists, update expected values in OpenMetadata` },
  ];
}

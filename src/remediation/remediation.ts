/**
 * Remediation Engine
 *
 * Generates structured, actionable safe-fix recommendations for each risk type.
 * Produces both a human-readable Markdown report and a machine-readable JSON plan.
 */

import { ResolvedEntity } from '../openmetadata/types';
import { PatchAnalysis } from '../diff/patch-parser';
import { PolicyEvaluationResult } from '../policy/types';
import { RiskReport } from '../risk/types';

// ─── Types ─────────────────────────────────────────────────────────────────

export type RemediationType =
  | 'assign-owner'
  | 'contract-update'
  | 'pii-access-review'
  | 'dashboard-migration'
  | 'dual-write'
  | 'deprecation-window'
  | 'test-fix'
  | 'glossary-review'
  | 'quality-fix';

export interface RemediationStep {
  order: number;
  action: string;
  detail: string;
  owner?: string;  // who should do this
  tool?: string;   // which tool/system
}

export interface RemediationItem {
  id: string;
  type: RemediationType;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedEntity: string;
  affectedColumns?: string[];
  steps: RemediationStep[];
  /** Suggested follow-up PR scope */
  followUpPRScope?: string[];
}

export interface RemediationPlan {
  generatedAt: string;
  totalItems: number;
  criticalCount: number;
  items: RemediationItem[];
}

// ─── Main Entry ────────────────────────────────────────────────────────────

/**
 * Generate a full remediation plan from entities, patches, and policy results.
 */
export function generateRemediations(
  entities: ResolvedEntity[],
  patches: PatchAnalysis[],
  report: RiskReport,
  policyResult: PolicyEvaluationResult
): RemediationPlan {
  const items: RemediationItem[] = [];
  let idCounter = 1;

  for (const entity of entities) {
    if (!entity.found) continue;
    const assessment = report.assessments.find(a => a.fqn === entity.fqn);

    // R1: No owner
    if (!entity.entity?.owner) {
      items.push(buildOwnerRemediation(entity, idCounter++));
    }

    // R2: Contract failures
    if (entity.contract?.hasContract && entity.contract.failingTests > 0) {
      items.push(buildContractRemediation(entity, idCounter++));
    }

    // R3: PII tags on changed entity
    const hasPII = (entity.entity?.tags || []).some(t =>
      ['pii', 'gdpr', 'sensitive', 'confidential'].some(kw =>
        t.tagFQN.toLowerCase().includes(kw)
      )
    );
    if (hasPII) {
      items.push(buildPIIRemediation(entity, idCounter++));
    }

    // R4: Downstream dashboards impacted
    if ((entity.downstream?.dashboards?.length ?? 0) > 0) {
      items.push(buildDashboardMigrationRemediation(entity, idCounter++));
    }

    // R5: Active quality issues
    if ((entity.activeQualityIssues?.length ?? 0) > 0) {
      items.push(buildQualityFixRemediation(entity, idCounter++));
    }

    // R6: Column-level changes with downstream impact
    const patch = patches.find(p => p.filePath === entity.filePath);
    if (patch && patch.changedColumns.length > 0 && (entity.downstream?.columnImpact?.length ?? 0) > 0) {
      const removedOrRenamed = patch.changedColumns.filter(c =>
        c.changeType === 'removed' || c.changeType === 'renamed'
      );
      if (removedOrRenamed.length > 0) {
        items.push(buildDualWriteRemediation(entity, removedOrRenamed.map(c => c.name), idCounter++));
      }
    }

    // R7: Glossary business-critical terms
    if ((entity.glossaryTerms?.length ?? 0) > 0) {
      items.push(buildGlossaryRemediation(entity, idCounter++));
    }
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    generatedAt: new Date().toISOString(),
    totalItems: items.length,
    criticalCount: items.filter(i => i.priority === 'critical').length,
    items,
  };
}

// ─── Individual Remediation Builders ───────────────────────────────────────

function buildOwnerRemediation(entity: ResolvedEntity, id: number): RemediationItem {
  return {
    id: `REM-${String(id).padStart(3, '0')}`,
    type: 'assign-owner',
    priority: 'high',
    title: `Assign owner to ${entity.entity?.name ?? entity.fqn}`,
    description: 'This asset has no owner in OpenMetadata. Changes to unowned assets bypass normal review routing.',
    affectedEntity: entity.fqn,
    steps: [
      { order: 1, action: 'Navigate to asset in OpenMetadata', detail: `Open ${entity.fqn} in your OpenMetadata instance`, tool: 'OpenMetadata UI' },
      { order: 2, action: 'Assign team or user as owner', detail: 'Go to → Edit → Owners → assign the responsible data team', tool: 'OpenMetadata UI' },
      { order: 3, action: 'Add to .lineagelock.json ownerMapping', detail: `"${entity.fqn}": "team-name"`, tool: '.lineagelock.json' },
    ],
    followUpPRScope: [
      `Update OpenMetadata ownership for ${entity.entity?.name ?? entity.fqn}`,
      'Add ownership mapping to .lineagelock.json',
    ],
  };
}

function buildContractRemediation(entity: ResolvedEntity, id: number): RemediationItem {
  const failing = entity.contract?.failingTests ?? 0;
  const total = entity.contract?.totalTests ?? 0;
  const suite = entity.contract?.testSuiteName ?? 'test suite';
  return {
    id: `REM-${String(id).padStart(3, '0')}`,
    type: 'contract-update',
    priority: 'critical',
    title: `Fix failing contract tests on ${entity.entity?.name ?? entity.fqn}`,
    description: `${failing}/${total} data contract tests are currently failing in "${suite}". Merging this PR on top of existing failures compounds risk.`,
    affectedEntity: entity.fqn,
    steps: [
      { order: 1, action: 'Identify failing tests', detail: `In OpenMetadata → Data Quality → ${suite} — review each failing test`, tool: 'OpenMetadata UI' },
      { order: 2, action: 'Fix or acknowledge each failure', detail: 'Either fix the data issue causing the failure, or update the contract expectation if the test is stale', tool: 'dbt / SQL / OpenMetadata' },
      { order: 3, action: 'Re-run test suite', detail: `Trigger a test run in OpenMetadata to confirm tests pass before merging`, tool: 'OpenMetadata Data Quality' },
      { order: 4, action: 'Update contract SLAs if needed', detail: 'If business logic changed, update the contract definition to reflect new expectations', tool: 'OpenMetadata UI' },
    ],
    followUpPRScope: [
      `Fix failing contract tests in ${suite}`,
      `Update dbt tests or data quality definitions`,
    ],
  };
}

function buildPIIRemediation(entity: ResolvedEntity, id: number): RemediationItem {
  const piiTags = (entity.entity?.tags || [])
    .filter(t => ['pii', 'gdpr', 'sensitive', 'confidential'].some(k => t.tagFQN.toLowerCase().includes(k)))
    .map(t => t.tagFQN);
  return {
    id: `REM-${String(id).padStart(3, '0')}`,
    type: 'pii-access-review',
    priority: 'critical',
    title: `PII/sensitive data access review for ${entity.entity?.name ?? entity.fqn}`,
    description: `Asset is tagged with sensitive classifications (${piiTags.slice(0, 3).join(', ')}). Any schema change requires a privacy/security review.`,
    affectedEntity: entity.fqn,
    steps: [
      { order: 1, action: 'Conduct privacy impact assessment', detail: 'Document why this schema change is needed and whether it affects data subject rights (GDPR Art. 35)', owner: 'privacy-team', tool: 'Legal/Compliance' },
      { order: 2, action: 'Verify column-level access controls', detail: 'Confirm downstream consumers only access PII via approved access patterns (masked views, row-level security)', tool: 'OpenMetadata Policies / Data Warehouse' },
      { order: 3, action: 'Update data lineage documentation', detail: 'Confirm OpenMetadata lineage reflects the new schema path', tool: 'OpenMetadata UI' },
      { order: 4, action: 'Get privacy team sign-off', detail: 'Obtain written approval from data privacy officer or designated reviewer', owner: 'privacy-team' },
    ],
    followUpPRScope: [
      'Privacy impact assessment document',
      'Update access control definitions',
      'Update OpenMetadata PII documentation',
    ],
  };
}

function buildDashboardMigrationRemediation(entity: ResolvedEntity, id: number): RemediationItem {
  const dashboards = (entity.downstream?.dashboards ?? []).map(d => d.name);
  return {
    id: `REM-${String(id).padStart(3, '0')}`,
    type: 'dashboard-migration',
    priority: 'high',
    title: `Migrate ${dashboards.length} affected dashboard(s) after schema change`,
    description: `Dashboards depend on this asset via lineage: ${dashboards.slice(0, 3).join(', ')}${dashboards.length > 3 ? ` (+${dashboards.length - 3} more)` : ''}.`,
    affectedEntity: entity.fqn,
    steps: [
      { order: 1, action: 'Audit each affected dashboard', detail: `Review ${dashboards.join(', ')} for hardcoded column references`, owner: 'bi-owners', tool: 'BI Tool (Superset / Looker / Tableau)' },
      { order: 2, action: 'Test dashboards against staging', detail: 'Deploy schema change to staging first and confirm all dashboard queries still execute', tool: 'Staging environment' },
      { order: 3, action: 'Update dashboard queries/metrics', detail: 'Update any column references, calculated fields, or saved filters affected by the change', owner: 'bi-owners' },
      { order: 4, action: 'Coordinate migration window', detail: 'Schedule the production merge during a low-traffic window to minimize dashboard downtime', owner: 'data-eng' },
    ],
    followUpPRScope: dashboards.map(d => `Update dashboard: ${d}`),
  };
}

function buildQualityFixRemediation(entity: ResolvedEntity, id: number): RemediationItem {
  const issues = entity.activeQualityIssues ?? [];
  return {
    id: `REM-${String(id).padStart(3, '0')}`,
    type: 'quality-fix',
    priority: 'high',
    title: `Resolve ${issues.length} active quality issue(s) before merging`,
    description: `This asset already has failing quality checks. Merging more changes while unhealthy compounds the risk.`,
    affectedEntity: entity.fqn,
    steps: [
      { order: 1, action: 'Review each failing test', detail: issues.slice(0, 3).map(i => `${i.name}: ${i.failureReason ?? 'no detail'}`).join('; '), tool: 'OpenMetadata Data Quality' },
      { order: 2, action: 'Fix root cause or acknowledge', detail: 'Either fix the underlying data issue or mark the test as acknowledged with a reason', tool: 'OpenMetadata UI' },
      { order: 3, action: 'Re-run quality suite', detail: 'Trigger re-run to confirm clean state before merging this PR', tool: 'OpenMetadata Automations' },
    ],
    followUpPRScope: [
      `Fix active quality issues on ${entity.entity?.name ?? entity.fqn}`,
    ],
  };
}

function buildDualWriteRemediation(entity: ResolvedEntity, columns: string[], id: number): RemediationItem {
  return {
    id: `REM-${String(id).padStart(3, '0')}`,
    type: 'dual-write',
    priority: 'high',
    title: `Dual-write strategy for renamed/removed columns: ${columns.join(', ')}`,
    description: `Columns ${columns.join(', ')} are being renamed or removed. Downstream consumers may break without a migration window.`,
    affectedEntity: entity.fqn,
    affectedColumns: columns,
    steps: [
      { order: 1, action: 'Add compatibility alias', detail: `SELECT old_name, new_name AS old_name_alias FROM ${entity.entity?.name ?? 'table'} — emit both old and new column names in a transitional period`, tool: 'dbt / SQL' },
      { order: 2, action: 'Notify downstream owners', detail: 'Alert owners of downstream consumers to migrate their queries within the deprecation window', owner: 'data-eng' },
      { order: 3, action: 'Migrate consumers', detail: 'For each downstream entity, update queries to use the new column name', owner: 'consumer-teams' },
      { order: 4, action: 'Remove the alias', detail: 'Once all consumers have migrated, open a follow-up PR to remove the compatibility column', owner: 'data-eng' },
    ],
    followUpPRScope: columns.map(c => `Remove compatibility alias for ${c} after consumer migration`),
  };
}

function buildGlossaryRemediation(entity: ResolvedEntity, id: number): RemediationItem {
  const terms = entity.glossaryTerms ?? [];
  return {
    id: `REM-${String(id).padStart(3, '0')}`,
    type: 'glossary-review',
    priority: 'medium',
    title: `Business glossary review required: ${terms.slice(0, 2).join(', ')}`,
    description: `Asset is linked to business-critical glossary terms. Schema changes may affect the semantic meaning of these terms.`,
    affectedEntity: entity.fqn,
    steps: [
      { order: 1, action: 'Review glossary term definitions', detail: `In OpenMetadata → Glossary, review ${terms.join(', ')} and confirm the schema change aligns`, tool: 'OpenMetadata Glossary' },
      { order: 2, action: 'Get business owner sign-off', detail: 'Obtain approval from the glossary term owner (usually a business stakeholder)', owner: 'business-owners' },
      { order: 3, action: 'Update glossary documentation if needed', detail: 'If the schema change changes the semantic meaning, update the glossary term description', tool: 'OpenMetadata UI' },
    ],
    followUpPRScope: ['Update glossary term definitions if semantic meaning changed'],
  };
}

// ─── Renderers ─────────────────────────────────────────────────────────────

/**
 * Render remediation plan as Markdown for PR comment inclusion.
 */
export function renderRemediations(plan: RemediationPlan): string {
  if (plan.totalItems === 0) return '';

  const lines: string[] = [];
  lines.push(`<details>`);
  lines.push(`<summary>🔧 Proposed Safe Fixes — ${plan.totalItems} remediation action(s)${plan.criticalCount > 0 ? ` (${plan.criticalCount} critical)` : ''}</summary>`);
  lines.push('');

  const priorityEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

  for (const item of plan.items) {
    lines.push(`### ${priorityEmoji[item.priority]} ${item.id}: ${item.title}`);
    lines.push('');
    lines.push(`> ${item.description}`);
    lines.push('');
    lines.push('**Steps:**');
    for (const step of item.steps) {
      lines.push(`${step.order}. **${step.action}** — ${step.detail}${step.tool ? ` *(${step.tool})*` : ''}${step.owner ? ` · Owner: \`${step.owner}\`` : ''}`);
    }
    if (item.followUpPRScope && item.followUpPRScope.length > 0) {
      lines.push('');
      lines.push('**Suggested follow-up PR scope:**');
      item.followUpPRScope.forEach(s => lines.push(`- [ ] ${s}`));
    }
    lines.push('');
  }

  lines.push(`> 📄 Full remediation plan: \`artifacts/lineagelock-remediation.json\``);
  lines.push(`</details>`);

  return lines.join('\n');
}

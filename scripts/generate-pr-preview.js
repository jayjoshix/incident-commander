#!/usr/bin/env node
/**
 * generate-pr-preview.js
 * 
 * Runs the full governance pipeline on demo fixtures,
 * renders the exact Markdown that would be posted as a GitHub PR comment,
 * then wraps it in a GitHub-styled HTML page so you can screenshot it.
 * 
 * Usage: node scripts/generate-pr-preview.js
 * Output: artifacts/pr-comment-preview.html
 */

const path = require('path');
const fs   = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { scoreEntities }         = require('../dist/risk/scoring');
const { computePRAggregate }    = require('../dist/risk/pr-aggregate');
const { loadConfig }            = require('../dist/config/loader');
const { evaluatePolicies }      = require('../dist/policy/approval-engine');
const { computeTrustSignal }    = require('../dist/trust/trust-signal');
const { generateRemediations }  = require('../dist/remediation/remediation');
const { buildAuditTrail }       = require('../dist/audit/audit-trail');
const { routeByRiskType }       = require('../dist/routing/routing');
const { DEMO_ENTITIES }         = require('../dist/fixtures/demo-data');
const { parsePatch }            = require('../dist/diff/patch-parser');
const { renderReport }          = require('../dist/report/renderer');

// ── Run pipeline ─────────────────────────────────────────────────────────────
const config   = loadConfig(path.join(__dirname, '..', '.lineagelock.json'));
const entities = DEMO_ENTITIES;
const patches  = entities.map(e => ({
  filePath: e.filePath,
  changedColumns: [
    { name: 'customer_id', changeType: 'renamed', oldName: 'cust_id' },
    { name: 'email',       changeType: 'type_change', oldType: 'VARCHAR(100)', newType: 'TEXT' },
  ],
  isStructuralChange: true,
  changeDescription: 'Renamed customer_id and changed email column type',
}));

const report         = scoreEntities(entities, config);
const aggregate      = computePRAggregate(report, entities, patches, config);
const policyResult   = evaluatePolicies(entities, patches, config);
const trustSignal    = computeTrustSignal(entities, report, policyResult);
const routingResult  = routeByRiskType(entities, report, policyResult);
const remediationPlan = generateRemediations(entities, patches, report, policyResult);
const reviewerResult  = {
  users: [...policyResult.allRequiredUsers, ...routingResult.users],
  teams: [...policyResult.allRequiredTeams, ...routingResult.teams],
};
const auditTrail = buildAuditTrail({
  entities, report, aggregate, policyResult,
  patchAnalyses: patches, reviewerResult, appliedLabels: ['lineagelock:critical', 'governance:blocked'],
});

const markdown = renderReport(report, entities, patches, aggregate, {
  reviewerResult,
  appliedLabels: ['lineagelock:critical', 'governance:blocked'],
  policyResult,
  trustSignal,
  remediationPlan,
  auditTrail,
  routingResult,
});

// ── Save raw markdown ─────────────────────────────────────────────────────────
const artifactsDir = path.join(__dirname, '..', 'artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });
fs.writeFileSync(path.join(artifactsDir, 'pr-comment.md'), markdown);
console.log('✅ Markdown saved to artifacts/pr-comment.md');

// ── Render HTML preview ───────────────────────────────────────────────────────
// Simple markdown → HTML (handles tables, code blocks, headings, bold, etc.)
function md2html(md) {
  return md
    // fenced code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="highlight"><code class="language-${lang}">${esc(code.trimEnd())}</code></pre>`)
    // headings
    .replace(/^#{5} (.+)$/gm, '<h5>$1</h5>')
    .replace(/^#{4} (.+)$/gm, '<h4>$1</h4>')
    .replace(/^#{3} (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#{2} (.+)$/gm, '<h2>$1</h2>')
    .replace(/^#{1} (.+)$/gm, '<h1>$1</h1>')
    // hr
    .replace(/^---$/gm, '<hr>')
    // bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // unordered list items
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    // ordered list items
    .replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>')
    // tables (simple)
    .replace(/^\|(.+)\|$/gm, (line) => {
      if (/^[\|\s\-:]+$/.test(line)) return '<tr class="sep"></tr>';
      const cells = line.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    // details/summary
    .replace(/<details>/g, '<details class="details-block">')
    // paragraphs
    .replace(/\n\n/g, '</p><p>')
    // newlines
    .replace(/\n/g, '<br>');
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const body = md2html(markdown);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LineageLock PR Comment Preview</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    font-size: 14px; line-height: 1.6; color: #1f2328; background: #f6f8fa;
  }

  /* GitHub chrome */
  .gh-header {
    background: #24292f; padding: 12px 16px;
    display: flex; align-items: center; gap: 12px;
  }
  .gh-logo { color: #fff; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.03em; }
  .gh-repo { color: #8b949e; font-size: 0.82rem; }
  .gh-repo a { color: #58a6ff; text-decoration: none; }

  /* PR page layout */
  .pr-page { max-width: 1050px; margin: 0 auto; padding: 24px 16px; }

  .pr-title-bar {
    display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px;
  }
  .pr-state {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 12px; border-radius: 999px;
    background: #da3633; color: #fff; font-size: 0.78rem; font-weight: 600;
    flex-shrink: 0; margin-top: 3px;
  }
  .pr-name { font-size: 1.25rem; font-weight: 600; color: #1f2328; }
  .pr-meta { font-size: 0.82rem; color: #8b949e; margin-bottom: 24px; }
  .pr-meta strong { color: #1f2328; }

  /* Tab bar */
  .pr-tabs {
    display: flex; border-bottom: 1px solid #d0d7de; margin-bottom: 20px; gap: 0;
  }
  .pr-tab {
    padding: 8px 16px; font-size: 0.85rem; color: #57606a; cursor: pointer;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .pr-tab.active { color: #1f2328; border-bottom-color: #fd8c73; font-weight: 600; }

  /* Comment card */
  .comment-card {
    border: 1px solid #d0d7de; border-radius: 8px; overflow: hidden;
    margin-bottom: 16px; background: #fff;
  }
  .comment-header {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px; background: #f6f8fa;
    border-bottom: 1px solid #d0d7de;
  }
  .comment-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: linear-gradient(135deg, #d97706, #b45309);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 0.85rem; flex-shrink: 0;
  }
  .comment-author { font-weight: 600; font-size: 0.85rem; }
  .comment-author .bot-badge {
    display: inline-block; padding: 1px 6px; border-radius: 3px;
    background: #ddf4ff; color: #0969da; border: 1px solid #54aeff40;
    font-size: 0.68rem; font-weight: 500; margin-left: 6px;
  }
  .comment-time { color: #8b949e; font-size: 0.78rem; margin-left: auto; }

  /* Merge status check */
  .merge-check {
    border: 1px solid #d0d7de; border-radius: 8px; overflow: hidden;
    margin-bottom: 16px; background: #fff;
  }
  .merge-check-row {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; border-bottom: 1px solid #d0d7de;
  }
  .merge-check-row:last-child { border: none; }
  .check-icon { font-size: 1.1rem; flex-shrink: 0; }
  .check-name { font-weight: 600; font-size: 0.85rem; flex: 1; }
  .check-status {
    padding: 2px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 600;
  }
  .check-status.fail { background: #ffebe9; color: #cf222e; border: 1px solid #ff818266; }
  .check-status.pass { background: #dafbe1; color: #1a7f37; border: 1px solid #4ac26b66; }

  /* Merge blocked banner */
  .merge-blocked {
    background: #fff8c5; border: 1px solid #d4a72c40;
    border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;
    display: flex; align-items: center; gap: 10px; font-size: 0.85rem;
  }
  .merge-blocked .icon { font-size: 1.2rem; }
  .merge-blocked strong { color: #1f2328; }

  /* Labels */
  .label-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
  .label {
    padding: 2px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 600;
    border: 1px solid transparent;
  }

  /* Comment body — markdown rendered */
  .comment-body { padding: 16px 20px; font-size: 0.88rem; }
  .comment-body h1 { font-size: 1.2rem; font-weight: 700; margin: 12px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #d0d7de; }
  .comment-body h2 { font-size: 1.05rem; font-weight: 700; margin: 16px 0 8px; }
  .comment-body h3 { font-size: 0.95rem; font-weight: 700; margin: 14px 0 6px; }
  .comment-body h4 { font-size: 0.88rem; font-weight: 700; margin: 10px 0 5px; }
  .comment-body p { margin: 6px 0; }
  .comment-body hr { border: none; border-top: 1px solid #d0d7de; margin: 16px 0; }
  .comment-body code {
    background: #eff1f3; padding: 2px 5px; border-radius: 4px;
    font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.82em; color: #1f2328;
  }
  .comment-body pre.highlight {
    background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px;
    padding: 14px 16px; overflow-x: auto; margin: 10px 0;
  }
  .comment-body pre code { background: none; padding: 0; font-size: 0.82rem; color: #1f2328; }
  .comment-body blockquote {
    border-left: 3px solid #d0d7de; padding-left: 12px; color: #57606a; margin: 8px 0;
  }
  .comment-body li { margin: 3px 0 3px 20px; }
  .comment-body oli { margin: 3px 0 3px 20px; list-style-type: decimal; display: list-item; }
  .comment-body strong { font-weight: 700; }
  .comment-body table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 0.84rem; }
  .comment-body tr { border-bottom: 1px solid #d0d7de; }
  .comment-body tr.sep { display: none; }
  .comment-body td { padding: 6px 12px; }
  .comment-body tr:first-child td { font-weight: 700; background: #f6f8fa; }
  .comment-body details.details-block {
    border: 1px solid #d0d7de; border-radius: 6px; padding: 10px 14px; margin: 8px 0;
    background: #f6f8fa;
  }

  /* Watermark label */
  .preview-label {
    text-align: center; padding: 8px; font-size: 0.72rem;
    color: #8b949e; background: #f6f8fa; border-top: 1px solid #d0d7de;
  }
</style>
</head>
<body>

<!-- GitHub chrome -->
<div class="gh-header">
  <div class="gh-logo">🔒</div>
  <div class="gh-repo">
    <a href="#">jayjoshix / incident-commander</a>
    <span style="color:#8b949e"> › Pull requests › </span>
    <a href="#">#7 feat: update fact_orders schema — rename customer_id, change email type</a>
  </div>
</div>

<div class="pr-page">

  <!-- PR title -->
  <div class="pr-title-bar">
    <span class="pr-state">🚫 Blocked</span>
    <div>
      <div class="pr-name">feat: update fact_orders schema — rename customer_id, change email type</div>
    </div>
  </div>
  <div class="pr-meta">
    <strong>data-engineer</strong> wants to merge 1 commit into
    <code>main</code> from <code>feat/update-fact-orders-schema</code>
    · opened 2 minutes ago
  </div>

  <!-- Labels -->
  <div class="label-row">
    <span class="label" style="background:#ffebe9;color:#cf222e;border-color:#ff818266">lineagelock:critical</span>
    <span class="label" style="background:#fff8c5;color:#9a6700;border-color:#d4a72c66">governance:blocked</span>
    <span class="label" style="background:#ddf4ff;color:#0969da;border-color:#54aeff66">needs:privacy-review</span>
    <span class="label" style="background:#dafbe1;color:#1a7f37;border-color:#4ac26b66">lineagelock:analyzed</span>
  </div>

  <!-- Tab bar -->
  <div class="pr-tabs">
    <div class="pr-tab">Conversation <span style="background:#d0d7de;border-radius:999px;padding:1px 7px;font-size:0.72rem;margin-left:4px">3</span></div>
    <div class="pr-tab active">Commits <span style="background:#d0d7de;border-radius:999px;padding:1px 7px;font-size:0.72rem;margin-left:4px">1</span></div>
    <div class="pr-tab">Checks <span style="background:#ffebe9;color:#cf222e;border-radius:999px;padding:1px 7px;font-size:0.72rem;margin-left:4px">1 fail</span></div>
    <div class="pr-tab">Files changed <span style="background:#d0d7de;border-radius:999px;padding:1px 7px;font-size:0.72rem;margin-left:4px">2</span></div>
  </div>

  <!-- Merge blocked -->
  <div class="merge-blocked">
    <span class="icon">🚫</span>
    <div><strong>Merging is blocked</strong> — LineageLock has flagged this PR as CRITICAL risk. Required reviews from <strong>privacy-team</strong> and <strong>data-quality</strong> have not been completed.</div>
  </div>

  <!-- Status checks -->
  <div class="merge-check">
    <div class="merge-check-row" style="background:#fff8c5">
      <span class="check-icon">🚫</span>
      <div class="check-name">🔒 LineageLock Risk Analysis</div>
      <span class="check-status fail">Required · Failing</span>
    </div>
    <div class="merge-check-row">
      <span class="check-icon">✅</span>
      <div class="check-name">CI / tests (20)</div>
      <span class="check-status pass">Passing</span>
    </div>
    <div class="merge-check-row">
      <span class="check-icon">✅</span>
      <div class="check-name">CI / lint</div>
      <span class="check-status pass">Passing</span>
    </div>
  </div>

  <!-- LineageLock bot comment -->
  <div class="comment-card">
    <div class="comment-header">
      <div class="comment-avatar">LL</div>
      <div>
        <span class="comment-author">
          lineagelock-bot
          <span class="bot-badge">bot</span>
        </span>
        <br><span style="font-size:0.75rem;color:#8b949e">commented 2 minutes ago · updated just now</span>
      </div>
      <div class="comment-time">· · ·</div>
    </div>
    <div class="comment-body">
      ${body}
    </div>
  </div>

</div>

<div class="preview-label">
  LineageLock PR Comment Preview — generated from demo fixture data · artifacts/pr-comment.md
</div>

</body>
</html>`;

const outPath = path.join(artifactsDir, 'pr-comment-preview.html');
fs.writeFileSync(outPath, html);
console.log(`✅ HTML preview saved to artifacts/pr-comment-preview.html`);
console.log(`\n👉 Open in browser:  file://${outPath}`);
console.log(`   Then take a screenshot for your submission!\n`);

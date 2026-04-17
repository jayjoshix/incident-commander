/**
 * GitHub API Helpers
 *
 * Handles PR metadata, changed file detection, and comment posting.
 */

import * as github from '@actions/github';

export interface PRContext {
  owner: string;
  repo: string;
  pullNumber: number;
  sha: string;
  baseBranch: string;
  headBranch: string;
}

export interface ChangedFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  patch?: string;
}

/**
 * Extract PR context from GitHub Actions environment.
 */
export function getPRContext(): PRContext {
  const context = github.context;
  const pr = context.payload.pull_request;

  if (!pr) {
    throw new Error(
      'LineageLock must run on a pull_request event. ' +
      'Ensure your workflow uses: on: [pull_request]'
    );
  }

  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pullNumber: pr.number,
    sha: pr.head.sha,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
  };
}

/**
 * Fetch the list of changed files in a PR.
 */
export async function getChangedFiles(
  token: string,
  ctx: PRContext
): Promise<ChangedFile[]> {
  const octokit = github.getOctokit(token);
  const allFiles: ChangedFile[] = [];
  let page = 1;

  while (true) {
    const response = await octokit.rest.pulls.listFiles({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: ctx.pullNumber,
      per_page: 100,
      page,
    });

    for (const file of response.data) {
      allFiles.push({
        filename: file.filename,
        status: file.status as ChangedFile['status'],
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch,
      });
    }

    if (response.data.length < 100) break;
    page++;
  }

  return allFiles;
}

/**
 * Post or update a comment on a PR.
 * Uses a marker to find and update existing LineageLock comments.
 */
export async function postOrUpdateComment(
  token: string,
  ctx: PRContext,
  body: string
): Promise<void> {
  const octokit = github.getOctokit(token);
  const marker = '<!-- lineagelock-report -->';
  const fullBody = `${marker}\n${body}`;

  // Find existing comment
  const { data: comments } = await octokit.rest.issues.listComments({
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.pullNumber,
    per_page: 100,
  });

  const existing = comments.find((c) => c.body?.includes(marker));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: ctx.owner,
      repo: ctx.repo,
      comment_id: existing.id,
      body: fullBody,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner: ctx.owner,
      repo: ctx.repo,
      issue_number: ctx.pullNumber,
      body: fullBody,
    });
  }
}

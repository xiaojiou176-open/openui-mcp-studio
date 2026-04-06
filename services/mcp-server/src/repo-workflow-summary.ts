import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GITHUB_API_VERSION = "2022-11-28";

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
};

type CommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<CommandResult>;

type HttpFetcher = typeof fetch;

type JsonCommandResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

type GitHubRunSummary = {
  databaseId?: number;
  workflowName: string;
  displayTitle: string;
  conclusion: string;
  event: string;
  url: string;
  createdAt?: string;
  headSha?: string;
  status?: string;
};

type LocalChangedFilesSummary = {
  modified: number;
  added: number;
  deleted: number;
  renamed: number;
  untracked: number;
  other: number;
};

export type RepoWorkflowSummary = {
  version: 1;
  generatedAt: string;
  workspaceRoot: string;
  repository: {
    originUrl: string | null;
    owner: string | null;
    name: string | null;
    defaultBranch: string | null;
    visibility: string | null;
    homepageUrl: string | null;
  };
  local: {
    branch: string | null;
    dirty: boolean;
    changedFileCount: number;
    changedFiles: string[];
    changedFilesSummary: LocalChangedFilesSummary;
  };
  github: {
    status: "connected" | "blocked";
    connected: boolean;
    blockedReason: string | null;
    openPullRequestCount: number | null;
    openIssueCount: number | null;
    openCodeScanningAlertCount: number | null;
    openSecretScanningAlertCount: number | null;
    openDependabotAlertCount: number | null;
    requiredChecks: string[];
    requiredApprovingReviewCount: number | null;
    requireCodeOwnerReviews: boolean | null;
    requireConversationResolution: boolean | null;
    recentFailedRuns: GitHubRunSummary[];
  };
  externalBlockers: string[];
  nextRecommendedStep: string;
};

type StatusEntry = {
  code: string;
  filePath: string;
};

function createDefaultRunner(): CommandRunner {
  return async (command, args, options = {}) => {
    try {
      const result = await execFileAsync(command, args, {
        cwd: options.cwd,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
      return {
        exitCode: 0,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        error: null,
      };
    } catch (error) {
      if (error && typeof error === "object") {
        const execError = error as {
          code?: number | string;
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        return {
          exitCode: typeof execError.code === "number" ? execError.code : null,
          stdout: execError.stdout ?? "",
          stderr: execError.stderr ?? "",
          error: execError.message ?? String(error),
        };
      }
      return {
        exitCode: null,
        stdout: "",
        stderr: "",
        error: String(error),
      };
    }
  };
}

function parseOriginRepository(
  originUrl: string | null,
): { owner: string; name: string } | null {
  const value = (originUrl ?? "").trim();
  if (!value) {
    return null;
  }

  const sshMatch = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u);
  if (sshMatch) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }

  const httpsMatch = value.match(
    /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/u,
  );
  if (httpsMatch) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }

  return null;
}

function isGitHubBlobUrl(value: string | null): boolean {
  const candidate = value?.trim();
  if (!candidate) {
    return false;
  }

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "github.com" && parsed.pathname.includes("/blob/");
  } catch {
    return false;
  }
}

function createEmptyChangedFilesSummary(): LocalChangedFilesSummary {
  return {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    other: 0,
  };
}

function classifyStatusCode(code: string): keyof LocalChangedFilesSummary {
  const normalized = code.trim();
  if (normalized === "??") {
    return "untracked";
  }
  if (normalized.includes("R")) {
    return "renamed";
  }
  if (normalized.includes("D")) {
    return "deleted";
  }
  if (normalized.includes("A")) {
    return "added";
  }
  if (normalized.includes("M")) {
    return "modified";
  }
  return "other";
}

async function runJsonCommand(
  runner: CommandRunner,
  command: string,
  args: string[],
  cwd: string,
): Promise<JsonCommandResult> {
  const result = await runner(command, args, { cwd });
  if (result.exitCode !== 0) {
    return {
      ok: false,
      error:
        result.error || result.stderr || result.stdout || `${command} failed`,
    };
  }
  try {
    return {
      ok: true,
      value: JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchGitHubJson(
  fetcher: HttpFetcher,
  pathname: string,
): Promise<JsonCommandResult> {
  try {
    const response = await fetcher(
      `https://api.github.com/${pathname.replace(/^\/+/u, "")}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "openui-mcp-studio/repo-workflow-summary",
          "x-github-api-version": GITHUB_API_VERSION,
        },
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        error: `GitHub REST ${response.status}: ${pathname}`,
      };
    }
    return {
      ok: true,
      value: await response.json(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runJsonCommandWithFallback(
  runner: CommandRunner,
  command: string,
  args: string[],
  cwd: string,
  restPathname: string | null,
  fetcher?: HttpFetcher,
  mapRestValue?: (value: unknown) => unknown,
): Promise<JsonCommandResult> {
  const result = await runJsonCommand(runner, command, args, cwd);
  if (result.ok || !restPathname || !fetcher) {
    return result;
  }
  const fallback = await fetchGitHubJson(fetcher, restPathname);
  if (!fallback.ok) {
    return result;
  }
  return {
    ok: true,
    value: mapRestValue ? mapRestValue(fallback.value) : fallback.value,
  };
}

function pushUniqueBlocker(blockers: string[], message: string): void {
  if (!blockers.includes(message)) {
    blockers.push(message);
  }
}

async function readOriginUrl(
  runner: CommandRunner,
  workspaceRoot: string,
): Promise<string | null> {
  const result = await runner("git", ["remote", "get-url", "origin"], {
    cwd: workspaceRoot,
  });
  if (result.exitCode !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

async function readLocalRepositoryFallbacks(workspaceRoot: string): Promise<{
  defaultBranch: string | null;
  visibility: string | null;
  homepageUrl: string | null;
}> {
  let visibility: string | null = null;
  let homepageUrl: string | null = null;
  try {
    const raw = await fs.readFile(
      path.resolve(workspaceRoot, "tooling/contracts/remote-governance-evidence.contract.json"),
      "utf8",
    );
    const contract = JSON.parse(raw) as {
      repository?: { visibility?: string };
    };
    visibility = contract.repository?.visibility?.trim() || null;
  } catch {
    // best-effort only
  }
  try {
    const raw = await fs.readFile(
      path.resolve(workspaceRoot, "tooling/contracts/public-surface.contract.json"),
      "utf8",
    );
    const contract = JSON.parse(raw) as {
      about?: { homepageUrl?: string };
    };
    homepageUrl = contract.about?.homepageUrl?.trim() || null;
  } catch {
    // best-effort only
  }
  return {
    defaultBranch: "main",
    visibility,
    homepageUrl,
  };
}

function parseStatusEntries(stdout: string): StatusEntry[] {
  return stdout
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => ({
      code: line.slice(0, 2),
      filePath: line.slice(3).trim(),
    }));
}

async function readLocalGitState(
  runner: CommandRunner,
  workspaceRoot: string,
): Promise<RepoWorkflowSummary["local"]> {
  const branchResult = await runner(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: workspaceRoot },
  );
  const statusResult = await runner("git", ["status", "--short"], {
    cwd: workspaceRoot,
  });
  const statusEntries =
    statusResult.exitCode === 0 ? parseStatusEntries(statusResult.stdout) : [];
  const changedFilesSummary = statusEntries.reduce<LocalChangedFilesSummary>(
    (summary, entry) => {
      summary[classifyStatusCode(entry.code)] += 1;
      return summary;
    },
    createEmptyChangedFilesSummary(),
  );

  return {
    branch:
      branchResult.exitCode === 0 ? branchResult.stdout.trim() || null : null,
    dirty: statusEntries.length > 0,
    changedFileCount: statusEntries.length,
    changedFiles: statusEntries.map((entry) => entry.filePath).slice(0, 20),
    changedFilesSummary,
  };
}

function buildNextRecommendedStep(input: {
  local: RepoWorkflowSummary["local"];
  github: RepoWorkflowSummary["github"];
  externalBlockers: string[];
  defaultBranch?: string | null;
}): string {
  if (input.local.dirty) {
    return "Stabilize the current worktree, then generate a repo workflow summary before opening or updating a PR.";
  }
  if (!input.github.connected) {
    return "Resolve GitHub CLI/auth connectivity so the repo can surface PR and workflow readiness before any remote mutation.";
  }
  if ((input.github.openCodeScanningAlertCount ?? 0) > 0) {
    if (
      input.local.branch &&
      input.defaultBranch &&
      input.local.branch !== input.defaultBranch
    ) {
      return "If the current PR checks are green, merge or separately remediate the remaining default-branch code-scanning alerts, then re-run workflow readiness.";
    }
    return "Address open code-scanning alerts first, then re-run workflow readiness before claiming closeout.";
  }
  if (input.externalBlockers.length > 0) {
    return "Record the external blockers in the runbook and keep the local workflow slice read-only until remote prerequisites are resolved.";
  }
  return "Use this summary as the pre-PR checklist: verify required checks, confirm no open security alerts, and only then move into branch/PR mutation.";
}

export async function buildRepoWorkflowSummary(input: {
  workspaceRoot: string;
  failedRunsLimit?: number;
  runner?: CommandRunner;
  httpFetcher?: HttpFetcher;
}): Promise<RepoWorkflowSummary> {
  const runner = input.runner ?? createDefaultRunner();
  const httpFetcher =
    input.httpFetcher ??
    (input.runner ? undefined : globalThis.fetch?.bind(globalThis));
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const failedRunsLimit = input.failedRunsLimit ?? 10;
  const originUrl = await readOriginUrl(runner, workspaceRoot);
  const repository = parseOriginRepository(originUrl);
  const local = await readLocalGitState(runner, workspaceRoot);
  const headResult = await runner("git", ["rev-parse", "HEAD"], {
    cwd: workspaceRoot,
  });
  const currentHeadSha =
    headResult.exitCode === 0 ? headResult.stdout.trim() || null : null;

  const summary: RepoWorkflowSummary = {
    version: 1,
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    repository: {
      originUrl,
      owner: repository?.owner ?? null,
      name: repository?.name ?? null,
      defaultBranch: null,
      visibility: null,
      homepageUrl: null,
    },
    local,
    github: {
      status: "blocked",
      connected: false,
      blockedReason: null,
      openPullRequestCount: null,
      openIssueCount: null,
      openCodeScanningAlertCount: null,
      openSecretScanningAlertCount: null,
      openDependabotAlertCount: null,
      requiredChecks: [],
      requiredApprovingReviewCount: null,
      requireCodeOwnerReviews: null,
      requireConversationResolution: null,
      recentFailedRuns: [],
    },
    externalBlockers: [],
    nextRecommendedStep: "",
  };

  if (!repository) {
    pushUniqueBlocker(
      summary.externalBlockers,
      "Origin remote does not resolve to a GitHub owner/repo pair.",
    );
    summary.github.blockedReason =
      "Could not derive GitHub repository coordinates from origin.";
    summary.nextRecommendedStep = buildNextRecommendedStep({
      local,
      github: summary.github,
      externalBlockers: summary.externalBlockers,
    });
    return summary;
  }

  const repoSlug = `${repository.owner}/${repository.name}`;
  const repoView = await runJsonCommandWithFallback(
    runner,
    "gh",
    [
      "repo",
      "view",
      repoSlug,
      "--json",
      "name,owner,visibility,homepageUrl,defaultBranchRef",
    ],
    workspaceRoot,
    `repos/${repoSlug}`,
    httpFetcher,
    (value) => {
      const repo = value as {
        private?: boolean;
        homepage?: string | null;
        default_branch?: string;
      };
      return {
        visibility: repo.private === true ? "PRIVATE" : "PUBLIC",
        homepageUrl: repo.homepage ?? null,
        defaultBranchRef: {
          name: repo.default_branch ?? "main",
        },
      };
    },
  );
  if (!repoView.ok) {
    const fallback = await readLocalRepositoryFallbacks(workspaceRoot);
    summary.repository.defaultBranch = fallback.defaultBranch;
    summary.repository.visibility = fallback.visibility;
    summary.repository.homepageUrl = fallback.homepageUrl;
    pushUniqueBlocker(
      summary.externalBlockers,
      `GitHub view unavailable: ${repoView.error}`,
    );
  }
  const repoViewValue = repoView.ok
    ? (repoView.value as {
        defaultBranchRef?: { name?: string };
        homepageUrl?: string;
        visibility?: string;
      })
    : null;
  const defaultBranch =
    repoViewValue?.defaultBranchRef?.name?.trim() ||
    summary.repository.defaultBranch ||
    "main";
  summary.repository.defaultBranch = defaultBranch;
  summary.repository.visibility =
    repoViewValue?.visibility?.trim() || summary.repository.visibility || null;
  summary.repository.homepageUrl =
    repoViewValue?.homepageUrl?.trim() || summary.repository.homepageUrl || null;

  if (isGitHubBlobUrl(summary.repository.homepageUrl)) {
    pushUniqueBlocker(
      summary.externalBlockers,
      "GitHub homepage still points at a raw blob URL instead of the product front door.",
    );
  }

  const [
    prsResult,
    issuesResult,
    codeAlertsResult,
    secretAlertsResult,
    dependabotAlertsResult,
    branchProtectionResult,
    failedRunsResult,
    currentBranchRunsResult,
  ] = await Promise.all([
    runJsonCommandWithFallback(
      runner,
      "gh",
      [
        "pr",
        "list",
        "--repo",
        repoSlug,
        "--state",
        "open",
        "--limit",
        "20",
        "--json",
        "number",
      ],
      workspaceRoot,
      `repos/${repository.owner}/${repository.name}/pulls?state=open&per_page=20`,
      httpFetcher,
      (value) =>
        Array.isArray(value)
          ? value.map((entry) => ({ number: (entry as { number?: number }).number }))
          : [],
    ),
    runJsonCommandWithFallback(
      runner,
      "gh",
      [
        "issue",
        "list",
        "--repo",
        repoSlug,
        "--state",
        "open",
        "--limit",
        "20",
        "--json",
        "number",
      ],
      workspaceRoot,
      `repos/${repository.owner}/${repository.name}/issues?state=open&per_page=20`,
      httpFetcher,
      (value) =>
        Array.isArray(value)
          ? value
              .filter((entry) => !("pull_request" in (entry as Record<string, unknown>)))
              .map((entry) => ({ number: (entry as { number?: number }).number }))
          : [],
    ),
    runJsonCommand(
      runner,
      "gh",
      [
        "api",
        `repos/${repository.owner}/${repository.name}/code-scanning/alerts`,
      ],
      workspaceRoot,
    ),
    runJsonCommand(
      runner,
      "gh",
      [
        "api",
        `repos/${repository.owner}/${repository.name}/secret-scanning/alerts`,
      ],
      workspaceRoot,
    ),
    runJsonCommand(
      runner,
      "gh",
      ["api", `repos/${repository.owner}/${repository.name}/dependabot/alerts`],
      workspaceRoot,
    ),
    runJsonCommand(
      runner,
      "gh",
      [
        "api",
        `repos/${repository.owner}/${repository.name}/branches/${defaultBranch}/protection`,
      ],
      workspaceRoot,
    ),
    runJsonCommandWithFallback(
      runner,
      "gh",
      [
        "run",
        "list",
        "--repo",
        repoSlug,
        "--limit",
        String(failedRunsLimit),
        "--status",
        "failure",
        "--json",
        "workflowName,displayTitle,conclusion,event,url,createdAt,databaseId",
      ],
      workspaceRoot,
      `repos/${repository.owner}/${repository.name}/actions/runs?status=failure&per_page=${failedRunsLimit}`,
      httpFetcher,
      (value: unknown) => {
        const runs = (value as { workflow_runs?: Array<Record<string, unknown>> })
          ?.workflow_runs;
        return Array.isArray(runs)
          ? runs.map((run) => ({
              databaseId: run.id,
              workflowName: run.name,
              displayTitle: run.display_title,
              conclusion: run.conclusion,
              event: run.event,
              url: run.html_url,
              createdAt: run.created_at,
              headSha: run.head_sha,
              status: run.status,
            }))
          : [];
      },
    ),
    runJsonCommandWithFallback(
      runner,
      "gh",
      [
        "run",
        "list",
        "--repo",
        repoSlug,
        "--branch",
        local.branch || defaultBranch,
        "--limit",
        String(failedRunsLimit),
        "--json",
        "workflowName,displayTitle,conclusion,event,url,createdAt,databaseId,headSha,status",
      ],
      workspaceRoot,
      `repos/${repository.owner}/${repository.name}/actions/runs?branch=${encodeURIComponent(local.branch || defaultBranch)}&per_page=${failedRunsLimit}`,
      httpFetcher,
      (value: unknown) => {
        const runs = (value as { workflow_runs?: Array<Record<string, unknown>> })
          ?.workflow_runs;
        return Array.isArray(runs)
          ? runs.map((run) => ({
              databaseId: run.id,
              workflowName: run.name,
              displayTitle: run.display_title,
              conclusion: run.conclusion,
              event: run.event,
              url: run.html_url,
              createdAt: run.created_at,
              headSha: run.head_sha,
              status: run.status,
            }))
          : [];
      },
    ),
  ]);

  const remoteErrors = [
    prsResult,
    issuesResult,
    codeAlertsResult,
    secretAlertsResult,
    dependabotAlertsResult,
    branchProtectionResult,
  ].flatMap((result) => (result.ok ? [] : [result.error]));

  const prsValue = prsResult.ok ? prsResult.value : [];
  const issuesValue = issuesResult.ok ? issuesResult.value : [];
  const codeAlertsValue = codeAlertsResult.ok ? codeAlertsResult.value : [];
  const secretAlertsValue = secretAlertsResult.ok ? secretAlertsResult.value : [];
  const dependabotAlertsValue = dependabotAlertsResult.ok
    ? dependabotAlertsResult.value
    : [];
  const protectionValue = branchProtectionResult.ok ? branchProtectionResult.value : {};
  const failedRunsValue = failedRunsResult.ok ? failedRunsResult.value : [];
  const currentBranchRunsValue = currentBranchRunsResult.ok
    ? currentBranchRunsResult.value
    : [];

  const githubErrors = [
    ...(repoView.ok ? [] : [repoView.error]),
    ...remoteErrors,
  ];
  summary.github.status = githubErrors.length > 0 ? "blocked" : "connected";
  summary.github.connected = githubErrors.length === 0;
  summary.github.blockedReason =
    githubErrors.length > 0 ? githubErrors.join(" | ") : null;
  summary.github.openPullRequestCount = Array.isArray(prsValue)
    ? prsValue.length
    : null;
  summary.github.openIssueCount = Array.isArray(issuesValue)
    ? issuesValue.length
    : null;
  summary.github.openCodeScanningAlertCount = Array.isArray(codeAlertsValue)
    ? (codeAlertsValue as Array<{ state?: string }>).filter(
        (alert) => alert.state === "open",
      ).length
    : null;
  summary.github.openSecretScanningAlertCount = Array.isArray(secretAlertsValue)
    ? (secretAlertsValue as Array<{ state?: string }>).filter(
        (alert) => alert.state === "open",
      ).length
    : null;
  summary.github.openDependabotAlertCount = Array.isArray(dependabotAlertsValue)
    ? (dependabotAlertsValue as Array<{ state?: string }>).filter(
        (alert) => alert.state !== "fixed" && alert.state !== "dismissed",
      ).length
    : null;

  const protection = protectionValue as {
    required_status_checks?: { contexts?: string[] };
    required_pull_request_reviews?: {
      required_approving_review_count?: number;
      require_code_owner_reviews?: boolean;
    };
    required_conversation_resolution?: { enabled?: boolean };
  };
  summary.github.requiredChecks =
    protection.required_status_checks?.contexts ?? [];
  summary.github.requiredApprovingReviewCount =
    protection.required_pull_request_reviews?.required_approving_review_count ??
    0;
  summary.github.requireCodeOwnerReviews =
    protection.required_pull_request_reviews?.require_code_owner_reviews ??
    false;
  summary.github.requireConversationResolution =
    protection.required_conversation_resolution?.enabled ?? false;
  const failedRuns = Array.isArray(failedRunsValue)
    ? (failedRunsValue as GitHubRunSummary[]).slice(0, failedRunsLimit)
    : [];
  const currentBranchRuns = Array.isArray(currentBranchRunsValue)
    ? (currentBranchRunsValue as GitHubRunSummary[]).slice(0, failedRunsLimit)
    : [];
  const currentHeadHasSuccessfulRemoteRun =
    currentHeadSha !== null &&
    currentBranchRuns.some(
      (run) =>
        run.headSha === currentHeadSha &&
        run.status === "completed" &&
        run.conclusion === "success",
    );
  const currentHeadHasActiveRemoteRun =
    currentHeadSha !== null &&
    currentBranchRuns.some(
      (run) =>
        run.headSha === currentHeadSha &&
        (run.status === "queued" || run.status === "in_progress"),
    );
  summary.github.recentFailedRuns =
    currentHeadHasSuccessfulRemoteRun || currentHeadHasActiveRemoteRun
    ? failedRuns.filter((run) => run.headSha === currentHeadSha)
    : failedRuns;
  if (!failedRunsResult.ok) {
    pushUniqueBlocker(
      summary.externalBlockers,
      `Recent failed workflow run lookup was unavailable: ${failedRunsResult.error}`,
    );
  }
  for (const error of remoteErrors) {
    pushUniqueBlocker(
      summary.externalBlockers,
      `GitHub read failed: ${error}`,
    );
  }

  if ((summary.github.openCodeScanningAlertCount ?? 0) > 0) {
    pushUniqueBlocker(
      summary.externalBlockers,
      `${summary.github.openCodeScanningAlertCount} open code-scanning alert(s) remain on the remote repository and need merge-time recheck or dedicated remediation.`,
    );
  }
  if ((summary.github.openSecretScanningAlertCount ?? 0) > 0) {
    pushUniqueBlocker(
      summary.externalBlockers,
      `${summary.github.openSecretScanningAlertCount} open secret-scanning alert(s) still require maintainer action before remote security posture is clean.`,
    );
  }
  if ((summary.github.recentFailedRuns.length ?? 0) > 0) {
    pushUniqueBlocker(
      summary.externalBlockers,
      "At least one recent failing GitHub workflow run is still visible on the remote repository.",
    );
  }

  summary.nextRecommendedStep = buildNextRecommendedStep({
    local,
    github: summary.github,
    externalBlockers: summary.externalBlockers,
    defaultBranch,
  });

  return summary;
}

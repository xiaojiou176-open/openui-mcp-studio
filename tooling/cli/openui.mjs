#!/usr/bin/env node
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CLI_NAME = "openui-mcp-studio";
const SCRIPT_REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const LATER_LANES = [
  "official catalog or marketplace listing",
  "published supporting-package registry release",
  "deployed hosted API runtime",
  "remote write-capable MCP",
];

function stripCommandBoundary(argv) {
  if (argv[0] === "--") {
    return argv.slice(1);
  }
  return argv;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isWorkspaceRoot(candidatePath) {
  const packageJsonPath = path.join(candidatePath, "package.json");
  const openapiPath = path.join(
    candidatePath,
    "docs",
    "contracts",
    "openui-mcp.openapi.json",
  );
  const mcpEntryPath = path.join(
    candidatePath,
    "services",
    "mcp-server",
    "src",
    "main.ts",
  );

  if (
    !(await fileExists(packageJsonPath)) ||
    !(await fileExists(openapiPath)) ||
    !(await fileExists(mcpEntryPath))
  ) {
    return false;
  }

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    return packageJson.name === "openui-mcp-studio";
  } catch {
    return false;
  }
}

async function resolveWorkspaceRoot(startDir) {
  let currentDir = path.resolve(startDir);
  while (true) {
    if (await isWorkspaceRoot(currentDir)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return SCRIPT_REPO_ROOT;
    }
    currentDir = parentDir;
  }
}

function buildHelpText() {
  return [
    `OpenUI MCP Studio repo-local CLI`,
    "",
    "This command is a repo-side builder surface, not a hosted API, SDK, plugin, or generic builder platform.",
    "",
    "Current builder surface order:",
    `1. local stdio MCP            -> \`${CLI_NAME} mcp\``,
    `2. compatibility OpenAPI     -> \`${CLI_NAME} openapi\``,
    `3. repo-local workflow packet -> \`${CLI_NAME} workflow summary|ready\``,
    "",
    "Later lanes, not current promises:",
    ...LATER_LANES.map((lane) => `- ${lane}`),
    "",
    "Commands:",
    `  ${CLI_NAME} help`,
    `  ${CLI_NAME} surface-guide [--json]`,
    `  ${CLI_NAME} ecosystem-guide [--json]`,
    `  ${CLI_NAME} mcp`,
    `  ${CLI_NAME} hosted info|openapi|serve [--port <n>] [--host <host>]`,
    `  ${CLI_NAME} workflow summary [--failed-runs-limit <n>]`,
    `  ${CLI_NAME} workflow ready [--failed-runs-limit <n>] [--no-artifacts]`,
    `  ${CLI_NAME} openapi [--json|--print]`,
    `  ${CLI_NAME} skills starter [--json]`,
    `  ${CLI_NAME} hosted info [--json]`,
    `  ${CLI_NAME} hosted openapi [--json]`,
    `  ${CLI_NAME} hosted serve [--port <n>] [--token <value>] [--rate-limit-rpm <n>]`,
    "",
    "Examples:",
    `  ${CLI_NAME} surface-guide`,
    `  ${CLI_NAME} ecosystem-guide --json`,
    `  ${CLI_NAME} mcp`,
    `  ${CLI_NAME} workflow summary --failed-runs-limit 3`,
    `  ${CLI_NAME} workflow ready --no-artifacts`,
    `  ${CLI_NAME} openapi`,
    `  ${CLI_NAME} skills starter`,
    `  ${CLI_NAME} hosted info --json`,
    "",
  ].join("\n");
}

function printHelp() {
  process.stdout.write(`${buildHelpText()}`);
}

async function runNodeCommand(input) {
  const forwardedArgs = stripCommandBoundary(input.args);
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...input.nodeArgs, ...forwardedArgs],
      {
        cwd: input.cwd,
        stdio: "inherit",
        env: process.env,
      },
    );

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${input.label} exited via signal ${signal}.`));
        return;
      }
      resolve(code ?? 0);
    });
  }).then((code) => {
    if (typeof code === "number" && code !== 0) {
      process.exit(code);
    }
  });
}

async function runMcp(workspaceRoot, args) {
  process.stderr.write(
    `[${CLI_NAME}] starting local stdio MCP from services/mcp-server/src/main.ts\n`,
  );
  await runNodeCommand({
    label: "mcp",
    cwd: workspaceRoot,
    args,
    nodeArgs: [
      "--env-file-if-exists=.env",
      "--import",
      "tsx",
      path.join(workspaceRoot, "services/mcp-server/src/main.ts"),
    ],
  });
}

async function runWorkflowCommand(workspaceRoot, subcommand, args) {
  if (subcommand === "summary") {
    await runNodeCommand({
      label: "workflow summary",
      cwd: workspaceRoot,
      args,
      nodeArgs: [
        "--import",
        "tsx",
        path.join(workspaceRoot, "tooling/cli/repo-workflow-summary.ts"),
        "--workspace-root",
        workspaceRoot,
      ],
    });
    return;
  }

  if (subcommand === "ready") {
    await runNodeCommand({
      label: "workflow ready",
      cwd: workspaceRoot,
      args,
      nodeArgs: [
        "--import",
        "tsx",
        path.join(workspaceRoot, "tooling/cli/repo-workflow-ready.mjs"),
        "--workspace-root",
        workspaceRoot,
      ],
    });
    return;
  }

  throw new Error(
    `Unknown workflow command: ${subcommand ?? "(missing)"}. Use \`${CLI_NAME} workflow summary\` or \`${CLI_NAME} workflow ready\`.`,
  );
}

async function readOpenapiDocument(workspaceRoot) {
  const openapiPath = path.join(
    workspaceRoot,
    "docs/contracts/openui-mcp.openapi.json",
  );
  const openapiRaw = await fs.readFile(openapiPath, "utf8");
  return {
    openapiPath,
    openapiRaw,
    openapiDocument: JSON.parse(openapiRaw),
  };
}

async function readEcosystemDocument(workspaceRoot) {
  const ecosystemPath = path.join(
    workspaceRoot,
    "docs/contracts/openui-ecosystem-productization.json",
  );
  const ecosystemRaw = await fs.readFile(ecosystemPath, "utf8");
  return {
    ecosystemPath,
    ecosystemDocument: JSON.parse(ecosystemRaw),
  };
}

async function readHostedOpenapiDocument(workspaceRoot) {
  const hostedOpenapiPath = path.join(
    workspaceRoot,
    "docs/contracts/openui-hosted-api.openapi.json",
  );
  const hostedOpenapiRaw = await fs.readFile(hostedOpenapiPath, "utf8");
  return {
    hostedOpenapiPath,
    hostedOpenapiDocument: JSON.parse(hostedOpenapiRaw),
  };
}

async function readSkillsKitManifest(workspaceRoot) {
  const manifestPath = path.join(
    workspaceRoot,
    "packages/skills-kit/manifest.json",
  );
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  return {
    manifestPath,
    manifest: JSON.parse(manifestRaw),
  };
}

async function readPublicSkillsStarterManifest(workspaceRoot) {
  const manifestPath = path.join(
    workspaceRoot,
    "examples/skills/public-starter.manifest.json",
  );
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  return {
    manifestPath,
    manifest: JSON.parse(manifestRaw),
  };
}

function buildSurfaceGuidePayload(workspaceRoot, openapiDocument) {
  return {
    file: path.relative(
      workspaceRoot,
      path.join(workspaceRoot, "docs/contracts/openui-mcp.openapi.json"),
    ),
    dispatcher: openapiDocument["x-openui-builder-dispatcher"] ?? null,
    guide: openapiDocument["x-openui-builder-surface-guide"] ?? null,
    currentOrder: openapiDocument["x-openui-builder-surface-order"] ?? [],
    laterLanes: openapiDocument["x-openui-later-lanes"] ?? [],
    note: "Use this guide to read the current builder surface order. It does not claim official catalog listing, front-stage SDK / hosted packaging, or remote-write MCP surfaces as part of that builder-order contract.",
  };
}

function buildEcosystemGuidePayload(workspaceRoot, ecosystemDocument) {
  return {
    file: path.relative(
      workspaceRoot,
      path.join(
        workspaceRoot,
        "docs/contracts/openui-ecosystem-productization.json",
      ),
    ),
    technicalName: ecosystemDocument.technicalName ?? CLI_NAME,
    frontdoorLabel: ecosystemDocument.frontdoorLabel ?? null,
    summary: ecosystemDocument.summary ?? null,
    currentTruth: ecosystemDocument.currentTruth ?? null,
    clientSupportMatrix: ecosystemDocument.clientSupportMatrix ?? [],
    surfaces: ecosystemDocument.surfaces ?? [],
    operatorOnlyActions: ecosystemDocument.operatorOnlyActions ?? [],
    note: "Use this guide to explain current ecosystem packaging honestly. Plugin-grade install packs and the OpenClaw public-ready bundle are current repo-owned distribution surfaces, while official listing, registry publication, and managed deployment remain later/operator-owned.",
  };
}

function buildSkillsStarterPayload(
  workspaceRoot,
  packageManifest,
  publicStarterManifest,
  skills,
) {
  const packageManifestPath = path.join(
    workspaceRoot,
    "packages/skills-kit/manifest.json",
  );
  const publicStarterManifestPath = path.join(
    workspaceRoot,
    "examples/skills/public-starter.manifest.json",
  );
  const installPath = [
    ...new Set([
      ...(Array.isArray(packageManifest.installPath)
        ? packageManifest.installPath
        : []),
      ...(Array.isArray(publicStarterManifest.installPath)
        ? publicStarterManifest.installPath
        : []),
    ]),
  ];
  const verificationPath = Array.isArray(packageManifest.verificationPath)
    ? packageManifest.verificationPath
    : [];
  const usePath = Array.isArray(publicStarterManifest.usePath)
    ? publicStarterManifest.usePath
    : [];
  const starterBundles = Array.isArray(packageManifest.starterBundles)
    ? packageManifest.starterBundles
    : [];
  const proofLoop = Array.isArray(publicStarterManifest.proofLoop)
    ? publicStarterManifest.proofLoop
    : [];
  const troubleshootingPath = Array.isArray(
    publicStarterManifest.troubleshootingPath,
  )
    ? publicStarterManifest.troubleshootingPath
    : Array.isArray(packageManifest.troubleshootingPath)
      ? packageManifest.troubleshootingPath
      : [];
  const notFor = [
    ...new Set([
      ...(Array.isArray(packageManifest.notFor) ? packageManifest.notFor : []),
      ...(Array.isArray(publicStarterManifest.notFor)
        ? publicStarterManifest.notFor
        : []),
    ]),
  ];

  return {
    root: "packages/skills-kit",
    repoMirrorRoot: "examples/skills",
    packageName: packageManifest.packageName,
    version: packageManifest.version,
    summary: publicStarterManifest.summary ?? packageManifest.summary ?? null,
    audience: Array.isArray(publicStarterManifest.audience)
      ? publicStarterManifest.audience
      : [packageManifest.audience].filter(Boolean),
    role: publicStarterManifest.role ?? packageManifest.role ?? null,
    distributionTier:
      publicStarterManifest.distributionTier ?? packageManifest.status ?? null,
    packageManifest: path.relative(workspaceRoot, packageManifestPath),
    repoMirrorManifest: path.relative(workspaceRoot, publicStarterManifestPath),
		installPath,
		usePath,
		starterBundles,
		proofLoop,
		troubleshootingPath,
		verificationPath,
		officialPublicSurfaces:
			publicStarterManifest.officialPublicSurfaces ??
			packageManifest.officialPublicSurfaces ??
			null,
		notFor,
		count: skills.length,
    boundary:
      "These starter assets now form a plugin-grade public package shelf with starter bundles, proof loop, and troubleshooting. Marketplace or hosted Skills runtime claims still remain out of scope.",
    internalReminder:
      ".agents/skills remains internal-only collaboration infrastructure and is not this command's target.",
    skills,
  };
}

async function runSurfaceGuide(workspaceRoot, args) {
  const { openapiDocument } = await readOpenapiDocument(workspaceRoot);
  const payload = buildSurfaceGuidePayload(workspaceRoot, openapiDocument);

  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const lines = [
    "Builder surface guide",
    `- file: ${payload.file}`,
    `- dispatcher: ${payload.dispatcher?.cli ?? CLI_NAME}`,
    `- guide command: ${payload.dispatcher?.surfaceGuideCommand ?? `${CLI_NAME} surface-guide`}`,
    `- note: ${payload.note}`,
    "",
    "Start with:",
    `- ${payload.guide?.startWith ?? "local stdio MCP"}`,
    "",
    "Current order:",
    ...payload.currentOrder.flatMap((surface) => [
      `- ${surface.position}. ${surface.surface}`,
      `  - audience: ${surface.audience ?? "unknown"}`,
      `  - best_for: ${surface.bestFor ?? "unknown"}`,
      `  - read_when: ${surface.readWhen ?? "unknown"}`,
      `  - not_for: ${surface.notFor ?? "unknown"}`,
      ...(Array.isArray(surface.entrypoints)
        ? surface.entrypoints.map(
            (entrypoint) => `  - entrypoint: ${entrypoint}`,
          )
        : []),
    ]),
    "",
    "Guide:",
    `- OpenAPI when: ${payload.guide?.openapiWhen ?? "unknown"}`,
    `- Workflow packet when: ${payload.guide?.workflowPacketWhen ?? "unknown"}`,
    `- Skills starter when: ${payload.guide?.skillsStarterWhen ?? "unknown"}`,
    "",
    "Later lanes, not current promises:",
    ...payload.laterLanes.map(
      (lane) => `- ${lane.description ?? lane.id ?? String(lane)}`,
    ),
    "",
  ];

  process.stdout.write(lines.join("\n"));
}

async function runEcosystemGuide(workspaceRoot, args) {
  const { ecosystemDocument } = await readEcosystemDocument(workspaceRoot);
  const payload = buildEcosystemGuidePayload(workspaceRoot, ecosystemDocument);

  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const lines = [
    "Ecosystem guide",
    `- file: ${payload.file}`,
    `- technical name: ${payload.technicalName}`,
    `- front-door label: ${payload.frontdoorLabel ?? "unknown"}`,
    `- note: ${payload.note}`,
    "",
    "Current truth:",
    ...Object.entries(payload.currentTruth ?? {}).map(
      ([key, value]) => `- ${key}: ${value}`,
    ),
    "",
    "Ecosystem surfaces:",
    ...payload.surfaces.flatMap((surface) => [
      `- ${surface.title} (${surface.status})`,
      `  - audience: ${surface.audience}`,
      `  - role: ${surface.role}`,
      `  - package_shape: ${surface.packageShape}`,
      ...(Array.isArray(surface.installPath)
        ? surface.installPath.map((item) => `  - install_path: ${item}`)
        : []),
      ...(Array.isArray(surface.verificationPath)
        ? surface.verificationPath.map(
            (item) => `  - verification_path: ${item}`,
          )
        : []),
      `  - not_for: ${surface.notFor}`,
    ]),
    "",
    "Client support matrix:",
    ...payload.clientSupportMatrix.flatMap((client) => [
      `- ${client.client} (${client.status})`,
      `  - why: ${client.why}`,
      ...(Array.isArray(client.repoOwnedProof)
        ? client.repoOwnedProof.map((item) => `  - repo_owned_proof: ${item}`)
        : []),
      `  - not_for: ${client.notFor}`,
    ]),
    "",
    "Operator-only follow-through:",
    ...payload.operatorOnlyActions.map((item) => `- ${item}`),
    "",
  ];

  process.stdout.write(lines.join("\n"));
}

function collectOperationList(openapiDocument) {
  const operations = [];
  for (const [routePath, routeConfig] of Object.entries(
    openapiDocument.paths ?? {},
  )) {
    for (const [method, operation] of Object.entries(routeConfig ?? {})) {
      if (!operation || typeof operation !== "object") {
        continue;
      }
      operations.push({
        method: method.toUpperCase(),
        path: routePath,
        summary:
          typeof operation.summary === "string"
            ? operation.summary
            : "no summary",
      });
    }
  }
  return operations;
}

async function runOpenapi(workspaceRoot, args) {
  const { openapiPath, openapiRaw, openapiDocument } =
    await readOpenapiDocument(workspaceRoot);

  if (args.includes("--print")) {
    process.stdout.write(openapiRaw);
    if (!openapiRaw.endsWith("\n")) {
      process.stdout.write("\n");
    }
    return;
  }
  const operations = collectOperationList(openapiDocument);
  const summaryPayload = {
    file: path.relative(workspaceRoot, openapiPath),
    title: openapiDocument.info?.title ?? null,
    version: openapiDocument.info?.version ?? null,
    transport: openapiDocument["x-openui-transport"] ?? null,
    server: openapiDocument.servers?.[0]?.url ?? null,
    boundary:
      openapiDocument.servers?.[0]?.description ??
      openapiDocument.info?.description ??
      null,
    operations,
    note: "This command inspects the repo-local compatibility contract. It does not claim a hosted API surface.",
  };

  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(summaryPayload, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      "OpenAPI compatibility surface",
      `- file: ${summaryPayload.file}`,
      `- title: ${summaryPayload.title ?? "unknown"}`,
      `- version: ${summaryPayload.version ?? "unknown"}`,
      `- transport: ${summaryPayload.transport ?? "unknown"}`,
      `- server: ${summaryPayload.server ?? "unknown"}`,
      `- boundary: ${summaryPayload.boundary ?? "unknown"}`,
      "- note: compatibility projection only; runtime transport remains local stdio MCP.",
      "- operations:",
      ...summaryPayload.operations.map(
        (operation) =>
          `  - ${operation.method} ${operation.path} :: ${operation.summary}`,
      ),
      "",
    ].join("\n"),
  );
}

async function readSkillsStarterEntries(workspaceRoot) {
  const skillsRoot = path.join(workspaceRoot, "examples", "skills");
  const directoryEntries = await fs.readdir(skillsRoot, {
    withFileTypes: true,
  });
  const starterEntries = [];

  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue;
    }
    starterEntries.push({
      name: entry.name,
      description: "repo-side starter asset",
      path: path.relative(workspaceRoot, path.join(skillsRoot, entry.name)),
    });
  }

  return starterEntries.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function runSkillsStarter(workspaceRoot, args) {
  const { manifest } = await readSkillsKitManifest(workspaceRoot);
  const { manifest: publicStarterManifest } =
    await readPublicSkillsStarterManifest(workspaceRoot);
  const skills = await readSkillsStarterEntries(workspaceRoot);
  const payload = buildSkillsStarterPayload(
    workspaceRoot,
    manifest,
    publicStarterManifest,
    skills,
  );

  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      "Public skills starter kit",
      `- root: ${payload.root}`,
      `- repo mirror root: ${payload.repoMirrorRoot}`,
      `- package: ${payload.packageName}@${payload.version}`,
      `- summary: ${payload.summary ?? "unknown"}`,
      `- role: ${payload.role ?? "unknown"}`,
      `- distribution tier: ${payload.distributionTier ?? "unknown"}`,
      `- package manifest: ${payload.packageManifest}`,
      `- repo mirror manifest: ${payload.repoMirrorManifest}`,
      `- count: ${payload.count}`,
      `- boundary: ${payload.boundary}`,
      "- audience:",
      ...payload.audience.map((item) => `  - ${item}`),
      "- install path:",
      ...payload.installPath.map((item) => `  - ${item}`),
      "- use path:",
      ...payload.usePath.map((item) => `  - ${item}`),
      "- starter bundles:",
      ...payload.starterBundles.map((item) => `  - ${item}`),
      "- proof loop:",
      ...payload.proofLoop.map((item) => `  - ${item}`),
      "- troubleshooting:",
      ...payload.troubleshootingPath.map((item) => `  - ${item}`),
      ...(payload.officialPublicSurfaces
        ? [
            "- official public surfaces:",
            ...Object.entries(payload.officialPublicSurfaces).map(
              ([host, value]) =>
                `  - ${host}: ${typeof value === "string" ? value : value.currentTruth ?? JSON.stringify(value)}`,
            ),
          ]
        : []),
      "- verification path:",
      ...payload.verificationPath.map((item) => `  - ${item}`),
      "- not for:",
      ...payload.notFor.map((item) => `  - ${item}`),
      `- internal reminder: ${payload.internalReminder}`,
      "- entries:",
      ...payload.skills.map(
        (skill) => `  - ${skill.name} :: ${skill.description} (${skill.path})`,
      ),
      "",
    ].join("\n"),
  );
}

async function runHostedCommand(workspaceRoot, subcommand, args) {
  if (!subcommand) {
    throw new Error(
      `Unknown hosted command: (missing). Use \`${CLI_NAME} hosted info\`, \`${CLI_NAME} hosted openapi\`, or \`${CLI_NAME} hosted serve\`.`,
    );
  }

  if (subcommand === "openapi") {
    const { hostedOpenapiDocument, hostedOpenapiPath } =
      await readHostedOpenapiDocument(workspaceRoot);
    const payload = {
      file: path.relative(workspaceRoot, hostedOpenapiPath),
      title: hostedOpenapiDocument.info?.title ?? null,
      version: hostedOpenapiDocument.info?.version ?? null,
      servers: hostedOpenapiDocument.servers ?? [],
      paths: Object.keys(hostedOpenapiDocument.paths ?? {}),
      note: "Hosted compatibility runtime contract. This is a real service surface, but not proof of a managed SaaS deployment.",
    };

    if (args.includes("--json")) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    process.stdout.write(
      [
        "Hosted compatibility service contract",
        `- file: ${payload.file}`,
        `- title: ${payload.title}`,
        `- version: ${payload.version}`,
        ...payload.servers.map(
          (server) => `- server: ${server.url} :: ${server.description}`,
        ),
        ...payload.paths.map((routePath) => `- path: ${routePath}`),
        `- note: ${payload.note}`,
        "",
      ].join("\n"),
    );
    return;
  }

  await runNodeCommand({
    label: `hosted ${subcommand}`,
    cwd: workspaceRoot,
    args,
    nodeArgs: [
      "--env-file-if-exists=.env",
      "--import",
      "tsx",
      path.join(workspaceRoot, "packages/hosted-api/src/cli.ts"),
      subcommand,
    ],
  });
}

async function main(argv = process.argv.slice(2)) {
  const normalizedArgs = stripCommandBoundary(argv);
  const command = normalizedArgs[0];

  if (
    normalizedArgs.length === 0 ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    printHelp();
    return;
  }

  const workspaceRoot = await resolveWorkspaceRoot(process.cwd());

  if (command === "mcp") {
    await runMcp(workspaceRoot, normalizedArgs.slice(1));
    return;
  }

  if (command === "surface-guide") {
    await runSurfaceGuide(workspaceRoot, normalizedArgs.slice(1));
    return;
  }

  if (command === "ecosystem-guide") {
    await runEcosystemGuide(workspaceRoot, normalizedArgs.slice(1));
    return;
  }

  if (command === "workflow") {
    await runWorkflowCommand(
      workspaceRoot,
      normalizedArgs[1],
      normalizedArgs.slice(2),
    );
    return;
  }

  if (command === "openapi") {
    await runOpenapi(workspaceRoot, normalizedArgs.slice(1));
    return;
  }

  if (command === "skills" && normalizedArgs[1] === "starter") {
    await runSkillsStarter(workspaceRoot, normalizedArgs.slice(2));
    return;
  }

  if (command === "hosted") {
    await runHostedCommand(
      workspaceRoot,
      normalizedArgs[1],
      normalizedArgs.slice(2),
    );
    return;
  }

  throw new Error(
    `Unknown command: ${normalizedArgs.join(" ")}. Use \`${CLI_NAME} help\` for the repo-local surface map.`,
  );
}

function resolveRealExecutablePath(value, resolver = realpathSync) {
  if (!value) {
    return null;
  }

  try {
    return resolver(path.resolve(value));
  } catch {
    return path.resolve(value);
  }
}

function isCliEntrypoint(
  argv1 = process.argv[1],
  entryFile = fileURLToPath(import.meta.url),
  resolver = realpathSync,
) {
  const invokedPath = resolveRealExecutablePath(argv1, resolver);
  const entryPath = resolveRealExecutablePath(entryFile, resolver);
  return Boolean(invokedPath && entryPath && invokedPath === entryPath);
}

if (isCliEntrypoint()) {
  main().catch((error) => {
    process.stderr.write(
      `[${CLI_NAME}] ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}

export {
  buildSkillsStarterPayload,
  buildEcosystemGuidePayload,
  buildHelpText,
  buildSurfaceGuidePayload,
  isCliEntrypoint,
  resolveRealExecutablePath,
};

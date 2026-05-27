import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();

async function readJson(relativePath) {
  const fullPath = path.join(workspaceRoot, relativePath);
  const raw = await fs.readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

async function ensureFile(relativePath, errors) {
  try {
    await fs.access(path.join(workspaceRoot, relativePath));
  } catch {
    errors.push(`missing file: ${relativePath}`);
  }
}

function collectArtifactPaths(manifest) {
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const installPath = Array.isArray(manifest.installPath) ? manifest.installPath : [];
  const troubleshootingPath = Array.isArray(manifest.troubleshootingPath)
    ? manifest.troubleshootingPath
    : [];
  const isRepoRelativePath = (value) =>
    typeof value === "string" &&
    /^(\.claude-plugin|examples|packages|plugins|docs|tooling|services|tests)\//u.test(value);

  return [
    ...artifacts
      .map((artifact) => artifact?.path)
      .filter((value) => typeof value === "string"),
    ...troubleshootingPath.filter((value) => typeof value === "string"),
    ...installPath.filter(isRepoRelativePath),
  ];
}

function validateSampleConfig(name, config, errors) {
  if (config?.config?.command !== "node") {
    errors.push(`${name}: config.command must be "node"`);
  }

  const args = Array.isArray(config?.config?.args) ? config.config.args : [];
  if (!args.some((value) => typeof value === "string" && value.endsWith("/main.js"))) {
    errors.push(`${name}: config.args must include the built MCP server entrypoint`);
  }

  if (!Array.isArray(config?.proofCommands) || config.proofCommands.length === 0) {
    errors.push(`${name}: proofCommands must be non-empty`);
  }
}

async function main() {
  const errors = [];
  const distributionManifestPath = "examples/public-distribution/public-distribution.manifest.json";
  const openclawManifestPath = "examples/public-distribution/openclaw-public-ready.manifest.json";

  const distributionManifest = await readJson(distributionManifestPath);
  const openclawManifest = await readJson(openclawManifestPath);
  const codexConfig = await readJson("examples/public-distribution/codex.mcp.json");
  const claudeConfig = await readJson("examples/public-distribution/claude-code.mcp.json");
  const genericConfig = await readJson("examples/public-distribution/generic-mcp.json");

  if (distributionManifest.status !== "package-ready") {
    errors.push(`public distribution manifest status must be package-ready (current: ${distributionManifest.status})`);
  }

  if (openclawManifest.status !== "public-ready") {
    errors.push(`OpenClaw manifest status must be public-ready (current: ${openclawManifest.status})`);
  }

  validateSampleConfig("codex.mcp.json", codexConfig, errors);
  validateSampleConfig("claude-code.mcp.json", claudeConfig, errors);
  validateSampleConfig("generic-mcp.json", genericConfig, errors);

  const referencedPaths = new Set([
    ...collectArtifactPaths(distributionManifest),
    ...collectArtifactPaths(openclawManifest),
    distributionManifestPath,
    openclawManifestPath,
  ]);

  for (const relativePath of referencedPaths) {
    await ensureFile(relativePath, errors);
  }

  const summary = {
    ok: errors.length === 0,
    manifests: {
      distribution: distributionManifestPath,
      openclaw: openclawManifestPath,
    },
    clients: ["Codex", "Claude Code", "Generic MCP host"],
    openclawStatus: openclawManifest.status,
    checkedPaths: [...referencedPaths].sort(),
    errors,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

await main();

#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "openui-skills-proof-"));

  try {
    const packResult = await execFileAsync(
      "npm",
      ["pack", path.join(process.cwd(), "packages/skills-kit")],
      {
        cwd: tempRoot,
        encoding: "utf8",
      },
    );
    const packedFile = packResult.stdout.trim().split(/\r?\n/u).at(-1);
    if (!packedFile) {
      throw new Error("npm pack did not return a skills-kit tarball name.");
    }

    await writeFile(
      path.join(tempRoot, "package.json"),
      JSON.stringify({ name: "skills-proof", type: "module" }, null, 2),
      "utf8",
    );
    await execFileAsync("npm", ["install", `./${packedFile}`], {
      cwd: tempRoot,
      encoding: "utf8",
    });

    const proofScriptPath = path.join(tempRoot, "proof.mjs");
    await writeFile(
      proofScriptPath,
      [
        "import { OPENUI_SKILLS_KIT_MANIFEST, getOpenuiSkillsStarter } from '@openui/skills-kit';",
        "const starter = getOpenuiSkillsStarter();",
        "console.log(JSON.stringify({",
        "  ok: true,",
        "  packageName: OPENUI_SKILLS_KIT_MANIFEST.packageName,",
        "  status: OPENUI_SKILLS_KIT_MANIFEST.status,",
        "  starterKeys: Object.keys(starter),",
        "  starterBundleKeys: Object.keys(starter.starterBundles),",
        "  openclawStatus: starter.starterBundles.openclaw.status ?? 'unknown',",
        "}, null, 2));",
      ].join("\n"),
      "utf8",
    );

    const proofResult = await execFileAsync("node", [proofScriptPath], {
      cwd: tempRoot,
      encoding: "utf8",
    });
    const proof = JSON.parse(proofResult.stdout);

    console.log(
      JSON.stringify(
        {
          ok: true,
          tarball: packedFile,
          packageName: proof.packageName,
          status: proof.status,
          starterKeys: proof.starterKeys,
          starterBundleKeys: proof.starterBundleKeys,
          openclawStatus: proof.openclawStatus,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

void main();

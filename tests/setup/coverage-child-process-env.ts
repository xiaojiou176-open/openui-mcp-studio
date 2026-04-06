import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Coverage-mode test runs should keep child Node processes out of the parent
// collector's temporary coverage directory. Even after moving to the Istanbul
// provider, inherited NODE_V8_COVERAGE can still cause subprocesses to write
// competing artifacts into the shared temp area and destabilize the final run.
if (process.env.NODE_V8_COVERAGE) {
	delete process.env.NODE_V8_COVERAGE;
}

const originalTmpdir = os.tmpdir();
const managedVitestTmpRoot = path.join(originalTmpdir, "openui-vitest-tmp");

function ensureManagedVitestTmpRoot(): string {
	fs.mkdirSync(managedVitestTmpRoot, { recursive: true });
	return managedVitestTmpRoot;
}

const managedTmpdir = ensureManagedVitestTmpRoot();
process.env.TMPDIR = managedTmpdir;
process.env.TMP = managedTmpdir;
process.env.TEMP = managedTmpdir;
os.tmpdir = ensureManagedVitestTmpRoot;

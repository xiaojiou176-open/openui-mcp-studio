import { OPENUI_BUILDER_SURFACE_MANIFEST } from "openui-mcp-studio";

const summary = {
	publicEntrypoint: OPENUI_BUILDER_SURFACE_MANIFEST.publicEntrypoint,
	currentOrder: OPENUI_BUILDER_SURFACE_MANIFEST.currentOrder.map((entry) => ({
		position: entry.position,
		id: entry.id,
		surface: entry.surface,
	})),
	laterLanes: OPENUI_BUILDER_SURFACE_MANIFEST.laterLanes.map((entry) => entry.id),
	publicExports: OPENUI_BUILDER_SURFACE_MANIFEST.publicExports.map((entry) => ({
		module: entry.module,
		audience: entry.audience,
	})),
	skillsStarterRoot: OPENUI_BUILDER_SURFACE_MANIFEST.skillsStarter.root,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

import { describe, expect, it } from "vitest";
import { getWorkbenchContent } from "../apps/web/app/workbench-data";
import {
	DEFAULT_LOCALE,
	resolveLocale,
	SUPPORTED_LOCALES,
} from "../apps/web/lib/i18n";
import { getFrontdoorMessages } from "../apps/web/lib/i18n/messages";

describe("frontdoor i18n contract", () => {
	it("keeps a single locale SSOT and resolves unsupported values to the English-first default", () => {
		expect(SUPPORTED_LOCALES).toEqual(["en-US", "zh-CN"]);
		expect(DEFAULT_LOCALE).toBe("en-US");
		expect(resolveLocale("zh-CN")).toBe("zh-CN");
		expect(resolveLocale("fr-FR")).toBe("en-US");
	});

	it("centralizes compare split labels instead of relying on route-local bilingual literals", () => {
		const english = getFrontdoorMessages("en-US");
		const chinese = getFrontdoorMessages("zh-CN");

		expect(english.localeLabel).toBe("Language");
		expect(chinese.localeLabel).toBe("语言");
		expect(english.shell.productLine).toContain("Codex and Claude Code");
		expect(chinese.home.guidedPaths[0]?.cta).toBe("打开上手路径");
		expect(english.home.guidedPaths[1]?.title).toContain("evidence desk");
		expect(chinese.shell.routeGuideBadge).toBe("推荐顺序");
		expect(english.compare.goThereFirst).toContain("hosted builder");
		expect(chinese.compare.goThereFirst).toContain(
			"最顺滑的托管式 builder 体验",
		);
		expect(english.compare.decisionCards[2]?.title).toContain("Codex");
		expect(chinese.compare.followUpLinks[1]?.cta).toBe("去工作台");
		expect(chinese.compare.cardLabels.alternativeSuffix).toBe("替代方案");
		expect(english.home.builderEntryPoints[0]?.cta).toBe(
			"Open MCP install guide",
		);
		expect(chinese.home.builderEntryPoints[0]?.cta).toBe("打开 MCP 接入指南");
		expect(chinese.home.builderEntryPoints[1]?.cta).toBe("打开 OpenAPI 契约");
		expect(chinese.home.builderEntryPoints[2]?.cta).toBe("打开 readiness 文档");
		expect(chinese.home.heroCtas.workbench).toBe("打开工作台");
		expect(chinese.home.proofSectionTitle).toBe(
			"提示词、产出、变更文件、评审包、证据链。",
		);
		expect(chinese.shell.footerLinks.proofFaq).toBe("证据 FAQ");
		expect(chinese.proof.heroCtas.workbench).toBe("打开操作者工作台");
		expect(english.proof.contractTitle).toBe("Proof contract");
		expect(chinese.proof.contractTitle).toContain("证据台合同");
		expect(chinese.proof.notProvedTitle).toContain("不证明");
		expect(chinese.proof.nextRoutes[0]?.cta).toBe("打开工作台");
		expect(chinese.proof.reviewDeskTitle).toContain("仓库已经证明");
		expect(chinese.proof.triageCards[1]?.title).toContain("人工判断");
		expect(english.proof.triageCards[2]?.body).toContain("repo-local ready");
		expect(chinese.proof.triageCards[2]?.body).toContain("repo-local 已就绪");
	});

	it("extends the same locale SSOT into workbench dialog and state copy", () => {
		const english = getWorkbenchContent("en-US");
		const chinese = getWorkbenchContent("zh-CN");

		expect(english.commandBarTitle).toBe("Command bar");
		expect(chinese.commandBarTitle).toBe("命令栏");
		expect(english.launchControlsTitle).toBe("Operator control rail");
		expect(chinese.launchControlsTitle).toBe("操盘控制栏");
		expect(english.stanceTitle).toContain("15 seconds");
		expect(chinese.stanceCards[0]?.title).toContain("已经证明");
		expect(chinese.statusLabels.active).toBe("进行中");
		expect(chinese.dialogSurfaceLabel).toBe("目标界面");
		expect(
			chinese.draftOptions.find((option) => option.value === "dashboard")
				?.label,
		).toBe("工作台");
		expect(english.dialogCopy.draft.title).toContain("launch-ready UI brief");
		expect(chinese.dialogCopy.draft.title).toContain("创建可上线的界面说明包");
		expect(english.pageTitle).toContain("proof still attached");
		expect(chinese.decisionSplitTitle).toContain("已经证明了什么");
		expect(english.nextActionGuidance.active).toContain("not Git landed");
		expect(chinese.nextActionGuidance.active).toContain(
			"不等于已经通过 Git 落袋",
		);
		expect(english.statusStripTitle).toBe("Desk status strip");
		expect(chinese.statusStripTitle).toContain("状态带");
		expect(chinese.laneContractTitle).toContain("泳道合同");
		expect(chinese.pauseTitle).toContain("先暂停");
		expect(chinese.errorTitle).toContain("工作区丢失了最新同步");
	});
});

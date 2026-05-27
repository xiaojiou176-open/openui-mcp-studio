"use client";

import { useEffect, useState } from "react";

import { WorkbenchErrorPanel } from "@/components/workbench-error-panel";

type GlobalErrorPageProps = {
	error: Error & { digest?: string };
	reset: () => void;
};

const FALLBACK_ERROR_LANG = "en-US";

export default function GlobalErrorPage({
	error,
	reset,
}: GlobalErrorPageProps) {
	const [lang, setLang] = useState(() =>
		typeof document === "undefined"
			? FALLBACK_ERROR_LANG
			: document.documentElement.lang || FALLBACK_ERROR_LANG,
	);

	useEffect(() => {
		setLang(document.documentElement.lang || FALLBACK_ERROR_LANG);
	}, []);

	return (
		<html lang={lang}>
			<body className="min-h-dvh bg-background text-foreground antialiased">
				<WorkbenchErrorPanel
					heading="page"
					title="The front door hit an unexpected runtime error."
					description="Refresh the current state and try again. Proof, review, and release surfaces remain available once the page reloads."
					digest={error.digest ?? "FRONTDOOR_RUNTIME_ERROR"}
					actionLabel="Retry the front door"
					onAction={reset}
					secondaryActionLabel="Reload page"
					onSecondaryAction={() => window.location.reload()}
				/>
			</body>
		</html>
	);
}

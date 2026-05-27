import "server-only";

import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE_NAME,
	resolveLocale,
	type SupportedLocale,
} from "../i18n";
import { isStaticExportBuild } from "../site-metadata";

export async function getRequestLocale(): Promise<SupportedLocale> {
	if (isStaticExportBuild()) {
		return DEFAULT_LOCALE;
	}

	const { cookies } = await import("next/headers");
	const cookieStore = await cookies();
	return resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

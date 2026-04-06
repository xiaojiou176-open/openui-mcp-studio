import "server-only";

import { cookies } from "next/headers";

import {
	LOCALE_COOKIE_NAME,
	resolveLocale,
	type SupportedLocale,
} from "../i18n";

export async function getRequestLocale(): Promise<SupportedLocale> {
	const cookieStore = await cookies();
	return resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

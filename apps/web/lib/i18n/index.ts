export const SUPPORTED_LOCALES = ["en-US", "zh-CN"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type AppLocale = SupportedLocale;

export const DEFAULT_LOCALE: SupportedLocale = "en-US";
export const LOCALE_COOKIE_NAME = "openui_locale";

export function isSupportedLocale(
	value: string | null | undefined,
): value is SupportedLocale {
	return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function resolveLocale(
	value: string | null | undefined,
): SupportedLocale {
	return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function getLocaleLabel(locale: SupportedLocale): string {
	return locale === "zh-CN" ? "中文" : "English";
}

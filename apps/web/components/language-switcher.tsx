"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE_NAME,
	type AppLocale,
} from "@/lib/i18n/config";
import { useLocale } from "@/components/locale-provider";

type LanguageSwitcherProps = {
	label: string;
	localeLabels: Record<AppLocale, string>;
};

export function LanguageSwitcher({
	label,
	localeLabels,
}: LanguageSwitcherProps) {
	const router = useRouter();
	const { locale, setLocale } = useLocale();

	const handleLocaleChange = (locale: AppLocale) => {
		document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
		document.documentElement.lang = locale;
		setLocale(locale);
		router.refresh();
	};

	return (
		<div className="flex items-center gap-2" aria-label={label}>
			<span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
				{label}
			</span>
			<Button
				type="button"
				size="sm"
				variant={locale === DEFAULT_LOCALE ? "default" : "outline"}
				aria-pressed={locale === DEFAULT_LOCALE}
				data-testid="language-toggle-en-US"
				onClick={() => handleLocaleChange("en-US")}
			>
				{localeLabels["en-US"]}
			</Button>
			<Button
				type="button"
				size="sm"
				variant={locale === "zh-CN" ? "default" : "outline"}
				aria-pressed={locale === "zh-CN"}
				data-testid="language-toggle-zh-CN"
				onClick={() => handleLocaleChange("zh-CN")}
			>
				{localeLabels["zh-CN"]}
			</Button>
		</div>
	);
}

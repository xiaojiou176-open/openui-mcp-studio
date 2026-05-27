"use client";

import {
	createContext,
	type ReactNode,
	useEffect,
	useContext,
	useMemo,
	useState,
} from "react";

import {
	DEFAULT_LOCALE,
	type AppLocale,
} from "@/lib/i18n/config";

type LocaleContextValue = {
	locale: AppLocale;
	setLocale: (nextLocale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type LocaleProviderProps = {
	children: ReactNode;
	initialLocale: AppLocale;
};

export function LocaleProvider({
	children,
	initialLocale,
}: LocaleProviderProps) {
	const [locale, setLocale] = useState<AppLocale>(initialLocale);

	useEffect(() => {
		setLocale(initialLocale);
	}, [initialLocale]);

	const value = useMemo(
		() => ({
			locale,
			setLocale,
		}),
		[locale],
	);

	return (
		<LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
	);
}

export function useLocale() {
	const context = useContext(LocaleContext);
	if (context) {
		return context;
	}

	return {
		locale: DEFAULT_LOCALE,
		setLocale: () => {},
	};
}

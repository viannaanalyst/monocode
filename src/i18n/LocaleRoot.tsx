import { useEffect, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { applyNativeMenuLocale } from "./nativeMenu";
import { getLocale, subscribeLocale } from "./locale";

export function LocaleRoot({ children }: { children: ReactNode }): ReactElement {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);

  useEffect(() => {
    void applyNativeMenuLocale(locale);
  }, [locale]);

  return (
    <div key={locale} className="contents">
      {children}
    </div>
  );
}

import { atom } from "jotai";
import ar from "../locales/ar.json";
import en from "../locales/en.json";
import tr from "../locales/tr.json";
import ru from "../locales/ru.json";
import uk from "../locales/uk.json";
import ja from "../locales/ja.json";
import zh from "../locales/zh.json";
import es from "../locales/es.json";
import fr from "../locales/fr.json";
import de from "../locales/de.json";
import vi from "../locales/vi.json";
import id from "../locales/id.json";
import pt from "../locales/pt.json";
import ptBR from "../locales/pt-br.json";
import caVAL from "../locales/ca-val.json";
import hu from "../locales/hu.json";
import pl from "../locales/pl.json";
import { atomWithStorage } from "jotai/utils";

// Define the shape of the translations
type Translations = typeof en;
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
type Locales = "ar" | "en" | "tr" | "ru" | "uk" | "ja" | "zh" | "es" | "fr" | "de" | "vi" | "pt" | "ptBR" | "id" | "caVAL" | "hu" | "pl";

const translations: Record<Locales, DeepPartial<Translations>> = {
  ar,
  en,
  tr,
  ru,
  uk,
  ja,
  zh,
  es,
  fr,
  de,
  vi,
  id,
  pt,
  ptBR,
  caVAL,
  hu,
  pl,
};

// Create a type for nested key paths
type NestedKeyOf<Object> = Object extends object
  ? {
      [Key in keyof Object]: Key extends string | number
        ? Key | `${Key}.${NestedKeyOf<Object[Key]>}`
        : never;
    }[keyof Object]
  : never;

// Utility function to access nested translation keys. Missing keys fall back to
// English first so a partially translated locale never shows a raw key path.
const findNestedTranslation = (
  obj: DeepPartial<Translations> | undefined,
  key: string,
): string | undefined => {
  let current: unknown = obj;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
};

const getNestedTranslation = (
  obj: DeepPartial<Translations>,
  key: NestedKeyOf<Translations>,
): string => {
  return (
    findNestedTranslation(obj, key) ??
    findNestedTranslation(en, key) ??
    key
  );
};

// Atom to store the current locale
export const localeAtom = atomWithStorage<Locales>("language", "en");

// Atom to get the translation function based on the current locale
export const translationAtom = atom((get) => {
  const locale = get(localeAtom);

  return (
    key: NestedKeyOf<Translations>,
    params: Record<string, string> = {},
  ): string => {
    const template = getNestedTranslation(translations[locale], key);

    // Replace placeholders with parameters, e.g., {name} => John
    return Object.keys(params).reduce(
      (str, paramKey) => str.replace(`{${paramKey}}`, params[paramKey]),
      template,
    );
  };
});

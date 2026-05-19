import { Currency, Language } from "../db/schema/users.schema";

export type LanguageCode = Language; // Use Language enum from schema
export type TextDirection = "ltr" | "rtl";
export type CurrencyCode = Currency; // Use Currency enum from schema

// supported languages

export const SUPPORTED_LANGUAGES: Record<Language, { timezone: string; textDirection: TextDirection }> = {
    [Language.EN_US]: { timezone: "America/New_York", textDirection: "ltr" },
    [Language.EN_GB]: { timezone: "Europe/London", textDirection: "ltr" },
    [Language.AR]: { timezone: "Asia/Riyadh", textDirection: "rtl" }
};

// supported currencies
export const SUPPORTED_CURRENCIES: Record<Currency, string> = {
    [Currency.USDT]: "Tether",
    [Currency.USD]: "United States Dollar",
    [Currency.EURO]: "Euro",
    [Currency.GBP]: "British Pound Sterling",
    [Currency.SAR]: "Saudi Riyal",
    [Currency.NGN]: "Nigerian Naira",
    [Currency.JPY]: "Japanese Yen",
    [Currency.AED]: "United Arab Emirates Dirham",
    [Currency.KES]: "Kenyan Shilling",
    [Currency.GHS]: "Ghanaian Cedi",
    [Currency.ZAR]: "South African Rand"
};

/* eslint-disable @typescript-eslint/no-explicit-any */
import Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import { getDb } from "../../config/db";
import { assets } from "../../db/schema/assets.schema";
import AppError from "../appError";
import { AssetCatalogRepository } from "../../repository/asset-catalogue";
import { CurrencyApiFiatPricingService } from "../../services/pricing/fiat/currencyapi";
import { CoinMarketCapService } from "../../services/pricing/crypto/coinmarketcap";
import logger from "../../config/logger";

const cache = new Map<string, number>();
const assetCatalogRepo = new AssetCatalogRepository();
const fiatPricingService = new CurrencyApiFiatPricingService();
const cryptoPricingService = new CoinMarketCapService();

Decimal.set({
    precision: 78,
    rounding: Decimal.ROUND_DOWN,
    toExpNeg: -78,
    toExpPos: 78
});

export async function getUsdPriceForAsset(legacyAssetId: string): Promise<number> {
    const asset = await assetCatalogRepo.findAssetByLegacyId(legacyAssetId);

    if (!asset) {
        throw new AppError(`Unknown asset legacy id: ${legacyAssetId}`, 400);
    }

    const assetClass = (asset.assetClass ?? "").toString().trim().toUpperCase();

    const isFiat = assetClass === "FIAT";
    if (isFiat) {
        const currencyCode = (asset.onchainSymbol || asset.displaySymbol || asset.legacyId).toString().toUpperCase();

        try {
            const exchangeRates = await fiatPricingService.getLatestRates("USD", [currencyCode]);
            const rate = exchangeRates?.[currencyCode]?.value;
            const usdPricePerAsset = 1 / rate;
            if (!Number.isFinite(usdPricePerAsset) || usdPricePerAsset <= 0) {
                throw new AppError(`Invalid fiat rate for ${currencyCode}`, 400);
            }
            return usdPricePerAsset;
        } catch (err: any) {
            logger.error(`[swap] failed to price fiat asset ${legacyAssetId} (${currencyCode})`, err);
            throw new AppError(`Failed to resolve price for fiat asset ${currencyCode}: ${err?.message || err}`, 502);
        }
    }

    try {
        const price = await cryptoPricingService.getUsdPriceByLegacy(legacyAssetId);
        if (!Number.isFinite(price) || price <= 0) {
            throw new AppError(`Invalid crypto price for ${legacyAssetId}`, 502);
        }
        return price;
    } catch (err: any) {
        logger.error(`[swap] failed to price crypto asset ${legacyAssetId}`, err);
        throw new AppError(`Failed to resolve price for asset ${legacyAssetId}: ${err?.message || err}`, 502);
    }
}

export async function getAssetDecimals(assetId: string): Promise<number> {
    if (cache.has(assetId)) return cache.get(assetId)!;

    const db = getDb();
    const [row] = await db.select().from(assets).where(eq(assets.legacyId, assetId)).limit(1);

    if (!row) throw new AppError(`Asset not found: ${assetId}`, 400);
    if (row.decimals == null) throw new AppError(`Asset ${assetId} has no decimals configured`, 500);

    const decimals = row.decimals;
    if (decimals < 0 || decimals > 78) {
        throw new AppError(`Invalid decimals for asset ${assetId}: ${decimals}`, 500);
    }

    cache.set(assetId, decimals);
    return decimals;
}

export async function toMinor(amountMajor: string, assetId: string): Promise<bigint> {
    const decimals = await getAssetDecimals(assetId);

    let dec: Decimal;
    try {
        dec = new Decimal(amountMajor);
    } catch {
        throw new AppError(`Invalid amount format: "${amountMajor}"`, 400);
    }

    if (dec.isNegative()) throw new AppError("Amount cannot be negative", 400);

    const decimalPlaces = dec.decimalPlaces();
    if (decimalPlaces > decimals) {
        throw new AppError(`Amount has ${decimalPlaces} decimal places but ${assetId} only supports ${decimals}`, 400);
    }

    const multiplier = new Decimal(10).pow(decimals);
    const minorAmount = dec.times(multiplier);
    const minorStr = minorAmount.toFixed(0);

    try {
        return BigInt(minorStr);
    } catch {
        throw new AppError(`Failed to convert amount to BigInt: ${minorStr}`, 500);
    }
}

export async function toMajor(amountMinor: bigint, assetId: string): Promise<Decimal> {
    const decimals = await getAssetDecimals(assetId);
    const minorDec = new Decimal(amountMinor.toString());
    const divisor = new Decimal(10).pow(decimals);
    return minorDec.dividedBy(divisor);
}

export async function getUsdPricesForSymbols(assetSymbols: string[]): Promise<Record<string, number>> {
    if (!Array.isArray(assetSymbols) || assetSymbols.length === 0) return {};
    const uniqueSymbols = Array.from(
        new Set(assetSymbols.map((s) => (s || "").toString().trim().toUpperCase()))
    ).filter(Boolean);
    if (uniqueSymbols.length === 0) return {};

    const result: Record<string, number> = {};

    let assetMap: Record<string, any> = {};
    try {
        assetMap = await assetCatalogRepo.findAssetsBySymbols(uniqueSymbols);
    } catch (err: any) {
        logger.error("[asset-helper] Asset catalog lookup failed", err);
        throw new Error(`Asset catalog lookup failed: ${err?.message}`);
    }

    const fiatCandidates: string[] = [];
    const cryptoCandidates: string[] = [];

    for (const sym of uniqueSymbols) {
        const found = assetMap[sym];
        if (found && typeof found.assetClass === "string" && found.assetClass.toUpperCase().includes("FIAT")) {
            fiatCandidates.push(sym);
        } else {
            cryptoCandidates.push(sym);
        }
    }

    if (fiatCandidates.length > 0) {
        try {
            const ratesMap = await fiatPricingService.getLatestRates("USD", fiatCandidates);

            for (const sym of fiatCandidates) {
                const raw = (ratesMap as any)[sym];
                let rateNum: number | null = null;
                if (raw == null) {
                    rateNum = null;
                } else {
                    rateNum = (raw as any).value;
                }

                if (!rateNum || !Number.isFinite(rateNum) || rateNum === 0) {
                    logger.warn(`[asset-helper] invalid currencyapi rate for ${sym}`, { raw });
                    throw new Error(`invalid currencyapi rate for ${sym}`);
                }
                const usdPerUnit = 1 / rateNum;
                if (Number.isFinite(usdPerUnit) && usdPerUnit > 0) {
                    result[sym] = usdPerUnit;
                }
            }
        } catch (err) {
            logger.error("[asset-helper] CurrencyApi fiat rates fetch failed", err);
            throw new Error(`CurrencyApi fiat rates fetch failed`);
        }
    }

    if (cryptoCandidates.length > 0) {
        try {
            const cmcPrices = await cryptoPricingService.getUsdPricesBySymbols(cryptoCandidates);
            for (const [k, v] of Object.entries(cmcPrices)) {
                if (Number.isFinite(v.price) && v.price > 0) {
                    result[k.toUpperCase()] = v.price;
                } else {
                    logger.warn("[asset-helper] CMC returned invalid price", { symbol: k, price: v.price });
                }
            }
        } catch (err) {
            logger.error("[asset-helper] CoinMarketCap price fetch failed", err);
            throw new Error(`CoinMarketCap price fetch failed`);
        }
    }

    const unresolved = uniqueSymbols.filter((s) => !(s in result));
    if (unresolved.length > 0) {
        logger.error("[asset-helper] Unresolved asset price look up", unresolved);
        throw new Error(`Unresolved asset price look up`);
    }

    return result;
}

export function getExplorerLink(
    txHash: string | undefined | null,
    blockchain: { explorerBase: string | null; explorerTxTmpl: string | null } | undefined | null
): string {
    if (!txHash || !blockchain) return "";
    if (!/^[a-zA-Z0-9]+$/.test(txHash)) {
        return "";
    }

    const { explorerBase, explorerTxTmpl } = blockchain;

    const isValidUrl = (url: string | null) => url && /^https:\/\//i.test(url);

    if (explorerTxTmpl && isValidUrl(explorerTxTmpl)) {
        return explorerTxTmpl.replace("{tx}", txHash);
    } else if (explorerBase && isValidUrl(explorerBase)) {
        return `${explorerBase}/tx/${txHash}`;
    }

    return "";
}

export function formatAmount(amountMajor: string | Decimal | undefined | null): string {
    if (!amountMajor) return "0";
    try {
        const amount = amountMajor instanceof Decimal ? amountMajor : new Decimal(amountMajor);
        return amount.toDecimalPlaces(18).toString();
    } catch (_error) {
        return String(amountMajor);
    }
}

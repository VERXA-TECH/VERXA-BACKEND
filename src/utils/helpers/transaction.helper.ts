/**
 * Transaction description input parameters
 */
export interface TransactionDescriptionInput {
    type: string;
    direction: "sent" | "received" | "all";
    status: string; // PENDING, COMPLETED, FAILED
    asset: {
        displaySymbol?: string | null;
        displayName?: string | null;
    } | null;
    swap?: {
        from?: {
            displaySymbol?: string | null;
            displayName?: string | null;
        } | null;
        to?: {
            displaySymbol?: string | null;
            displayName?: string | null;
        } | null;
    } | null;
}

/**
 * Generates a user-facing description for a transaction based on its type, properties, and status.
 */
export function generateTransactionDescription(transaction: TransactionDescriptionInput): string {
    const { type, direction, asset, swap, status } = transaction;

    // Get asset display symbol with fallback to display name
    const getAssetDisplay = (
        assetObj: { displaySymbol?: string | null; displayName?: string | null } | null | undefined
    ): string => {
        if (!assetObj) return "Asset";
        return assetObj.displaySymbol || assetObj.displayName || "Asset";
    };

    let baseDescription = "";

    switch (type) {
        case "DEPOSIT":
        case "FIAT_DEPOSIT":
            baseDescription = `${getAssetDisplay(asset)} Received`;
            break;

        case "TRANSFER":
            baseDescription = `${getAssetDisplay(asset)} Sent`;
            break;

        case "INTERNAL_TRANSFER":
            if (direction === "received") {
                baseDescription = `${getAssetDisplay(asset)} Received`;
            } else {
                baseDescription = `${getAssetDisplay(asset)} Sent`;
            }
            break;

        case "SWAP":
            if (swap?.from && swap?.to) {
                const toSymbol = getAssetDisplay(swap.to);
                baseDescription = `Swapped to ${toSymbol}`;
            } else {
                baseDescription = `Swapped ${getAssetDisplay(asset)}`;
            }
            break;

        case "WITHDRAWAL":
            baseDescription = `Sent ${getAssetDisplay(asset)}`;
            break;

        default:
            if (direction === "received") {
                baseDescription = `${getAssetDisplay(asset)} Received`;
            } else {
                baseDescription = `${getAssetDisplay(asset)} Sent`;
            }
            break;
    }

    if (status === "PENDING") {
        if (direction === "sent" || type === "TRANSFER" || type === "WITHDRAWAL") {
            return `Sending ${getAssetDisplay(asset)}`;
        }
        if (type === "SWAP") {
            return `Swapping...`;
        }
        return `Pending ${baseDescription}`;
    }

    if (status === "FAILED") {
        if (type === "SWAP") {
            return `Swap Failed`;
        }
        if (direction === "sent" || type === "TRANSFER" || type === "WITHDRAWAL") {
            return `Sending Failed`;
        }
        return `Failed ${baseDescription}`;
    }

    return baseDescription;
}

export default {
    generateTransactionDescription
};

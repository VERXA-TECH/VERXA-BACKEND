import { TransactionType } from "../../../types/transaction.types";
/**
 * Transforms a single transaction object for admin responses.
 * 1. Renames "type" to "category"
 * 2. Adds a new "type" field (credit or debit)
 * 3. Populates admin details if they exist in the joined record
 */
export function transformTransaction(data: any): any {
    if (!data) return null;

    // Handle nested structure from repository (e.g., { transaction: ..., user: ..., admin: ... })
    // or flat structure if it's already semi-flattened
    const txn = data.transaction || data;
    const admin = data.admin;
    const adminRole = data.adminRole;

    const originalType = txn.type;

    // The repository cross-join always returns side='debit' for non-split transactions
    // (DEPOSIT, FIAT_DEPOSIT, REFUND etc.) because the WHERE clause filters to side='debit'.
    // So we only trust txn.side for split transaction types where both sides are returned.
    const isSplitType = originalType === TransactionType.INTERNAL_TRANSFER || originalType === TransactionType.SWAP;

    let creditDebitType: "credit" | "debit";

    if (isSplitType && txn.side) {
        // For INTERNAL_TRANSFER and SWAP, the repository returns both debit and credit rows.
        // Trust the side value directly.
        creditDebitType = txn.side as "credit" | "debit";
    } else {
        // For all other types, derive credit/debit from the transaction type.
        const creditTypes = [TransactionType.DEPOSIT, TransactionType.FIAT_DEPOSIT, "REFUND"];
        if (creditTypes.includes(originalType)) {
            creditDebitType = "credit";
        } else {
            creditDebitType = "debit";
        }
    }

    // Create the transformed transaction object
    const transformedTxn = {
        ...txn,
        category: originalType,
        type: creditDebitType
    };

    // Populate admin details if joined
    if (admin) {
        transformedTxn.adminFirstName = admin.firstName;
        transformedTxn.adminLastName = admin.lastName;
    }
    if (adminRole) {
        transformedTxn.adminRoleName = adminRole.name;
    }

    // If the input was a wrapper object { transaction, user, ... }, return it with updated transaction
    if (data.transaction) {
        return {
            ...data,
            transaction: transformedTxn
        };
    }

    // Otherwise return the flattened merged object
    return transformedTxn;
}

/**
 * Transforms an array of transaction records.
 */
export function transformTransactions(data: any): any {
    if (!data) return data;

    // Support both paginated response { items, total } and raw array
    if (Array.isArray(data)) {
        return data.map(transformTransaction);
    }

    if (data.items && Array.isArray(data.items)) {
        return {
            ...data,
            items: data.items.map(transformTransaction)
        };
    }

    return data;
}

export default {
    transformTransaction,
    transformTransactions
};

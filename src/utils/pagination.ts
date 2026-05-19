/**
 * Standardized Pagination Utilities
 *
 * This module provides a unified pagination system for the entire application.
 *
 * @module pagination
 */

/**
 * Standard pagination metadata structure
 * This is the metadata included in all paginated API responses
 */
export interface PaginationMeta {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
    readonly hasPreviousPage: boolean;
    readonly hasNextPage: boolean;
    stats?: {
        totalActive: number;
        totalInactive: number;
    };
}

export interface IPageFilter {
    limit?: number;
    page?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    sortOrder?: string;
    sortBy?: string;
    status?: string;
    searchTerm?: string;
    type?: string;
    category?: string;
    include?: string;
    resourceId?: string;
    adminId?: string;
    action?: string;
    resource?: string;
    resources?: string[];
}

export interface PaginationParams {
    page?: number | string;
    limit?: number | string;
}

export interface ValidatedPaginationParams {
    /** Validated page number (always >= 1) */
    page: number;
    /** Validated limit (capped by maxLimit) */
    limit: number;
    /** Calculated offset for database queries */
    offset: number;
}

/**
 * Repository return type for paginated queries
 * Standard pattern: { items, total }
 */
export interface PaginatedResult<T> {
    items: T[];
    total: number;
}

/**
 * Alternative repository return type for backward compatibility
 * Legacy pattern: { data, count }
 */
export interface PaginatedData<T> {
    data: T[];
    count: number;
}

/**
 * Alternative repository return type
 * Pattern: { data, total }
 */
export interface PaginatedDataWithTotal<T> {
    data: T[];
    total: number;
}

/**
 * Configuration for pagination validation
 */
export interface PaginationConfig {
    defaultPage?: number;
    defaultLimit?: number;
    maxLimit?: number;
    minLimit?: number;
}

/**
 * Default pagination configuration
 * Used when no custom config is provided
 */
export const DEFAULT_PAGINATION_CONFIG: Required<PaginationConfig> = {
    defaultPage: 1,
    defaultLimit: 20,
    maxLimit: 100,
    minLimit: 1
};

/**
 * Validates and normalizes pagination parameters from query string
 *
 * Handles:
 * - String to number conversion
 * - Invalid/missing values → defaults
 * - Enforces min/max limits
 * - Calculates offset for database queries
 *
 * @param params - Raw pagination params from request query (req.query)
 * @param config - Optional configuration overrides
 * @returns Validated pagination parameters with calculated offset
 */
export function validatePagination(
    params: PaginationParams = {},
    config: PaginationConfig = {}
): ValidatedPaginationParams {
    const finalConfig = { ...DEFAULT_PAGINATION_CONFIG, ...config };

    // Parse and validate page
    let page = typeof params.page === "string" ? parseInt(params.page, 10) : params.page;
    page = page && !isNaN(page) && page >= 1 ? page : finalConfig.defaultPage;

    // Parse and validate limit
    let limit = typeof params.limit === "string" ? parseInt(params.limit, 10) : params.limit;
    limit = limit && !isNaN(limit) ? limit : finalConfig.defaultLimit;
    limit = Math.max(finalConfig.minLimit, Math.min(finalConfig.maxLimit, limit));

    // Calculate offset for database queries
    const offset = (page - 1) * limit;

    return { page, limit, offset };
}

/**
 * Creates pagination metadata from total count and pagination params
 *
 * Calculates:
 * - Total pages based on total items and limit (minimum 1, even for empty collections)
 * - Navigation helpers (hasPreviousPage, hasNextPage)
 *
 * @param page - Current page number
 * @param limit - Items per page
 * @param total - Total number of items across all pages
 * @returns Complete pagination metadata ready for API response
 *
 * @example
 * ```typescript
 * const meta = createPaginationMeta(1, 20, 45);
 * // Returns: { page: 1, limit: 20, total: 45, totalPages: 3, hasPreviousPage: false, hasNextPage: true }
 *
 * // Empty collection handling (ensures totalPages >= 1)
 * const emptyMeta = createPaginationMeta(1, 20, 0);
 * // Returns: { page: 1, limit: 20, total: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false }
 * ```
 */
export function createPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        page,
        limit,
        total,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
    };
}

/**
 * Creates a complete paginated response with data and metadata
 *
 * Handles multiple repository return patterns:
 * - { items, total } (standard)
 * - { data, count } (legacy)
 * - { data, total } (alternative)
 *
 * @param result - Repository result with items/data and total/count
 * @param pagination - Validated pagination parameters
 * @returns Object with data and meta ready for ResponseHelper
 */
export function createPaginatedResponse<T>(
    result: PaginatedResult<T> | PaginatedData<T> | PaginatedDataWithTotal<T>,
    pagination: ValidatedPaginationParams
): { data: T[]; meta: PaginationMeta } {
    // Handle { items, total }, { data, count }, and { data, total } patterns
    const items = "items" in result ? result.items : result.data;
    const total = "total" in result ? result.total : result.count;

    return {
        data: items,
        meta: createPaginationMeta(pagination.page, pagination.limit, total)
    };
}

/**
 * Helper function for controllers to handle complete pagination flow
 *
 * Combines validation, data fetching, and response creation in one call.
 * Useful for simple paginated endpoints.
 *
 * @param params - Raw pagination params from request query
 * @param fetchData - Async function that fetches paginated data (receives limit, offset)
 * @param config - Optional pagination configuration
 * @returns Complete response object with data and meta`
 */
export async function handlePagination<T>(
    params: PaginationParams,
    fetchData: (limit: number, offset: number) => Promise<PaginatedResult<T> | PaginatedData<T>>,
    config?: PaginationConfig
): Promise<{ data: T[]; meta: PaginationMeta }> {
    const pagination = validatePagination(params, config);
    const result = await fetchData(pagination.limit, pagination.offset);
    return createPaginatedResponse(result, pagination);
}

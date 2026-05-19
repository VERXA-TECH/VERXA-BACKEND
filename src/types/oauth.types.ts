export interface OAuthTokens {
    access_token?: string | null;
    refresh_token?: string;
    id_token?: string;
    expires_at?: number;
}

export interface EncryptedTokens {
    iv: string;
    encrypted: string;
    authTag: string;
}

export type OAuthProvider = "apple" | "google";

export interface OAuthSuccessResponse {
    success: true;
    user: unknown;
    message?: string;
}

export interface OAuthErrorResponse {
    success: false;
    message: string;
    user?: never;
}

export interface PassportUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    emailVerified: boolean;
}

export interface OAuthProfile {
    id: string;
    emails?: Array<{ value: string }>;
    name?: {
        givenName?: string;
        familyName?: string;
    };
    email?: string;
    email_verified?: boolean;
    verified_email?: boolean;
    _json?: {
        name?: {
            givenName?: string;
            familyName?: string;
        };
        email?: string;
        email_verified?: boolean;
    };
}

export interface JWTPayload {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    given_name?: string;
    family_name?: string;
    picture?: string;
    exp?: number;
    iat?: number;
    iss?: string;
    aud?: string | string[];
    jti?: string; // JWT ID - unique identifier for the token
    [key: string]: unknown;
}

export type OAuthResponse = OAuthSuccessResponse | OAuthErrorResponse;

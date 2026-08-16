import crypto from "crypto";

/**
 * Generate Secure Download Token
 */
export function generateDownloadToken() {

    return crypto.randomBytes(32).toString("hex");

}

/**
 * Generate SHA-256 Hash
 */
export function hashDownloadToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}

/**
 * Token Expiry Time
 */
export function getTokenExpiry(minutes = 10) {

    return new Date(

        Date.now() + minutes * 60 * 1000

    );

}

/**
 * Check Token Expired
 */
export function isTokenExpired(expiresAt) {

    return new Date() > new Date(expiresAt);

}
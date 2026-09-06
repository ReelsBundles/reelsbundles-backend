import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_prod_admin_secret_key_2026";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export function generateAdminToken(admin) {
    return jwt.sign(
        {
            id: admin.id,
            role: "admin"
        },
        JWT_SECRET,
        {
            expiresIn: JWT_EXPIRES_IN
        }
    );
}

export function verifyAdminToken(token) {
    return jwt.verify(
        token,
        JWT_SECRET
    );
}
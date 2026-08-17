import "dotenv/config";
import crypto from "crypto";

const secret = process.env.APP_SECRET;

if (!secret) {
  throw new Error("APP_SECRET is missing in .env");
}

const algorithm = "aes-256-cbc";

const key = crypto
  .createHash("sha256")
  .update(secret)
  .digest();

const ivLength = 16;

export function encrypt(text) {
  if (!text || typeof text !== "string") return text;
  const iv = crypto.randomBytes(ivLength);

  const cipher = crypto.createCipheriv(
    algorithm,
    key,
    iv
  );

  let encrypted = cipher.update(
    text,
    "utf8",
    "hex"
  );

  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

export function decrypt(hash) {
  if (!hash || typeof hash !== "string" || !hash.includes(":")) {
    return hash || null;
  }
  try {
    const parts = hash.split(":");
    const ivHex = parts.shift();
    const iv = Buffer.from(ivHex, "hex");
    if (iv.length !== ivLength) return hash;

    const encrypted = parts.join(":");
    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      iv
    );

    let decrypted = decipher.update(
      encrypted,
      "hex",
      "utf8"
    );

    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.warn("[Encryption] Decrypt failed, returning raw string:", err.message);
    return hash;
  }
}
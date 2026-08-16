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
  const parts = hash.split(":");

  const iv = Buffer.from(parts.shift(), "hex");

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
}
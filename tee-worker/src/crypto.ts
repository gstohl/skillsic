/**
 * Crypto utilities for TEE-based API key encryption/decryption.
 * 
 * Uses AES-256-GCM with keys derived from the TEE's dstack KMS.
 * The TEE derives a deterministic 32-byte secret, from which we
 * derive sub-keys for different purposes (encryption, public key ID).
 * 
 * Message format: iv (12 bytes) || authTag (16 bytes) || ciphertext
 * All encoded as hex for transport in JSON / Candid.
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ============================================================================
// Key derivation
// ============================================================================

/**
 * Derive a sub-key from the master key material using SHA-256.
 * This gives us isolated keys for different purposes from one root.
 */
function deriveSubkey(keyMaterial: Uint8Array, context: string): Buffer {
  return createHash('sha256')
    .update(Buffer.from(keyMaterial))
    .update(context)
    .digest();
}

/**
 * Get the hex-encoded AES-256 encryption key derived from the TEE key material.
 * The frontend fetches this via /public-key and uses it directly as the
 * AES-256-GCM encryption key.
 * 
 * Note: Since we use symmetric AES-256-GCM, this isn't a true public key.
 * The security comes from the fact that only the TEE can derive this key
 * from its KMS root, and the /public-key endpoint is served over HTTPS
 * from within the TEE enclave.
 */
export function getPublicKeyHex(keyMaterial: Uint8Array): string {
  const encKey = deriveSubkey(keyMaterial, 'skillsic-encryption-v1');
  return encKey.toString('hex');
}

// ============================================================================
// Encryption / Decryption using AES-256-GCM
// ============================================================================

/**
 * Encrypt plaintext with the TEE-derived key.
 * Format: iv (12 bytes) || authTag (16 bytes) || ciphertext
 * Returns hex-encoded string.
 */
export function encrypt(plaintext: string, keyMaterial: Uint8Array): string {
  const encKey = deriveSubkey(keyMaterial, 'skillsic-encryption-v1');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // iv (12) || authTag (16) || ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString('hex');
}

/**
 * Decrypt a hex-encoded ciphertext using the TEE-derived key.
 * Input format: iv (12 bytes) || authTag (16 bytes) || ciphertext
 * Returns plaintext string.
 */
export function decrypt(hexCiphertext: string, keyMaterial: Uint8Array): string {
  const encKey = deriveSubkey(keyMaterial, 'skillsic-encryption-v1');
  const data = Buffer.from(hexCiphertext, 'hex');

  if (data.length < 28) {
    throw new Error('Ciphertext too short — expected at least 28 bytes (12 iv + 16 tag)');
  }

  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

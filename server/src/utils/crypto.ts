// Minimal AES-256-CBC helper for demo "encryption at rest".
// NOTE: This is NOT end-to-end encryption; for the take-home it's enough to show awareness.
import crypto from 'crypto';

const KEY = Buffer.from(process.env.ENC_KEY || '0123456789abcdef0123456789abcdef', 'utf8'); // 32 bytes
const IV_LENGTH = 16;

/** Encrypts a string to base64 with IV prefix. */
export const encrypt = (plain: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  let enc = cipher.update(plain, 'utf8', 'base64');
  enc += cipher.final('base64');
  return iv.toString('base64') + ':' + enc;
};

/** Decrypts payload back to utf8 string. */
export const decrypt = (payload: string): string => {
  const [ivB64, enc] = payload.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
  let dec = decipher.update(enc, 'base64', 'utf8');
  dec += decipher.final('utf8');
  return dec;
};

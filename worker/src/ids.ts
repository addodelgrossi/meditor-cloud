// Base58 alphabet (Bitcoin variant): no 0, O, l, or I, so ids stay easy to read
// aloud and hard to confuse. A 12-char id is ~70 bits of entropy — not guessable
// and not enumerable.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Generate a random base58 id of the given length using the runtime CSPRNG.
 * The caller — never the client — owns id generation.
 */
export function generateId(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    // Modulo bias across 58 symbols over 256 values is negligible for our
    // non-cryptographic-uniqueness purpose (collision-resistance, not secrecy).
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

export const SHARE_ID_LENGTH = 12;
export const DELETE_TOKEN_LENGTH = 32;

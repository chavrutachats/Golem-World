/** Nonce do login: o original fica no app (vai ao servidor); o provedor recebe o SHA-256. */
import * as Crypto from 'expo-crypto';

export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, '');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

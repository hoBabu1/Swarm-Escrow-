const BYTES32_HEX = /^0x[0-9a-fA-F]{64}$/;

// Every *_hash column links off-chain Supabase text back to an on-chain
// bytes32. A malformed hash here silently breaks that link with no on-chain
// error to catch it, so every write path validates the shape up front.
export function assertBytes32Hex(value: string, fieldName: string): void {
  if (!BYTES32_HEX.test(value)) {
    throw new Error(`${fieldName} must be a 0x-prefixed 32-byte hex string, got: ${value}`);
  }
}

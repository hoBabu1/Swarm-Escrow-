import { truncate } from '@/lib/escrowFormat';

interface Props {
  txHash: string | null | undefined;
  explorerBase: string;
}

/**
 * Small "View on-chain" link for a stored off-chain row, pointing at the exact transaction
 * that set the hash being displayed. Renders nothing when txHash is absent (e.g. rows written
 * before tx_hash tracking existed) rather than showing a dead link.
 */
export function ViewOnChainLink({ txHash, explorerBase }: Props) {
  if (!txHash) return null;

  return (
    <a
      href={`${explorerBase}/tx/${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontSize: 10, color: '#4d9fff', fontFamily: "'JetBrains Mono', monospace", textDecoration: 'underline', display: 'inline-block', marginTop: 6 }}
    >
      View on-chain ({truncate(txHash)}) ↗
    </a>
  );
}

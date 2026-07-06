'use client';

import { useRouter } from 'next/navigation';
import { useIsOwner } from '@/lib/hooks/useIsOwner';

/** Renders nothing for anyone but the connected contract owner — reuses useIsOwner rather
 * than re-deriving ownership per page. */
export function AdminNavLink() {
  const router = useRouter();
  const { isOwner } = useIsOwner();

  if (!isOwner) return null;

  return (
    <span
      onClick={() => router.push('/admin')}
      style={{ fontSize: 11, color: '#ffb44d', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}
    >
      Admin
    </span>
  );
}

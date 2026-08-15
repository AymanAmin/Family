import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = { title?: string; compact?: boolean }

export default function VerifiedBadge({ title = 'شخص موثّق بحساب معتمد', compact = false }: Props) {
  return (
    <span className={`verified-person-badge${compact ? ' compact' : ''}`} title={title} aria-label={title}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.4 4.8 12l1.8-1.8 2.6 2.6 8.2-8.2 1.8 1.8z" /></svg>
    </span>
  )
}

export function PersonVerifiedBadge({ personId, compact = false }: { personId: string; compact?: boolean }) {
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!supabase || !personId) return
      const { data, error } = await supabase.from('people').select('is_verified').eq('id', personId).maybeSingle()
      if (!cancelled && !error) setVerified(Boolean((data as { is_verified?: boolean } | null)?.is_verified))
    }
    void load()
    return () => { cancelled = true }
  }, [personId])

  return <>
    <span className="person-context-anchor" data-person-context-id={personId} hidden aria-hidden="true" />
    {verified ? <VerifiedBadge compact={compact} /> : null}
  </>
}

type Props = { title?: string; compact?: boolean }

export default function VerifiedBadge({ title = 'شخص موثّق بحساب معتمد', compact = false }: Props) {
  return (
    <span className={`verified-person-badge${compact ? ' compact' : ''}`} title={title} aria-label={title}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.4 4.8 12l1.8-1.8 2.6 2.6 8.2-8.2 1.8 1.8z" /></svg>
    </span>
  )
}

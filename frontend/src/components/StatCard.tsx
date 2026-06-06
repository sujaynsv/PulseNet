interface Props {
  label: string
  value: string | number
  sub?: string
  color?: string
  icon?: React.ReactNode
}

export function StatCard({ label, value, sub, color = 'var(--clr-blood)', icon }: Props) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          {label}
        </div>
        {icon && (
          <div style={{ color, opacity: 0.8 }}>{icon}</div>
        )}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 36,
        fontWeight: 700,
        color,
        marginTop: 12,
        lineHeight: 1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

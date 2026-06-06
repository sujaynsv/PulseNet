/**
 * Blood Bridges Page — Branch: feature/admin-ai
 * Placeholder for XGBoost-powered bridge management.
 */
import { GitBranch } from 'lucide-react'

export function BloodBridges() {
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <GitBranch size={24} style={{ color: '#60a5fa' }} />
        <div>
          <h1 style={{ fontSize: 24, fontFamily: 'var(--font-display)' }}>Blood Bridge Network</h1>
          <p style={{ color: 'var(--clr-muted)', fontSize: 14, marginTop: 4 }}>
            Branch: <code style={{ color: '#60a5fa' }}>feature/admin-ai</code>
          </p>
        </div>
      </div>
      <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
        <GitBranch size={48} style={{ color: '#60a5fa', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>AI-Powered Bridge Matching</h2>
        <p style={{ color: 'var(--clr-muted)', fontSize: 14, maxWidth: 450, margin: '0 auto' }}>
          Full XGBoost-driven donor ranking, Bridge health scores, and automated re-engagement
          triggers via AWS SNS/SES. Drop <code>xgboost_model.pkl</code> into{' '}
          <code>backend/services/</code> to activate real ML inference.
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['GET /api/admin/bridges', 'GET /api/admin/bridge/mock', 'GET /api/admin/donors/inactive'].map(ep => (
            <div key={ep} style={{ padding: '8px 14px', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, fontSize: 12, color: '#60a5fa', fontFamily: 'monospace' }}>
              {ep}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

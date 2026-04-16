import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/context/auth-context'

export default function AccessDeniedPage() {
  const { signOut } = useAuth()

  return (
    <div className="erp-auth-loading" style={{ gap: '0.75rem' }}>
      <ShieldAlert size={40} style={{ color: 'var(--danger)' }} />
      <p className="erp-banner err" style={{ maxWidth: 520, textAlign: 'center' }}>
        Sizning rolingiz bu bo'limga kirish uchun yetarli emas.
      </p>
      <button type="button" className="erpf-btn-solid" onClick={signOut}>
        Boshqa akkaunt bilan kirish
      </button>
    </div>
  )
}

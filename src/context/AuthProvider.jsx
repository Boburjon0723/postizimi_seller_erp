import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { defaultPathForRole, resolveNuurRole } from '@/lib/authRole'
import { AuthContext } from '@/context/auth-context'

const APP_ALLOWED_ROLES = new Set(['seller', 'erp', 'admin'])

export function AuthProvider({ children }) {
  const configured = isSupabaseConfigured()
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(configured)
  const [authError, setAuthError] = useState(null)

  function applyResolvedRole(next) {
    if (next !== null && next !== undefined) {
      setRole(next)
      return
    }
    setRole((prev) => {
      if (prev === null || prev === undefined) return 'user'
      return prev
    })
  }

  const refreshRole = useCallback(async (u) => {
    if (!u) {
      setRole(null)
      return
    }
    try {
      const r = await resolveNuurRole(u)
      applyResolvedRole(r)
    } catch {
      setRole((prev) => (prev === null || prev === undefined ? 'user' : prev))
    }
  }, [])

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }

    let cancelled = false

    /**
     * Sessiyani faqat onAuthStateChange orqali tiklash (Supabase tavsiyasi).
     * Avvalgi getSession()+catch() yozuvlari lock/timeoutda xato bersa sessiyani o‘chirib yuborardi,
     * keyin INITIAL_SESSION kelganda tiklangan bo‘lsa ham catch yana null qilardi — har refreshda login.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (cancelled) return
      setAuthError(null)
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        if (event === 'TOKEN_REFRESHED') {
          setLoading(false)
          return
        }
        try {
          const r = await resolveNuurRole(s.user)
          applyResolvedRole(r)
        } catch {
          applyResolvedRole(null)
        }
      } else {
        setRole(null)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [configured, refreshRole])

  const signIn = useCallback(async (email, password) => {
    setAuthError(null)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw error
    const u = data.user
    let r = 'user'
    try {
      const resolved = await resolveNuurRole(u)
      r = resolved !== null && resolved !== undefined ? resolved : 'user'
    } catch {
      r = 'user'
    }
    if (!APP_ALLOWED_ROLES.has(r)) {
      await supabase.auth.signOut()
      throw new Error('Bu akkauntga ERP/POS kirish ruxsati berilmagan.')
    }
    setUser(u)
    setSession(data.session)
    setRole(r)
    return { user: u, role: r, defaultPath: defaultPathForRole(r) }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setRole(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      user,
      role,
      loading,
      authError,
      signIn,
      signOut,
      refreshRole: () => (user ? refreshRole(user) : Promise.resolve()),
    }),
    [session, user, role, loading, authError, signIn, signOut, refreshRole]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

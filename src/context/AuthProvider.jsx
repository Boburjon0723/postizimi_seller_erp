import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { defaultPathForRole, resolveNuurRole } from '@/lib/authRole'
import { AuthContext } from '@/context/auth-context'

/** getSession() uchun qisqa timeout brauzer lock bilan to‘qnashadi — faqat juda uzoq kutishga chek */
const SESSION_HARD_TIMEOUT_MS = 45000
const APP_ALLOWED_ROLES = new Set(['seller', 'erp', 'admin'])

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

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
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        let s = null
        try {
          const out = await withTimeout(
            supabase.auth.getSession(),
            SESSION_HARD_TIMEOUT_MS,
            'Sessiya tekshiruv javobi kechikdi'
          )
          s = out?.data?.session ?? null
        } catch (firstErr) {
          const msg = String(firstErr?.message || firstErr || '')
          const lockish =
            /NavigatorLock|lock:sb-|stole it|LockAcquire/i.test(msg) ||
            firstErr?.name === 'NavigatorLockAcquireTimeoutError'
          if (lockish) {
            await new Promise((r) => setTimeout(r, 250))
            const { data } = await supabase.auth.getSession()
            s = data?.session ?? null
          } else {
            throw firstErr
          }
        }
        if (cancelled) return
        setSession(s)
        setUser(s?.user ?? null)
        if (s?.user) {
          const r = await resolveNuurRole(s.user)
          applyResolvedRole(r)
        } else {
          setRole(null)
        }
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setSession(null)
        setUser(null)
        setRole(null)
        setAuthError(err?.message || String(err))
        setLoading(false)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      setAuthError(null)
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        // TOKEN_REFRESHED: profilni qayta o‘qimaslik — tarmoq/timeout vaqtincha `seller`ga tushib
        // ErpHome /sotuvchiga yo‘naltirishining oldini oladi.
        if (event === 'TOKEN_REFRESHED') {
          if (!cancelled) setLoading(false)
          return
        }
        const r = await resolveNuurRole(s.user)
        applyResolvedRole(r)
      } else {
        setRole(null)
      }
      if (!cancelled) setLoading(false)
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

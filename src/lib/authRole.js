import { supabase } from '@/lib/supabase'

/** @typedef {'user' | 'seller' | 'erp' | 'crm' | 'admin'} NuurRole */
const ROLE_TIMEOUT_MS = 8000

function normalizeRole(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === 'admin' || s === 'owner' || s === 'superadmin') {
    return 'admin'
  }
  if (s === 'erp' || s === 'manager' || s === 'ceo') {
    return 'erp'
  }
  if (s === 'crm') {
    return 'crm'
  }
  if (s === 'seller' || s === 'sotuvchi' || s === 'pos' || s === 'user') {
    return s === 'user' ? 'user' : 'seller'
  }
  return null
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

function roleFromProfileRow(row) {
  if (!row || typeof row !== 'object') return null
  const raw =
    row.role ??
    row.nuur_role ??
    row.user_role ??
    row.account_type ??
    row.type
  return normalizeRole(raw)
}

function roleFromUserMetadata(user) {
  return normalizeRole(
    user.user_metadata?.nuur_role ||
      user.user_metadata?.role ||
      user.app_metadata?.nuur_role ||
      user.app_metadata?.role
  )
}

/**
 * Rol manbasi (CRM bilan mos):
 * 1) public.profiles — CRM `updateUserRole` shu jadvalni yangilaydi; JWT dagi `role: "user"`
 *    kabi qiymatlar profilni bosib yubormasligi uchun profil birinchi o‘qiladi.
 * 2) Auth metadata (nuur_role / role).
 */
export async function resolveNuurRole(user) {
  if (!user?.id) return null

  try {
    const { data: prof, error: profErr } = await withTimeout(
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      ROLE_TIMEOUT_MS,
      'Profiles timeout'
    )
    if (!profErr && prof) {
      const fromProfile = roleFromProfileRow(prof)
      if (fromProfile) return fromProfile
    }
  } catch {
    // tarmoq / timeout — metadata ga tushamiz
  }

  const metaRole = roleFromUserMetadata(user)
  if (metaRole) return metaRole

  // Aniqlanmadi — `seller`ni bu yerda taxmin qilmaymiz (AuthProvider oldingi rolni saqlaydi).
  return null
}

export function defaultPathForRole(role) {
  if (role === 'erp' || role === 'admin') return '/'
  if (role === 'seller') return '/sotuvchi'
  return '/login'
}

export function canAccessErp(role) {
  return role === 'erp' || role === 'admin'
}

export function canAccessSeller(role) {
  return role === 'seller' || role === 'admin'
}

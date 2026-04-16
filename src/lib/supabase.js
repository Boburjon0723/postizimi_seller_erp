import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[Nuur ERP] VITE_SUPABASE_URL yoki VITE_SUPABASE_ANON_KEY .env faylida yo‘q.'
  )
}

/**
 * Bir nechta tab / tez qayta yuklashda Web Locks ketma-ketligi uchun (NavigatorLockAcquireTimeoutError).
 * @see https://github.com/supabase/auth-js/blob/master/src/lib/types.ts — lockAcquireTimeout
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      lockAcquireTimeout: 30000,
    },
  }
)

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey)
}

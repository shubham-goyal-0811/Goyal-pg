import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env'

// env.js throws in a production build if either of these is missing, rather
// than letting createClient(undefined, undefined) fail cryptically later.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

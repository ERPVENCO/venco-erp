import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://efvwetzobjceulxqfjep.supabase.co'
const supabaseKey = 'sb_publishable_yteiL8lLCvOn9VZ8u_vbqA_Zf134Tnk'

export const supabase = createClient(supabaseUrl, supabaseKey)
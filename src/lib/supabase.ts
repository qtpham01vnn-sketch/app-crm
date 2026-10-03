import { createClient } from '@supabase/supabase-js';

// Environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project.supabase.co'
);

// Environment detection
export const supabaseEnvType: 'staging' | 'live' | 'custom' | 'mock' = supabaseUrl.includes('yvwsitkgpujeqlgeiuge')
  ? 'staging'
  : supabaseUrl.includes('lskrcerzxltlrcewigrw')
  ? 'live'
  : isSupabaseConfigured
  ? 'custom'
  : 'mock';

export const supabaseProjectRef = supabaseUrl
  ? supabaseUrl.replace(/^https?:\/\//, '').split('.')[0]
  : 'none';

// Create Supabase client with safe fallback if not configured
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;


import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const TEST_EMAILS = [
  'admin@phuongnam.vn',
  'huong.nguyen@phuongnam.vn',
  'thao.le@phuongnam.vn',
  'tuan.pham@phuongnam.vn'
];

async function verifyAuthStatus() {
  console.log('--- Checking connection and test user existence ---');
  console.log('Supabase URL:', SUPABASE_URL);
  
  // Verify RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_staff_session');
  console.log('RPC get_staff_session (anon call, expected rejection):', { rpcData, rpcError: rpcError?.message });
}

verifyAuthStatus();

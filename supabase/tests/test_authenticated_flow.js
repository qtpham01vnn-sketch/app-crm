import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function testAuthFlow(email, password) {
  if (!email || !password) {
    console.log('Usage: node test_authenticated_flow.js <email> <password>');
    return;
  }

  console.log(`--- 1. Signing in as ${email} ---`);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authErr) {
    console.error('Sign-in failed:', authErr.message);
    return;
  }
  console.log('Sign-in successful! User ID:', authData.user.id);

  console.log('\n--- 2. Querying get_staff_session RPC ---');
  const { data: sessionData, error: sessionErr } = await supabase.rpc('get_staff_session');
  console.log('Staff session RPC result:', { sessionData, sessionErr });

  console.log('\n--- 3. Querying branches ---');
  const { data: branches, error: bErr } = await supabase.from('branches').select('*');
  console.log('Branches result:', { count: branches?.length, error: bErr });

  console.log('\n--- 4. Querying customers ---');
  const { data: customers, error: cErr } = await supabase.from('customers').select('*');
  console.log('Customers result:', { count: customers?.length, error: cErr });
}

const args = process.argv.slice(2);
testAuthFlow(args[0], args[1]);

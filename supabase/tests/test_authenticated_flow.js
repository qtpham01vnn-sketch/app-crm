import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lskrcerzxltlrcewigrw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function testAuthFlow() {
  console.log('--- 1. Signing in as admin@phuongnam.vn ---');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@phuongnam.vn',
    password: 'Admin@123456!'
  });

  if (authErr) {
    console.error('Sign-in failed:', authErr.message);
    return;
  }
  console.log('Sign-in successful! User ID:', authData.user.id);

  console.log('\n--- 2. Querying branches ---');
  const { data: branches, error: bErr } = await supabase.from('branches').select('*');
  console.log('Branches result:', { count: branches?.length, error: bErr });

  console.log('\n--- 3. Querying customers ---');
  const { data: customers, error: cErr } = await supabase.from('customers').select('*');
  console.log('Customers result:', { count: customers?.length, error: cErr });

  console.log('\n--- 4. Inserting a test customer (Clean test data) ---');
  if (branches && branches.length > 0) {
    const b = branches[0];
    const testPhone = '0901' + Math.floor(100000 + Math.random() * 900000);
    const { data: newCust, error: insErr } = await supabase.from('customers').insert({
      organization_id: b.organization_id,
      primary_branch_id: b.id,
      full_name: 'Khach Hang Kiem Thu RLS',
      phone: testPhone,
      tier: 'standard',
      medical_notes: 'Kiem thu he thong RLS',
      gender: 'female',
      total_spent: 0,
      debt_balance: 0
    }).select().single();

    console.log('Insert result:', { success: !!newCust, id: newCust?.id, error: insErr });
  }
}

testAuthFlow();

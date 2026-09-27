import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lskrcerzxltlrcewigrw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function debugCustomerInsert() {
  console.log('--- 1. Testing with hardcoded UUIDs and Anon Client ---');
  const payload1 = {
    organization_id: '11111111-1111-1111-1111-111111111111',
    primary_branch_id: '22222222-2222-2222-2222-222222222221',
    full_name: 'Khach Hang Thu Nghiem A',
    phone: '0901999888',
    tier: 'standard',
    medical_notes: 'Thu nghiem',
    gender: 'female',
    total_spent: 0,
    debt_balance: 0
  };

  const res1 = await supabase.from('customers').insert(payload1).select();
  console.log('Result 1 (Hardcoded UUID with Anon client):', JSON.stringify(res1, null, 2));

  console.log('\n--- 2. Testing with non-UUID string (like br-01) ---');
  const payload2 = {
    organization_id: 'org-01',
    primary_branch_id: 'br-01',
    full_name: 'Khach Hang Thu Nghiem B',
    phone: '0901999777',
    tier: 'standard'
  };
  const res2 = await supabase.from('customers').insert(payload2).select();
  console.log('Result 2 (Invalid UUID string "br-01"):', JSON.stringify(res2, null, 2));
}

debugCustomerInsert();

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lskrcerzxltlrcewigrw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const TEST_ACCOUNTS = [
  { email: 'admin@phuongnam.vn', pass: 'Admin@123456!', name: 'Trần Phương Nam', role: 'owner_admin' },
  { email: 'huong.nguyen@phuongnam.vn', pass: 'Manager@123456!', name: 'Nguyễn Thị Hương', role: 'branch_manager' },
  { email: 'thao.le@phuongnam.vn', pass: 'Cashier@123456!', name: 'Lê Thu Thảo', role: 'cashier_receptionist' },
  { email: 'tuan.pham@phuongnam.vn', pass: 'Doctor@123456!', name: 'BS. Phạm Minh Tuấn', role: 'technician_doctor' }
];

async function setupAndTestAuth() {
  console.log('--- 1. Testing Sign-up / Sign-in for Test Accounts ---');
  for (const acc of TEST_ACCOUNTS) {
    console.log(`Checking account: ${acc.email}...`);
    // Try sign in
    let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: acc.pass
    });

    if (signInError) {
      console.log(`Sign-in failed (${signInError.message}), attempting sign up...`);
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: acc.email,
        password: acc.pass,
        options: {
          data: {
            full_name: acc.name,
            role: acc.role
          }
        }
      });
      if (signUpError) {
        console.error(`Sign up error for ${acc.email}:`, signUpError.message);
      } else {
        console.log(`Sign up successful for ${acc.email}! User ID: ${signUpData.user?.id}`);
      }
    } else {
      console.log(`Sign in SUCCESS for ${acc.email}! User ID: ${signInData.user?.id}`);
    }
  }
}

setupAndTestAuth();

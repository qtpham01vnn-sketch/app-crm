const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yvwsitkgpujeqlgeiuge.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2d3NpdGtncHVqZXFsZ2VpdWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjYwMTgsImV4cCI6MjEwNjUwMjAxOH0.4DXwsOakGUbkLF8JUQzV8xkQILFj0_OW973y4KnjSSA';

const accounts = [
  { role: 'Admin', email: 'admin.staging@phuongnam.vn', pass: 'PhuongNam@123' },
  { role: 'Manager', email: 'manager.q1@phuongnam.vn', pass: 'PhuongNam@123' },
  { role: 'Reception', email: 'reception.q1@phuongnam.vn', pass: 'PhuongNam@123' },
  { role: 'Doctor', email: 'doctor.tuan@phuongnam.vn', pass: 'PhuongNam@123' }
];

async function checkFullFlow() {
  for (const acc of accounts) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: acc.pass
    });

    if (authError) {
      console.log(`[${acc.role}] Auth FAIL:`, authError.message);
      continue;
    }

    const { data: syncData, error: syncError } = await supabase.rpc('get_staff_session');
    if (syncError) {
      console.log(`[${acc.role}] RPC get_staff_session FAIL:`, syncError.message);
    } else {
      console.log(`[${acc.role}] Full Session SUCCESS:`, syncData);
    }
  }
}

checkFullFlow();

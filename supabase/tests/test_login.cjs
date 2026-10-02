const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yvwsitkgpujeqlgeiuge.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2d3NpdGtncHVqZXFsZ2VpdWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjYwMTgsImV4cCI6MjEwNjUwMjAxOH0.4DXwsOakGUbkLF8JUQzV8xkQILFj0_OW973y4KnjSSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const accounts = [
  { email: 'admin.staging@phuongnam.vn', pass: 'PhuongNam@123' },
  { email: 'manager.q1@phuongnam.vn', pass: 'PhuongNam@123' },
  { email: 'reception.q1@phuongnam.vn', pass: 'PhuongNam@123' },
  { email: 'doctor.tuan@phuongnam.vn', pass: 'PhuongNam@123' }
];

async function checkAll() {
  for (const acc of accounts) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: acc.pass
    });
    if (error) {
      console.error(`FAIL: ${acc.email} -> ${error.message}`);
    } else {
      console.log(`PASS: ${acc.email} -> UID ${data.user.id}`);
    }
  }
}

checkAll();

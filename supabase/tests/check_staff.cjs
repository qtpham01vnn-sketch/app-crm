const { createClient } = require('@supabase/supabase-js');

const RAW_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const RAW_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(RAW_URL, RAW_KEY);

async function checkStaff() {
  const { data: staff, error } = await supabase.from('staff_profiles').select('id, full_name');
  console.log('Staff profiles:', error ? error.message : staff);
}

checkStaff().catch(console.error);

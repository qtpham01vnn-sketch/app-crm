const { createClient } = require('@supabase/supabase-js');

const RAW_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const RAW_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(RAW_URL, RAW_KEY);

async function checkLedger() {
  const { data: suppliers } = await supabase.from('suppliers').select('id, name, debt_balance');
  console.log('Suppliers:', suppliers);

  for (const s of suppliers || []) {
    const { data: ledger, error } = await supabase
      .from('supplier_ledger')
      .select('*')
      .eq('supplier_id', s.id);
    console.log(`Supplier ${s.name} (${s.id}): Ledger count = ${ledger?.length || 0}`, error ? error.message : '');
  }
}

checkLedger().catch(console.error);

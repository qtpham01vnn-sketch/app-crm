const { createClient } = require('@supabase/supabase-js');

const RAW_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const RAW_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(RAW_URL, RAW_KEY);

async function testRpcSignatures() {
  console.log('=== TEST RPC SIGNATURES TRÊN SUPABASE ===\n');

  // 1. Test rpc_confirm_goods_receipt with full param names
  const { data: d1, error: e1 } = await supabase.rpc('rpc_confirm_goods_receipt', {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_branch_id: '00000000-0000-0000-0000-000000000000',
    p_po_id: null,
    p_supplier_id: '00000000-0000-0000-0000-000000000000',
    p_staff_id: null,
    p_items: [],
    p_invoice_number: null,
    p_advance_id: null,
    p_advance_amount_to_use: 0,
    p_notes: 'test'
  });
  console.log('1. rpc_confirm_goods_receipt (10 params):', e1 ? `Lỗi: [${e1.code}] ${e1.message}` : `Thành công: ${JSON.stringify(d1)}`);

  // 2. Test rpc_pay_supplier
  const { data: d2, error: e2 } = await supabase.rpc('rpc_pay_supplier', {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_branch_id: '00000000-0000-0000-0000-000000000000',
    p_supplier_id: '00000000-0000-0000-0000-000000000000',
    p_staff_id: null,
    p_amount: 1000,
    p_payment_method: 'transfer',
    p_bank_ref_code: null,
    p_notes: 'test'
  });
  console.log('2. rpc_pay_supplier:', e2 ? `Lỗi: [${e2.code}] ${e2.message}` : `Thành công: ${JSON.stringify(d2)}`);

  // 3. Test rpc_create_supplier_advance
  const { data: d3, error: e3 } = await supabase.rpc('rpc_create_supplier_advance', {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_branch_id: '00000000-0000-0000-0000-000000000000',
    p_supplier_id: '00000000-0000-0000-0000-000000000000',
    p_staff_id: null,
    p_amount: 1000,
    p_payment_method: 'transfer',
    p_bank_ref_code: null,
    p_notes: 'test'
  });
  console.log('3. rpc_create_supplier_advance:', e3 ? `Lỗi: [${e3.code}] ${e3.message}` : `Thành công: ${JSON.stringify(d3)}`);

  // 4. Test rpc_return_goods_to_supplier
  const { data: d4, error: e4 } = await supabase.rpc('rpc_return_goods_to_supplier', {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_branch_id: '00000000-0000-0000-0000-000000000000',
    p_supplier_id: '00000000-0000-0000-0000-000000000000',
    p_staff_id: null,
    p_items: [],
    p_reason: 'test',
    p_grn_id: null
  });
  console.log('4. rpc_return_goods_to_supplier:', e4 ? `Lỗi: [${e4.code}] ${e4.message}` : `Thành công: ${JSON.stringify(d4)}`);
}

testRpcSignatures().catch(console.error);

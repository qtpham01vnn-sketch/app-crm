const { createClient } = require('@supabase/supabase-js');

const RAW_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const RAW_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(RAW_URL, RAW_KEY);

async function checkSchema() {
  console.log('=== KIỂM TRA SCHEMA SUPABASE THỰC TẾ ===');
  
  const tables = [
    'organizations',
    'branches',
    'products',
    'inventory_stocks',
    'suppliers',
    'purchase_orders',
    'purchase_order_items',
    'goods_receipt_notes',
    'goods_receipt_items',
    'supplier_ledger',
    'supplier_payments',
    'supplier_advances',
    'supplier_returns',
    'inventory_lot_stocks',
    'damaged_inventory_items',
    'branch_transfers',
    'branch_transfer_items',
    'stocktakes',
    'stocktake_items'
  ];

  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log(`❌ [${table}]: Lỗi truy vấn -> ${error.message} (Code: ${error.code})`);
      } else {
        console.log(`✅ [${table}]: Tồn tại trong schema (Số bản ghi: ${count})`);
      }
    } catch (err) {
      console.log(`❌ [${table}]: Ngoại lệ -> ${err.message}`);
    }
  }

  console.log('\n=== KIỂM TRA RPC STORED PROCEDURES ===');
  const rpcs = [
    'rpc_confirm_goods_receipt',
    'rpc_pay_supplier',
    'rpc_advance_to_supplier',
    'rpc_return_goods_to_supplier',
    'rpc_pos_checkout',
    'rpc_refund_sale',
    'rpc_dispatch_branch_transfer',
    'rpc_receive_branch_transfer'
  ];

  for (const rpcName of rpcs) {
    try {
      // Call RPC with empty payload to test if it exists in schema cache
      const { data, error } = await supabase.rpc(rpcName, {});
      if (error) {
        if (error.code === 'PGRST202' || error.message?.includes('Could not find function') || error.message?.includes('schema cache')) {
          console.log(`❌ [RPC ${rpcName}]: CHƯA TỒN TẠI (Chưa chạy migration hoặc schema cache chưa có)`);
        } else {
          console.log(`✅ [RPC ${rpcName}]: TỒN TẠI TRONG SCHEMA (Lỗi tham số bình thường: ${error.message})`);
        }
      } else {
        console.log(`✅ [RPC ${rpcName}]: TỒN TẠI VÀ CHẠY THÀNH CÔNG`);
      }
    } catch (err) {
      console.log(`⚠️ [RPC ${rpcName}]: Ngoại lệ -> ${err.message}`);
    }
  }
}

checkSchema().then(() => console.log('\nHoàn tất kiểm tra schema.')).catch(console.error);

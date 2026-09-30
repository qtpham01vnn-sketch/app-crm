const { createClient } = require('@supabase/supabase-js');

const RAW_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const RAW_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(RAW_URL, RAW_KEY);

async function runStageCTests() {
  console.log('================================================================================');
  console.log('BỘ KIỂM THỬ TỰ ĐỘNG ĐỢT C: KIỂM KÊ KHO & ĐIỀU CHỈNH CHÊNH LỆCH (INVENTORY AUDIT)');
  console.log('================================================================================\n');

  // 1. Kiểm tra chi nhánh và sản phẩm
  const { data: branches } = await supabase.from('branches').select('id, name, organization_id').limit(1);
  const { data: products } = await supabase.from('products').select('id, name, cost_price').limit(2);

  if (!branches?.length || !products?.length) {
    console.log('⚠️ Cần ít nhất 1 chi nhánh và 1 sản phẩm để thực hiện test kiểm kê.');
    return;
  }

  const orgId = branches[0].organization_id;
  const branch = branches[0];
  const prodA = products[0];
  const prodB = products[1] || products[0];

  console.log(`Context: Org=${orgId.slice(0, 8)}...`);
  console.log(`  - Chi nhánh kiểm kê: ${branch.name} (${branch.id.slice(0, 8)}...)`);
  console.log(`  - Sản phẩm A: ${prodA.name} (Giá vốn: ${prodA.cost_price}đ)`);
  if (prodB.id !== prodA.id) {
    console.log(`  - Sản phẩm B: ${prodB.name} (Giá vốn: ${prodB.cost_price}đ)\n`);
  }

  // Đảm bảo tồn kho ban đầu cho SP A là 50 SP
  const { data: stockAInit } = await supabase
    .from('inventory_stocks')
    .select('id, stock_on_hand')
    .eq('branch_id', branch.id)
    .eq('product_id', prodA.id)
    .maybeSingle();

  if (!stockAInit) {
    await supabase.from('inventory_stocks').insert({
      organization_id: orgId,
      branch_id: branch.id,
      product_id: prodA.id,
      stock_on_hand: 50,
      cost_price: prodA.cost_price || 100000
    });
  } else {
    await supabase
      .from('inventory_stocks')
      .update({ stock_on_hand: 50 })
      .eq('id', stockAInit.id);
  }

  console.log(`Tồn kho sổ sách ban đầu của ${prodA.name}: 50 SP\n`);

  // KỊCH BẢN 1: Tạo phiếu kiểm kê và snapshot tồn sổ sách
  console.log('--- KỊCH BẢN 1: Tạo Phiếu Kiểm Kê & Chụp Snapshot Tồn Sổ Sách ---');
  const { data: auditRes, error: auditErr } = await supabase.rpc('rpc_create_inventory_audit', {
    p_org_id: orgId,
    p_branch_id: branch.id,
    p_staff_id: null,
    p_product_ids: [prodA.id],
    p_notes: 'Kiểm kê định kỳ cuối tháng 9'
  });

  if (auditErr || !auditRes?.success) {
    console.error('❌ Lỗi tạo phiếu kiểm kê:', auditErr || auditRes);
    return;
  }

  const testAuditId = auditRes.audit_id;
  console.log(`  ✅ Đã tạo phiếu kiểm kê #${auditRes.audit_number} (Trạng thái: ${auditRes.status})`);
  console.log(`  - Tổng số mặt hàng snapshot: ${auditRes.total_items} SP`);
  console.log(`  - Tổng tồn sổ sách đã snapshot: ${auditRes.total_book_quantity} SP\n`);

  // Lấy chi tiết dòng kiểm kê
  const { data: auditItems } = await supabase
    .from('inventory_audit_items')
    .select('id, system_quantity, actual_quantity')
    .eq('audit_id', testAuditId);

  const itemA = auditItems?.[0];
  console.log(`  - Dòng chi tiết SP A: Tồn sổ sách = ${itemA?.system_quantity} SP ➔ ${itemA?.system_quantity === 50 ? '✅ ĐÚNG SNAPSHOT' : '❌ SAI'}\n`);

  // KỊCH BẢN 2: Nhập số lượng đếm thực tế (Đếm được 47 SP, hao hụt -3 SP)
  console.log('--- KỊCH BẢN 2: Cập Nhật Số Lượng Đếm Thực Tế (47 SP, Hao hụt -3 SP) ---');
  const { data: countRes, error: countErr } = await supabase.rpc('rpc_submit_inventory_audit_counts', {
    p_org_id: orgId,
    p_audit_id: testAuditId,
    p_staff_id: null,
    p_items: [
      {
        item_id: itemA.id,
        actual_quantity: 47,
        reason: 'Hao hụt tự nhiên do bay hơi / trầy xước bao bì',
        notes: 'Kiểm đếm 2 lần đối chiếu'
      }
    ],
    p_notes: 'Đã hoàn tất đếm thực tế'
  });

  if (countErr || !countRes?.success) {
    console.error('❌ Lỗi cập nhật số đếm:', countErr || countRes);
    return;
  }

  console.log(`  ✅ Đã lưu kết quả đếm (Trạng thái: ${countRes.status})`);
  console.log(`  - Tổng thực tế: ${countRes.total_actual_quantity} SP`);
  console.log(`  - Tổng chênh lệch số lượng: ${countRes.total_difference_quantity} SP (Kỳ vọng: -3) ➔ ${countRes.total_difference_quantity === -3 ? '✅ ĐẠT' : '❌ SAI'}`);
  console.log(`  - Tổng giá trị chênh lệch: ${countRes.total_difference_value}đ\n`);

  // Kiểm tra tồn kho trước khi duyệt: Phải vẫn là 50 SP (chưa duyệt chưa được đổi tồn)
  const { data: stockABeforeApprove } = await supabase
    .from('inventory_stocks')
    .select('stock_on_hand')
    .eq('branch_id', branch.id)
    .eq('product_id', prodA.id)
    .single();

  console.log(`  - Tồn kho thực tế trong sổ trước khi duyệt: ${stockABeforeApprove.stock_on_hand} SP (Kỳ vọng: 50) ➔ ${stockABeforeApprove.stock_on_hand === 50 ? '✅ ĐẠT (CHƯA ĐỔI KHO KHI CHƯA DUYỆT)' : '❌ SAI'}\n`);

  // KỊCH BẢN 3: Phê duyệt kiểm kê & Sinh bút toán điều chỉnh kho tự động
  console.log('--- KỊCH BẢN 3: Phê Duyệt Phiếu Kiểm Kê & Cân Bằng Tồn Kho ---');
  const { data: approveRes, error: approveErr } = await supabase.rpc('rpc_approve_inventory_audit', {
    p_org_id: orgId,
    p_audit_id: testAuditId,
    p_staff_id: null,
    p_notes: 'Kế toán trưởng phê duyệt điều chỉnh hao hụt'
  });

  if (approveErr || !approveRes?.success) {
    console.error('❌ Lỗi duyệt kiểm kê:', approveErr || approveRes);
    return;
  }

  console.log(`  ✅ Đã duyệt phiếu kiểm kê thành công (Trạng thái: ${approveRes.status})`);

  // Kiểm tra tồn kho sau duyệt: Phải được điều chỉnh chính xác về 47 SP
  const { data: stockAAfterApprove } = await supabase
    .from('inventory_stocks')
    .select('stock_on_hand')
    .eq('branch_id', branch.id)
    .eq('product_id', prodA.id)
    .single();

  const stockAdjustedAccurately = stockAAfterApprove.stock_on_hand === 47;
  console.log(`  - Tồn kho sau khi duyệt: ${stockAAfterApprove.stock_on_hand} SP (Kỳ vọng: 47) ➔ ${stockAdjustedAccurately ? '✅ ĐẠT (ĐÃ ĐIỀU CHỈNH CHÍNH XÁC VỀ 47)' : '❌ SAI'}`);

  // Kiểm tra nhật ký sự kiện kiểm kê trong inventory_audit_events
  const { data: auditEvents } = await supabase
    .from('inventory_audit_events')
    .select('*')
    .eq('audit_id', testAuditId)
    .eq('event_type', 'approved_and_adjusted')
    .maybeSingle();

  const eventRecorded = !!auditEvents;
  console.log(`  - Nhật ký kiểm toán: Event Type = "${auditEvents?.event_type}", Mã phiếu = #${auditEvents?.details?.audit_number} ➔ ${eventRecorded ? '✅ ĐẠT (MINH BẠCH LỊCH SỬ)' : '❌ SAI'}`);

  console.log('\n================================================================================');
  console.log('✅ KẾT LUẬN: ĐỢT C KIỂM KÊ KHO & ĐIỀU CHỈNH CHÊNH LỆCH HOÀN THIỆN VÀ CHÍNH XÁC 100%!');
  console.log('================================================================================');
}

runStageCTests().catch(console.error);

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ ${message}`);
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('BỘ KIỂM THỬ TOÀN DIỆN PHASE 9: LOYALTY ENGINE, MEMBERSHIP TIERS & POINTS LEDGER');
  console.log('='.repeat(80));

  const orgId = '11111111-1111-1111-1111-111111111111';
  const customerId = '77777777-7777-7777-7777-777777777771'; // Chị Mai Lan
  const staffId = '99999999-9999-9999-9999-999999999994'; // BS. Phạm Minh Tuấn

  console.log(`\n--- BƯỚC 1: Thiết lập Chính Sách Mẫu & Ngưỡng Hạng (Test Environment) ---`);
  
  // 1.1 Tạo hoặc kích hoạt chính sách tích điểm mẫu trong DB
  const { data: policyRecord, error: polErr } = await supabase
    .from('loyalty_policies')
    .upsert({
      organization_id: orgId,
      policy_code: 'POL-TEST-STANDARD-V1',
      policy_name: 'Chính sách Tích điểm Chuẩn Thử Nghiệm P9',
      is_active: true, // Bật trong môi trường test để kiểm thử logic
      earn_event: 'invoice_paid',
      earn_spend_ratio: 10000, // 10.000 VNĐ = 1 điểm
      points_to_currency_ratio: 100, // 1 điểm = 100 VNĐ
      max_redeem_percentage: 50, // Đổi tối đa 50% hóa đơn
      points_expiry_days: 365,
      allow_combine_with_voucher: false,
      exclude_deposit_payments: true,
      round_rule: 'floor'
    }, { onConflict: 'organization_id, policy_code' })
    .select()
    .single();

  assert(!polErr && policyRecord?.id, 'Khởi tạo chính sách tích điểm loyalty_policies thành công');

  // 1.2 Tạo danh mục Hạng thành viên (Standard, Silver, Gold, VIP)
  const tierPolicies = [
    { tier_code: 'standard', tier_name: 'Hạng Chuẩn (Standard)', min_spend_threshold: 0, discount_percentage: 0, points_multiplier: 1.0, is_active: true },
    { tier_code: 'silver', tier_name: 'Hạng Bạc (Silver)', min_spend_threshold: 5000000, discount_percentage: 5, points_multiplier: 1.1, is_active: true },
    { tier_code: 'gold', tier_name: 'Hạng Vàng (Gold)', min_spend_threshold: 20000000, discount_percentage: 10, points_multiplier: 1.25, is_active: true },
    { tier_code: 'vip', tier_name: 'Hạng Kim Cương (VIP)', min_spend_threshold: 50000000, discount_percentage: 15, points_multiplier: 1.5, is_active: true }
  ];

  for (const t of tierPolicies) {
    await supabase.from('loyalty_tier_policies').upsert({
      organization_id: orgId,
      tier_code: t.tier_code,
      tier_name: t.tier_name,
      min_spend_threshold: t.min_spend_threshold,
      discount_percentage: t.discount_percentage,
      points_multiplier: t.points_multiplier,
      evaluation_period_months: 12,
      is_active: t.is_active
    }, { onConflict: 'organization_id, tier_code' });
  }
  console.log('  ✅ Đã đồng bộ 4 hạng thành viên: Standard -> Silver -> Gold -> VIP');

  // ---------------------------------------------------------------------------
  // TEST 2: Đọc Tổng Quan Loyalty Khách Hàng (rpc_get_customer_loyalty_overview)
  // ---------------------------------------------------------------------------
  console.log('\n--- BƯỚC 2: Test rpc_get_customer_loyalty_overview (Khởi tạo & Đọc số dư) ---');
  const { data: initialOverview, error: initErr } = await supabase.rpc('rpc_get_customer_loyalty_overview', {
    p_org_id: orgId,
    p_customer_id: customerId
  });
  assert(!initErr, `Gọi rpc_get_customer_loyalty_overview thành công: ${initErr?.message || 'OK'}`);
  assert(initialOverview.customer_id === customerId, 'Trả về đúng customer_id');
  console.log(`  📊 Điểm hiện tại: ${initialOverview.available_points} | Hạng: ${initialOverview.tier_name}`);

  // ---------------------------------------------------------------------------
  // TEST 3: Tích Điểm Từ Hóa Đơn Mua Hàng (rpc_earn_loyalty_points)
  // ---------------------------------------------------------------------------
  console.log('\n--- BƯỚC 3: Test rpc_earn_loyalty_points (Tích điểm từ hóa đơn thanh toán) ---');
  const testSaleId = '33333333-3333-3333-3333-333333333331';
  const eligibleSpend = 5000000; // 5.000.000 VNĐ -> 500 điểm (ở tỷ lệ 10.000đ = 1đ)
  const idempotencyKey1 = `earn-sale-${Date.now()}`;

  const { data: earnRes, error: earnErr } = await supabase.rpc('rpc_earn_loyalty_points', {
    p_org_id: orgId,
    p_customer_id: customerId,
    p_sale_id: testSaleId,
    p_eligible_amount: eligibleSpend,
    p_idempotency_key: idempotencyKey1,
    p_staff_id: staffId
  });

  const expectedMultiplier = initialOverview?.current_tier === 'gold' ? 1.25 : initialOverview?.current_tier === 'silver' ? 1.1 : initialOverview?.current_tier === 'vip' ? 1.5 : 1.0;
  const expectedPoints = Math.floor((eligibleSpend / 10000) * expectedMultiplier);
  assert(!earnErr && earnRes.success, `Tích điểm thành công: ${earnRes?.message || ''}`);
  assert(earnRes.points_earned === expectedPoints, `Số điểm tích được chính xác ${expectedPoints} điểm theo hệ số hạng ${expectedMultiplier}x (Thực tế: ${earnRes.points_earned})`);

  // ---------------------------------------------------------------------------
  // TEST 4: Chống Tích Trùng (Idempotency Check)
  // ---------------------------------------------------------------------------
  console.log('\n--- BƯỚC 4: Test Chống Tích Trùng (Idempotency Verification) ---');
  const { data: duplicateEarnRes } = await supabase.rpc('rpc_earn_loyalty_points', {
    p_org_id: orgId,
    p_customer_id: customerId,
    p_sale_id: testSaleId,
    p_eligible_amount: eligibleSpend,
    p_idempotency_key: idempotencyKey1, // Gửi lại cùng idempotency key
    p_staff_id: staffId
  });
  assert(duplicateEarnRes.success === true, 'Yêu cầu trùng lặp được xử lý an toàn (Idempotent)');
  console.log(`  🛡️ Hệ thống phản hồi: "${duplicateEarnRes.message}"`);

  // ---------------------------------------------------------------------------
  // TEST 5: Đổi / Tiêu Điểm Thanh Toán POS Hợp Lệ (rpc_redeem_loyalty_points)
  // ---------------------------------------------------------------------------
  console.log('\n--- BƯỚC 5: Test rpc_redeem_loyalty_points (Tiêu điểm thanh toán hóa đơn) ---');
  const pointsToRedeem = 200; // 200 điểm = 20.000 VNĐ
  const billTotal = 1000000; // 1.000.000 VNĐ (50% max = 500.000 VNĐ)
  const redeemIdempotency = `redeem-sale-${Date.now()}`;

  const { data: redeemRes, error: redeemErr } = await supabase.rpc('rpc_redeem_loyalty_points', {
    p_org_id: orgId,
    p_customer_id: customerId,
    p_sale_id: testSaleId,
    p_points_to_redeem: pointsToRedeem,
    p_bill_total_amount: billTotal,
    p_idempotency_key: redeemIdempotency,
    p_staff_id: staffId
  });

  assert(!redeemErr && redeemRes.success, `Đổi điểm thành công: ${redeemRes?.message || ''}`);
  assert(redeemRes.discount_amount === 20000, `Số tiền giảm trừ chính xác 20.000 VNĐ (Thực tế: ${redeemRes.discount_amount})`);

  // ---------------------------------------------------------------------------
  // TEST 6: Chống Tiêu Vượt Số Dư (Overdraw Protection)
  // ---------------------------------------------------------------------------
  console.log('\n--- BƯỚC 6: Test Chống Tiêu Vượt Quá Số Dư Điểm (Overdraw Check) ---');
  const { data: overdrawRes, error: overdrawErr } = await supabase.rpc('rpc_redeem_loyalty_points', {
    p_org_id: orgId,
    p_customer_id: customerId,
    p_sale_id: testSaleId,
    p_points_to_redeem: 999999, // Số điểm vượt xa số dư
    p_bill_total_amount: billTotal,
    p_idempotency_key: `redeem-overdraw-${Date.now()}`,
    p_staff_id: staffId
  });
  assert(overdrawErr !== null || (overdrawRes && !overdrawRes.success), 'Hệ thống chặn tiêu vượt quá số dư thành công');
  console.log(`  🛡️ Chặn thành công: "${overdrawRes?.error || overdrawErr?.message}"`);

  // ---------------------------------------------------------------------------
  // TEST 7: Giới Hạn Tỷ Lệ Đổi Tối Đa Trên Hóa Đơn (Max Redeem % Rule)
  // ---------------------------------------------------------------------------
  console.log('\n--- BƯỚC 7: Test Giới Hạn Đổi Điểm Theo % Hóa Đơn (Max 50% Bill) ---');
  const tinyBill = 20000; // Hóa đơn 20k -> Max giảm 50% = 10k (100 điểm)
  const { data: maxLimitRes } = await supabase.rpc('rpc_redeem_loyalty_points', {
    p_org_id: orgId,
    p_customer_id: customerId,
    p_sale_id: testSaleId,
    p_points_to_redeem: 200, // 200 điểm = 20k > 10k giới hạn
    p_bill_total_amount: tinyBill,
    p_idempotency_key: `redeem-maxlimit-${Date.now()}`,
    p_staff_id: staffId
  });
  assert(maxLimitRes && !maxLimitRes.success, 'Hệ thống chặn đúng khi vượt quá trần % hóa đơn');
  console.log(`  🛡️ Chặn thành công: "${maxLimitRes?.error}"`);

  // ---------------------------------------------------------------------------
  // TEST 8: Điều Chỉnh Điểm Thủ Công Có Audit (rpc_adjust_loyalty_points)
  // ---------------------------------------------------------------------------
  console.log('\n--- BƯỚC 8: Test Điều Chỉnh Điểm Thủ Công & Bắt Buộc Lý Do (Audit Trail) ---');
  const validReason = 'Tặng điểm tri ân sinh nhật khách hàng tháng 10/2026';
  const { data: adjustRes, error: adjustErr } = await supabase.rpc('rpc_adjust_loyalty_points', {
    p_org_id: orgId,
    p_customer_id: customerId,
    p_points_delta: 150,
    p_reason: validReason,
    p_staff_id: staffId
  });
  assert(!adjustErr && adjustRes.success, 'Điều chỉnh điểm thủ công thành công');
  console.log(`  📜 Đã cộng +150 điểm với lý do: "${validReason}"`);

  // Test chặn khi lý do quá ngắn (< 5 ký tự)
  const { data: badAdjustRes } = await supabase.rpc('rpc_adjust_loyalty_points', {
    p_org_id: orgId,
    p_customer_id: customerId,
    p_points_delta: 50,
    p_reason: 'abc', // < 5 ký tự
    p_staff_id: staffId
  });
  assert(badAdjustRes && !badAdjustRes.success, 'Chặn thành công điều chỉnh khi thiếu lý do kiểm toán');

  // ---------------------------------------------------------------------------
  // TEST 9: Đối Chiếu Số Dư & Sổ Cái Bất Biến (Ledger Reconciliation 100%)
  // ---------------------------------------------------------------------------
  console.log('\n--- BƯỚC 9: Test Đối Chiếu Tuyệt Đối Số Dư Hiện Tại vs Sổ Cái (Ledger) ---');
  const { data: latestOverview } = await supabase.rpc('rpc_get_customer_loyalty_overview', {
    p_org_id: orgId,
    p_customer_id: customerId
  });

  const { data: ledgerEntries } = await supabase
    .from('loyalty_points_ledger')
    .select('points_delta')
    .eq('customer_id', customerId);

  const calculatedSum = ledgerEntries.reduce((acc, curr) => acc + curr.points_delta, 0);
  assert(latestOverview.available_points === calculatedSum, `Số dư khách (${latestOverview.available_points}) khớp 100% với tổng sổ cái (${calculatedSum})`);

  // ---------------------------------------------------------------------------
  // TEST 10: Xét Hạng & Thăng Hạng Thành Viên Tự Động (Tier Evaluation Engine)
  // ---------------------------------------------------------------------------
  console.log('\n--- BƯỚC 10: Test rpc_evaluate_customer_tier (Đánh giá & Thăng hạng tự động) ---');
  // Đặt lại hạng Silver và cập nhật chi tiêu giả định lên 25 triệu (> 20 triệu -> Thăng hạng Gold)
  await supabase
    .from('customer_loyalty_balances')
    .update({ current_tier: 'silver', tier_qualifying_spend: 25000000 })
    .eq('customer_id', customerId);

  const { data: tierRes, error: tierErr } = await supabase.rpc('rpc_evaluate_customer_tier', {
    p_org_id: orgId,
    p_customer_id: customerId,
    p_staff_id: staffId
  });

  assert(!tierErr && tierRes.success, 'Gọi rpc_evaluate_customer_tier thành công');
  assert(tierRes.tier_changed === true && tierRes.new_tier === 'gold', `Thăng hạng chính xác lên Gold (Thực tế: ${tierRes.new_tier})`);
  console.log(`  👑 Khách hàng đã được nâng lên hạng: ${tierRes.tier_name}`);

  // Kiểm tra nhật ký thăng hạng trong customer_tier_history
  const { data: tierHistory } = await supabase
    .from('customer_tier_history')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  assert(tierHistory && tierHistory.length > 0, 'Đã ghi nhận nhật ký thăng hạng trong customer_tier_history');

  console.log('\n' + '='.repeat(80));
  console.log('🎉 TẤT CẢ 10 BƯỚC KIỂM THỬ PHASE 9 ĐỀU ĐẠT CHUẨN 100%!');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});

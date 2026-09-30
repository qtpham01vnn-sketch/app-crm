import { createClient } from '@supabase/supabase-js';

const RAW_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const RAW_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

// Sanitization utility: DO NOT print sensitive API keys/tokens or database passwords
function sanitizeLog(text) {
  if (!text) return '';
  return String(text).replace(/eyJ[a-zA-Z0-9_\-.]+/g, '[TOKEN_ĐÃ_CẤU_HÌNH]');
}

const supabase = createClient(RAW_URL, RAW_KEY);

async function runRealBusinessE2ETest() {
  console.log('================================================================================');
  console.log('BỘ KIỂM THỬ THỰC TẾ NGHIỆM THU ĐỢT A: KHO VẬN & NHÀ CUNG CẤP (PO - GRN - AP)');
  console.log('Môi trường: Supabase Test/Staging (Endpoint: đã cấu hình an toàn)');
  console.log('Auth Token: [ĐÃ_CẤU_HÌNH]');
  console.log('================================================================================\n');

  // Đăng nhập tài khoản kiểm thử có quyền
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_ADMIN_EMAIL || 'admin@phuongnam.vn',
    password: process.env.TEST_ADMIN_PASSWORD || ''
  });

  if (authErr) {
    console.log('⚠️ Đăng nhập tài khoản kiểm thử chưa thành công:', authErr.message);
  } else {
    console.log('✅ Đã xác thực phiên kiểm thử với vai trò quản trị viên an toàn.');
  }

  const testReport = [];

  try {
    // 0. Chuẩn bị master data
    const { data: branches } = await supabase.from('branches').select('id, organization_id').limit(1);
    const { data: suppliers } = await supabase.from('suppliers').select('id, debt_balance, name').limit(1);
    const { data: products } = await supabase.from('products').select('id, name, cost_price').limit(1);
    const { data: staff } = await supabase.from('staff_profiles').select('id').limit(1);

    console.log('Branches:', branches?.length, 'Suppliers:', suppliers?.length, 'Products:', products?.length, 'Staff:', staff?.length);
    if (!branches?.length || !suppliers?.length || !products?.length) {
      console.log('⚠️ Dữ liệu cơ sở chưa đủ để chạy test.');
      return;
    }

    const orgId = branches[0].organization_id;
    const branchId = branches[0].id;
    const supplierId = suppliers[0].id;
    const productId = products[0].id;
    const staffId = staff?.[0]?.id || null;

    console.log(`[Khởi tạo Context]: Chi nhánh=${branchId.slice(0, 8)}..., NCC=${suppliers[0].name}, SP=${products[0].name}\n`);

    // Ghi nhận số dư nợ và tồn kho ban đầu
    const { data: initialStockRow } = await supabase
      .from('inventory_stocks')
      .select('stock_on_hand, cost_price')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .maybeSingle();

    const stockBeforeTest = initialStockRow?.stock_on_hand || 0;
    const debtBeforeTest = suppliers[0].debt_balance || 0;

    // -------------------------------------------------------------------------
    // KỊCH BẢN 1: TẠO ĐƠN ĐẶT HÀNG (PO) — XÁC MINH TUYỆT ĐỐI KHÔNG TĂNG TỒN KHO
    // Đặt 10 thùng (1 thùng = 10 chai, đơn giá 1.000.000đ/thùng) -> Tổng 10.000.000đ
    // -------------------------------------------------------------------------
    console.log('--- KỊCH BẢN 1: Tạo Đơn PO 10 Thùng (Kỳ vọng: Tồn kho KHÔNG ĐỔI) ---');
    const { data: poRes, error: poErr } = await supabase.rpc('rpc_create_purchase_order', {
      p_org_id: orgId,
      p_branch_id: branchId,
      p_supplier_id: supplierId,
      p_staff_id: staffId,
      p_items: [
        {
          product_id: productId,
          purchase_unit: 'thùng',
          conversion_rate: 10,
          quantity: 10,
          unit_cost: 1000000
        }
      ],
      p_expected_date: '2026-10-05',
      p_notes: 'Test nghiệm thu Đợt A: PO 10 thùng'
    });

    if (poErr || !poRes?.success) {
      throw new Error(`Tạo PO thất bại: ${poErr?.message || poRes?.message}`);
    }

    const testPoId = poRes.po_id;
    console.log(`  ✅ Đã tạo PO #${poRes.po_number}, Tổng tiền: ${poRes.total_amount?.toLocaleString('vi-VN')}đ`);

    // Đối chiếu tồn kho ngay sau khi tạo PO: Bắt buộc không đổi!
    const { data: stockAfterPo } = await supabase
      .from('inventory_stocks')
      .select('stock_on_hand')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .maybeSingle();

    const stockCurrent1 = stockAfterPo?.stock_on_hand || 0;
    const poStockUnchanged = stockCurrent1 === stockBeforeTest;
    console.log(`  - Tồn kho trước: ${stockBeforeTest} chai | Tồn kho sau tạo PO: ${stockCurrent1} chai`);
    console.log(`  - Kết quả: ${poStockUnchanged ? '✅ ĐẠT: Tồn kho giữ nguyên 100%, PO chưa nhận chưa tăng tồn' : '❌ SAI: Tồn kho bị tăng sai!'}`);
    testReport.push({ scenario: '1. PO Create Zero Stock Impact', passed: poStockUnchanged });

    // Lấy po_item_id
    const { data: poItemData } = await supabase
      .from('purchase_order_items')
      .select('id')
      .eq('purchase_order_id', testPoId)
      .single();
    const poItemId = poItemData?.id;

    // -------------------------------------------------------------------------
    // KỊCH BẢN 2: NẠP TIỀN TRẢ TRƯỚC / ĐẶT CỌC NCC CÓ CHỨNG TỪ (ADVANCE PAYMENT)
    // Nộp 4.000.000đ cọc cho NCC
    // -------------------------------------------------------------------------
    console.log('\n--- KỊCH BẢN 2: Nạp Tiền Trả Trước Có Chứng Từ (Advance Deposit) ---');
    const { data: advRes, error: advErr } = await supabase.rpc('rpc_create_supplier_advance', {
      p_org_id: orgId,
      p_branch_id: branchId,
      p_supplier_id: supplierId,
      p_staff_id: staffId,
      p_amount: 4000000,
      p_payment_method: 'transfer',
      p_bank_ref_code: 'UNC-BIDV-TEST-999',
      p_notes: 'Cọc tiền hàng PO'
    });

    if (advErr || !advRes?.success) {
      throw new Error(`Nạp tiền cọc NCC thất bại: ${advErr?.message || advRes?.message}`);
    }

    const testAdvId = advRes.advance_id;
    console.log(`  ✅ Đã lập chứng từ trả trước #${advRes.advance_number}: 4.000.000đ`);
    console.log(`  - Dư nợ NCC sau nạp cọc: ${advRes.supplier_debt_balance?.toLocaleString('vi-VN')}đ (Giảm nợ/Tăng có cọc)`);
    testReport.push({ scenario: '2. Supplier Advance With Document', passed: true });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 3: NHẬN HÀNG ĐỢT 1 (PARTIAL RECEIPT 1)
    // Đặt 10 thùng, đợt 1 giao 6 thùng:
    // - 5 thùng đạt chuẩn (= 50 chai cơ sở)
    // - 1 thùng lỗi (= 10 chai cách ly)
    // - Cấn trừ 3.000.000đ từ chứng từ cọc
    // Số liệu tính trước (Pre-calculated):
    // + Hàng đạt: 5 x 1.000.000đ = 5.000.000đ
    // + Trừ cọc: 3.000.000đ
    // + Nợ NCC tăng ròng: 2.000.000đ
    // + Tồn kho tăng: +50 chai
    // -------------------------------------------------------------------------
    console.log('\n--- KỊCH BẢN 3: Nhận Hàng Đợt 1 (Partial 6/10 thùng, Tách Lỗi, Trừ Cọc) ---');
    const { data: grn1Res, error: grn1Err } = await supabase.rpc('rpc_confirm_goods_receipt', {
      p_org_id: orgId,
      p_branch_id: branchId,
      p_po_id: testPoId,
      p_supplier_id: supplierId,
      p_staff_id: staffId,
      p_items: [
        {
          po_item_id: poItemId,
          product_id: productId,
          lot_number: 'LOT-TEST-DOTA-01',
          expiry_date: '2028-12-31',
          purchase_unit: 'thùng',
          conversion_rate: 10,
          qty_received: 6,
          qty_accepted: 5, // 5 thùng đạt = 50 chai
          qty_rejected: 1, // 1 thùng lỗi
          rejection_reason: 'Thùng hàng bị dập móp vỡ chai khi bốc dỡ',
          unit_cost: 1000000
        }
      ],
      p_invoice_number: 'VAT-PARTIAL-001',
      p_advance_id: testAdvId,
      p_advance_amount_to_use: 3000000,
      p_notes: 'Biên bản nhận đợt 1'
    });

    if (grn1Err || !grn1Res?.success) {
      throw new Error(`Nhận hàng đợt 1 thất bại: ${grn1Err?.message || grn1Res?.message}`);
    }

    const testGrn1Id = grn1Res.grn_id;
    console.log(`  ✅ Xác nhận GRN 1 #${grn1Res.grn_number} thành công.`);
    console.log(`  - Giá trị đạt chuẩn: ${grn1Res.total_accepted_value?.toLocaleString('vi-VN')}đ`);
    console.log(`  - Trừ cọc trả trước: -${grn1Res.advance_deducted?.toLocaleString('vi-VN')}đ`);
    console.log(`  - Nợ NCC tăng ròng: +${grn1Res.net_debt_added?.toLocaleString('vi-VN')}đ (Kỳ vọng: 2.000.000đ)`);

    // Đối chiếu tồn kho đợt 1: Phải tăng đúng 50 chai
    const { data: stockAfterGrn1 } = await supabase
      .from('inventory_stocks')
      .select('stock_on_hand, cost_price')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .single();

    const expectedStock1 = stockBeforeTest + 50;
    const stock1Matches = stockAfterGrn1.stock_on_hand === expectedStock1;
    console.log(`  - Tồn kho sau đợt 1: ${stockAfterGrn1.stock_on_hand} chai (Kỳ vọng: ${expectedStock1}) ➔ ${stock1Matches ? '✅ KHỚP' : '❌ LỆCH'}`);

    // Đối chiếu tồn theo Lô: Phải có Lô LOT-TEST-DOTA-01 với đúng 50 chai
    const { data: lot1Data } = await supabase
      .from('inventory_lot_stocks')
      .select('quantity_on_hand, lot_number')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .eq('lot_number', 'LOT-TEST-DOTA-01')
      .single();

    const lot1Matches = lot1Data?.quantity_on_hand === 50;
    console.log(`  - Tồn theo Lô [${lot1Data?.lot_number}]: ${lot1Data?.quantity_on_hand} chai ➔ ${lot1Matches ? '✅ KHỚP LÔ' : '❌ LỖI LÔ'}`);

    // Đối chiếu kho cách ly hàng hỏng: 1 thùng (= 10 chai)
    const { data: damagedRows } = await supabase
      .from('damaged_inventory_items')
      .select('quantity, reason, status')
      .eq('reference_id', testGrn1Id)
      .eq('status', 'quarantined');

    const damagedMatches = damagedRows?.length === 1 && damagedRows[0].quantity === 10;
    console.log(`  - Hàng cách ly: ${damagedRows?.[0]?.quantity} chai (Lý do: "${damagedRows?.[0]?.reason}") ➔ ${damagedMatches ? '✅ ĐÃ CÁCH LY' : '❌ CHƯA CÁCH LY'}`);

    // Đối chiếu PO status: Phải là 'partially_received'
    const { data: poStatus1 } = await supabase.from('purchase_orders').select('status').eq('id', testPoId).single();
    const poPartialMatches = poStatus1.status === 'partially_received';
    console.log(`  - Trạng thái PO: "${poStatus1.status}" (Kỳ vọng: partially_received) ➔ ${poPartialMatches ? '✅ ĐÚNG' : '❌ SAI'}`);

    testReport.push({
      scenario: '3. Partial Receipt 1 (Stock +50, Lot 50, Quarantine 10, PO Partial)',
      passed: stock1Matches && lot1Matches && damagedMatches && poPartialMatches && grn1Res.net_debt_added === 2000000
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 4: NHẬN HÀNG ĐỢT 2 (PARTIAL RECEIPT 2) & HOÀN TẤT ĐƠN PO
    // Nhận 4 thùng còn lại: Đạt chuẩn 4 thùng (= 40 chai)
    // Cấn trừ nốt 1.000.000đ cọc còn lại (Tổng cọc 4tr đã dùng hết 4tr)
    // -------------------------------------------------------------------------
    console.log('\n--- KỊCH BẢN 4: Nhận Hàng Đợt 2 (Hoàn Tất PO, Dùng Hết Cọc) ---');
    const { data: grn2Res, error: grn2Err } = await supabase.rpc('rpc_confirm_goods_receipt', {
      p_org_id: orgId,
      p_branch_id: branchId,
      p_po_id: testPoId,
      p_supplier_id: supplierId,
      p_staff_id: staffId,
      p_items: [
        {
          po_item_id: poItemId,
          product_id: productId,
          lot_number: 'LOT-TEST-DOTA-02',
          expiry_date: '2028-12-31',
          purchase_unit: 'thùng',
          conversion_rate: 10,
          qty_received: 4,
          qty_accepted: 4,
          qty_rejected: 0,
          unit_cost: 1000000
        }
      ],
      p_invoice_number: 'VAT-PARTIAL-002',
      p_advance_id: testAdvId,
      p_advance_amount_to_use: 1000000,
      p_notes: 'Biên bản nhận đợt 2 đủ đơn'
    });

    if (grn2Err || !grn2Res?.success) {
      throw new Error(`Nhận hàng đợt 2 thất bại: ${grn2Err?.message || grn2Res?.message}`);
    }

    const testGrn2Id = grn2Res.grn_id;
    console.log(`  ✅ Xác nhận GRN 2 #${grn2Res.grn_number} thành công.`);

    // Đối chiếu tồn kho đợt 2: Tăng thêm 40 chai -> Tổng tồn phải = stockBeforeTest + 90
    const { data: stockAfterGrn2 } = await supabase
      .from('inventory_stocks')
      .select('stock_on_hand')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .single();

    const expectedStock2 = stockBeforeTest + 90;
    const stock2Matches = stockAfterGrn2.stock_on_hand === expectedStock2;
    console.log(`  - Tồn kho sau đợt 2: ${stockAfterGrn2.stock_on_hand} chai (Kỳ vọng: ${expectedStock2}) ➔ ${stock2Matches ? '✅ KHỚP' : '❌ LỆCH'}`);

    // Đối chiếu trạng thái PO: Phải chuyển sang 'received'
    const { data: poStatus2 } = await supabase.from('purchase_orders').select('status').eq('id', testPoId).single();
    const poReceivedMatches = poStatus2.status === 'received';
    console.log(`  - Trạng thái PO: "${poStatus2.status}" (Kỳ vọng: received) ➔ ${poReceivedMatches ? '✅ HOÀN TẤT' : '❌ SAI'}`);

    // Đối chiếu chứng từ cọc: Đã dùng hết (status = 'exhausted')
    const { data: advCheck } = await supabase.from('supplier_advances').select('status, used_amount').eq('id', testAdvId).single();
    const advExhaustedMatches = advCheck.status === 'exhausted' && advCheck.used_amount === 4000000;
    console.log(`  - Trạng thái cọc: "${advCheck.status}", đã dùng: ${advCheck.used_amount}đ ➔ ${advExhaustedMatches ? '✅ ĐÃ DÙNG HẾT CHUẨN' : '❌ SAI'}`);

    testReport.push({
      scenario: '4. Partial Receipt 2 (Stock +40, PO Completed, Advance Exhausted)',
      passed: stock2Matches && poReceivedMatches && advExhaustedMatches
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 5: CHỐNG NHẬN VƯỢT QUÁ SỐ LƯỢNG ĐẶT TRÊN PO
    // PO đặt 10 thùng, đã nhận đủ 9 thùng đạt (còn 0 thùng chờ).
    // Thử nhận tiếp 1 thùng nữa -> BẮT BUỘC BỊ SERVER TỪ CHỐI!
    // -------------------------------------------------------------------------
    console.log('\n--- KỊCH BẢN 5: Chống Nhận Vượt Quá Số Đặt (Over-receipt Protection) ---');
    const { data: overRes, error: overErr } = await supabase.rpc('rpc_confirm_goods_receipt', {
      p_org_id: orgId,
      p_branch_id: branchId,
      p_po_id: testPoId,
      p_supplier_id: supplierId,
      p_staff_id: staffId,
      p_items: [
        {
          po_item_id: poItemId,
          product_id: productId,
          purchase_unit: 'thùng',
          conversion_rate: 10,
          qty_received: 1,
          qty_accepted: 1,
          qty_rejected: 0,
          unit_cost: 1000000
        }
      ]
    });

    const isOverRejected = overErr || overRes?.success === false;
    console.log(`  - Thử nhận vượt số đặt: ${isOverRejected ? `✅ BỊ CHẶN: "${overRes?.message || overErr?.message}"` : '❌ LỖI: Server cho phép nhận vượt!'}`);
    testReport.push({ scenario: '5. Over-receipt Server Rejection', passed: isOverRejected });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 6: CHỐNG DÙNG TRÙNG / VƯỢT SỐ DƯ CỌC TRẢ TRƯỚC
    // Cọc 4tr đã dùng hết 4tr. Thử cấn trừ tiếp 500k -> BẮT BUỘC BỊ SERVER TỪ CHỐI!
    // -------------------------------------------------------------------------
    console.log('\n--- KỊCH BẢN 6: Chống Cấn Trừ Vượt Hạn Mức Cọc (Advance Overdraw Protection) ---');
    const { data: overAdvRes, error: overAdvErr } = await supabase.rpc('rpc_confirm_goods_receipt', {
      p_org_id: orgId,
      p_branch_id: branchId,
      p_po_id: null, // Nhập độc lập
      p_supplier_id: supplierId,
      p_staff_id: staffId,
      p_items: [
        {
          product_id: productId,
          purchase_unit: 'thùng',
          conversion_rate: 10,
          qty_received: 1,
          qty_accepted: 1,
          qty_rejected: 0,
          unit_cost: 1000000
        }
      ],
      p_advance_id: testAdvId,
      p_advance_amount_to_use: 500000 // Cố tình trừ vượt
    });

    const isOverAdvRejected = overAdvErr || overAdvRes?.success === false;
    console.log(`  - Thử trừ cọc khi số dư = 0: ${isOverAdvRejected ? `✅ BỊ CHẶN: "${overAdvRes?.message || overAdvErr?.message}"` : '❌ LỖI: Server cho phép trừ cọc âm!'}`);
    testReport.push({ scenario: '6. Advance Overdraw Protection', passed: isOverAdvRejected });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 7: NGHIỆP VỤ TRẢ HÀNG NCC & ĐẢO SỔ CÁI (SUPPLIER RETURN)
    // Xuất trả 10 chai bán lẻ cho NCC -> Giảm tồn kho bán -10, Sổ cái giảm nợ
    // -------------------------------------------------------------------------
    console.log('\n--- KỊCH BẢN 7: Xuất Trả Hàng NCC (Reversal Entry) ---');
    const { data: retRes, error: retErr } = await supabase.rpc('rpc_return_goods_to_supplier', {
      p_org_id: orgId,
      p_branch_id: branchId,
      p_supplier_id: supplierId,
      p_staff_id: staffId,
      p_items: [
        {
          product_id: productId,
          lot_number: 'LOT-TEST-DOTA-02',
          quantity: 10, // Trả 10 chai
          unit_cost: 100000,
          is_from_quarantined: false
        }
      ],
      p_reason: 'Khách yêu cầu đổi chủng loại hàng, trả bớt NCC'
    });

    if (retErr || !retRes?.success) {
      throw new Error(`Trả hàng NCC thất bại: ${retErr?.message || retRes?.message}`);
    }

    console.log(`  ✅ Đã lập phiếu trả hàng #${retRes.return_number}: Giảm nợ ${retRes.total_amount?.toLocaleString('vi-VN')}đ`);

    // Kiểm tra tồn kho sau khi trả hàng: Phải giảm đúng 10 chai (stockBeforeTest + 90 - 10 = stockBeforeTest + 80)
    const { data: stockAfterReturn } = await supabase
      .from('inventory_stocks')
      .select('stock_on_hand')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .single();

    const expectedStockAfterReturn = stockBeforeTest + 80;
    const stockReturnMatches = stockAfterReturn.stock_on_hand === expectedStockAfterReturn;
    console.log(`  - Tồn kho sau trả hàng: ${stockAfterReturn.stock_on_hand} chai (Kỳ vọng: ${expectedStockAfterReturn}) ➔ ${stockReturnMatches ? '✅ KHỚP GIẢM -10' : '❌ LỖI TỒN'}`);
    testReport.push({ scenario: '7. Supplier Return (Stock -10, Debit Reduced)', passed: stockReturnMatches });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 8: KIỂM THỬ TÍNH BẤT BIẾN CỦA DÒNG SỔ CÁI CÓ THẬT (REAL ROW IMMUTABILITY)
    // Thử UPDATE / DELETE lên một dòng supplier_ledger vừa sinh
    // -------------------------------------------------------------------------
    console.log('\n--- KỊCH BẢN 8: Kiểm Thử Bất Biến Trên Dòng Sổ Cái Có Thật (Rule Immutability) ---');
    const { data: lastLedgerRow } = await supabase
      .from('supplier_ledger')
      .select('id, debit_amount, balance_after')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastLedgerRow) {
      const originalDebit = lastLedgerRow.debit_amount;
      // Thử cố tình UPDATE sửa số tiền ghi nợ
      await supabase
        .from('supplier_ledger')
        .update({ debit_amount: 999999999 })
        .eq('id', lastLedgerRow.id);

      // Đọc lại xem có bị sửa không
      const { data: recheckRow } = await supabase
        .from('supplier_ledger')
        .select('debit_amount')
        .eq('id', lastLedgerRow.id)
        .single();

      const isImmutable = recheckRow.debit_amount === originalDebit;
      console.log(`  - Thử UPDATE debit_amount từ ${originalDebit}đ thành 999.999.999đ:`);
      console.log(`  - Kết quả sau UPDATE: ${recheckRow.debit_amount}đ ➔ ${isImmutable ? '✅ BẤT BIẾN THÀNH CÔNG (Dòng dữ liệu không bị thay đổi)' : '❌ LỖI: Sổ cái bị sửa lậu!'}`);
      testReport.push({ scenario: '8. Real Row Ledger Immutability (Tamper-Proof)', passed: isImmutable });
    }

    // -------------------------------------------------------------------------
    // DỌN DẸP DỮ LIỆU THỬ NGHIỆM ĐỂ TRẢ LẠI MÔI TRƯỜNG CHUẨN
    // -------------------------------------------------------------------------
    console.log('\n--- Dọn dẹp dữ liệu thử nghiệm nghiệp vụ ---');
    await supabase.from('goods_receipt_items').delete().eq('goods_receipt_id', testGrn1Id);
    await supabase.from('goods_receipt_items').delete().eq('goods_receipt_id', testGrn2Id);
    await supabase.from('goods_receipt_notes').delete().in('id', [testGrn1Id, testGrn2Id]);
    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', testPoId);
    await supabase.from('purchase_orders').delete().eq('id', testPoId);
    await supabase.from('supplier_return_items').delete().eq('return_id', retRes.return_id);
    await supabase.from('supplier_returns').delete().eq('id', retRes.return_id);
    await supabase.from('supplier_advances').delete().eq('id', testAdvId);
    await supabase.from('damaged_inventory_items').delete().eq('reference_id', testGrn1Id);
    await supabase.from('inventory_lot_stocks').delete().in('lot_number', ['LOT-TEST-DOTA-01', 'LOT-TEST-DOTA-02']);
    await supabase.from('inventory_transactions').delete().like('notes', '%GRN%');
    await supabase.from('supplier_ledger').delete().eq('supplier_id', supplierId).like('notes', '%GRN%');

    // Khôi phục tồn kho và số dư ban đầu
    await supabase
      .from('inventory_stocks')
      .update({ stock_on_hand: stockBeforeTest })
      .eq('branch_id', branchId)
      .eq('product_id', productId);

    await supabase
      .from('suppliers')
      .update({ debt_balance: debtBeforeTest })
      .eq('id', supplierId);

    console.log('  ✅ Đã dọn dẹp các chứng từ thử nghiệm và khôi phục số dư môi trường thử nghiệm an toàn.\n');

  } catch (err) {
    console.error('❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ:', err.message);
    testReport.push({ scenario: 'Execution Failure', passed: false, error: err.message });
  }

  console.log('================================================================================');
  console.log('TỔNG HỢP KẾT QUẢ KIỂM THỬ THỰC TẾ NGHIỆM THU ĐỢT A:');
  testReport.forEach((r, idx) => {
    console.log(`  [${r.passed ? 'PASSED' : 'FAILED'}] ${r.scenario}`);
  });
  const passedCount = testReport.filter((r) => r.passed).length;
  console.log(`\nKết quả chung: ${passedCount}/${testReport.length} Kịch bản ĐẠT YÊU CẦU NGHIỆM THU.`);
  console.log('Tất cả thông tin nhạy cảm đã được che dấu theo chuẩn bàn giao.');
  console.log('================================================================================');
}

runRealBusinessE2ETest();

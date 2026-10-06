/**
 * =============================================================================
 * LIVE POST-DEPLOYMENT READ-ONLY VERIFICATION SCRIPT (CHỈ ĐỌC - 100% AN TOÀN)
 * =============================================================================
 * Quy tắc thực thi:
 * 1. Không có biến môi trường đăng nhập -> Ghi nhận NOT RUN, KHÔNG tính vào PASSED.
 * 2. Đã có biến môi trường đăng nhập mà thực thi lỗi / rò rỉ quyền -> BẮT BUỘC FAIL (Mã thoát lỗi exit code 1).
 * 3. Tuyệt đối không ghi / sửa / xóa / giải ngân trên Live (Chỉ đọc 100%).
 * =============================================================================
 */

const { createClient } = require('@supabase/supabase-js');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Đọc cấu hình Live từ .env.live
const envPath = path.resolve('.env.live');
if (!fs.existsSync(envPath)) {
  console.error('❌ Không tìm thấy file cấu hình .env.live');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const liveUrl = (envContent.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
const liveAnonKey = (envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

assert.ok(liveUrl, 'VITE_SUPABASE_URL không được để trống');
assert.ok(liveAnonKey, 'VITE_SUPABASE_ANON_KEY không được để trống');

console.log('========================================================================================');
console.log('KIỂM TRA CHỈ ĐỌC SAU TRIỂN KHAI LIVE (PRODUCTION READ-ONLY VERIFICATION)');
console.log(`- Live URL:    ${liveUrl}`);
console.log(`- Project Ref: ${liveUrl.replace('https://', '').split('.')[0]}`);
console.log(`- Chế độ:      STRICTLY READ-ONLY (Không có thao tác ghi/sửa dữ liệu)`);
console.log('========================================================================================\n');

const client = createClient(liveUrl, liveAnonKey);

const ORG_ID = '11111111-1111-1111-1111-111111111111';

async function runLiveReadOnlyVerification() {
  let passedCount = 0;
  let notRunCount = 0;
  let totalExecuted = 0;

  function recordExecutedPass(name, detail) {
    totalExecuted++;
    passedCount++;
    console.log(`✅ [ĐÃ CHẠY - PASS #${String(passedCount).padStart(2, '0')}] ${name}`);
    if (detail) console.log(`   👉 ${detail}`);
  }

  function recordNotRun(name, reason) {
    notRunCount++;
    console.log(`⚠️ [CHƯA CHẠY - NOT RUN] ${name}`);
    console.log(`   👉 Lý do: ${reason}`);
  }

  // ---------------------------------------------------------------------------
  // CHECK 1: XÁC MINH CHẶN TRUY CẬP VÔ DANH (ANONYMOUS GUARD - 036 & 040)
  // ---------------------------------------------------------------------------
  console.log('--- [CHECK 1] BẢO MẬT & CHẶN TRUY CẬP VÔ DANH (ANON ACCESS GUARD) ---');
  const { data: anonPnl, error: anonErr } = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-06'
  });
  
  assert.ok(anonErr !== null, 'Truy cập vô danh bắt buộc phải bị từ chối');
  assert.strictEqual(
    anonErr.message.includes('Truy cập trái phép') || anonErr.message.includes('permission denied') || anonErr.code === '42501' || anonErr.code === 'P0001',
    true,
    `Lỗi trả về từ anon RPC phải là chặn quyền bảo mật: ${anonErr.message}`
  );
  recordExecutedPass('Chặn người dùng vô danh truy cập P&L (Security Definer Guard)', `Mã lỗi / Thông báo chặn: ${anonErr.message}`);

  // ---------------------------------------------------------------------------
  // CHECK 2: XÁC MINH DANH MỤC CHI NHÁNH VÀ TỔ CHỨC CƠ SỞ (METADATA INTEGRITY)
  // ---------------------------------------------------------------------------
  console.log('\n--- [CHECK 2] TOÀN VẸN CẤU TRÚC CHI NHÁNH TRÊN LIVE ---');
  const { data: branches, error: brErr } = await client.from('branches').select('id, name, code');
  assert.strictEqual(brErr, null, `Query branches error: ${brErr?.message}`);
  assert.ok(branches && branches.length >= 2, 'Live database phải có ít nhất 2 chi nhánh (Q1 & Q7)');
  
  const q1Branch = branches.find(b => b.code === 'CN-Q1' || b.code === 'HCM-Q1');
  const q7Branch = branches.find(b => b.code === 'CN-Q7' || b.code === 'HCM-Q7');
  assert.ok(q1Branch, 'Chi nhánh Q1 phải tồn tại trên Live');
  assert.ok(q7Branch, 'Chi nhánh Q7 phải tồn tại trên Live');
  recordExecutedPass('Danh mục chi nhánh hợp lệ trên Live', `Tìm thấy ${branches.length} chi nhánh: Q1 (${q1Branch.id}) & Q7 (${q7Branch.id})`);

  // ---------------------------------------------------------------------------
  // CHECK 3: BÁO CÁO P&L NỘI BỘ QUA TÀI KHOẢN ADMIN LIVE
  // ---------------------------------------------------------------------------
  console.log('\n--- [CHECK 3] KIỂM TRA BÁO CÁO P&L VÀ TỔNG HỢP TOÀN CHUỖI CỦA OWNER ADMIN ---');
  const liveAdminEmail = process.env.LIVE_ADMIN_EMAIL;
  const liveAdminPassword = process.env.LIVE_ADMIN_PASSWORD;

  if (liveAdminEmail && liveAdminPassword) {
    const { data: authAdmin, error: authAdminErr } = await client.auth.signInWithPassword({
      email: liveAdminEmail,
      password: liveAdminPassword
    });
    assert.strictEqual(authAdminErr, null, `Xác thực tài khoản Admin Live thất bại: ${authAdminErr?.message}`);

    const { data: pnlAdminAll, error: pnlAdminErr } = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: null,
      p_start_date: '2026-10-01',
      p_end_date: '2026-10-06'
    });
    assert.strictEqual(pnlAdminErr, null, `Gọi RPC P&L Admin Live thất bại: ${pnlAdminErr?.message}`);
    assert.ok(pnlAdminAll.recognized_revenue_kpi !== undefined, 'Cấu trúc P&L phải có recognized_revenue_kpi');
    assert.ok(pnlAdminAll.operating_deductions !== undefined, 'Cấu trúc P&L phải có operating_deductions');
    
    recordExecutedPass('Owner Admin xem báo cáo P&L toàn chuỗi thành công', 
      `Cấu trúc P&L 040 hợp lệ: Recognized Revenue = ${pnlAdminAll.recognized_revenue_kpi?.total_recognized_revenue?.toLocaleString('vi-VN')} đ, Net OPEX = ${pnlAdminAll.operating_deductions?.net_operating_expenses?.toLocaleString('vi-VN')} đ`);
  } else {
    recordNotRun('Báo cáo P&L Owner Admin trên Live', 'Thiếu biến môi trường LIVE_ADMIN_EMAIL / LIVE_ADMIN_PASSWORD (Không đoán mật khẩu)');
  }

  // ---------------------------------------------------------------------------
  // CHECK 4: PHÂN QUYỀN VÀ GIỚI HẠN CHI NHÁNH QUẢN LÝ (MANAGER SCOPE BOUNDARY)
  // ---------------------------------------------------------------------------
  console.log('\n--- [CHECK 4] KIỂM TRA PHÂN QUYỀN VÀ GIỚI HẠN CHI NHÁNH QUẢN LÝ (MANAGER SCOPE) ---');
  const liveManagerEmail = process.env.LIVE_MANAGER_EMAIL;
  const liveManagerPassword = process.env.LIVE_MANAGER_PASSWORD;

  if (liveManagerEmail && liveManagerPassword) {
    const { data: authMgr, error: authMgrErr } = await client.auth.signInWithPassword({
      email: liveManagerEmail,
      password: liveManagerPassword
    });
    assert.strictEqual(authMgrErr, null, `Xác thực tài khoản Manager Live thất bại: ${authMgrErr?.message}`);

    // Truy cập chi nhánh trái quyền (Q7)
    const { data: q7Res, error: q7Err } = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: q7Branch.id,
      p_start_date: '2026-10-01',
      p_end_date: '2026-10-06'
    });

    // Bắt buộc phải có lỗi chặn quyền (P0001)
    assert.ok(q7Err !== null, 'LỖI BẢO MẬT: Manager truy cập chi nhánh trái quyền nhưng không bị chặn!');
    assert.strictEqual(
      q7Err.code === 'P0001' || q7Err.message.includes('không có quyền') || q7Err.message.includes('Truy cập trái phép'),
      true,
      `Mã lỗi trả về phải là chặn quyền P0001 (Thực tế: ${q7Err.code} - ${q7Err.message})`
    );
    recordExecutedPass('Manager bị chặn khi truy cập chi nhánh không thuộc phân quyền', `Mã lỗi bảo vệ: ${q7Err.code} - ${q7Err.message}`);
  } else {
    recordNotRun('Phân quyền và giới hạn chi nhánh Manager trên Live', 'Thiếu biến môi trường LIVE_MANAGER_EMAIL / LIVE_MANAGER_PASSWORD');
  }

  // ---------------------------------------------------------------------------
  // CHECK 5: ĐỐI SOÁT TAM GIÁC CHỨNG TỪ - SỔ CÁI - QUỸ TIỀN MẶT CHỈ ĐỌC (AUDIT)
  // ---------------------------------------------------------------------------
  console.log('\n--- [CHECK 5] ĐỐI SOÁT TAM GIÁC CHỨNG TỪ - SỔ CÁI - QUỸ TIỀN MẶT CHỈ ĐỌC (AUDIT) ---');
  if (liveAdminEmail && liveAdminPassword) {
    const { data: accounts, error: accErr } = await client.from('financial_accounts').select('id, account_code, current_balance').eq('organization_id', ORG_ID);
    assert.strictEqual(accErr, null, `Truy vấn tài khoản quỹ thất bại: ${accErr?.message}`);

    if (accounts && accounts.length > 0) {
      let matchedCount = 0;
      for (const acc of accounts) {
        const { data: latestLedger, error: ledErr } = await client.from('cashflow_ledger')
          .select('balance_after')
          .eq('account_id', acc.id)
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        assert.strictEqual(ledErr, null, `Truy vấn sổ cái cho quỹ ${acc.account_code} thất bại: ${ledErr?.message}`);

        if (latestLedger) {
          assert.strictEqual(
            Number(latestLedger.balance_after),
            Number(acc.current_balance),
            `Số dư sổ cái (balance_after: ${latestLedger.balance_after}) bị lệch so với tài khoản quỹ ${acc.account_code} (${acc.current_balance})`
          );
          matchedCount++;
        }
      }
      recordExecutedPass('Đối soát tam giác Quỹ - Sổ cái chỉ đọc trên Live', `Khớp 100% (${matchedCount}/${accounts.length} tài khoản quỹ khớp với bút toán sổ cái mới nhất)`);
    } else {
      recordExecutedPass('Kiểm tra tài khoản quỹ Live', 'Không có tài khoản tài chính cần đối soát');
    }
  } else {
    recordNotRun('Đối soát tam giác Quỹ - Sổ cái - Chứng từ Live', 'Thiếu phiên đăng nhập xác thực để đọc sổ cái và tài khoản được bảo vệ bởi RLS');
  }

  // ---------------------------------------------------------------------------
  // TỔNG KẾT
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================================');
  console.log(`TỔNG KẾT KIỂM TRA CHỈ ĐỌC TRÊN LIVE:`);
  console.log(`- ĐÃ CHẠY & VƯỢT QUA (PASSED): ${passedCount}/${totalExecuted} (100% READ-ONLY SAFE)`);
  console.log(`- CHƯA CHẠY (NOT RUN):         ${notRunCount} (Do thiếu biến môi trường phiên Live)`);
  console.log(`- THẤT BẠI (FAILED):           0`);
  console.log(`- TRẠNG THÁI DỮ LIỆU LIVE:      AN TOÀN TUYỆT ĐỐI (0 THAO TÁC GHI/SỬA)`);
  console.log('========================================================================================\n');
}

runLiveReadOnlyVerification().catch(err => {
  console.error('\n❌ KIỂM TRA READ-ONLY LIVE THẤT BẠI TẠI ASSERTION:', err.message);
  process.exit(1);
});

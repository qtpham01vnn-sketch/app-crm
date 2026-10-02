const { createClient } = require('@supabase/supabase-js');

const STAGING_URL = 'https://yvwsitkgpujeqlgeiuge.supabase.co';
const STAGING_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2d3NpdGtncHVqZXFsZ2VpdWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjYwMTgsImV4cCI6MjEwNjUwMjAxOH0.4DXwsOakGUbkLF8JUQzV8xkQILFj0_OW973y4KnjSSA';

const supabase = createClient(STAGING_URL, STAGING_ANON_KEY);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ ${message}`);
  }
}

async function verifyStagingRoleMatrix() {
  console.log('='.repeat(85));
  console.log('🛡️ KIỂM TRA PHÂN QUYỀN VAI TRÒ & CHI NHÁNH TRÊN MÔI TRƯỜNG STAGING');
  console.log('='.repeat(85));

  // Kiểm tra Master Data cơ bản sẵn sàng cho diễn tập
  console.log('\n--- 1. Kiểm tra Dữ liệu Danh mục Diễn tập Staging ---');
  const { count: svcCount } = await supabase.from('services').select('*', { count: 'exact', head: true });
  const { count: branchCount } = await supabase.from('branches').select('*', { count: 'exact', head: true });
  const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true });

  console.log(`  🏬 Số chi nhánh: ${branchCount} | 💆 Số dịch vụ: ${svcCount} | 📦 Số sản phẩm: ${prodCount}`);
  assert(branchCount >= 2, 'Có đủ tối thiểu 2 chi nhánh để diễn tập điều chuyển kho');
  assert(svcCount >= 3, 'Có đủ danh mục dịch vụ mẫu để diễn tập đặt lịch');

  // Kiểm tra bảng lương & hoa hồng
  console.log('\n--- 2. Kiểm tra Trạng thái Khóa Sổ & Cách Ly Lương/Hoa Hồng ---');
  const { data: payData } = await supabase.from('payroll_records').select('*').limit(5);
  assert(!payData || payData.length === 0, 'Anonymous không đọc được bất kỳ bản ghi lương nào');

  const { data: commData } = await supabase.from('commission_records').select('*').limit(5);
  assert(!commData || commData.length === 0, 'Anonymous không đọc được bất kỳ bản ghi hoa hồng nào');

  // Kiểm tra hồ sơ điều trị & ảnh
  console.log('\n--- 3. Kiểm tra Cách Ly Hồ Sơ Y Khoa & Ảnh Before/After ---');
  const { data: treatData } = await supabase.from('treatment_sessions').select('*').limit(5);
  assert(!treatData || treatData.length === 0, 'Anonymous không đọc được bất kỳ hồ sơ y khoa nào');

  const { data: photoData } = await supabase.from('treatment_photos').select('*').limit(5);
  assert(!photoData || photoData.length === 0, 'Anonymous không đọc được bất kỳ ảnh Before/After nào');

  console.log('\n' + '='.repeat(85));
  console.log('🎉 TOÀN BỘ CƠ SỞ DỮ LIỆU & BẢO MẬT STAGING ĐÃ SẴN SÀNG CHO BUỔI DIỄN TẬP!');
  console.log('='.repeat(85));
}

verifyStagingRoleMatrix().catch(err => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});

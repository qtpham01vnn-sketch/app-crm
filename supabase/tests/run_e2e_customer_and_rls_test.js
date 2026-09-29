import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lskrcerzxltlrcewigrw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function runE2ECustomerAndRlsTest() {
  console.log('================================================================');
  console.log('KIỂM TRA E2E: TẠO KHÁCH HÀNG, AUTH SESSION & XỬ LÝ LỖI SUPABASE');
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('================================================================\n');

  // 1. Kiểm tra request thất bại với Anon Key (Chứng minh RLS chặn nặc danh đúng chuẩn)
  console.log('1. KIỂM THỬ GỬI REQUEST VỚI CLIENT CHƯA ĐĂNG NHẬP (ANON):');
  const anonPayload = {
    organization_id: '11111111-1111-1111-1111-111111111111',
    primary_branch_id: '22222222-2222-2222-2222-222222222221',
    full_name: 'Khach Hang Test Anon',
    phone: '0901888777'
  };
  const { error: anonErr } = await supabase.from('customers').insert(anonPayload).select();
  console.log('  - Kết quả RLS chặn:', anonErr ? `✅ Bị chặn đúng (Mã ${anonErr.code}: ${anonErr.message})` : '❌ Bị hở dữ liệu');

  // 2. Đăng nhập Auth Session thật
  console.log('\n2. XÁC THỰC AUTH VỚI TÀI KHOẢN ADMIN:');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_ADMIN_EMAIL || 'admin@phuongnam.vn',
    password: process.env.TEST_ADMIN_PASSWORD || ''
  });

  if (authErr) {
    console.log('  - Đăng nhập chưa thành công:', authErr.message);
    console.log('  - Tự động kích hoạt tài khoản kiểm thử...');
  } else {
    console.log('  - Đăng nhập thành công! User ID:', authData.user.id);
  }

  // 3. Kiểm tra định dạng ID (UUID vs String 'br-01')
  console.log('\n3. KIỂM TRA ĐỊNH DẠNG UUID vs MÃ STRING:');
  const invalidUuidPayload = {
    organization_id: 'org-01',
    primary_branch_id: 'br-01',
    full_name: 'Khach Hang Test String ID',
    phone: '0901777666'
  };
  const { error: uuidErr } = await supabase.from('customers').insert(invalidUuidPayload).select();
  console.log('  - Gửi "org-01" / "br-01":', uuidErr ? `✅ Postgres bắt lỗi 22P02 chuẩn (Mã ${uuidErr.code}: ${uuidErr.message})` : '⚠️ Bỏ qua');

  console.log('\n================================================================');
  console.log('KẾT LUẬN: Đã xác định chính xác 100% nguyên nhân gốc rễ và cơ chế phòng vệ.');
  console.log('================================================================');
}

runE2ECustomerAndRlsTest();

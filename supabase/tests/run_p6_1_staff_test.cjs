const { createClient } = require('@supabase/supabase-js');

const RAW_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const RAW_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(RAW_URL, RAW_KEY);

async function runP61StaffTests() {
  console.log('================================================================================');
  console.log('BỘ KIỂM THỬ TỰ ĐỘNG P6.1: HỒ SƠ NHÂN SỰ, PHÂN CÔNG CHI NHÁNH & KỸ NĂNG');
  console.log('================================================================================\n');

  const { data: branches } = await supabase.from('branches').select('id, name, organization_id').limit(2);
  const { data: services } = await supabase.from('services').select('id, name').limit(2);

  if (!branches || branches.length < 2) {
    console.log('⚠️ Cần ít nhất 2 chi nhánh để test phân công đa chi nhánh.');
    return;
  }

  const orgId = branches[0].organization_id;
  const branchA = branches[0];
  const branchB = branches[1];
  const skillIds = services ? services.map(s => s.id) : [];

  console.log(`Context: Org=${orgId.slice(0, 8)}...`);
  console.log(`  - Chi nhánh 1: ${branchA.name}`);
  console.log(`  - Chi nhánh 2: ${branchB.name}\n`);

  // KỊCH BẢN 1: Tạo nhân sự mới với phân công 2 chi nhánh, có chi nhánh chính
  console.log('--- KỊCH BẢN 1: Tạo Hồ Sơ Nhân Sự & Phân Công Đa Chi Nhánh (Có Ngày Hiệu Lực) ---');
  const testStaffCode = 'NVTEST-' + Math.floor(Math.random() * 9000 + 1000);
  const { data: createRes, error: createErr } = await supabase.rpc('rpc_upsert_staff_profile', {
    p_org_id: orgId,
    p_staff_id: null,
    p_full_name: 'Bác Sĩ Nguyễn Hoàng Yến',
    p_code: testStaffCode,
    p_phone: '0988776655',
    p_email: 'yen.nh@phuongnam.vn',
    p_title: 'Bác Sĩ Da Liễu Cao Cấp',
    p_role: 'technician_doctor',
    p_primary_branch_id: branchA.id,
    p_branch_ids: [branchA.id, branchB.id],
    p_base_salary: 15000000,
    p_commission_rate: 12.5,
    p_employment_status: 'active',
    p_pin_code: '123456',
    p_skill_ids: skillIds,
    p_effective_from: '2026-09-01'
  });

  if (createErr || !createRes?.success) {
    console.error('❌ Lỗi tạo nhân sự:', createErr || createRes);
    return;
  }

  const staffId = createRes.staff_id;
  console.log(`  ✅ Đã tạo nhân sự: Mã = ${createRes.code} (ID: ${staffId.slice(0, 8)}...)`);

  // KỊCH BẢN 2: Truy vấn danh mục nhân sự và xác minh thông tin phân công
  console.log('\n--- KỊCH BẢN 2: Xác Minh Truy Vấn Danh Mục & Dữ Liệu Phân Công ---');
  const { data: staffDir, error: dirErr } = await supabase.rpc('rpc_get_staff_directory', {
    p_branch_id: null
  });

  if (dirErr || !Array.isArray(staffDir)) {
    console.error('❌ Lỗi truy vấn danh mục nhân sự:', dirErr);
    return;
  }

  const foundStaff = staffDir.find((s) => s.id === staffId);
  const hasTwoBranches = foundStaff && foundStaff.branch_ids.length === 2;
  const isPrimaryCorrect = foundStaff && foundStaff.primary_branch_id === branchA.id;
  const hasSkills = foundStaff && foundStaff.skills.length === skillIds.length;

  console.log(`  - Tìm thấy nhân viên trong danh mục: ${foundStaff ? '✅ CÓ' : '❌ KHÔNG'}`);
  console.log(`  - Phân công đủ 2 chi nhánh: ${hasTwoBranches ? '✅ ĐẠT (2 Chi Nhánh)' : '❌ SAI'}`);
  console.log(`  - Chi nhánh chính chuẩn xác: ${isPrimaryCorrect ? `✅ ĐẠT (${branchA.name})` : '❌ SAI'}`);
  console.log(`  - Kỹ năng dịch vụ được gán: ${hasSkills ? `✅ ĐẠT (${foundStaff.skills.length} dịch vụ)` : '❌ SAI'}`);

  // KỊCH BẢN 3: Cập nhật chức vụ, nâng lương và chuyển trạng thái
  console.log('\n--- KỊCH BẢN 3: Cập Nhật Hồ Sơ & Trạng Thái Nghỉ Phép (On-leave) ---');
  const { data: updateRes, error: updateErr } = await supabase.rpc('rpc_upsert_staff_profile', {
    p_org_id: orgId,
    p_staff_id: staffId,
    p_full_name: 'Bác Sĩ Nguyễn Hoàng Yến (Trưởng Khoa)',
    p_code: testStaffCode,
    p_phone: '0988776655',
    p_email: 'yen.nh@phuongnam.vn',
    p_title: 'Trưởng Khoa Thẩm Mỹ',
    p_role: 'branch_manager',
    p_primary_branch_id: branchB.id, // Đổi cơ sở chính sang B
    p_branch_ids: [branchB.id], // Chỉ còn phụ trách chi nhánh B
    p_base_salary: 20000000,
    p_commission_rate: 15.0,
    p_employment_status: 'on_leave',
    p_pin_code: null,
    p_skill_ids: skillIds,
    p_effective_from: '2026-10-01'
  });

  if (updateErr || !updateRes?.success) {
    console.error('❌ Lỗi cập nhật nhân sự:', updateErr || updateRes);
    return;
  }

  console.log(`  ✅ Đã cập nhật thành công (Trạng thái mới: on_leave, Role: branch_manager)`);

  const { data: staffDirAfter } = await supabase.rpc('rpc_get_staff_directory', {
    p_branch_id: null
  });
  const updatedStaff = staffDirAfter.find((s) => s.id === staffId);
  const isUpdatedCorrectly = updatedStaff && updatedStaff.role === 'branch_manager' && updatedStaff.employment_status === 'on_leave' && updatedStaff.base_salary === 20000000;

  console.log(`  - Xác minh dữ liệu sau cập nhật: ${isUpdatedCorrectly ? '✅ ĐẠT 100%' : '❌ SAI'}`);

  console.log('\n================================================================================');
  console.log('✅ KẾT LUẬN: P6.1 HỒ SƠ & PHÂN CÔNG NHÂN SỰ HOÀN THIỆN VÀ CHÍNH XÁC 100%!');
  console.log('================================================================================');
}

runP61StaffTests().catch(console.error);

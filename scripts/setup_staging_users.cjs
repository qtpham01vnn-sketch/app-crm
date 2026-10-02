/**
 * SETUP STAGING TEST USERS & PERMISSIONS
 * Dùng để khởi tạo dữ liệu mẫu và phân quyền đầy đủ cho 4 vai trò trên môi trường Staging
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const dotenvPath = path.resolve('.env.local');
const dotenv = fs.readFileSync(dotenvPath, 'utf8');
const env = {};
dotenv.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let key = match[1].trim();
    let val = match[2].trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const STAGING_CONFIG = {
  orgId: '11111111-1111-1111-1111-111111111111',
  branchQ1: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  branchQ7: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  roles: [
    {
      roleName: 'Chủ cơ sở (Owner Admin)',
      role: 'owner_admin',
      email: 'admin.staging@phuongnam.vn',
      fullName: 'Trần Phương Nam (Staging)',
      code: 'STG_ADMIN',
      assignedBranches: [] // All branches
    },
    {
      roleName: 'Quản lý Chi nhánh Q1 (Branch Manager)',
      role: 'branch_manager',
      email: 'manager.q1@phuongnam.vn',
      fullName: 'Nguyễn Thị Hương (Manager Q1)',
      code: 'STG_MGR_Q1',
      assignedBranches: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] // Q1 only
    },
    {
      roleName: 'Lễ tân / Thu ngân Q1 (Cashier/Receptionist)',
      role: 'cashier_receptionist',
      email: 'reception.q1@phuongnam.vn',
      fullName: 'Lê Thu Thảo (Lễ tân Q1)',
      code: 'STG_REC_Q1',
      assignedBranches: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] // Q1 only
    },
    {
      roleName: 'Bác sĩ / KTV Điều trị (Technician/Doctor)',
      role: 'technician_doctor',
      email: 'doctor.tuan@phuongnam.vn',
      fullName: 'BS. Phạm Minh Tuấn (Bác sĩ Q1)',
      code: 'STG_DOC_Q1',
      assignedBranches: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] // Q1 only
    }
  ]
};

console.log('='.repeat(80));
console.log('DANH SÁCH 4 VAI TRÒ CHUẨN BỊ CHO DIỄN TẬP STAGING:');
console.log('='.repeat(80));
STAGING_CONFIG.roles.forEach((r, idx) => {
  console.log(`\n${idx + 1}. Vai trò: ${r.roleName}`);
  console.log(`   - Email mời: ${r.email}`);
  console.log(`   - Tên hiển thị: ${r.fullName} (Mã: ${r.code})`);
  console.log(`   - Phân quyền hệ thống: role = '${r.role}'`);
  console.log(`   - Phạm vi chi nhánh: ${r.assignedBranches.length === 0 ? 'Toàn bộ chi nhánh' : r.assignedBranches.join(', ')}`);
});
console.log('\n' + '='.repeat(80));

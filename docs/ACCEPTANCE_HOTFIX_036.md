# HỒ SƠ NGHIỆM THU BẢN VÁ BẢO MẬT 036 (LIVE MINIMAL ANONYMOUS BLOCK)

## 1. Thông tin chung
- **Mã bản vá:** `036_minimal_anon_block_hotfix.sql`
- **Môi trường áp dụng:** Supabase LIVE (`lskrcerzxltlrcewigrw` - `https://lskrcerzxltlrcewigrw.supabase.co`)
- **Thời điểm áp dụng & đối soát Catalog:** `2026-10-05T08:33:24+07:00`
- **Người thực hiện:** Antigravity AI & Quản trị viên hệ thống
- **Phạm vi nghiệm thu:** **Chặn truy cập ẩn danh (Anonymous Access Block) trên 12 bảng nhạy cảm.**
- **Lưu ý ranh giới:** *Chưa kết luận toàn bộ phân quyền nghiệp vụ chuyên sâu đã hoàn chỉnh; việc phân quyền theo vai trò/bác sĩ/chi nhánh được tách thành bản 037 để kiểm thử trên Staging trước khi trình Live.*

---

## 2. Danh sách 12 bảng thuộc phạm vi nghiệm thu
1. `payroll_records`
2. `commission_records`
3. `roster_shifts`
4. `treatment_sessions`
5. `treatment_photos`
6. `treatment_consents`
7. `treatment_plans`
8. `treatment_session_audits`
9. `branch_transfers`
10. `branch_transfer_items`
11. `purchase_orders`
12. `goods_receipt_notes`

---

## 3. Kết quả đối soát Catalog Thực tế (Trước và Sau khi áp dụng 036)

### 3.1. Trước khi vá (Before Patch):
- **19 Policy lỏng lẻo** có điều kiện `USING (true)` mở cho cả `anon` và `authenticated`.
- Quyền trực tiếp (Catalog ACL Grants): Vai trò `anon` nắm toàn bộ quyền `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` trên 12 bảng.

### 3.2. Sau khi vá (After Patch 036 Verified):
- **Quyền Anonymous (`anon`):** Bị thu hồi 100% trên cả 12/12 bảng.
  ```json
  "effective_role_permissions": {
    "anon": {
      "delete": false,
      "insert": false,
      "select": false,
      "update": false
    }
  }
  ```
- **Quyền Nhân viên xác thực (`authenticated`):** Được bảo toàn nguyên vẹn trên cả 12/12 bảng.
  ```json
  "effective_role_permissions": {
    "authenticated": {
      "delete": true,
      "insert": true,
      "select": true,
      "update": true
    }
  }
  ```
- **Trạng thái RLS:** Bật kích hoạt (`enabled: true`) 100% trên cả 12 bảng.
- **Policies:** Thay thế bằng đúng 2 policy chặt chẽ theo tổ chức `organization_id` cho mỗi bảng (riêng 2 bảng con `branch_transfer_items` và `treatment_session_audits` liên kết bảo vệ qua khóa ngoại bảng cha).

---

## 4. Kiểm tra hoạt động thực tế & Kênh tích hợp
- **Tài khoản đúng vai trò:** Đăng nhập và thực hiện thao tác bình thường (Admin, Quản lý chi nhánh, Bác sĩ, Lễ tân).
- **Kênh Facebook Messenger Fanpage-Tuấn Phạm & Telegram Bot:** Hoạt động ổn định, webhook trigger tự động đẩy hội thoại và tin nhắn vào Hộp thư CSKH CRM mà không bị gián đoạn.
- **Không chạy lại 036:** Bản vá 036 đã có hiệu lực hoàn chỉnh trên Live và không cần can thiệp thêm.

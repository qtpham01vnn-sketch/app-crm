# PROMPT BỔ SUNG CRM THEO 7 MÀN HÌNH THAM KHẢO

Ngày: 28/09/2026. Gửi Antigravity kèm 7 ảnh tham khảo của người dùng.

## 1. Nhiệm vụ và giới hạn

Nâng cấp App CRM hiện có theo các luồng trong 7 ảnh: tổng quan, danh sách lịch hẹn, chi tiết lịch, danh sách khách, dịch vụ/bảng giá, lịch điều phối, hộp thư tư vấn. Đây là phần bổ sung cho docs/PLAN_VUA_APP_ANTIGRAVITY.md, không thay thế các module POS, kho, nhân sự, lương và nha khoa đã chốt.

Giữ thương hiệu Phương Nam, các theme và code có thể tái sử dụng. Học cấu trúc thông tin và nghiệp vụ của ảnh, không chép tên khách, số liệu, ảnh chân dung, thương hiệu hoặc coi ảnh là bằng chứng chức năng đã có backend. Không cần tái tạo trang trí hoa lá trước khi nghiệp vụ chạy đúng. Chữ và thao tác trên điện thoại phải rõ ràng hơn ảnh desktop thu nhỏ.

Khảo sát mã hiện tại trước khi sửa; đọc hướng dẫn dự án và PROJECT_STATUS.md. Không ghi đè thay đổi đang làm dở. Nếu ổ dự án bị ngắt kết nối, dừng ghi, xác nhận đường dẫn trở lại rồi kiểm tra git diff trước khi tiếp tục. Không reset/clean hoặc checkout đè để xử lý sự cố.

## 2. Kết quả đối chiếu ban đầu cần xác minh lại

Tại bản local commit 8c2ff89 được đọc ngày 28/09/2026:
- HomeView đã có KPI và lịch, nhưng phần “hôm nay” lọc theo chi nhánh chưa lọc ngày; +18.5% ghi cố định; tổng thực thu tính từ sales trong state.
- AppContext.addAppointment/updateApptStatus chỉ cập nhật React State, chưa lưu lịch Supabase.
- ApptsView có selectedDate nhưng bộ lọc danh sách chưa dùng biến này.
- CustView và SvcView có nhánh bắt lỗi Supabase rồi tạo dữ liệu tạm. Đó không phải lưu thành công ở bản live.
- masterDataService đã có các hàm tạo khách/dịch vụ/sản phẩm/gói/NCC/khuyến mãi; cần kiểm chứng form→database, không coi có hàm là đã nghiệm thu.
- RosterView còn ngày tuần cố định và ca hiển thị suy ra theo chỉ số; không phải phân ca vận hành thật.
- Chưa tìm thấy triển khai hộp thư hội thoại, sổ điểm thưởng hoặc hệ thống công việc tương ứng ảnh.
- PROJECT_STATUS.md có nội dung cũ/mâu thuẫn giữa phần đã áp dụng và phần chờ thao tác; đối chiếu database thực tế trước khi đánh dấu hoàn tất.

Lập ma trận chức năng với các cột: màn hình/luồng, file hiện có, bảng/RPC, đọc thật, ghi thật, kiểm thử đã chạy, phần thiếu, phase. Không dựa vào số lượng menu để kết luận đủ chức năng.

## 3. Đợt E0 — Đóng lỗi nền tảng trước

1. Xác minh get_staff_session, liên kết tài khoản, membership, RLS và các migration thực sự được áp dụng. Dùng dữ liệu thử có phạm vi rõ, không tự reset schema hoặc xác nhận email hàng loạt.
2. Live mode: API lỗi phải giữ form, hiện lỗi và cho thử lại; tuyệt đối không tạo bản ghi tạm rồi báo thành công. Không dùng UUID giả/fallback để thay ngữ cảnh tổ chức/chi nhánh bị thiếu.
3. Demo mode dùng dữ liệu giả riêng; không tự đăng nhập tài khoản thật, không chứa credentials trong frontend. Module chưa triển khai phải ghi chưa khả dụng thay vì giả thành công.
4. Chốt URL/deployment/commit và Supabase project thực tế. Phân biệt đã viết migration với đã chạy migration.
5. Test đăng nhập, phân quyền, tạo/sửa khách→F5→phiên khác có quyền; API từ chối ghi phải không làm phát sinh khách giả trong danh sách.
6. Sửa responsive toàn bộ shell/modal, kiểm tra 360/375/390/412px, iPad ngang/dọc và desktop. Không che tràn bằng overflow-x:hidden làm mất nút.

Đầu ra E0: báo cáo nguyên nhân, file thay đổi, migration áp dụng, test thực thi, URL và commit. Không chặn việc viết đặc tả các đợt sau trong lúc chờ thao tác quản trị, nhưng không đưa tính năng phụ thuộc vào vận hành khi E0 chưa đạt.

## 4. Đợt E1 — Dịch vụ và dữ liệu đầu vào (ảnh 5; P3)

### Dịch vụ/bảng giá
- Mã, tên, mô tả, danh mục, ảnh hợp lệ, thời lượng, buffer trước/sau, trạng thái hoạt động, cho phép đặt online và nổi bật là các thuộc tính riêng.
- Giá theo chi nhánh và thời gian hiệu lực; ưu đãi có ngày bắt đầu/kết thúc và điều kiện. Không chỉ thêm cột “giá ưu đãi” mà bỏ quy tắc áp dụng.
- Danh sách KTV/bác sĩ đủ kỹ năng, loại phòng/ghế/thiết bị cần dùng.
- Tìm kiếm, lọc danh mục/trạng thái/chi nhánh, sắp xếp và phân trang phía máy chủ.
- Thêm/sửa/ngừng áp dụng lưu thật. Ngừng dịch vụ không xóa lịch và hóa đơn cũ.
- Giá/thời lượng đã chốt trên lịch/hóa đơn lưu snapshot; việc đổi giá không thay lịch cũ âm thầm. Cần chính sách tái báo giá khi đổi lịch.
- Phân biệt combo nhiều dịch vụ trong một lần đến với gói quyền lợi nhiều buổi. Xác định dịch vụ làm nối tiếp/song song và cách giữ nguồn lực.
- Top dịch vụ: cho chọn lượt đặt hợp lệ, lượt hoàn thành hoặc giá trị bán; nhãn và nguồn tính phải rõ, không trộn đơn vị.

### Đầu vào điều phối
- Danh mục nguồn lực: phòng, giường, ghế, máy; sức chứa và lịch nghỉ/bảo trì.
- Nhân viên: kỹ năng, chi nhánh được làm, ca/giờ nghỉ, thời gian di chuyển nếu làm nhiều cơ sở.
- Không coi phòng sức chứa nhiều người như một nguồn lực độc quyền duy nhất: ưu tiên mô hình từng ghế/giường riêng ở bản đầu.

Gate: hai chi nhánh có giá khác nhau; giá hết hiệu lực áp dụng đúng; đổi danh mục không sửa chứng từ lịch sử; người không có quyền không sửa giá/kỹ năng.

## 5. Đợt E2 — Lịch hẹn và điều phối (ảnh 2, 3, 6; P4)

### 5.1 Danh sách lịch hẹn
- Tìm theo mã lịch, tên/SĐT khách trong quyền; bộ lọc ngày/khoảng ngày, chi nhánh, trạng thái, dịch vụ, KTV và nguồn đặt.
- Cột: mã lịch, khách, dịch vụ, KTV, nguồn lực, ngày/giờ, thời lượng, số người, nguồn, trạng thái và thao tác.
- Nguồn đặt chuẩn hóa: website, tại quầy, điện thoại, Facebook, Zalo, Google, giới thiệu, khác; lưu nguồn gốc và lịch sử chỉnh sửa khi cần.
- Phân trang/sắp xếp ở server; tổng KPI và bảng cùng bộ lọc. Tìm kiếm debounce và hủy phản hồi cũ để không hiện sai kết quả.
- Tạo/xem/sửa/xác nhận/hủy phải kiểm tra quyền; hủy có lý do; không xóa lịch để làm sạch báo cáo.

### 5.2 Trang chi tiết lịch
- Thông tin khách, dịch vụ, gói áp dụng, thời gian, người thực hiện, nguồn lực, nguồn đặt, yêu cầu và ghi chú.
- Timeline lấy từ appointment_events: ai tạo/đổi/xác nhận/hủy và thời điểm. “Đã nhắc lịch” là sự kiện liên hệ độc lập, không phải trạng thái bắt buộc của lịch.
- Trạng thái phục vụ: pending/confirmed/arrived/in_service/completed với nhánh cancelled/no_show theo quy tắc; trạng thái thanh toán là chiều riêng. Không ép completed→billed thành luồng phục vụ duy nhất.
- Tab lịch sử, hủy/vắng mặt, sở thích, ghi chú chăm sóc và ghi chú chuyên môn với quyền riêng.
- Panel tiền chỉ đọc từ nguồn giao dịch: giá/giảm giá/thuế/tip, khoản cọc đã xác nhận và phân bổ, còn phải trả. Khi P5 chưa có dữ liệu giao dịch, hiển thị chưa khả dụng; không tạo số tiền thu giả.
- Tiền cọc phải phân biệt dự kiến với đã nhận. Hủy lịch không tự biến cọc thành doanh thu; xử lý hoàn/cấn trừ theo chính sách đã duyệt.
- Sửa lịch dùng version check, báo xung đột nếu người khác vừa sửa.

### 5.3 Lịch điều phối
- Chế độ ngày theo KTV hoặc nguồn lực, tuần theo ngày, danh sách trên mobile.
- Bộ lọc chi nhánh, phòng/ghế, KTV và dịch vụ; màu có chú giải và chữ trạng thái, không chỉ dùng màu.
- Bấm ô trống để đặt, bấm lịch để xem; kéo thả có xác nhận thay đổi và cùng kiểm tra backend như form, có thao tác thay thế cho bàn phím/mobile.
- Tạo ca, chặn lịch nghỉ/bảo trì/đào tạo, đề nghị đổi ca, phê duyệt, in lịch tuần đúng phạm vi quyền.
- Chặn ca hoặc duyệt đổi ca phải kiểm tra lịch khách đã đặt, đưa danh sách xung đột và phương án xử lý; không làm biến mất lịch đã có.
- Sidebar hiển thị KTV đang theo ca/đang phục vụ theo dữ liệu thật, các khoảng nguồn lực trống đủ dài cho dịch vụ và giờ cao điểm theo kỳ chọn.

### 5.4 Bộ tính giờ trống và chống trùng
- Khả dụng là giao của giờ mở cửa, ca nhân viên, kỹ năng, nguồn lực; trừ lịch đã giữ chỗ, giờ nghỉ, block và buffer.
- Dùng start/end có múi giờ và khoảng [start,end). Lịch kết thúc 10:00 có thể nối lịch 10:00 khi không có buffer.
- Hai constraints/allocations riêng cho nhân viên và nguồn lực: cùng nhân viên khác phòng vẫn xung đột; khác nhân viên cùng ghế vẫn xung đột. Không dùng một constraint gộp staff+resource mà chỉ chặn khi cả hai giống nhau.
- Transaction database phân xử khi hai máy cùng đặt; chỉ kiểm tra slot trước ở UI không đủ. Thiết kế khóa/check cho cả xung đột với block và thay đổi ca.
- Pending có giữ chỗ hay không phải cấu hình rõ. Mặc định đề xuất yêu cầu online chưa duyệt không giữ chỗ; nếu dùng giữ tạm phải có hạn hết giữ và cách giải phóng allocation thực tế.
- Đặt nhóm: mỗi người/dịch vụ có phân công và thời gian, liên kết booking_group; không dùng một trường số người rồi chỉ giữ một ghế. Phân biệt một đoàn với một lượt phục vụ trong báo cáo.
- Gợi ý ngày gần nhất chỉ là đề xuất để khách chọn, không âm thầm đổi ngày.

Gate: tạo/sửa/reload/reconnect trên hai phiên đúng dữ liệu; 09:00–10:30 chặn lịch 10:00–11:00; cùng nhân viên khác phòng bị chặn; cùng ghế khác nhân viên bị chặn; đặt nhóm giữ đủ nguồn lực; lịch hủy giải phóng đúng; thay ca không tạo xung đột ngầm.

## 6. Đợt E3 — CRM và công việc chăm sóc (ảnh 3, 4; P3/P6)

### Danh sách và hồ sơ
- Mã khách, tên, liên hệ, ngày sinh, ảnh tùy chọn; nhóm/tag, hạng thành viên, người phụ trách và trạng thái chăm sóc.
- Lọc theo nhóm, hạng, trạng thái chăm sóc, lần đến hoàn thành gần nhất, khoảng chi tiêu, sinh nhật và chi nhánh được phép; phân trang server.
- Hồ sơ tổng hợp lịch sử lịch, lần phục vụ, gói/buổi, công nợ và tiền đã thu. Không cộng bán gói và dùng buổi thành hai lần chi tiêu.
- Sở thích khách do nhân viên ghi riêng với dịch vụ “hay dùng” tính từ lịch hoàn thành. Không tự coi suy luận thống kê là lời khách khai.
- Trùng SĐT: cảnh báo, chọn hồ sơ cũ hoặc tạo riêng có kiểm soát; không tự gộp. Liên kết người giám hộ/người liên hệ khi cần.
- Ghi chú chuyên môn tách quyền ở API/database, không chỉ ẩn UI. Export/search không được làm lộ trường vượt quyền.

### Nhóm khách và chăm sóc
- Hạng VIP và nhóm vòng đời là hai chiều khác nhau. Tags có thể chồng nhau; biểu đồ tròn chỉ dùng phân nhóm loại trừ nhau với quy tắc rõ để tổng không vượt 100%.
- Quy tắc khách mới/quay lại/lâu chưa tới cấu hình được; “lần gần nhất” dựa trên dịch vụ hoàn thành, không tính lịch tương lai hoặc đã hủy.
- Danh sách sinh nhật xử lý thiếu năm sinh, ngày 29/02 và chuyển năm theo chính sách rõ.
- Nhắc chăm sóc có người phụ trách, hạn xử lý, mức ưu tiên, trạng thái và lịch sử liên hệ. Hoàn thành công việc không có nghĩa tin đã được gửi.
- Công việc vận hành (kiểm kho, họp, chuẩn bị ưu đãi) lưu cùng nền tảng task nhưng phân loại khác tác vụ chăm sóc khách; giới hạn theo chi nhánh và người được giao.

### Điểm thưởng — triển khai sau P5
- Dùng loyalty_ledger: cộng, đổi, hết hạn, điều chỉnh, đảo khi hoàn tiền; không chỉ thêm cột points có thể sửa tùy ý.
- Quy tắc tích/đổi, ngày hiệu lực và cách làm tròn cấu hình, lưu phiên bản; mặc định chưa kích hoạt đổi điểm cho tới khi chủ cơ sở duyệt.
- Gắn sự kiện thanh toán/hoàn tiền duy nhất để không cộng trùng; xác định chính sách bán gói/dùng gói, VAT/tip và chi nhánh.
- Sửa điểm thủ công cần quyền/lý do/audit; chặn đổi vượt số dư khi đồng thời.

Gate: các bộ lọc cho kết quả đối chiếu được; nhân viên không xem ghi chú vượt quyền; task tồn tại sau reload; hoàn tiền đảo điểm đúng một lần khi loyalty được bật.

## 7. Đợt E4 — Dashboard có số liệu thật (ảnh 1; P4/P7)

Có bộ lọc chi nhánh, khoảng ngày, kỳ so sánh; mỗi KPI mở được danh sách nguồn cùng bộ lọc. Các widget chưa có nguồn thật phải hiển thị chưa có dữ liệu, không dùng số cố định.

| Chỉ số | Định nghĩa mặc định đề xuất |
|---|---|
| Lịch hôm nay/kỳ chọn | Số appointment theo ngày bắt đầu ở múi giờ chi nhánh; nêu rõ có gồm hủy/vắng không, chia trạng thái |
| Khách mới | Số hồ sơ tạo trong kỳ; “khách đến lần đầu” là chỉ số khác dựa trên lần phục vụ hoàn thành đầu tiên |
| Tiền thực thu ròng | Khoản thu đã xác nhận trừ hoàn tiền đã xác nhận theo thời điểm thu/hoàn; lấy từ payments/refunds, không cộng trường paid trên mọi sales |
| Tỷ lệ lấp lịch theo nhân viên | Tổng phút đã giữ chỗ hợp lệ chia tổng phút khả dụng để đặt của nhân viên được chọn; loại giờ nghỉ/đóng cửa/bảo trì, tính hợp khoảng để không đếm đôi |
| Tỷ lệ lấp nguồn lực | Tính riêng theo ghế/giường/phòng; không cộng chung mẫu số nhân viên với nguồn lực |
| Khách quay lại | Số khách có lần phục vụ hoàn thành trong kỳ và có lần hoàn thành trước kỳ; ghi rõ nếu dùng định nghĩa khác |
| Top dịch vụ | Lượt đặt hợp lệ hoặc lượt hoàn thành hoặc giá trị bán, do bộ chọn metric quyết định |
| So sánh tăng giảm | (kỳ hiện tại − kỳ trước)/kỳ trước; kỳ trước bằng 0 hiển thị chưa có cơ sở so sánh; chỉ so khoảng thời gian tương đương |

- Biểu đồ lịch theo giờ phải ghi rõ đếm giờ bắt đầu hay số đang phục vụ. Các đường trạng thái phải cùng tập lịch và mốc thời gian; nếu muốn lịch sử trạng thái tại từng thời điểm cần event log.
- Mini calendar hiển thị khả dụng theo bộ lọc/dịch vụ/nguồn lực, không tô “còn chỗ” chỉ vì ngày đó ít lịch.
- Widget: lịch sắp tới, khách mới, hội thoại chờ trả lời, top dịch vụ, tasks quá hạn/đến hạn và cảnh báo vận hành.
- Chỉ số hồi đáp/hội thoại cần dữ liệu inbox thật. Cập nhật realtime có debounce và refetch sau reconnect; không nhận đủ event thì không giả định số vẫn chính xác.

Gate: fixture dữ liệu cố định có đáp án; thay khoảng ngày/chi nhánh cập nhật toàn bộ widget đúng; 0 mẫu số không hiện vô cực; không còn +18.5% hoặc ngày/ca ghi cứng trong live.

## 8. Đợt E5 — Hộp thư tư vấn đa kênh (ảnh 7; phần mở rộng P4C/P6)

Đây là hộp thư làm việc của nhân viên, không mặc nhiên là chatbot AI.

### Giao diện và workflow
- Desktop ba vùng: danh sách hội thoại, luồng tin, hồ sơ liên quan. Mobile chuyển ba màn/tabs, không nhét ba cột vào một chiều rộng.
- Lọc kênh, chưa trả lời, unread, nhãn, người được giao, chi nhánh và trạng thái mở/đóng. Unread khác với “chờ nhân viên phản hồi”; xử lý riêng.
- Nhãn, ghim, chuyển tư vấn viên, ghi chú nội bộ khác màu/kiểu và không bao giờ gửi ra ngoài khi người dùng đang ở chế độ ghi chú.
- Mẫu trả lời/báo giá, xem dịch vụ, tạo yêu cầu đặt lịch và chọn slot thật. Chỉ gửi xác nhận lịch sau khi transaction đặt lịch thành công.
- Hồ sơ bên phải chỉ hiển thị dữ liệu được cấp quyền. Không tự gộp hai khách vì trùng tên, ảnh hoặc SĐT dùng chung.
- Trạng thái lead: mới, đang tư vấn, chờ phản hồi, đã đặt lịch, không phù hợp/đóng; liên kết booking chuyển đổi, không tự tính doanh thu từ tin nhắn.
- Có cơ chế phân công/hiển thị người đang trả lời để giảm gửi trùng; idempotency cho thao tác gửi.

### Tích hợp thật
- Xây provider adapter riêng cho từng kênh, token chỉ phía server, webhook được xác minh theo nhà cung cấp.
- external_contact_id phải gắn với channel_account/provider; không dùng ID của một Page/OA như ID toàn hệ thống.
- Webhook trùng/đến sai thứ tự không tạo trùng tin. Lưu external message ID, thời điểm nhà cung cấp, trạng thái queued/sent/delivered/read/failed khi kênh thực sự hỗ trợ.
- Nhà cung cấp nhận request chưa đồng nghĩa đã giao/đã đọc. Không bịa online status khi API không cung cấp.
- Outbox, retry có giới hạn, rate limit, xử lý token hết hạn/quyền bị thu hồi; khi kết nối lỗi không mất nội dung nháp.
- Tệp đính kèm có giới hạn dung lượng/loại, quyền tải xuống và xử lý an toàn; không ghi token/nội dung nhạy cảm vào log.
- Trước khi tích hợp Zalo/Meta, đọc tài liệu chính thức hiện hành, ghi ngày kiểm tra, quyền cần xin, điều kiện gửi, template, chi phí/hạn mức và tài khoản cần cung cấp. Không lấy SĐT làm Zalo UID/PSID hoặc giả định có thể nhắn mọi người bất kỳ lúc nào.
- Nếu thiếu tài khoản kênh: hoàn thiện khung dữ liệu/workflow và test adapter giả trong môi trường test; UI live ghi “chưa kết nối”, không báo gửi thật.
- Không tự gửi tin cho khách thật trong quá trình phát triển; dùng người nhận thử được chỉ định.
- AI gợi ý trả lời là tính năng riêng, tắt mặc định; không cần AI để hoàn thành inbox này.

Gate: nhận tin thử→phân công→trả lời→provider xác nhận→lưu lịch sử; webhook replay không nhân đôi; ghi chú nội bộ không đi ra ngoài; token hết hạn báo đúng; lịch bị người khác chiếm thì không gửi xác nhận thành công.

## 9. Dữ liệu bổ sung và kỹ thuật dùng chung

Tái sử dụng schema phù hợp hiện có, không tạo bảng mới trùng nghĩa chỉ vì khác tên. Các thực thể có thể cần thêm:
- appointment_events, booking_groups, appointment_participants, resource_allocations, availability_blocks;
- service_staff_skills, service_price_versions, package_components;
- customer_tags, customer_tag_links, customer_care_tasks, contact_events;
- tasks, task_events, loyalty_ledger, loyalty_policy_versions;
- channel_accounts, channel_contacts, conversations, conversation_assignments, messages, message_events, message_templates, outbox_events, webhook_inbox_events.

Mọi thực thể phải có phạm vi organization/branch thích hợp, constraints chống tham chiếu chéo, audit cần thiết và chính sách lưu trữ/xóa. Dữ liệu Auth, khách, ghi chú, ảnh và tin nhắn cần kiểm thử RLS theo vai trò. Bảng public booking không mở toàn bộ khách hàng cho anonymous.

Frontend giữ React/TypeScript; chia service/query theo module, không dồn mọi thứ vào một AppContext. TanStack Query hoặc lớp tương đương quản lý cache theo user/org/branch/filter, pagination server, invalidation sau ghi và clear khi đăng xuất. Query danh mục không select toàn bộ hồ sơ nhạy cảm chỉ để điền dropdown.

Lịch có thể dùng thư viện chuyên dụng tương thích dự án; kiểm tra giấy phép cho resource scheduler trước khi chọn. Biểu đồ dùng thư viện sẵn hoặc SVG hiện có; công thức và dữ liệu đúng quan trọng hơn thư viện. Không tự thêm hạ tầng nặng khi PostgreSQL và tác vụ server đáp ứng.

## 10. Thứ tự triển khai và nghiệm thu

1. E0: nền tảng Auth/live/mock, lỗi lưu và mobile.
2. E1: dịch vụ, giá, kỹ năng, ca và nguồn lực.
3. E2: lịch hẹn thật, chi tiết lịch, chống trùng và lịch điều phối.
4. E3 cơ bản: CRM, nhóm và công việc chăm sóc; loyalty chờ P5.
5. E4: widget lịch/khách/tasks trước; widget tiền sau khi P5 có giao dịch chuẩn.
6. E5: inbox theo từng kênh khi đủ quyền/tài khoản; có thể chuẩn bị cấu trúc sớm nhưng không dùng lịch giả để xác nhận booking.

Tiếp tục các phase POS/kho/lương của PLAN gốc theo phụ thuộc; không để mở rộng hình thức làm trì hoãn việc lưu dữ liệu đúng.

Mỗi đợt bàn giao:
- Bảng yêu cầu→file→migration/RPC→test→trạng thái thật/mock/chưa có.
- Test đã chạy, kết quả và lỗi còn mở; không chỉ lint/build.
- Ảnh desktop/mobile của các luồng chính; thao tác tạo/sửa/reload đã kiểm chứng.
- Commit, URL deployment và Supabase project; migration nào đã áp dụng, cái nào chờ người dùng.
- PROJECT_STATUS.md và hướng dẫn ngắn theo vai trò.

Không tuyên bố hoàn tất nếu còn fallback tạo thành công giả, số liệu ghi cứng, quyền chỉ ẩn UI, lịch chưa lưu database hoặc tin nhắn chỉ ghi log nhưng báo đã gửi.

## 11. Nguồn kỹ thuật đã tham khảo

- PostgreSQL Range Types và exclusion constraints: https://www.postgresql.org/docs/current/rangetypes.html
- Google Calendar incremental synchronization (cho phần Calendar trong PLAN gốc): https://developers.google.com/workspace/calendar/api/guides/sync
- Zalo OA OpenAPI: https://oa.zalo.me/home/function/extension
- Zalo Platform Document Hub: https://docs.zaloplatforms.com/docs/OA
- Meta Messenger: https://developers.facebook.com/docs/messenger-platform/overview — cần kiểm tra trực tiếp tài liệu/permissions hiện hành lúc triển khai; phiên nghiên cứu này chưa đọc được nội dung trang.

## 12. Lệnh bắt đầu công việc

Đọc tài liệu này cùng PLAN gốc và 7 ảnh. Đầu tiên đối chiếu mã hiện tại, cập nhật ma trận thiếu/đã có và sửa các lỗi E0 đã chỉ ra. Sau đó triển khai E1→E2 theo thứ tự phụ thuộc, tiếp tục phần độc lập khi thiếu tài khoản tích hợp. Không chỉ trả lời một kế hoạch mới rồi dừng; thực hiện công việc được giao, kiểm thử và bàn giao từng đợt. Chỉ hỏi người dùng khi cần thông tin/quyền thực sự không có; không yêu cầu gửi bí mật trong chat. Không thay đổi dữ liệu vận hành thật hoặc gửi tin khách thật để thử nghiệm.

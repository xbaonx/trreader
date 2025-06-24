# Tarot Reader - Hệ thống đọc bài Tarot với GPT

Hệ thống backend Node.js + Express cho ứng dụng đọc bài Tarot tích hợp với OpenAI để tạo bài đọc Tarot tự động.

## Tính năng

- **Rút bài ngẫu nhiên**: API rút bài Tarot ngẫu nhiên từ thư viện hình ảnh.
- **Lưu trữ phiên đọc bài**: Lưu toàn bộ thông tin phiên đọc bài trong file JSON.
- **Tích hợp GPT**: Tạo lời giải đọc bài Tarot chi tiết dựa trên lá bài được rút.
- **Chế độ thanh toán**: Chỉ hiển thị kết quả GPT sau khi được duyệt/thanh toán.
- **Giao diện quản trị**: Quản lý phiên đọc bài, cấu hình và thư viện hình ảnh.
- **Xuất dữ liệu**: Xuất danh sách phiên đọc bài ra định dạng CSV.
- **Tùy biến prompt**: Thay đổi prompt và template kết quả qua giao diện.
- **Tải lên hình ảnh**: Tải lên hình ảnh Tarot mới với kiểm tra trùng lặp tên tệp.

## Kiến trúc hệ thống

### Cấu trúc dữ liệu

Dữ liệu lưu trữ trong file JSON (`/mnt/data/db.json`) với hai bảng chính:

1. **sessions**: Lưu thông tin phiên đọc bài
   - `id`: ID phiên duy nhất
   - `uid`: ID người dùng
   - `name`: Họ tên đầy đủ của người dùng
   - `dob`: Ngày sinh của người dùng (định dạng YYYY-MM-DD)
   - `timestamp`: Thời gian tạo phiên
   - `cards`: Các lá bài được rút (tên, hình ảnh)
   - `paid`: Trạng thái thanh toán
   - `gptResult`: Kết quả đọc bài từ GPT
   - `approvedAt`: Thời gian duyệt (nếu đã duyệt)
   - `editedAt`: Thời gian chỉnh sửa gần nhất (nếu có)

2. **config**: Cấu hình hệ thống
   - `prompt`: Template prompt cho OpenAI
   - `responseTemplate`: Template định dạng kết quả đọc bài
   - `defaultCardCount`: Số lá bài mặc định được rút
   - `enableCardRandomization`: Bật/tắt chế độ rút bài ngẫu nhiên

### Các API Endpoints

#### API người dùng:

- **POST /draw**: Rút lá bài Tarot ngẫu nhiên
  - Request: `{ uid: "user_id", name: "Họ tên đầy đủ", dob: "YYYY-MM-DD", count: 3 }`
  - Response: `{ id: "session_id", cards: [...], name: "Họ tên đầy đủ", dob: "YYYY-MM-DD", timestamp: "..." }`

- **GET /result?uid=...**: Lấy kết quả đọc bài cho người dùng
  - Response: Thông tin phiên đọc bài (không bao gồm GPT result nếu chưa thanh toán)

#### API quản trị:

- **GET /admin**: Giao diện quản trị
- **GET /admin/data**: Lấy danh sách phiên đọc bài
- **POST /admin/approve**: Duyệt phiên và tạo kết quả GPT
- **POST /admin/edit**: Chỉnh sửa kết quả GPT
- **POST /admin/delete**: Xóa phiên đọc bài
- **GET/POST /admin/prompt**: Lấy/cập nhật prompt
- **GET/POST /admin/template**: Lấy/cập nhật template
- **GET /admin/export**: Xuất phiên đọc bài ra CSV
- **POST /admin/filter**: Lọc phiên theo UID hoặc ngày
- **POST /admin/upload-card**: Tải lên lá bài mới
- **GET /admin/cards**: Lấy danh sách lá bài

## Cài đặt và chạy local

### Yêu cầu

- Node.js 14+ và npm
- OpenAI API key

### Cài đặt

1. Clone repository:
```bash
git clone <repository-url>
cd trreader
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Tạo file .env:
```bash
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000 # Optional, defaults to 3000
```

4. Chạy ứng dụng:
```bash
node server.js
```

5. Truy cập: http://localhost:3000

## Triển khai trên Render.com

1. Đăng ký tài khoản [Render.com](https://render.com)

2. Tạo Web Service mới:
   - Kết nối với repository GitHub
   - Chọn branch để deploy
   - Cấu hình:
     - **Name**: `trreader` (hoặc tùy chọn)
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `node server.js`
     - **Instance Type**: Web Service (Free hoặc trả phí tùy nhu cầu)

3. Cấu hình Persistent Disk:
   - Thêm disk và mount vào `/mnt/data`
   - Đảm bảo quyền ghi vào thư mục này

4. Thêm Environment Variables:
   - `OPENAI_API_KEY`: API Key của OpenAI

5. Deploy và chờ ứng dụng được triển khai

6. Truy cập: https://your-app-name.onrender.com

## Backup và bảo trì

- Hệ thống tự động tạo backup mỗi khi dữ liệu thay đổi
- 10 backup gần nhất được lưu trong `/mnt/data/backups`
- Kiểm tra logs nếu có lỗi: `heroku logs --tail` (nếu dùng Heroku) hoặc logs của Render

## Biến môi trường

- `OPENAI_API_KEY`: API Key của OpenAI (bắt buộc)
- `PORT`: Cổng chạy ứng dụng (mặc định: 3000)
- `NODE_ENV`: Môi trường chạy (development/production)

## Đóng góp

Mọi đóng góp đều được chào đón! Vui lòng mở issue hoặc pull request để cải thiện ứng dụng.

## Giấy phép

[MIT](LICENSE)

// Script để sửa webhook API
const fs = require('fs');
const path = require('path');

// Đọc file server.js
const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// Tìm đoạn code webhook cần sửa
const webhookPattern = /app\.post\('\/api\/webhook', async \(req, res\) => \{[\s\S]*?\/\/ Tạo session mới\n\s*const newSession = db\.addSession\(\{\n\s*uid,\n\s*cards: selectedCards,\n\s*paid: false,\n\s*gptResult: null,\n\s*\}\);/g;

// Thay thế bằng phiên bản có name và dob
const replacement = `app.post('/api/webhook', async (req, res) => {
  try {
    const { uid, name, dob, cardCount = 3 } = req.body;
    
    if (!uid) {
      return res.json({
        messages: [{
          text: "Lỗi: Thiếu thông tin người dùng"
        }]
      });
    }
    
    // Lấy cấu hình
    const config = db.getConfig();
    const defaultCount = config.defaultCardCount || 3;
    const actualCardCount = Math.min(cardCount, defaultCount);
    
    // Lấy tất cả ảnh lá bài từ thư mục
    const imageDir = path.join(__dirname, 'public', 'images');
    let cardImages;
    try {
      cardImages = fs.readdirSync(imageDir).filter(file => 
        file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')
      );
    } catch (error) {
      console.error('Error reading image directory:', error);
      cardImages = [];
    }
    
    if (cardImages.length < actualCardCount) {
      return res.json({
        messages: [{
          text: \`Không đủ ảnh lá bài tarot (cần ít nhất \${actualCardCount} lá)\`
        }]
      });
    }
    
    // Chọn ngẫu nhiên các lá bài
    const selectedCards = [];
    const selectedIndices = new Set();
    
    while (selectedCards.length < actualCardCount) {
      const randomIndex = Math.floor(Math.random() * cardImages.length);
      
      if (!selectedIndices.has(randomIndex)) {
        selectedIndices.add(randomIndex);
        const imageName = cardImages[randomIndex];
        
        // Format tên lá bài hiển thị (chuyển the_fool.jpg -> The Fool)
        const cardName = imageName
          .replace(/\.(jpg|jpeg|png)$/i, '')
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        selectedCards.push({
          name: cardName,
          image: \`/images/\${imageName}\`
        });
      }
    }
    
    // Tạo session mới
    const newSession = db.addSession({
      uid,
      name, // Thêm họ tên
      dob,  // Thêm ngày sinh
      cards: selectedCards,
      paid: false,
      gptResult: null,
    });`;

// Thay thế nội dung
const updatedContent = content.replace(webhookPattern, replacement);

// Ghi lại file
fs.writeFileSync(serverPath, updatedContent, 'utf8');

console.log('Đã cập nhật webhook API thành công.');

const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');

/**
 * Tạo ảnh ghép từ 3 lá bài được rút
 * @param {Array} cards Mảng các lá bài, mỗi lá có thuộc tính image
 * @returns {Promise<string>} Đường dẫn đến ảnh ghép
 */
async function createCompositeImage(cards) {
  try {
    // Check valid cards array
    if (!Array.isArray(cards) || cards.length === 0) {
      console.error('Invalid cards array');
      return null;
    }

    // Lấy 3 lá bài đầu tiên (hoặc ít hơn nếu không đủ 3)
    const selectedCards = cards.slice(0, 3);
    console.log(`Creating composite image from ${selectedCards.length} cards`);
    
    // Đường dẫn đến thư mục composites
    const compositesDir = path.join(__dirname, 'public/images/composites');
    
    // Tạo thư mục nếu không tồn tại
    await fs.ensureDir(compositesDir);
    
    // Tạo tên file duy nhất cho ảnh ghép
    const filename = `composite_${Date.now()}.jpg`;
    const outputPath = path.join(compositesDir, filename);
    
    // Kích thước mỗi lá bài và padding
    const cardWidth = 250;
    const cardHeight = 400;
    const padding = 10;
    
    // Tạo nền cho ảnh ghép
    const compositeWidth = cardWidth * 3 + padding * 4;
    const compositeHeight = cardHeight + padding * 2;
    
    // Tạo buffer cho từng lá bài đã được resize
    const resizedCards = [];
    
    // Resize từng lá bài để phù hợp với kích thước đã định
    for (let i = 0; i < Math.min(selectedCards.length, 3); i++) {
      const card = selectedCards[i];
      // Lấy đường dẫn đến file ảnh
      const imagePath = path.join(__dirname, 'public', card.image);
      
      try {
        // Resize ảnh lá bài
        const resizedImage = await sharp(imagePath)
          .resize({
            width: cardWidth,
            height: cardHeight,
            fit: 'contain',
            background: { r: 30, g: 30, b: 50, alpha: 0 }
          })
          .toBuffer();
        
        // Thêm vào danh sách
        resizedCards.push({
          input: resizedImage,
          top: padding,
          left: padding + i * (cardWidth + padding)
        });
        
        console.log(`Card ${i+1} resized successfully`);
      } catch (err) {
        console.error(`Error resizing card ${i+1}:`, err);
        // Tiếp tục với thẻ khác nếu lỗi
      }
    }
    
    // Kiểm tra xem có thẻ bài nào được resize thành công không
    if (resizedCards.length === 0) {
      console.error('No cards could be resized for composite');
      return null;
    }
    
    // Tạo hình ảnh ghép với các lá bài đã resize
    await sharp({
      create: {
        width: compositeWidth,
        height: compositeHeight,
        channels: 4,
        background: { r: 30, g: 30, b: 50, alpha: 1 }
      }
    })
    .composite(resizedCards)
    .jpeg({ quality: 90 })
    .toFile(outputPath);
    
    console.log(`Composite image created successfully at ${outputPath}`);
    
    // Trả về đường dẫn URL
    return `/images/composites/${filename}`;
  } catch (error) {
    console.error('Error creating composite image:', error);
    return null;
  }
}

module.exports = {
  createCompositeImage
}

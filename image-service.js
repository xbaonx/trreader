const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');

/**
 * Tạo ảnh ghép từ 3 lá bài Tarot
 * @param {Array} cards - Mảng các đối tượng lá bài
 * @returns {Promise<string>} - Đường dẫn tới ảnh ghép
 */
async function createCompositeImage(cards) {
  try {
    // Đảm bảo thư mục tồn tại
    const compositesDir = path.join(__dirname, 'public/images/composites');
    await fs.ensureDir(compositesDir);
    
    // Tạo tên file duy nhất cho ảnh ghép
    const timestamp = Date.now();
    const outputFilename = `composite_${timestamp}.jpg`;
    const outputPath = path.join(compositesDir, outputFilename);
    
    // Đọc hình ảnh các lá bài (loại bỏ tiền tố /images/)
    const cardImages = cards.map(card => {
      const imagePath = card.image.replace('/images/', '');
      return path.join(__dirname, 'public/images', imagePath);
    });
    
    // Kích thước mỗi lá bài và padding
    const cardWidth = 250;
    const cardHeight = 400;
    const padding = 10;
    
    // Tạo nền cho ảnh ghép
    const compositeWidth = cardWidth * 3 + padding * 4;
    const compositeHeight = cardHeight + padding * 2;
    
    // Tạo hình ảnh ghép với 3 lá bài cạnh nhau
    const composite = sharp({
      create: {
        width: compositeWidth,
        height: compositeHeight,
        channels: 4,
        background: { r: 30, g: 30, b: 50, alpha: 1 }
      }
    });
    
    // Tạo danh sách các composites
    const composites = [];
    
    // Thêm từng lá bài vào vị trí
    for (let i = 0; i < Math.min(cardImages.length, 3); i++) {
      composites.push({
        input: cardImages[i],
        top: padding,
        left: padding + i * (cardWidth + padding)
      });
    }
    
    // Ghép và lưu ảnh
    await composite
      .composite(composites)
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    
    // Trả về đường dẫn web tới ảnh
    return `/images/composites/${outputFilename}`;
  } catch (error) {
    console.error('Error creating composite image:', error);
    throw error;
  }
}

module.exports = {
  createCompositeImage
};

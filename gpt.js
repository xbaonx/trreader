/**
 * gpt.js - Module tích hợp với OpenAI API để tạo nội dung đọc bài tarot
 */

const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const db = require('./db');

dotenv.config();

// Kiểm tra và khởi tạo OpenAI client
let openai;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} catch (error) {
  console.error('Error initializing OpenAI client:', error);
}

/**
 * Tạo phiên đọc bài tarot dựa trên các lá bài đã chọn
 * @param {Array<Object>} cards - Mảng các đối tượng lá bài (có thuộc tính name)
 * @returns {Promise<string>} - Kết quả đọc bài từ GPT
 */
async function generateTarotReading(cards) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY không được thiết lập trong biến môi trường');
    }

    if (!openai) {
      throw new Error('OpenAI client chưa được khởi tạo đúng cách');
    }

    // Lấy cấu hình từ db
    const config = db.getConfig();
    
    // Tạo prompt sử dụng config và template đã định nghĩa
    const cardsList = cards.map((card, index) => `${index + 1}. ${card.name}`).join('\n');
    const fullPrompt = `${config.prompt}

Các lá bài được rút:
${cardsList}

Vui lòng trả lời theo định dạng sau:
${config.responseTemplate}`;

    // Gọi API OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Bạn là chuyên gia tarot với hơn 20 năm kinh nghiệm. Bạn giải đọc bài tarot một cách chi tiết, rõ ràng và dễ hiểu." },
        { role: "user", content: fullPrompt }
      ],
      temperature: 0.7,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating tarot reading:', error);
    throw error;
  }
}

module.exports = {
  generateTarotReading
};

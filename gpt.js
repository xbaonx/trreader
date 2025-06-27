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
async function generateTarotReading(cards, userInfo = {}) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY không được thiết lập trong biến môi trường');
    }

    if (!openai) {
      throw new Error('OpenAI client chưa được khởi tạo đúng cách');
    }

    // Lấy cấu hình từ db
    const config = db.getConfig();
    
    // Xử lý thông tin người dùng
    const name = userInfo.name || 'Khách hàng';
    const dob = userInfo.dob || 'không xác định';
    
    // Thay thế các placeholder trong template
    let prompt = config.prompt
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{dob\}\}/g, dob);
      
    let responseTemplate = config.responseTemplate
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{dob\}\}/g, dob);
    
    // Tạo prompt sử dụng config và template đã định nghĩa
    const cardsList = cards.map((card, index) => `${index + 1}. ${card.name}`).join('\n');
    const fullPrompt = `${prompt}

Cards drawn:
${cardsList}

Please respond in the following format:
${responseTemplate}`;

    // Sử dụng mô hình từ config hoặc fallback về gpt-3.5-turbo nếu không tồn tại
    const model = config.model || 'gpt-3.5-turbo';
    
    console.log(`Using GPT model: ${model}`);
    
    // Gọi API OpenAI
    console.log('[DEBUG] System message (from config.prompt):', prompt);
    console.log('[DEBUG] User message (cards + template):', `Các lá bài được rút:\n${cardsList}\n\nVui lòng trả lời theo định dạng sau:\n${responseTemplate}`);
    
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Cards drawn:\n${cardsList}\n\nPlease respond in the following format:\n${responseTemplate}` }
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

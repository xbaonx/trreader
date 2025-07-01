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
 * @param {Object} userInfo - Thông tin người dùng (name, dob, sessionId, etc)
 * @param {Array} chatHistory - Lịch sử chat của người dùng (tùy chọn)
 * @returns {Promise<string>} - Kết quả đọc bài từ GPT
 */
async function generateTarotReading(cards, userInfo = {}, chatHistory = []) {
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
    
    // Chuẩn bị messages cho API call
    const messages = [
      { role: "system", content: prompt },
    ];

    // Thêm lịch sử chat vào nếu có
    if (chatHistory && chatHistory.length > 0) {
      console.log('[DEBUG] Using chat history with', chatHistory.length, 'messages');
      
      // Giới hạn lịch sử chat để tránh vượt quá token limit
      const limitedHistory = chatHistory.slice(-5); // Chỉ lấy 5 message gần nhất
      messages.push(...limitedHistory);
    }

    // Thêm message hiện tại
    messages.push({ role: "user", content: `Cards drawn:\n${cardsList}\n\nPlease respond in the following format:\n${responseTemplate}` });
    
    // Gọi API OpenAI
    console.log('[DEBUG] System message (from config.prompt):', prompt);
    console.log('[DEBUG] User message (cards + template):', `Các lá bài được rút:\n${cardsList}\n\nVui lòng trả lời theo định dạng sau:\n${responseTemplate}`);
    
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.7,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating tarot reading:', error);
    throw error;
  }
}

/**
 * Thêm một tin nhắn vào lịch sử chat và trả về lịch sử đã cập nhật
 * @param {string} sessionId - ID của phiên chat
 * @param {string} role - Vai trò (user, assistant, system)
 * @param {string} content - Nội dung tin nhắn
 * @returns {Array} - Lịch sử chat đã cập nhật
 */
async function addToChatHistory(sessionId, role, content) {
  const db = require('./db'); // Import ở đây để tránh circular dependency
  
  // Tạo message mới
  const newMessage = { role, content, timestamp: new Date().toISOString() };
  
  // Lấy thông tin phiên hiện tại
  const session = db.getSessionById(sessionId);
  if (!session) {
    console.error(`Session ${sessionId} not found`);
    return [];
  }
  
  // Cập nhật lịch sử chat
  const updatedSession = db.updateSession(sessionId, {
    chatHistory: [newMessage]
  });
  
  return updatedSession.chatHistory || [];
}

/**
 * Lấy lịch sử chat của một phiên
 * @param {string} sessionId - ID của phiên chat
 * @returns {Array} - Lịch sử chat
 */
function getChatHistory(sessionId) {
  const db = require('./db'); // Import ở đây để tránh circular dependency
  
  const session = db.getSessionById(sessionId);
  if (!session) {
    console.error(`Session ${sessionId} not found`);
    return [];
  }
  
  return session.chatHistory || [];
}

module.exports = {
  generateTarotReading,
  addToChatHistory,
  getChatHistory,
  openai // Export client OpenAI để sử dụng từ các module khác
};

/**
 * premium.js - Module đánh giá nhu cầu nâng cấp tài khoản premium dựa trên lịch sử chat
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
 * Đánh giá xem cuộc hội thoại có cần nâng cấp lên premium hay không dựa trên lịch sử chat
 * @param {string} sessionId - ID của phiên chat
 * @returns {Promise<{needsPremium: boolean, reason: string}>} - Kết quả đánh giá
 */
async function evaluateNeedForPremium(sessionId) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY không được thiết lập trong biến môi trường');
    }

    if (!openai) {
      throw new Error('OpenAI client chưa được khởi tạo đúng cách');
    }

    // Lấy session từ database
    const session = db.getSessionById(sessionId);
    if (!session || !session.chatHistory) {
      return { needsPremium: false, reason: "Không tìm thấy lịch sử chat" };
    }

    // Lấy cấu hình premium prompt từ config
    const config = db.getConfig();
    const premiumPrompt = config.premiumPrompt || `Bạn là người đánh giá xem người dùng có nhu cầu nâng cấp lên tài khoản premium hay không. 
    Hãy phân tích lịch sử chat và xác định xem người dùng có đang yêu cầu:
    1. Thông tin chi tiết và chuyên sâu về các lá bài tarot
    2. Giải thích chuyên sâu về ý nghĩa của các lá bài trong bối cảnh riêng của họ
    3. Thông tin về các mối quan hệ cụ thể giữa các lá bài
    4. Những phân tích theo thời gian hoặc tương lai xa
    5. Các câu hỏi cụ thể liên quan đến tình yêu, sự nghiệp, tài chính mà cần phân tích sâu
    
    Nếu người dùng hỏi các câu hỏi cơ bản về ý nghĩa tổng quát, đó là dịch vụ miễn phí.
    Nếu họ đi sâu vào chi tiết và cần các phân tích chuyên nghiệp, họ cần nâng cấp lên premium.
    
    Trả về kết quả là needsPremium: true hoặc false, và lý do.`;

    // Chuẩn bị dữ liệu chat history để đánh giá
    const chatHistory = session.chatHistory || [];
    
    // Lấy tối đa 10 tin nhắn gần nhất để đánh giá
    const recentMessages = chatHistory.slice(-10);
    
    // Chuẩn bị prompt cho GPT
    const messages = [
      { role: "system", content: premiumPrompt },
      { role: "user", content: `Đánh giá lịch sử chat sau và xác định xem người dùng có cần nâng cấp lên premium không:\n\n${JSON.stringify(recentMessages)}` }
    ];

    // Gọi API OpenAI
    console.log('[DEBUG] Evaluating chat history for premium needs, session:', sessionId);
    
    const model = config.model || 'gpt-3.5-turbo';
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.1, // Nhiệt độ thấp để có kết quả nhất quán
      response_format: { type: "json_object" } // Yêu cầu phản hồi dạng JSON
    });

    // Xử lý kết quả
    const response = completion.choices[0].message.content;
    console.log('[DEBUG] Premium evaluation result:', response);
    
    try {
      const result = JSON.parse(response);
      return {
        needsPremium: result.needsPremium === true,
        reason: result.reason || "Không có lý do cụ thể"
      };
    } catch (error) {
      console.error('Error parsing premium evaluation result:', error);
      return {
        needsPremium: false,
        reason: "Lỗi xử lý kết quả đánh giá"
      };
    }
  } catch (error) {
    console.error('Error evaluating premium need:', error);
    return {
      needsPremium: false,
      reason: `Lỗi: ${error.message}`
    };
  }
}

/**
 * Cập nhật trạng thái premium của một session
 * @param {string} sessionId - ID phiên
 * @param {boolean} needsPremium - Cờ đánh dấu cần premium hay không
 * @returns {Promise<Object>} - Session được cập nhật
 */
async function updateSessionPremiumStatus(sessionId, needsPremium) {
  try {
    const updatedSession = db.updateSession(sessionId, { needsPremium });
    return updatedSession;
  } catch (error) {
    console.error('Error updating session premium status:', error);
    throw error;
  }
}

module.exports = {
  evaluateNeedForPremium,
  updateSessionPremiumStatus
};

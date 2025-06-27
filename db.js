/**
 * db.js - Module quản lý dữ liệu lưu trữ trong db.json
 * File db.json có cấu trúc: { sessions: [...], config: {...} }
 * 
 * Cấu trúc sessions bao gồm các trường:
 * - id: ID phiên duy nhất
 * - uid: ID người dùng
 * - name: Họ tên người dùng (mới thêm)
 * - dob: Ngày tháng năm sinh (mới thêm, định dạng YYYY-MM-DD)
 * - timestamp: Thời gian tạo phiên
 * - cards: Các lá bài được rút
 * - paid: Trạng thái thanh toán
 * - gptResult: Kết quả đọc bài từ GPT
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Đường dẫn tới file db.json và thư mục backup
const DATA_DIR = '/mnt/data';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Cấu trúc mặc định của DB
const DEFAULT_DB = {
  sessions: [],
  config: {
    prompt: `Bạn là chuyên gia tarot reader với nhiều năm kinh nghiệm. Hãy phân tích ý nghĩa của các lá bài tarot dưới đây và đưa ra lời giải cho người dùng có tên là {{name}} và sinh ngày {{dob}}. Hãy nhớ rằng mỗi lá bài mang một năng lượng và thông điệp riêng, và sự kết hợp giữa chúng tạo ra một câu chuyện hoàn chỉnh dành cho {{name}}.`,
    responseTemplate: `# Kết Quả Đọc Bài Tarot

## Phân tích tổng quát
[Đưa ra phân tích tổng quát dựa trên sự kết hợp của các lá bài]

## Phân tích chi tiết từng lá bài
[Phân tích ý nghĩa của từng lá bài trong ngữ cảnh hiện tại]

## Lời khuyên
[Đưa ra lời khuyên cho người được đọc bài]

## Kết luận
[Đưa ra kết luận về tổng thể phiên đọc bài]`,
    defaultCardCount: 3,
    model: 'gpt-3.5-turbo',
    models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']
  }
};

/**
 * Đảm bảo thư mục data và file db.json tồn tại
 */
function ensureDataStructure() {
  try {
    // Đảm bảo thư mục data tồn tại
    fs.ensureDirSync(DATA_DIR);
    fs.ensureDirSync(BACKUP_DIR);
    
    // Kiểm tra xem file db.json có tồn tại không, nếu không thì tạo mới
    if (!fs.existsSync(DB_FILE)) {
      fs.writeJsonSync(DB_FILE, DEFAULT_DB, { spaces: 2 });
      console.log('Created new db.json file with default structure');
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring data structure:', error);
    // Nếu là môi trường phát triển local, tạo thư mục tạm thời
    try {
      const tempDir = path.join(__dirname, 'temp_data');
      fs.ensureDirSync(tempDir);
      fs.ensureDirSync(path.join(tempDir, 'backups'));
      console.log(`Created temporary data directory at ${tempDir} for local development`);
      return true;
    } catch (localError) {
      console.error('Could not create temporary directory:', localError);
      return false;
    }
  }
}

/**
 * Đọc dữ liệu từ db.json
 * @returns {Object} DB object hoặc DEFAULT_DB nếu có lỗi
 */
function readDB() {
  try {
    ensureDataStructure();
    return fs.readJsonSync(DB_FILE);
  } catch (error) {
    console.error('Error reading database:', error);
    return { ...DEFAULT_DB };
  }
}

/**
 * Tạo backup của db.json trước khi lưu
 */
function createBackup() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const backupFile = path.join(BACKUP_DIR, `db_${timestamp}.json`);
      fs.copySync(DB_FILE, backupFile);
      
      // Giữ tối đa 10 file backup gần nhất
      const backups = fs.readdirSync(BACKUP_DIR)
        .filter(file => file.startsWith('db_') && file.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a)); // Sắp xếp theo thời gian giảm dần
      
      if (backups.length > 10) {
        for (let i = 10; i < backups.length; i++) {
          fs.removeSync(path.join(BACKUP_DIR, backups[i]));
        }
      }
      
      console.log(`Created backup: ${backupFile}`);
    }
  } catch (error) {
    console.error('Error creating backup:', error);
  }
}

/**
 * Lưu dữ liệu vào db.json
 * @param {Object} data - Dữ liệu muốn lưu
 * @returns {boolean} Kết quả thành công hay thất bại
 */
function saveDB(data) {
  try {
    ensureDataStructure();
    createBackup();
    fs.writeJsonSync(DB_FILE, data, { spaces: 2 });
    return true;
  } catch (error) {
    console.error('Error saving database:', error);
    return false;
  }
}

// ========== SESSIONS API ==========

/**
 * Lấy tất cả các session
 * @returns {Array} Mảng chứa tất cả các session
 */
function getAllSessions() {
  const db = readDB();
  return db.sessions || [];
}

/**
 * Lấy session theo ID
 * @param {string} id - ID của session
 * @returns {Object|null} Session đã tìm thấy hoặc null
 */
function getSessionById(id) {
  const sessions = getAllSessions();
  return sessions.find(session => session.id === id) || null;
}

/**
 * Lấy session gần đây nhất theo UID
 * @param {string} uid - UID của người dùng
 * @returns {Object|null} Session gần đây nhất hoặc null
 */
function getLatestSessionByUid(uid) {
  const sessions = getAllSessions();
  const userSessions = sessions.filter(session => session.uid === uid);
  
  if (userSessions.length === 0) return null;
  
  // Sắp xếp theo thời gian giảm dần và lấy session mới nhất
  return userSessions.sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  )[0];
}

/**
 * Thêm một session mới
 * @param {Object} session - Session cần thêm
 * @returns {Object} Session đã thêm với ID mới
 */
function addSession(sessionData) {
  const db = readDB();
  
  const newSession = {
    id: uuidv4(),
    uid: sessionData.uid,
    full_name: sessionData.full_name || 'Khách',  // Họ tên đầy đủ
    dob: sessionData.dob || '',                   // Ngày sinh
    timestamp: new Date().toISOString(),
    cards: sessionData.cards,
    compositeImage: sessionData.compositeImage || null, // Ảnh ghép các lá bài
    paid: sessionData.paid || false,
    gptResult: sessionData.gptResult || null,
  };
  
  db.sessions.push(newSession);
  saveDB(db);
  return newSession;
}

/**
 * Cập nhật một session theo ID
 * @param {string} id - ID của session cần cập nhật
 * @param {Object} updates - Dữ liệu cập nhật
 * @returns {Object|null} Session đã cập nhật hoặc null nếu không tìm thấy
 */
function updateSession(id, updatedData) {
  const db = readDB();
  
  const index = db.sessions.findIndex(session => session.id === id);
  if (index === -1) return null;
  
  // Chỉ cập nhật các trường được phép
  if (updatedData.paid !== undefined) db.sessions[index].paid = updatedData.paid;
  if (updatedData.gptResult) {
    db.sessions[index].gptResult = updatedData.gptResult;
    db.sessions[index].editedAt = new Date().toISOString();
  }
  // Thêm hỗ trợ trường basicResult cho kết quả đọc bài cơ bản (miễn phí)
  if (updatedData.basicResult) {
    db.sessions[index].basicResult = updatedData.basicResult;
    // Cập nhật thời gian chỉnh sửa
    if (!db.sessions[index].editedAt) {
      db.sessions[index].editedAt = new Date().toISOString();
    }
  }
  if (updatedData.name) db.sessions[index].name = updatedData.name;
  if (updatedData.dob) db.sessions[index].dob = updatedData.dob;
  
  // Đánh dấu thời gian duyệt nếu được thanh toán
  if (updatedData.paid && !db.sessions[index].approvedAt) {
    db.sessions[index].approvedAt = new Date().toISOString();
  }
  
  saveDB(db);
  return db.sessions[index];
}

/**
 * Xóa một session theo ID
 * @param {string} id - ID của session cần xóa
 * @returns {boolean} Kết quả xóa thành công hay không
 */
function deleteSession(id) {
  const db = readDB();
  const initialLength = db.sessions.length;
  
  db.sessions = db.sessions.filter(session => session.id !== id);
  
  if (db.sessions.length !== initialLength) {
    saveDB(db);
    return true;
  }
  
  return false;
}

/**
 * Lọc session theo UID hoặc khoảng thời gian
 * @param {Object} filters - Các điều kiện lọc
 * @returns {Array} Mảng các session khớp với điều kiện lọc
 */
function filterSessions(filters = {}) {
  const sessions = getAllSessions();
  
  return sessions.filter(session => {
    // Lọc theo UID
    if (filters.uid && session.uid !== filters.uid) {
      return false;
    }
    
    // Lọc theo khoảng thời gian
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      const sessionDate = new Date(session.timestamp);
      if (sessionDate < startDate) return false;
    }
    
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      const sessionDate = new Date(session.timestamp);
      if (sessionDate > endDate) return false;
    }
    
    return true;
  });
}

// ========== CONFIG API ==========

/**
 * Lấy toàn bộ cấu hình
 * @returns {Object} Cấu hình hiện tại
 */
function getConfig() {
  console.log('[DEBUG] getConfig called');
  const db = readDB();
  if (db.config) {
    console.log('[DEBUG] Using config from DB:', JSON.stringify(db.config));
    return db.config;
  } else {
    console.log('[DEBUG] Using DEFAULT_DB config');
    return DEFAULT_DB.config;
  }
}

/**
 * Cập nhật cấu hình
 * @param {Object} updates - Dữ liệu cập nhật
 * @returns {Object} Cấu hình đã cập nhật
 */
function updateConfig(updates) {
  const db = readDB();
  
  db.config = {
    ...db.config,
    ...updates
  };
  
  saveDB(db);
  return db.config;
}

module.exports = {
  ensureDataStructure,
  readDB,
  saveDB,
  getAllSessions,
  getSessionById,
  getLatestSessionByUid,
  addSession,
  updateSession,
  deleteSession,
  filterSessions,
  getConfig,
  updateConfig
};

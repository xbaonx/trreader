/**
 * server.js - File chính của ứng dụng Express
 */

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs-extra');
const { createObjectCsvWriter } = require('csv-writer');
const db = require('./db');
const gpt = require('./gpt');
const adminRoutes = require('./admin-routes');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Đảm bảo cấu trúc dữ liệu được khởi tạo
db.ensureDataStructure();

// Đảm bảo thư mục images tồn tại
fs.ensureDirSync(path.join(__dirname, 'public', 'images'));

/**
 * Cấu hình Multer cho upload ảnh
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'public/images');
    fs.ensureDirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Normalize filename
    const fileName = file.originalname.toLowerCase().replace(/ /g, '_');
    
    // Kiểm tra trùng lặp tên file
    const uploadPath = path.join(__dirname, 'public/images');
    fs.readdir(uploadPath, (err, files) => {
      if (err) {
        return cb(err);
      }
      
      // Nếu tên file đã tồn tại, thêm timestamp
      if (files.includes(fileName)) {
        const timestamp = Date.now();
        const fileNameParts = fileName.split('.');
        const fileExtension = fileNameParts.pop();
        const fileBaseName = fileNameParts.join('.');
        const newFileName = `${fileBaseName}_${timestamp}.${fileExtension}`;
        return cb(null, newFileName);
      }
      
      // Nếu tên file chưa tồn tại, sử dụng tên gốc
      cb(null, fileName);
    });
  }
});

// Phân loại file cho phép
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg' || file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(null, false);
    return cb(new Error('Chỉ chấp nhận file ảnh JPEG, JPG hoặc PNG!'));
  }
};

// Cấu hình Multer
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
  fileFilter: fileFilter
});

// Thêm middleware để kiểm tra thư mục static
app.use((req, res, next) => {
  // Đảm bảo thư mục static tồn tại
  fs.ensureDirSync(path.join(__dirname, 'public'));
  fs.ensureDirSync(path.join(__dirname, 'public', 'images'));
  next();
});

/**
 * API Route 1: Hiển thị trang admin trực tiếp từ root path
 * GET /
 */
app.get('/', (req, res) => {
  try {
    // Giao diện quản trị được render bằng EJS
    res.render('admin', {
      title: 'Quản lý Tarot - Admin Dashboard',
      activeTab: req.query.tab || 'sessions' // Tab mặc định
    });
  } catch (error) {
    console.error('Error in root path endpoint:', error);
    res.status(500).send('Lỗi máy chủ nội bộ');
  }
});

// ========== API ROUTES ==========

/**
 * API Route 1: Rút bài ngẫu nhiên
 * POST /draw
 */
app.post('/draw', (req, res) => {
  try {
    const { uid } = req.body;
    
    if (!uid) {
      return res.status(400).json({ error: 'User ID là bắt buộc' });
    }
    
    // Lấy cấu hình
    const config = db.getConfig();
    const cardCount = config.defaultCardCount || 3;
    
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
    
    if (cardImages.length < cardCount) {
      return res.status(500).json({ 
        error: `Không đủ ảnh lá bài tarot (cần ít nhất ${cardCount} lá)` 
      });
    }
    
    // Chọn ngẫu nhiên các lá bài
    const selectedCards = [];
    const selectedIndices = new Set();
    
    while (selectedCards.length < cardCount) {
      const randomIndex = Math.floor(Math.random() * cardImages.length);
      
      if (!selectedIndices.has(randomIndex)) {
        selectedIndices.add(randomIndex);
        const imageName = cardImages[randomIndex];
        
        // Format tên lá bài hiển thị (chuyển the_fool.jpg -> The Fool)
        const name = imageName
          .replace(/\.(jpg|jpeg|png)$/i, '')
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        selectedCards.push({
          name,
          image: `/images/${imageName}`
        });
      }
    }
    
    // Tạo session mới
    const newSession = db.addSession({
      uid,
      cards: selectedCards,
      paid: false,
      gptResult: null,
    });
    
    // Trả về thông tin các lá bài
    res.json({ 
      success: true, 
      sessionId: newSession.id,
      cards: selectedCards 
    });
    
  } catch (error) {
    console.error('Error in /draw endpoint:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
});

/**
 * API Route 2: Lấy kết quả đọc bài cho người dùng
 * GET /result?uid=...
 */
app.get('/result', (req, res) => {
  try {
    const { uid } = req.query;
    
    if (!uid) {
      return res.status(400).json({ error: 'User ID là bắt buộc' });
    }
    
    // Tìm session gần đây nhất cho uid này
    const session = db.getLatestSessionByUid(uid);
    
    if (!session) {
      return res.status(404).json({ error: 'Không tìm thấy phiên đọc bài nào cho người dùng này' });
    }
    
    // Nếu chưa thanh toán, không gửi kết quả GPT
    if (!session.paid) {
      const { gptResult, ...sessionWithoutGptResult } = session;
      return res.json(sessionWithoutGptResult);
    }
    
    // Trả về toàn bộ session nếu đã thanh toán
    res.json(session);
    
  } catch (error) {
    console.error('Error in /result endpoint:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
});

/**
 * Sử dụng router admin
 * Các route được định nghĩa trong admin-routes.js
 */
app.use('/admin', adminRoutes(db, gpt, upload));

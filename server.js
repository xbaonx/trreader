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
const imageService = require('./image-service');
const adminRoutes = require('./admin-routes');

// Ensure debug-composite exists before importing
let debugComposite;
try {
  debugComposite = require('./debug-composite');
  console.log('Debug composite module loaded successfully');
} catch (error) {
  console.error('Failed to load debug-composite module:', error.message);
  // Create a stub if module not found
  debugComposite = {
    testCompositeCreation: async () => ({
      success: false,
      error: 'Debug module not loaded properly'
    }),
    logDebug: (msg) => console.log('Debug log:', msg)
  };
}

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

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

// Đảm bảo thư mục images tồn tại trong persistent disk và tạo symbolic link
const imagesDir = path.join(__dirname, 'public', 'images');
const persistentImagesDir = path.join('/mnt/data', 'images');

// Đảm bảo thư mục persistent disk tồn tại
fs.ensureDirSync(persistentImagesDir);

// Xóa thư mục images cũ nếu tồn tại (có thể là thư mục trống hoặc symbolic link cũ)
if (fs.existsSync(imagesDir)) {
  fs.removeSync(imagesDir);
}

// Tạo symbolic link từ public/images đến /mnt/data/images
try {
  fs.symlinkSync(persistentImagesDir, imagesDir, 'dir');
  console.log('Symbolic link created from', imagesDir, 'to', persistentImagesDir);
} catch (error) {
  console.error('Error creating symbolic link:', error);
  // Nếu không thể tạo symlink (ví dụ: trên Windows hoặc quyền không đủ), tạo thư mục thường
  fs.ensureDirSync(imagesDir);
  console.log('Created regular directory instead:', imagesDir);
}

/**
 * Cấu hình Multer cho upload ảnh
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.NODE_ENV === 'production'
      ? path.join('/mnt/data', 'images')
      : path.join(__dirname, 'public/images');
    fs.ensureDirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Normalize filename
    const fileName = file.originalname.toLowerCase().replace(/ /g, '_');
    
    // Kiểm tra trùng lặp tên file
    const uploadPath = process.env.NODE_ENV === 'production'
      ? path.join('/mnt/data', 'images')
      : path.join(__dirname, 'public/images');
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
      activeTab: req.query.tab || 'sessions' 
    });
  } catch (error) {
    console.error('Error in root path endpoint:', error);
    res.status(500).send('Lỗi máy chủ nội bộ');
  }
});

// ========== DEBUG ROUTES ==========

/**
 * Route kiểm tra tính năng tạo ảnh ghép
 * GET /debug/composite
 */
app.get('/debug/composite', async (req, res) => {
  try {
    const result = await debugComposite.testCompositeCreation();
    
    if (result.success) {
      // Thêm thông tin về server
      const serverInfo = {
        nodeEnv: process.env.NODE_ENV || 'development',
        hostname: req.headers.host,
        publicUrl: process.env.NODE_ENV === 'production' 
          ? `https://${req.headers.host}` 
          : `http://${req.headers.host}`,
        imagePath: result.compositePath,
        fullUrl: process.env.NODE_ENV === 'production' 
          ? `https://${req.headers.host}${result.compositePath}` 
          : `http://${req.headers.host}${result.compositePath}`,
        serverTime: new Date().toISOString()
      };
      
      // Trả về kết quả test và thông tin server
      res.json({
        success: true,
        message: 'Composite image created successfully',
        debug: result,
        server: serverInfo,
        image: `<img src="${result.compositePath}" style="max-width: 100%">`,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Error creating composite image',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Debug composite error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error in debug endpoint', 
      error: error.message,
      stack: error.stack
    });
  }
});

// ========== API ROUTES ==========

/**
 * API Route 1: Rút bài ngẫu nhiên
 * POST /draw
 */
app.post('/draw', async (req, res) => {
  try {
    const { uid, full_name, dob } = req.body;
    
    if (!uid) {
      return res.status(400).json({ error: 'User ID là bắt buộc' });
    }
    
    // Kiểm tra định dạng ngày sinh nếu được cung cấp
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      return res.status(400).json({ error: 'Ngày sinh phải có định dạng YYYY-MM-DD' });
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
    
    // Tạo ảnh ghép từ các lá bài đã chọn
    let compositeImageUrl = null;
    try {
      compositeImageUrl = await imageService.createCompositeImage(selectedCards);
      console.log('Created composite image:', compositeImageUrl);
    } catch (error) {
      console.error('Error creating composite image:', error);
      // Không báo lỗi cho client, tiếp tục xử lý
    }
    
    // Tạo session mới
    const newSession = db.addSession({
      uid,
      full_name,
      dob, 
      cards: selectedCards,
      compositeImage: compositeImageUrl,
      paid: false,
      gptResult: null,
    });
    
    // Trả về thông tin các lá bài
    res.json({ 
      success: true, 
      sessionId: newSession.id,
      cards: selectedCards,
      full_name: newSession.full_name,
      dob: newSession.dob,
      compositeImage: compositeImageUrl
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

// ========== CHATFUEL WEBHOOK API ==========

/**
 * API Webhook cho Chatfuel
 * POST /api/webhook
 */
app.post('/api/webhook', async (req, res) => {
  try {
    const { uid, full_name, dob, cardCount = 3 } = req.body;
    
    if (!uid) {
      return res.json({
        messages: [{
          text: "Lỗi: Thiếu thông tin người dùng"
        }]
      });
    }
    
    // Kiểm tra định dạng ngày sinh nếu được cung cấp
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      return res.json({
        messages: [{
          text: "Lỗi: Ngày sinh phải có định dạng YYYY-MM-DD"
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
          text: `Không đủ ảnh lá bài tarot (cần ít nhất ${actualCardCount} lá)`
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
          .replace(/.(jpg|jpeg|png)$/i, '')
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        selectedCards.push({
          name: cardName,
          image: `/images/${imageName}`
        });
      }
    }
    
    // Tạo ảnh ghép từ các lá bài đã chọn
    let compositeImageUrl = null;
    try {
      compositeImageUrl = await imageService.createCompositeImage(selectedCards);
      console.log('Created composite image for webhook:', compositeImageUrl);
    } catch (error) {
      console.error('Error creating composite image for webhook:', error);
      // Không báo lỗi cho client, tiếp tục xử lý
    }
    
    // Tạo session mới
    const newSession = db.addSession({
      uid,
      full_name, // Họ tên đầy đủ
      dob,      // Ngày sinh
      cards: selectedCards,
      compositeImage: compositeImageUrl, // Thêm đường dẫn ảnh ghép
      paid: false,
      gptResult: null,
    });
    
    // Chuẩn bị URL cho Chatfuel
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${req.headers.host}` 
      : `http://${req.headers.host}`;
      
    // Trả về thông tin theo định dạng Chatfuel
    // Không gửi từng ảnh lá bài riêng nữa
    
    // Khởi tạo mảng messages trống
    const messages = [];
    
    // Thêm ảnh ghép vào response nếu có
    if (compositeImageUrl) {
      messages.push({ "text": "👆 Đây là ảnh ghép 3 lá bài của bạn" });
      messages.push({
        "attachment": {
          "type": "image",
          "payload": {
            "url": `${baseUrl}${compositeImageUrl}`
          }
        }
      });
    }
    
    // Không thêm nút xem kết quả nữa
    
    res.json({
      "messages": messages,
      "session_id": newSession.id
    });
    
  } catch (error) {
    console.error('Error in /api/webhook endpoint:', error);
    res.json({
      "messages": [
        { "text": "Đã xảy ra lỗi. Vui lòng thử lại sau." }
      ]
    });
  }
});


/**
 * Webhook API Trả kết quả đọc bài
 * POST /api/webhook/result
 */
app.post('/api/webhook/result', async (req, res) => {
  try {
    const { session_id } = req.body;
    
    if (!session_id) {
      return res.json({
        "messages": [
          { "text": "Thiếu thông tin phiên đọc bài" }
        ]
      });
    }
    
    const sessionData = db.getSessionById(session_id);
    
    if (!sessionData) {
      return res.json({
        "messages": [
          { "text": "Không tìm thấy phiên đọc bài" }
        ]
      });
    }
    
    // Kiểm tra xem phiên đã được thanh toán và có kết quả đọc bài hay chưa
    if (!sessionData.paid || !sessionData.gptResult) {
      return res.json({
        "messages": [
          { "text": "Phiên đọc bài chưa được xử lý hoặc thanh toán. Vui lòng quay lại sau." }
        ]
      });
    }
    
    // Chuẩn bị URL cho Chatfuel
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${req.headers.host}` 
      : `http://${req.headers.host}`;
    
    // Tạo mảng response
    const messages = [];
    
    // Thêm kết quả GPT
    messages.push({ "text": sessionData.gptResult });
    
    // Thêm ảnh ghép vào response nếu có
    if (sessionData.compositeImageUrl) {
      messages.push({
        "attachment": {
          "type": "image",
          "payload": {
            "url": `${baseUrl}${sessionData.compositeImageUrl}`
          }
        }
      });
    }
    
    // Trả về kết quả theo định dạng Chatfuel
    res.json({
      "messages": messages
    });
    
  } catch (error) {
    console.error('Error in /api/webhook/result endpoint:', error);
    res.json({
      "messages": [
        { "text": "Đã xảy ra lỗi khi lấy kết quả đọc bài. Vui lòng thử lại sau." }
      ]
    });
  }
});

// Khai báo port và chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

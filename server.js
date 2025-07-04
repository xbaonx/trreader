/**
 * server.js - File chính của ứng dụng Express
 */

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');
const PDFDocument = require('pdfkit');
require('dotenv').config();
const morgan = require('morgan');
const multer = require('multer');
const { createObjectCsvWriter } = require('csv-writer');
const db = require('./db');
const gpt = require('./gpt');
const premium = require('./premium');
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

// Môi trường đã được cấu hình bởi dotenv ở trên

// Thư mục lưu PDF trên Render disk
const pdfDir = process.env.NODE_ENV === 'production'
  ? path.join('/mnt/data', 'pdfs')
  : path.join(__dirname, 'pdfs');

// Đảm bảo thư mục PDF tồn tại
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static('public'));
app.use('/pdfs', express.static(pdfDir)); // Serve PDF files

/**
 * API endpoint để lấy lịch sử chat của một user
 * GET /api/chat-history?uid=<user_id>
 */
app.get('/api/chat-history', (req, res) => {
  try {
    const uid = req.query.uid;
    
    if (!uid) {
      return res.status(400).json({ 
        error: "Thiếu tham số uid",
        message: "Vui lòng cung cấp ID người dùng"
      });
    }
    
    console.log(`Đang lấy lịch sử chat cho user ${uid}`);
    
    // Lấy session mới nhất của user
    const latestSession = db.getLatestSessionByUid(uid);
    
    if (!latestSession) {
      return res.status(404).json({
        error: "Không tìm thấy session",
        message: `Không tìm thấy session nào cho user ${uid}`
      });
    }
    
    // Lấy lịch sử chat từ session
    const chatHistory = latestSession.chatHistory || [];
    
    // Trả về lịch sử chat
    res.json({
      user_id: uid,
      session_id: latestSession.id,
      session_timestamp: latestSession.timestamp,
      isPremium: latestSession.isPremium || false,
      messages: chatHistory,
      message_count: chatHistory.length
    });
  } catch (error) {
    console.error(`Lỗi khi lấy lịch sử chat:`, error);
    res.status(500).json({ 
      error: "Lỗi server",
      message: "Có lỗi xảy ra khi lấy lịch sử chat"
    });
  }
});

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
  // Đảm bảo các thư mục cần thiết tồn tại
  if (!fs.existsSync('public/debug-composite')) {
    fs.mkdirSync('public/debug-composite', { recursive: true });
  }

  // Đảm bảo thư mục static tồn tại
  fs.ensureDirSync(path.join(__dirname, 'public'));
  fs.ensureDirSync(path.join(__dirname, 'public', 'images'));
  next();
});

/**
 * Tạo PDF cho kết quả đọc bài
 * @param {Object} sessionData - Dữ liệu phiên đọc bài
 * @returns {Promise<string>} - Đường dẫn tới file PDF
 */
async function generateTarotPDF(sessionData) {
  return new Promise((resolve, reject) => {
    try {
      // Kiểm tra dữ liệu đầu vào
      if (!sessionData || !sessionData.id) {
        throw new Error('Dữ liệu phiên đọc bài không hợp lệ: Thiếu ID');
      }
      
      if (!sessionData.gptResult) {
        throw new Error('Dữ liệu phiên đọc bài không hợp lệ: Thiếu kết quả GPT');
      }
      
      console.log('Bắt đầu tạo PDF cho session:', sessionData.id);
      
      const sessionId = sessionData.id;
      const pdfPath = path.join(pdfDir, `${sessionId}.pdf`);
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(pdfPath);
      
      // Xử lý sự kiện khi đã ghi xong PDF
      stream.on('finish', () => {
        resolve(pdfPath);
      });
      
      // Pipe PDF vào stream
      doc.pipe(stream);
      
      // Sử dụng font mặc định trước
      doc.font('Helvetica');
      
      // Chỉ thử sử dụng font Noto nếu ở môi trường development
      if (process.env.NODE_ENV !== 'production') {
        try {
          // Register and use NotoSans fonts for Vietnamese
          const fontPath = path.join(__dirname, 'fonts');
          const regularFont = path.join(fontPath, 'NotoSans-Regular.ttf');
          const boldFont = path.join(fontPath, 'NotoSans-Bold.ttf');
          
          console.log('Kiểm tra font path:', {
            fontPath,
            regularFont,
            boldFont,
            regularExists: fs.existsSync(regularFont),
            boldExists: fs.existsSync(boldFont)
          });
          
          if (fs.existsSync(regularFont)) {
            try {
              doc.registerFont('NotoRegular', regularFont);
              doc.font('NotoRegular');
              console.log('Sử dụng font NotoRegular');
            } catch (fontError) {
              console.error('Không thể đăng ký font NotoRegular:', fontError.message);
            }
          }
          
          if (fs.existsSync(boldFont)) {
            try {
              doc.registerFont('NotoBold', boldFont);
              console.log('Sử dụng font NotoBold cho tiêu đề');
            } catch (fontError) {
              console.error('Không thể đăng ký font NotoBold:', fontError.message);
            }
          }
        } catch (fontError) {
          console.error('Lỗi khi tải font:', fontError);
          // Tiếp tục với font mặc định
        }
      } else {
        console.log('Chạy trong môi trường production, bỏ qua việc tải font tùy chỉnh');
      }
      
      // Trang bìa - Tiêu đề chính
      try {
        if (process.env.NODE_ENV !== 'production' && doc._fonts['NotoBold']) {
          doc.font('NotoBold').fontSize(24).text('KẾT QUẢ ĐỌC BÀI TAROT', { align: 'center' });
          if (doc._fonts['NotoRegular']) {
            doc.font('NotoRegular');
          } else {
            doc.font('Helvetica');
          }
        } else {
          doc.fontSize(24).text('KẾT QUẢ ĐỌC BÀI TAROT', { align: 'center' });
        }
      } catch (fontErr) {
        console.warn('Lỗi khi sử dụng font tùy chỉnh cho tiêu đề:', fontErr.message);
        doc.font('Helvetica').fontSize(24).text('KẾT QUẢ ĐỌC BÀI TAROT', { align: 'center' });
      }
      
      doc.moveDown(2);
      
      // Thông tin người dùng
      if (sessionData.userInfo) {
        doc.fontSize(14);
        if (sessionData.userInfo.name) {
          doc.text(`Họ và tên: ${sessionData.userInfo.name}`);
        }
        if (sessionData.userInfo.dob) {
          doc.text(`Ngày sinh: ${sessionData.userInfo.dob}`);
        }
        doc.moveDown();
      }
      
      // Câu hỏi
      if (sessionData.question) {
        doc.fontSize(16).text('Câu hỏi:', { underline: true });
        doc.fontSize(14).text(sessionData.question);
        doc.moveDown();
      }
      
      // Ảnh ghép lá bài
      if (sessionData.compositeImageUrl) {
        try {
          // Xác định đường dẫn đến ảnh dựa vào môi trường
          let imagePath;
          // compositeImageUrl thường có dạng /images/composite-session-id.jpg
          // Cần loại bỏ dấu / đầu tiên để tham chiếu đúng từ public
          const relativePath = sessionData.compositeImageUrl.startsWith('/') 
            ? sessionData.compositeImageUrl.substring(1) 
            : sessionData.compositeImageUrl;
            
          if (process.env.NODE_ENV === 'production') {
            // Trong production, ảnh được lưu tại /mnt/data/images
            const filename = path.basename(sessionData.compositeImageUrl);
            imagePath = path.join('/mnt/data', 'images', filename);
            
            // Nếu không tìm thấy, thử đường dẫn thay thế
            if (!fs.existsSync(imagePath)) {
              imagePath = path.join('/mnt/data', relativePath);
            }
          } else {
            // Trong development
            imagePath = path.join(__dirname, 'public', relativePath);
          }
          
          console.log(`Đang thử tải ảnh từ đường dẫn: ${imagePath}`);
          
          // Kiểm tra xem file có tồn tại không
          if (fs.existsSync(imagePath)) {
            doc.image(imagePath, {
              fit: [500, 300],
              align: 'center'
            });
            doc.moveDown();
          } else {
            console.warn(`Không tìm thấy ảnh ghép tại: ${imagePath}`);
            doc.text('[Không tìm thấy ảnh lá bài]', {
              align: 'center'
            });
            doc.moveDown();
          }
        } catch (imgError) {
          console.error('Lỗi khi xử lý ảnh trong PDF:', imgError);
          doc.text('[Lỗi khi tải ảnh lá bài]', {
            align: 'center'
          });
          doc.moveDown();
        }
      }
      
      // Kết quả đọc bài
      if (sessionData.gptResult) {
        try {
          // Tiêu đề thông tin
          if (process.env.NODE_ENV !== 'production' && doc._fonts && doc._fonts['NotoBold']) {
            doc.font('NotoBold').fontSize(14).text('Thông tin:');
            if (doc._fonts['NotoRegular']) {
              doc.font('NotoRegular');
            } else {
              doc.font('Helvetica');
            }
          } else {
            doc.font('Helvetica').fontSize(14).text('Thông tin:');
          }
          
          // Thông tin người dùng
          doc.moveDown(0.5);
          doc.text(`Họ tên: ${sessionData.full_name || sessionData.name || 'Không có thông tin'}`);
          doc.text(`Ngày sinh: ${sessionData.dob ? new Date(sessionData.dob).toLocaleDateString('vi-VN') : 'Không có thông tin'}`);
          doc.text(`Ngày đọc bài: ${new Date(sessionData.timestamp || Date.now()).toLocaleDateString('vi-VN')}`);
          doc.moveDown(2);
        } catch (infoErr) {
          console.warn('Lỗi khi thêm thông tin người dùng:', infoErr.message);
          // Fallback an toàn nếu có lỗi
          doc.font('Helvetica');
          doc.fontSize(14).text('Thông tin:');
          doc.moveDown(0.5);
          doc.text(`Họ tên: ${sessionData.full_name || sessionData.name || 'Không có thông tin'}`);
          doc.text(`Ngày đọc bài: ${new Date(sessionData.timestamp || Date.now()).toLocaleDateString('vi-VN')}`);
          doc.moveDown(2);
        }
        
        // Tiêu đề kết quả đọc bài
        if (process.env.NODE_ENV !== 'production' && doc._fonts && doc._fonts['NotoBold']) {
          doc.font('NotoBold').fontSize(16).text('Kết quả đọc bài:', { underline: true });
          if (doc._fonts['NotoRegular']) {
            doc.font('NotoRegular');
          } else {
            doc.font('Helvetica');
          }
        } else {
          doc.font('Helvetica').fontSize(16).text('Kết quả đọc bài:', { underline: true });
        }
        
        doc.moveDown();
        // Nội dung kết quả
        try {
          doc.text(sessionData.gptResult);
        } catch (resultErr) {
          console.error('Lỗi khi hiển thị kết quả:', resultErr.message);
          // Fallback về font mặc định và thử lại
          doc.font('Helvetica');
          doc.text(sessionData.gptResult || 'Không thể hiển thị kết quả đọc bài. Vui lòng thử lại sau.');
        }
      }
      
      // Chú thích footer
      try {
        const footerText = 'PDF được tạo tự động từ hệ thống đọc bài Tarot';

        // Đảm bảo dùng font mặc định cho footer
        doc.font('Helvetica').fontSize(10).text(footerText, {
          align: 'center'
        }).text(new Date().toLocaleDateString('vi-VN'), {
          align: 'center'
        });
      } catch (footerErr) {
        console.warn('Lỗi khi thêm footer:', footerErr.message);
      }
      
      // Hoàn tất PDF
      doc.end();
      
    } catch (error) {
      console.error('Error generating PDF in server.js:', error);
      console.error('Error details:', JSON.stringify({
        errorMessage: error.message,
        errorStack: error.stack,
        sessionId: sessionData.id,
        compositeImagePath: sessionData.compositeImageUrl,
        environment: process.env.NODE_ENV,
        pdfDirValue: pdfDir
      }));
      reject(error);
    }
  });
}

/**
 * Dọn dẹp các file PDF cũ
 * Xóa các file cũ hơn 30 ngày
 */
function cleanupOldPDFs() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  fs.readdir(pdfDir, (err, files) => {
    if (err) {
      console.error('Error reading PDF directory:', err);
      return;
    }
    
    files.forEach(file => {
      const filePath = path.join(pdfDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(`Error getting stats for file ${file}:`, err);
          return;
        }
        
        if (stats.isFile() && stats.mtime < thirtyDaysAgo) {
          fs.unlink(filePath, err => {
            if (err) console.error(`Error deleting file ${file}:`, err);
            else console.log(`Deleted old PDF: ${file}`);
          });
        }
      });
    });
  });
}

// Chạy dọn dẹp mỗi ngày
setInterval(cleanupOldPDFs, 24 * 60 * 60 * 1000);

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
    
    // Tạo nội dung tin nhắn của người dùng dựa trên các lá bài được chọn
    const userMessage = `Làm ơn đọc bài tarot cho tôi. Các lá bài được rút: ${selectedCards.map(card => card.name).join(', ')}`;
    
    // Tạo phiên mới
    const newSession = db.addSession({
      uid,
      name: full_name,
      dob, 
      cards: selectedCards,
      compositeImage: compositeImageUrl,
      paid: false,
      gptResult: null,
      // Khởi tạo lịch sử chat với tin nhắn đầu tiên là của người dùng
      chatHistory: [{
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString()
      }]
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
app.use('/admin', adminRoutes(db, gpt, upload, generateTarotPDF, pdfDir));

// ========== CHATFUEL WEBHOOK API ==========

/**
 * API Webhook cho Chatfuel
 * POST /api/webhook
 */
app.post('/api/webhook', async (req, res) => {
  try {
    // Ghi log đầy đủ request body để debug
    console.log('============= WEBHOOK REQUEST ==============');
    console.log('Webhook request body:', JSON.stringify(req.body, null, 2));
    console.log('Webhook request headers:', JSON.stringify(req.headers, null, 2));
    
    // Kiểm tra cả trường hợp messenger user id từ Chatfuel
    const uid = req.body.uid || req.body['messenger user id'];
    // Lấy tên và ngày sinh từ request
    const first_name = req.body.first_name || req.body['first name'] || '';
    const last_name = req.body.last_name || req.body['last name'] || '';
    const name = req.body.name && req.body.name !== 'null' ? req.body.name : (first_name && last_name ? `${first_name} ${last_name}` : first_name || 'Khách hàng');
    const dob = req.body.dob && req.body.dob !== 'null' ? req.body.dob : 'không xác định';
    // Chỉ lấy cardCount và bỏ qua full_name và dob
    const cardCount = req.body.cardCount || 3;
    // Lấy session_id nếu có để hỗ trợ lịch sử chat
    const session_id = req.body.session_id && req.body.session_id !== 'null' ? req.body.session_id : null;
    // Lấy query từ người dùng (nếu có)
    const userQuery = req.body.query && req.body.query !== 'null' ? req.body.query : '';
    
    console.log(`Webhook request: uid=${uid}, session_id=${session_id}, query=${userQuery}`);
    
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
    
    // Lấy kết quả đọc bài trực tiếp từ GPT
    let gptResult = null;
    try {
      console.log('Lấy kết quả đọc bài từ GPT...');
      
      // Lấy lịch sử chat của người dùng
      let userHistory = [];
      
      // Nếu có session_id, lấy lịch sử chat từ session đó
      if (session_id) {
        const currentSession = db.getSessionById(session_id);
        if (currentSession && currentSession.chatHistory) {
          console.log(`Lấy lịch sử chat từ session hiện tại ${session_id} (${currentSession.chatHistory.length} tin nhắn)`);
          userHistory = [...currentSession.chatHistory];
          
          // Thêm tin nhắn mới của người dùng vào lịch sử chat nếu có
          if (userQuery) {
            console.log(`Thêm tin nhắn mới của người dùng vào lịch sử: ${userQuery}`);
            await gpt.addToChatHistory(session_id, 'user', userQuery);
            userHistory.push({
              role: 'user',
              content: userQuery,
              timestamp: new Date().toISOString()
            });
          }
        }
      } 
      // Nếu không có session_id, lấy lịch sử chat từ phiên gần nhất
      else {
        const previousSession = db.getLatestSessionByUid(uid);
        if (previousSession && previousSession.chatHistory) {
          console.log(`Lấy lịch sử chat từ phiên trước đó của người dùng ${uid}`);
          userHistory = [...previousSession.chatHistory];
        }
      } 
      
      gptResult = await gpt.generateTarotReading(selectedCards, { name, dob }, userHistory);
      console.log('Kết quả GPT:', gptResult.substring(0, 100) + '...');
      
      // KHÔNG lưu kết quả vào lịch sử chat ở đây - sẽ làm sau khi tạo newSession
      
    } catch (gptError) {
      console.error('Lỗi khi lấy kết quả từ GPT:', gptError);
      // Tiếp tục với gptResult = null
    }
    
    // Tạo nội dung tin nhắn của người dùng
    const userMessage = req.body['last user freeform input'] || `Làm ơn đọc bài tarot cho tôi với ${actualCardCount} lá bài`;
    
    // Tạo session mới - đã có kết quả GPT nhưng chưa thanh toán
    const newSession = db.addSession({
      uid,
      name,
      dob,
      cards: selectedCards,
      compositeImage: compositeImageUrl,
      paid: false, // Chưa đánh dấu thanh toán vì người dùng chưa trả tiền
      gptResult: gptResult,
      // Khởi tạo lịch sử chat với tin nhắn của người dùng và phản hồi của GPT
      chatHistory: [
        {
          role: 'user',
          content: userMessage,
          timestamp: new Date().toISOString()
        },
        ...(gptResult ? [{
          role: 'assistant',
          content: gptResult,
          timestamp: new Date().toISOString()
        }] : [])
      ]
    });
    
    // Chuẩn bị URL cho Chatfuel
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${req.headers.host}` 
      : `http://${req.headers.host}`;
      
    // Trả về thông tin theo định dạng Chatfuel
    // Không gửi từng ảnh lá bài riêng nữa
    
    // Khởi tạo mảng webhookMessages trống
    const webhookMessages = [];
    
    // Thêm kết quả GPT vào response nếu có
    if (gptResult) {
      webhookMessages.push({ "text": gptResult });
    } else {
      webhookMessages.push({ "text": "Không thể lấy kết quả đọc bài. Vui lòng thử lại sau." });
    }
    
    // Thêm ảnh ghép vào response nếu có
    if (compositeImageUrl) {
      webhookMessages.push({
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
      "messages": webhookMessages
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
 * Webhook API cho chat tiếp theo sau khi đọc bài
 * POST /api/webhook/follow-up
 */
app.post('/api/webhook/follow-up', async (req, res) => {
  try {
    // Lấy và xử lý dữ liệu từ Chatfuel, loại bỏ giá trị 'null' dạng chuỗi
    const rawUid = req.body.uid;
    const rawLastUserInput = req.body['last user freeform input'];
    
    const uid = rawUid && rawUid !== 'null' ? rawUid : null;
    const userMessage = rawLastUserInput && rawLastUserInput !== 'null' ? rawLastUserInput : '';
    
    // Log để debug
    console.log(`Raw follow-up data: uid=${rawUid}, last_user_input=${rawLastUserInput}`);
    console.log(`Processed follow-up data: uid=${uid}, userMessage=${userMessage}`);
    
    if (!uid) {
      return res.json({
        "messages": [{ "text": "Thiếu thông tin người dùng" }]
      });
    }
    
    // Nếu không có tin nhắn từ người dùng, trả về thông báo
    if (!userMessage) {
      return res.json({
        "messages": [{ "text": "Vui lòng gửi câu hỏi của bạn" }]
      });
    }
    
    console.log(`Follow-up question for user ${uid}: ${userMessage}`);
    
    // Lấy phiên mới nhất của người dùng dựa trên uid
    const sessionData = db.getLatestSessionByUid(uid);
    if (!sessionData) {
      return res.json({
        "messages": [{ "text": "Không tìm thấy phiên chat cho người dùng này" }]
      });
    }
    
    // Thêm câu hỏi của người dùng vào lịch sử chat
    const session_id = sessionData.id;
    await gpt.addToChatHistory(session_id, 'user', userMessage);
    
    // Lấy lịch sử chat hiện tại
    const chatHistory = gpt.getChatHistory(session_id);
    
    // Đánh giá xem câu hỏi này có cần premium hay không TRƯỚC khi gọi API GPT
    console.log('Evaluating if this conversation needs premium...');
    const premiumEvaluation = await premium.evaluateNeedForPremium(session_id);
    
    // Cập nhật trạng thái premium của session nếu cần
    if (premiumEvaluation.needsPremium) {
      console.log(`Session ${session_id} needs premium upgrade: ${premiumEvaluation.reason}`);
      await premium.updateSessionPremiumStatus(session_id, true);
    }
    
    // Lấy session đã được cập nhật để kiểm tra trạng thái premium
    const updatedSession = db.getSessionById(session_id);
    const needsPremium = updatedSession?.needsPremium === true;
    
    // Nếu người dùng cần premium nhưng chưa thanh toán, đưa ra thông báo giới hạn
    let response;
    if (needsPremium && !updatedSession.paid) {
      // Chuẩn bị phản hồi giới hạn cho người dùng free
      response = "Dựa trên lịch sử chat của bạn, câu hỏi này yêu cầu phân tích chuyên sâu hơn. Vui lòng nâng cấp tài khoản Premium để nhận được câu trả lời chi tiết từ chuyên gia tarot.";
      
      // Lưu phản hồi vào lịch sử chat
      await gpt.addToChatHistory(session_id, 'assistant', response);
    } else {
      // Xử lý câu hỏi bình thường với GPT nếu không cần premium hoặc đã thanh toán
      const config = db.getConfig();
      const model = config.model || 'gpt-3.5-turbo';
      
      // Tạo prompt hệ thống
      const systemPrompt = `Bạn là chuyên gia tarot reader. Hãy trả lời câu hỏi của người dùng dựa trên kết quả đọc bài tarot đã được cung cấp trước đó. Bạn có thể truy cập vào tất cả các tin nhắn trong lịch sử chat.`;
      
      // Tạo messages gửi tới OpenAI
      const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory
      ];
      
      console.log(`Sending ${messages.length} messages to OpenAI, including system prompt`);
      
      // Gọi OpenAI API
      try {
        const openai = require('./gpt').openai;
        const completion = await openai.chat.completions.create({
          model: model,
          messages: messages,
          temperature: 0.7
        });
        
        response = completion.choices[0].message.content;
        
        // Lưu phản hồi vào lịch sử chat
        await gpt.addToChatHistory(session_id, 'assistant', response);
        
      } catch (error) {
        console.error('Error getting follow-up response:', error);
        response = "Rất tiếc, tôi không thể xử lý câu hỏi của bạn lúc này. Vui lòng thử lại sau.";
        await gpt.addToChatHistory(session_id, 'assistant', response);
      }
    }
    
    // Tạo followupMessages cho response
    const followupMessages = [{ "text": response }];
    
    // Nếu cần premium, thêm thông báo nâng cấp
    if (needsPremium && !updatedSession.paid) {
      followupMessages.push({ 
        "text": "\n\n⭐️ *Để nhận được phân tích chuyên sâu hơn về các lá bài tarot và trả lời chi tiết hơn cho câu hỏi của bạn, bạn cần nâng cấp lên tài khoản Premium.* ⭐️" 
      });
      
      // Thêm nút nâng cấp
      followupMessages.push({
        "attachment": {
          "type": "template",
          "payload": {
            "template_type": "button",
            "text": "Nâng cấp ngay để nhận phân tích từ Chuyên gia Tarot",
            "buttons": [
              {
                "type": "web_url",
                "url": `${process.env.PAYMENT_URL || 'https://tarot.example.com/upgrade'}?uid=${uid}`,

                "title": "Nâng cấp Premium"
              }
            ]
          }
        }
      });
    }
    
    // Trả về kết quả - không cần trả về session_id nữa
    res.json({
      "messages": followupMessages,
      "needs_premium": needsPremium
    });
    
  } catch (error) {
    console.error('Error in follow-up API:', error);
    res.json({
      "messages": [{ "text": "Đã xảy ra lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau." }]
    });
  }
});

/**
 * Webhook API Trả kết quả đọc bài
 * POST /api/webhook/result
 */
app.post('/api/webhook/result', async (req, res) => {
  try {
    const { uid } = req.body;
    
    if (!uid) {
      return res.json({
        "messages": [
          { "text": "Thiếu thông tin người dùng" }
        ]
      });
    }
    
    const sessionData = db.getLatestSessionByUid(uid);
    
    if (!sessionData) {
      return res.json({
        "messages": [
          { "text": "Không tìm thấy phiên đọc bài cho người dùng này" }
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
    
    // Tạo file PDF cho kết quả đọc bài
    try {
      // Kiểm tra xem PDF đã tồn tại chưa
      const pdfFileName = `${sessionData.id}.pdf`;
      const pdfFullPath = path.join(pdfDir, pdfFileName);
      
      // Nếu chưa có PDF, tạo mới
      if (!fs.existsSync(pdfFullPath)) {
        await generateTarotPDF(sessionData);
        console.log(`PDF created for session ${sessionData.id}`);
      }
      
      // Tạo URL cho file PDF
      const pdfUrl = `${baseUrl}/pdfs/${pdfFileName}`;
      
      // Thêm kết quả GPT
      messages.push({ "text": sessionData.gptResult });
      
      // Đảm bảo tin nhắn của người dùng và kết quả được lưu vào lịch sử
      // Lấy tin nhắn từ người dùng (nếu có)
      const userQuery = req.body.query || '';
      if (userQuery) {
        await gpt.addToChatHistory(sessionData.id, 'user', userQuery);
      }
      
      // Thêm ảnh ghép vào response nếu có
      if (sessionData.compositeImageUrl) {
        messages.push({ "text": "👆 Here are your three tarot cards" });
        messages.push({
          "attachment": {
            "type": "image",
            "payload": {
              "url": `${baseUrl}${sessionData.compositeImageUrl}`
            }
          }
        });
      }
      
      // Thêm nút tải xuống PDF
      messages.push({
        "attachment": {
          "type": "template",
          "payload": {
            "template_type": "button",
            "text": "Bạn có thể tải xuống kết quả dạng PDF tại đây:",
            "buttons": [
              {
                "type": "web_url",
                "url": pdfUrl,
                "title": "Tải xuống PDF"
              }
            ]
          }
        }
      });
      
    } catch (pdfError) {
      console.error('Error creating PDF:', pdfError);
      // Vẫn tiếp tục trả về kết quả text nếu có lỗi khi tạo PDF
      messages.push({ "text": sessionData.gptResult });
      
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
    }
    
    // Trả về kết quả theo định dạng Chatfuel
    res.json({
      "messages": messages,
      "session_id": session_id // Trả về session_id để hỗ trợ lịch sử chat
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

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
    // Chỉ lấy cardCount và bỏ qua full_name và dob
    const cardCount = req.body.cardCount || 3;
    
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
    
    // Tạo session mới - không cần full_name và dob nữa
    const newSession = db.addSession({
      uid,
      cards: selectedCards,
      compositeImage: compositeImageUrl, // Thêm đường dẫn ảnh ghép
      paid: false,
      gptResult: null, // Kết quả đọc bài chuyên sâu (trả phí)
      basicResult: null, // Kết quả đọc bài cơ bản (miễn phí)
    });
    
    // Chuẩn bị URL cho Chatfuel
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${req.headers.host}` 
      : `http://${req.headers.host}`;
      
    // Tạo phiên đọc bài tarot cơ bản (miễn phí)
    let basicReading = null;
    try {
      // Tạo kết quả đọc bài cơ bản (rút gọn)
      basicReading = await gpt.generateTarotReading(selectedCards, { name: "Bạn", dob: "" });
      console.log('Generated basic tarot reading for webhook');
      
      // Lưu kết quả đọc bài cơ bản vào session
      db.updateSession(newSession.id, { basicResult: basicReading });
    } catch (error) {
      console.error('Error generating basic tarot reading:', error);
      basicReading = "Rất tiếc, không thể tạo kết quả đọc bài lúc này. Vui lòng thử lại sau.";
    }
    
    // Trả về thông tin theo định dạng Chatfuel
    // Khởi tạo mảng messages
    const messages = [];
    
    // Thêm ảnh ghép vào response
    if (compositeImageUrl) {
      messages.push({ "text": "👆 Đây là ba lá bài tarot của bạn" });
      messages.push({
        "attachment": {
          "type": "image",
          "payload": {
            "url": `${baseUrl}${compositeImageUrl}`
          }
        }
      });
    }
    
    // Thêm kết quả đọc bài cơ bản
    if (basicReading) {
      messages.push({ "text": "📜 Kết quả đọc bài cơ bản (miễn phí):" });
      messages.push({ "text": basicReading });
      
      // Thêm nút để chuyển đến phần đọc bài chuyên sâu (trả phí)
      messages.push({
        "attachment": {
          "type": "template",
          "payload": {
            "template_type": "button",
            "text": "Bạn muốn có kết quả đọc bài chuyên sâu và hỏi đáp thêm?",
            "buttons": [
              {
                "type": "show_block",
                "block_names": ["Premium Reading"],
                "title": "Đọc bài chuyên sâu"
              }
            ]
          }
        }
      });
    }
    
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
    
    // Kiểm tra xem phiên đã được thanh toán và có kết quả đọc bài chuyên sâu hay chưa
    if (!sessionData.paid || !sessionData.gptResult) {
      // Nếu không có kết quả chuyên sâu, nhưng có kết quả cơ bản, hiển thị kết quả cơ bản
      if (sessionData.basicResult) {
        return res.json({
          "messages": [
            { "text": "📜 Kết quả đọc bài cơ bản (miễn phí)" },
            { "text": sessionData.basicResult },
            { "text": "Phiên đọc bài chuyên sâu chưa được thanh toán hoặc xử lý. Vui lòng thanh toán để xem kết quả đọc bài chi tiết." }
          ]
        });
      } else {
        // Nếu không có cả kết quả cơ bản và chuyên sâu
        return res.json({
          "messages": [
            { "text": "Phiên đọc bài chưa được xử lý hoặc thanh toán. Vui lòng quay lại sau." }
          ]
        });
      }
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
      
      // Thêm kết quả đọc bài chuyên sâu (trả phí)
      messages.push({ "text": "🔥 Kết quả đọc bài chuyên sâu (trả phí):" });
      messages.push({ "text": sessionData.gptResult });
      
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

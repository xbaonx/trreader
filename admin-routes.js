/**
 * admin-routes.js - Các routes cho phần quản trị
 * Sẽ được import vào file server.js
 */

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { createObjectCsvWriter } = require('csv-writer');

// Export function để tạo router
module.exports = function(db, gpt, upload, generateTarotPDF, pdfDir) {
  const router = express.Router();
  
  /**
   * Trang quản trị admin
   * GET /admin
   */
  router.get('/', (req, res) => {
    try {
      // Giao diện quản trị được render bằng EJS
      res.render('admin', {
        title: 'Quản lý Tarot - Admin Dashboard',
        activeTab: req.query.tab || 'sessions' // Tab mặc định
      });
    } catch (error) {
      console.error('Error in /admin endpoint:', error);
      res.status(500).send('Lỗi máy chủ nội bộ');
    }
  });

  /**
   * Lấy danh sách sessions cho admin
   * GET /admin/data
   */
  router.get('/data', (req, res) => {
    try {
      // Lọc sessions nếu có tham số
      const { uid, startDate, endDate } = req.query;
      
      let sessions;
      if (uid || startDate || endDate) {
        sessions = db.filterSessions({ uid, startDate, endDate });
      } else {
        sessions = db.getAllSessions();
      }
      
      res.json({ success: true, sessions });
    } catch (error) {
      console.error('Error in /admin/data endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Duyệt session và tạo kết quả GPT
   * POST /admin/approve
   */
  router.post('/approve', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID là bắt buộc' });
      }
      
      // Tìm session theo ID
      const session = db.getSessionById(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Không tìm thấy session' });
      }
      
      // Nếu đã thanh toán và có kết quả GPT, trả về kết quả hiện tại
      if (session.paid && session.gptResult) {
        return res.json({ success: true, gptResult: session.gptResult });
      }
      
      // Gọi GPT để tạo kết quả đọc bài
      try {
        const gptResult = await gpt.generateTarotReading(session.cards, session.name, session.dob);
        
        // Cập nhật session
        const updatedSession = db.updateSession(sessionId, {
          paid: true,
          gptResult,
          approvedAt: new Date().toISOString()
        });
        
        res.json({ success: true, gptResult });
      } catch (error) {
        console.error('Error generating GPT result:', error);
        res.status(500).json({ error: 'Lỗi khi tạo kết quả GPT' });
      }
      
    } catch (error) {
      console.error('Error in /admin/approve endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Sửa kết quả GPT
   * POST /admin/edit
   */
  router.post('/edit', (req, res) => {
    try {
      const { sessionId, newText } = req.body;
      
      if (!sessionId || !newText) {
        return res.status(400).json({ error: 'Session ID và nội dung mới là bắt buộc' });
      }
      
      // Tìm và cập nhật session
      const session = db.getSessionById(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Không tìm thấy session' });
      }
      
      const updatedSession = db.updateSession(sessionId, {
        gptResult: newText,
        editedAt: new Date().toISOString()
      });
      
      res.json({ success: true, session: updatedSession });
      
    } catch (error) {
      console.error('Error in /admin/edit endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Xóa session
   * POST /admin/delete
   */
  router.post('/delete', (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID là bắt buộc' });
      }
      
      // Tìm và xóa session
      const session = db.getSessionById(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Không tìm thấy session' });
      }
      
      db.deleteSession(sessionId);
      
      res.json({ success: true });
      
    } catch (error) {
      console.error('Error in /admin/delete endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Lọc sessions
   * POST /admin/filter
   */
  router.post('/filter', (req, res) => {
    try {
      const { uid, startDate, endDate } = req.body;
      
      const sessions = db.filterSessions({ uid, startDate, endDate });
      res.json({ success: true, sessions });
    } catch (error) {
      console.error('Error in /admin/filter endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Tạo hoặc tạo lại file PDF cho kết quả đọc bài
   * POST /admin/generate-pdf
   */
  router.post('/generate-pdf', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID là bắt buộc' });
      }
      
      // Tìm session theo ID
      const sessionData = db.getSessionById(sessionId);
      
      if (!sessionData) {
        return res.status(404).json({ error: 'Không tìm thấy session' });
      }
      
      if (!sessionData.gptResult) {
        return res.status(400).json({ error: 'Session chưa có kết quả đọc bài' });
      }
      
      // Chuẩn bị dữ liệu session đầy đủ trước khi gửi đến hàm generateTarotPDF
      const preparedSessionData = {
        ...sessionData,
        // Đảm bảo các trường quan trọng luôn tồn tại
        id: sessionData.id || sessionId,
        userInfo: {
          name: sessionData.name || sessionData.full_name || 'Khách hàng',
          dob: sessionData.dob || ''
        }
      };
      
      // Kiểm tra compositeImageUrl nếu không tồn tại hoặc không đúng định dạng
      if (!sessionData.compositeImageUrl && sessionData.compositeImage) {
        preparedSessionData.compositeImageUrl = sessionData.compositeImage;
      } else if (!sessionData.compositeImageUrl) {
        // Tạo đường dẫn ảnh mặc định dựa trên ID hoặc các lá bài
        const defaultImagePath = `/images/composite-${sessionData.id}.jpg`;
        preparedSessionData.compositeImageUrl = defaultImagePath;
        console.log(`Không tìm thấy đường dẫn ảnh, sử dụng đường dẫn mặc định: ${defaultImagePath}`);
      }

      // Xóa PDF cũ nếu có
      const pdfFileName = `${sessionData.id}.pdf`;
      const pdfFullPath = path.join(pdfDir, pdfFileName);
      if (fs.existsSync(pdfFullPath)) {
        fs.unlinkSync(pdfFullPath);
      }
      
      // Gọi generateTarotPDF với dữ liệu đã được chuẩn bị
      console.log('Gọi hàm generateTarotPDF với dữ liệu:', JSON.stringify(preparedSessionData, null, 2));
      await generateTarotPDF(preparedSessionData);
      
      // Tạo URL cho file PDF
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? `https://${req.headers.host}` 
        : `http://${req.headers.host}`;
      const pdfUrl = `${baseUrl}/pdfs/${pdfFileName}`;
      
      res.json({ 
        success: true, 
        message: 'Tạo PDF thành công', 
        pdfUrl 
      });
      
    } catch (error) {
      console.error('Error generating PDF in admin-routes.js:', error);
      console.error('Error details:', JSON.stringify({
        errorMessage: error.message,
        errorStack: error.stack,
        sessionId: req.body.sessionId,
        hasGeneratePDF: typeof generateTarotPDF === 'function',
        hasPdfDir: !!pdfDir,
        pdfDirValue: pdfDir
      }));
      
      res.status(500).json({
        error: `Lỗi khi tạo PDF: ${error.message}`,
        details: error.stack ? error.stack.split('\n')[0] : 'Không có thông tin chi tiết'
      });
    }
  });

  /**
   * Xuất danh sách sessions ra CSV
   * GET /admin/export
   */
  router.get('/export', (req, res) => {
    try {
      const sessions = db.getAllSessions();
      
      if (sessions.length === 0) {
        return res.status(404).send('Không có dữ liệu để xuất');
      }
      
      // Tạo đường dẫn tạm thời cho file CSV
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const csvPath = path.join(__dirname, `sessions-${timestamp}.csv`);
      
      // Định nghĩa header cho file CSV
      const csvWriter = createObjectCsvWriter({
        path: csvPath,
        header: [
          { id: 'id', title: 'ID' },
          { id: 'uid', title: 'User ID' },
          { id: 'name', title: 'Họ tên' },
          { id: 'dob', title: 'Ngày sinh' },
          { id: 'timestamp', title: 'Thời gian' },
          { id: 'paid', title: 'Thanh toán' },
          { id: 'cards', title: 'Các lá bài' },
          { id: 'gptResult', title: 'Kết quả đọc bài' }
        ]
      });
      
      // Chuẩn bị dữ liệu để xuất
      const records = sessions.map(session => ({
        id: session.id,
        uid: session.uid,
        name: session.name || '',
        dob: session.dob || '',
        timestamp: session.timestamp,
        paid: session.paid ? 'Đã thanh toán' : 'Chưa thanh toán',
        cards: session.cards ? session.cards.join(', ') : '',
        gptResult: session.gptResult || ''
      }));
      
      // Ghi dữ liệu vào file CSV
      csvWriter.writeRecords(records)
        .then(() => {
          // Đọc file CSV và gửi về client
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename=sessions-${timestamp}.csv`);
          
          const fileStream = fs.createReadStream(csvPath);
          fileStream.pipe(res);
          
          // Xóa file sau khi đã gửi xong
          fileStream.on('end', () => {
            fs.unlink(csvPath, (err) => {
              if (err) console.error('Error deleting CSV file:', err);
            });
          });
        });
    } catch (error) {
      console.error('Error exporting sessions:', error);
      res.status(500).send('Lỗi khi xuất dữ liệu');
    }
  });

  /**
   * Lấy toàn bộ cấu hình
   * GET /admin/config 
   */
  router.get('/config', (req, res) => {
    try {
      const config = db.getConfig();
      res.json({ success: true, config });
    } catch (error) {
      console.error('Error getting config:', error);
      res.status(500).json({ error: 'Lỗi khi lấy cấu hình' });
    }
  });

  /**
   * Lấy toàn bộ cấu hình
   * GET /admin/config
   */
  router.get('/config', (req, res) => {
    try {
      const config = db.getConfig();
      res.json({ success: true, config });
    } catch (error) {
      console.error('Error getting config:', error);
      res.status(500).json({ error: 'Lỗi khi lấy cấu hình' });
    }
  });

  /**
   * Cập nhật toàn bộ cấu hình
   * POST /admin/config
   */
  router.post('/config', (req, res) => {
    try {
      // Lấy các tham số từ body
      const { 
        prompt, 
        responseTemplate, 
        defaultCardCount, 
        model,
        defaultUserInfo,
        premiumPrompt
      } = req.body;
      
      // Tạo đối tượng cấu hình để cập nhật
      const configUpdate = {};
      
      // Thêm các tham số nếu có
      if (prompt !== undefined) configUpdate.prompt = prompt;
      if (responseTemplate !== undefined) configUpdate.responseTemplate = responseTemplate;
      if (defaultCardCount !== undefined) configUpdate.defaultCardCount = parseInt(defaultCardCount, 10) || 3;
      if (model !== undefined) configUpdate.model = model;
      if (defaultUserInfo !== undefined) configUpdate.defaultUserInfo = defaultUserInfo;
      if (premiumPrompt !== undefined) configUpdate.premiumPrompt = premiumPrompt;
      
      // Cập nhật cấu hình
      db.updateConfig(configUpdate);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating config:', error);
      res.status(500).json({ error: 'Lỗi khi cập nhật cấu hình' });
    }
  });

  /**
   * Cấu hình prompt
   * GET /admin/prompt
   */
  router.get('/prompt', (req, res) => {
    try {
      const config = db.getConfig();
      res.json({ success: true, prompt: config.prompt });
    } catch (error) {
      console.error('Error in GET /admin/prompt endpoint:', error);
      res.status(500).json({ error: 'Lỗi khi lấy cấu hình prompt' });
    }
  });

  /**
   * Lưu cấu hình prompt
   * POST /admin/prompt
   */
  router.post('/prompt', (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (prompt === undefined) {
        return res.status(400).json({ error: 'Nội dung prompt là bắt buộc' });
      }
      
      db.updateConfig({ prompt });
      res.json({ success: true });
    } catch (error) {
      console.error('Error in POST /admin/prompt endpoint:', error);
      res.status(500).json({ error: 'Lỗi khi cập nhật prompt' });
    }
  });

  /**
   * Cấu hình template
   * GET /admin/template
   */
  router.get('/template', (req, res) => {
    try {
      const config = db.getConfig();
      res.json({ success: true, template: config.responseTemplate });
    } catch (error) {
      console.error('Error in GET /admin/template endpoint:', error);
      res.status(500).json({ error: 'Lỗi khi lấy cấu hình template' });
    }
  });

  /**
   * Lưu cấu hình template
   * POST /admin/template
   */
  router.post('/template', (req, res) => {
    try {
      const { template } = req.body;
      
      if (template === undefined) {
        return res.status(400).json({ error: 'Nội dung template là bắt buộc' });
      }
      
      db.updateConfig({ responseTemplate: template });
      res.json({ success: true });
    } catch (error) {
      console.error('Error in POST /admin/template endpoint:', error);
      res.status(500).json({ error: 'Lỗi khi cập nhật template' });
    }
  });

  /**
   * API Route 9: Upload card images (hỗ trợ nhiều ảnh cùng lúc)
   * POST /admin/upload-card
   */
  router.post('/upload-card', upload.array('cardImage', 20), (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Không có file ảnh nào được tải lên'
        });
      }

      // Xử lý tất cả các file được upload
      const uploadedCards = req.files.map(file => {
        // Lấy tên lá bài từ tên file
        const cardName = path.parse(file.originalname).name
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
          
        return {
          originalName: file.originalname,
          filename: file.filename,
          cardName: cardName,
          filePath: `/images/${file.filename}`,
          size: file.size
        };
      });
      
      res.json({
        success: true,
        message: `Đã upload thành công ${uploadedCards.length} lá bài`,
        cards: uploadedCards
      });
      
    } catch (error) {
      console.error('Error uploading card:', error);
      res.status(500).json({
        success: false,
        error: 'Lỗi khi tải lên file'
      });
    }
  });

  /**
   * API Route 10: Get cards list
   * GET /admin/cards
   */
  router.get('/cards', (req, res) => {
    try {
      // Sử dụng /mnt/data/images trong môi trường production
      const imageDir = process.env.NODE_ENV === 'production'
        ? path.join('/mnt/data', 'images')
        : path.join(process.cwd(), 'public', 'images');
      const files = fs.readdirSync(imageDir).filter(file => 
        file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')
      );
      
      const cards = files.map(file => {
        // Format display name (convert snake_case to Title Case)
        const displayName = file
          .replace(/\.(jpg|jpeg|png)$/i, '')
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        return {
          filename: file,
          displayName,
          path: `/images/${file}`
        };
      });
      
      res.json({
        success: true,
        cards
      });
      
    } catch (error) {
      console.error('Error getting cards:', error);
      res.status(500).json({
        success: false,
        error: 'Lỗi khi lấy danh sách lá bài'
      });
    }
  });

  /**
   * API Route 11: Delete card image
   * POST /admin/delete-card
   */
  router.post('/delete-card', (req, res) => {
    try {
      const { filename } = req.body;
      
      if (!filename) {
        return res.status(400).json({
          success: false,
          error: 'Tên file lá bài là bắt buộc'
        });
      }
      
      // Kiểm tra và ngăn chặn path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({
          success: false,
          error: 'Tên file không hợp lệ'
        });
      }
      
      // Sử dụng /mnt/data/images trong môi trường production
      const imagePath = process.env.NODE_ENV === 'production'
        ? path.join('/mnt/data', 'images', filename)
        : path.join(process.cwd(), 'public', 'images', filename);
      
      // Kiểm tra file tồn tại
      if (!fs.existsSync(imagePath)) {
        return res.status(404).json({
          success: false,
          error: 'File ảnh không tồn tại'
        });
      }
      
      // Xóa file
      fs.unlinkSync(imagePath);
      
      res.json({
        success: true,
        message: `Đã xóa lá bài ${filename} thành công`
      });
      
    } catch (error) {
      console.error('Error deleting card:', error);
      res.status(500).json({
        success: false,
        error: 'Lỗi khi xóa lá bài'
      });
    }
  });

  return router;
};

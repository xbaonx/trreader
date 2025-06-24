/**
 * admin-routes.js - Các routes cho phần quản trị
 * Sẽ được import vào file server.js
 */

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { createObjectCsvWriter } = require('csv-writer');

// Export function để tạo router
module.exports = function(db, gpt, upload) {
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
        const gptResult = await gpt.generateTarotReading(session.cards);
        
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
      
      // Xóa session
      const success = db.deleteSession(sessionId);
      
      if (!success) {
        return res.status(404).json({ error: 'Không tìm thấy session hoặc không thể xóa' });
      }
      
      res.json({ success: true });
      
    } catch (error) {
      console.error('Error in /admin/delete endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Lọc sessions theo UID hoặc thời gian
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
   * Xuất danh sách sessions ra CSV
   * GET /admin/export
   */
  router.get('/export', (req, res) => {
    try {
      const sessions = db.getAllSessions();
      
      if (sessions.length === 0) {
        return res.status(404).json({ error: 'Không có dữ liệu để xuất' });
      }
      
      // Tạo file CSV tạm thời
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const csvFilePath = path.join(__dirname, `temp_export_${timestamp}.csv`);
      
      const csvWriter = createObjectCsvWriter({
        path: csvFilePath,
        header: [
          { id: 'id', title: 'ID' },
          { id: 'uid', title: 'UID' },
          { id: 'timestamp', title: 'Thời gian' },
          { id: 'paid', title: 'Đã thanh toán' },
          { id: 'cards', title: 'Các lá bài' },
          { id: 'hasResult', title: 'Có kết quả' }
        ]
      });
      
      // Chuẩn bị dữ liệu cho CSV
      const csvData = sessions.map(session => ({
        id: session.id,
        uid: session.uid,
        timestamp: session.timestamp,
        paid: session.paid ? 'Có' : 'Không',
        cards: session.cards.map(card => card.name).join(', '),
        hasResult: session.gptResult ? 'Có' : 'Không'
      }));
      
      // Ghi file CSV
      csvWriter.writeRecords(csvData)
        .then(() => {
          // Gửi file và xóa sau khi hoàn tất
          res.download(csvFilePath, `tarot_sessions_${timestamp}.csv`, (err) => {
            fs.removeSync(csvFilePath); // Xóa file tạm sau khi gửi
            if (err) console.error('Error sending CSV file:', err);
          });
        })
        .catch(error => {
          console.error('Error writing CSV:', error);
          res.status(500).json({ error: 'Lỗi khi tạo file CSV' });
        });
      
    } catch (error) {
      console.error('Error in /admin/export endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Lấy prompt hiện tại
   * GET /admin/prompt
   */
  router.get('/prompt', (req, res) => {
    try {
      const config = db.getConfig();
      res.json({ success: true, prompt: config.prompt });
    } catch (error) {
      console.error('Error in GET /admin/prompt endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Cập nhật prompt
   * POST /admin/prompt
   */
  router.post('/prompt', (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: 'Nội dung prompt là bắt buộc' });
      }
      
      // Cập nhật cấu hình
      const config = db.updateConfig({ prompt });
      res.json({ success: true, config });
      
    } catch (error) {
      console.error('Error in POST /admin/prompt endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Lấy template hiện tại
   * GET /admin/template
   */
  router.get('/template', (req, res) => {
    try {
      const config = db.getConfig();
      res.json({ success: true, template: config.responseTemplate });
    } catch (error) {
      console.error('Error in GET /admin/template endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Cập nhật template
   * POST /admin/template
   */
  router.post('/template', (req, res) => {
    try {
      const { template } = req.body;
      
      if (!template) {
        return res.status(400).json({ error: 'Nội dung template là bắt buộc' });
      }
      
      // Cập nhật cấu hình
      const config = db.updateConfig({ responseTemplate: template });
      res.json({ success: true, config });
      
    } catch (error) {
      console.error('Error in POST /admin/template endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });

  /**
   * Upload lá bài mới
   * POST /admin/upload-card
   */
  router.post('/upload-card', upload.single('cardImage'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Không có file được upload' });
      }
      
      // Trả về thông tin file đã upload
      res.json({
        success: true,
        cardName: req.file.filename,
        path: `/images/${req.file.filename}`
      });
      
    } catch (error) {
      console.error('Error in /admin/upload-card endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });
  
  /**
   * Lấy danh sách các lá bài đã upload
   * GET /admin/cards
   */
  router.get('/cards', (req, res) => {
    try {
      const imageDir = path.join(__dirname, 'public', 'images');
      fs.ensureDirSync(imageDir);
      
      const cardFiles = fs.readdirSync(imageDir).filter(file => 
        file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')
      );
      
      const cards = cardFiles.map(filename => {
        // Format tên hiển thị (chuyển the_fool.jpg -> The Fool)
        const displayName = filename
          .replace(/\.(jpg|jpeg|png)$/i, '')
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
          
        return {
          filename,
          displayName,
          path: `/images/${filename}`
        };
      });
      
      res.json({ success: true, cards });
      
    } catch (error) {
      console.error('Error in /admin/cards endpoint:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  });
  
  return router;
};

/**
 * Config Tab Functions
 * Xử lý các tương tác trên tab cấu hình
 */

// Load config data
function loadConfig() {
  // Load tất cả cấu hình
  axios.get('/admin/config')
    .then(response => {
      if (response.data && response.data.success) {
        const config = response.data.config;
        
        // Cập nhật state
        state.config = config;
        
        // Cập nhật giao diện
        document.getElementById('promptText').value = config.prompt || '';
        document.getElementById('templateText').value = config.responseTemplate || '';
        document.getElementById('defaultCardCount').value = config.defaultCardCount || 3;
        
        // Cập nhật cài đặt model
        const modelSelect = document.getElementById('gptModel');
        if (modelSelect) {
          // Xóa tất cả option cũ
          modelSelect.innerHTML = '';
          
          // Tạo option mới từ danh sách models
          const defaultModels = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'];
          const models = (config.models && Array.isArray(config.models) && config.models.length > 0) ? 
                          config.models : defaultModels;
          
          models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            option.selected = model === config.model;
            modelSelect.appendChild(option);
          });
          
          // Nếu không có model được chọn, chọn mặc định gpt-3.5-turbo
          if (modelSelect.querySelector('option[selected]') === null) {
            const defaultOption = modelSelect.querySelector('option[value="gpt-3.5-turbo"]');
            if (defaultOption) defaultOption.selected = true;
          }
        }
        
        // Cập nhật cài đặt thông tin người dùng
        if (config.defaultUserInfo) {
          document.getElementById('nameRequired').checked = config.defaultUserInfo.nameRequired || false;
          document.getElementById('dobRequired').checked = config.defaultUserInfo.dobRequired || false;
        }
      }
    })
    .catch(error => {
      console.error('Error loading config:', error);
      showToast('Lỗi khi tải cấu hình', 'danger');
    });
    
  // Load template config
  axios.get('/admin/template')
    .then(response => {
      if (response.data && response.data.success) {
        document.getElementById('templateText').value = response.data.template || '';
        state.config.responseTemplate = response.data.template || '';
      }
    })
    .catch(error => {
      console.error('Error loading template config:', error);
      showToast('Lỗi khi tải cấu hình template', 'danger');
    });
}

// Config event bindings
function bindConfigEvents() {
  // Save prompt
  const btnSavePrompt = document.getElementById('btnSavePrompt');
  if (btnSavePrompt) {
    btnSavePrompt.addEventListener('click', () => {
      const prompt = document.getElementById('promptText').value;
      
      axios.post('/admin/prompt', { prompt })
        .then(response => {
          if (response.data && response.data.success) {
            state.config.prompt = prompt;
            showToast('Đã lưu cấu hình prompt thành công!', 'success');
          }
        })
        .catch(error => {
          console.error('Error saving prompt config:', error);
          showToast('Lỗi khi lưu cấu hình prompt', 'danger');
        });
    });
  }
  
  // Save template
  const btnSaveTemplate = document.getElementById('btnSaveTemplate');
  if (btnSaveTemplate) {
    btnSaveTemplate.addEventListener('click', () => {
      const template = document.getElementById('templateText').value;
      
      axios.post('/admin/template', { template })
        .then(response => {
          if (response.data && response.data.success) {
            state.config.responseTemplate = template;
            showToast('Đã lưu cấu hình template thành công!', 'success');
          }
        })
        .catch(error => {
          console.error('Error saving template config:', error);
          showToast('Lỗi khi lưu cấu hình template', 'danger');
        });
    });
  }
  
  // Save model
  const btnSaveModel = document.getElementById('btnSaveModel');
  if (btnSaveModel) {
    btnSaveModel.addEventListener('click', () => {
      const gptModel = document.getElementById('gptModel').value;
      
      axios.post('/admin/config', { model: gptModel })
        .then(response => {
          if (response.data && response.data.success) {
            state.config.model = gptModel;
            showToast('Đã lưu model GPT thành công!', 'success');
          }
        })
        .catch(error => {
          console.error('Error saving model config:', error);
          showToast('Lỗi khi lưu model GPT', 'danger');
        });
    });
  }
  
  // Save other config
  const btnSaveOtherConfig = document.getElementById('btnSaveOtherConfig');
  if (btnSaveOtherConfig) {
    btnSaveOtherConfig.addEventListener('click', () => {
      const defaultCardCount = document.getElementById('defaultCardCount').value;
      const gptModel = document.getElementById('gptModel').value;
      const nameRequired = document.getElementById('nameRequired').checked;
      const dobRequired = document.getElementById('dobRequired').checked;
      
      axios.post('/admin/config', { 
        defaultCardCount: parseInt(defaultCardCount, 10) || 3,
        model: gptModel,
        defaultUserInfo: {
          nameRequired,
          dobRequired
        }
      })
        .then(response => {
          if (response.data && response.data.success) {
            state.config.defaultCardCount = parseInt(defaultCardCount, 10) || 3;
            state.config.model = gptModel;
            if (!state.config.defaultUserInfo) state.config.defaultUserInfo = {};
            state.config.defaultUserInfo.nameRequired = nameRequired;
            state.config.defaultUserInfo.dobRequired = dobRequired;
            showToast('Đã lưu cấu hình thành công!', 'success');
          }
        })
        .catch(error => {
          console.error('Error saving other config:', error);
          showToast('Lỗi khi lưu cấu hình', 'danger');
        });
    });
  }
}

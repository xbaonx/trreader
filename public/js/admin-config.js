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
        document.getElementById('premiumPrompt').value = config.premiumPrompt || '';
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
            if (model === config.model) {
              option.selected = true;
              option.setAttribute('selected', 'selected'); // Thêm bảo đảm chọn đúng
            }
            modelSelect.appendChild(option);
          });
          
          // Nếu không có model được chọn, chọn mặc định gpt-3.5-turbo
          if (modelSelect.querySelector('option[selected="selected"]') === null) {
            // Thử tìm model mặc định
            let defaultOption = modelSelect.querySelector('option[value="gpt-3.5-turbo"]');
            if (defaultOption) {
              defaultOption.selected = true;
              defaultOption.setAttribute('selected', 'selected');
            } else if (modelSelect.options.length > 0) {
              // Nếu không có gpt-3.5-turbo, chọn option đầu tiên
              modelSelect.options[0].selected = true;
              modelSelect.options[0].setAttribute('selected', 'selected');
            }
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
  
  // Save premium prompt
  const btnSavePremiumPrompt = document.getElementById('btnSavePremiumPrompt');
  if (btnSavePremiumPrompt) {
    btnSavePremiumPrompt.addEventListener('click', () => {
      const premiumPrompt = document.getElementById('premiumPrompt').value;
      
      axios.post('/admin/config', { premiumPrompt })
        .then(response => {
          if (response.data && response.data.success) {
            state.config.premiumPrompt = premiumPrompt;
            showToast('Đã lưu cấu hình Premium Prompt thành công!', 'success');
          }
        })
        .catch(error => {
          console.error('Error saving premium prompt config:', error);
          showToast('Lỗi khi lưu cấu hình Premium Prompt', 'danger');
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
            
            // Làm mới dropdown để hiển thị giá trị được chọn
            const modelSelect = document.getElementById('gptModel');
            if (modelSelect) {
              // Đặt lại giá trị selected cho tất cả option
              Array.from(modelSelect.options).forEach(option => {
                option.selected = (option.value === gptModel);
                if (option.selected) {
                  option.setAttribute('selected', 'selected');
                } else {
                  option.removeAttribute('selected');
                }
              });
            }
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

/**
 * Config Tab Functions
 * Xử lý các tương tác trên tab cấu hình
 */

// Load config data
function loadConfig() {
  // Load prompt config
  axios.get('/admin/prompt')
    .then(response => {
      if (response.data && response.data.success) {
        document.getElementById('promptText').value = response.data.prompt || '';
        state.config.prompt = response.data.prompt || '';
      }
    })
    .catch(error => {
      console.error('Error loading prompt config:', error);
      showToast('Lỗi khi tải cấu hình prompt', 'danger');
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
  
  // Save other config
  const btnSaveOtherConfig = document.getElementById('btnSaveOtherConfig');
  if (btnSaveOtherConfig) {
    btnSaveOtherConfig.addEventListener('click', () => {
      const defaultCardCount = document.getElementById('defaultCardCount').value;
      const enableCardRandomization = document.getElementById('enableCardRandomization').checked;
      
      axios.post('/admin/config', { 
        defaultCardCount: parseInt(defaultCardCount, 10) || 3,
        enableCardRandomization
      })
        .then(response => {
          if (response.data && response.data.success) {
            state.config.defaultCardCount = parseInt(defaultCardCount, 10) || 3;
            state.config.enableCardRandomization = enableCardRandomization;
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

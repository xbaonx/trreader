/**
 * Cards Tab Functions
 * Xử lý các tương tác trên tab quản lý thẻ bài
 */

// Load cards data
function loadCards() {
  const cardsGrid = document.getElementById('cardsGrid');
  cardsGrid.innerHTML = '<div class="loading"></div>';
  
  axios.get('/admin/cards')
    .then(response => {
      if (response.data && response.data.success) {
        state.cards = response.data.cards;
        renderCards();
      }
    })
    .catch(error => {
      console.error('Error loading cards:', error);
      cardsGrid.innerHTML = '<div class="text-center text-danger">Lỗi khi tải dữ liệu thẻ bài</div>';
    });
}

// Render cards grid
function renderCards() {
  const cardsGrid = document.getElementById('cardsGrid');
  
  if (state.cards.length === 0) {
    cardsGrid.innerHTML = '<div class="text-center">Không có thẻ bài nào</div>';
    return;
  }
  
  let html = '';
  state.cards.forEach(card => {
    html += `
      <div class="card-item">
        <img src="${card.path}" alt="${card.displayName}" class="card-preview" 
          onclick="previewCard('${card.path}', '${card.displayName}')">
        <div class="card-name">${card.displayName}</div>
        <button class="btn btn-sm btn-danger delete-card" 
          onclick="deleteCard('${card.filename}', '${card.displayName}')">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
  });
  
  cardsGrid.innerHTML = html;
}

// Preview card in modal
function previewCard(imagePath, cardName) {
  const cardPreviewImage = document.getElementById('cardPreviewImage');
  const cardPreviewTitle = document.getElementById('cardPreviewTitle');
  
  cardPreviewImage.src = imagePath;
  cardPreviewTitle.textContent = cardName;
  
  const cardPreviewModal = new bootstrap.Modal(document.getElementById('cardPreviewModal'));
  cardPreviewModal.show();
}

// Delete card function
function deleteCard(filename, displayName) {
  if (confirm(`Bạn có chắc chắn muốn xóa lá bài "${displayName}"?`)) {
    const deleteResult = document.getElementById('deleteResult');
    if (deleteResult) {
      deleteResult.className = 'alert alert-info mt-2';
      deleteResult.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xóa lá bài...';
      deleteResult.classList.remove('hidden');
    }
    
    axios.post('/admin/delete-card', { filename })
      .then(response => {
        if (response.data && response.data.success) {
          if (deleteResult) {
            deleteResult.className = 'alert alert-success mt-2';
            deleteResult.innerHTML = `<i class="fas fa-check-circle"></i> ${response.data.message || 'Đã xóa thành công'}`;
          }
          // Reload cards after successful deletion
          loadCards();
        } else {
          if (deleteResult) {
            deleteResult.className = 'alert alert-danger mt-2';
            deleteResult.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${response.data.error || 'Lỗi không xác định'}`;
          }
        }
      })
      .catch(error => {
        console.error('Error deleting card:', error);
        if (deleteResult) {
          deleteResult.className = 'alert alert-danger mt-2';
          deleteResult.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${error.response?.data?.error || 'Lỗi khi xóa lá bài'}`;
        }
      });
  }
}

// Card event bindings
function bindCardEvents() {
  // Upload card form
  const uploadCardForm = document.getElementById('uploadCardForm');
  if (uploadCardForm) {
    uploadCardForm.addEventListener('submit', function(event) {
      event.preventDefault();
      
      const uploadResult = document.getElementById('uploadResult');
      uploadResult.className = 'alert alert-info mt-2';
      uploadResult.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải lên...';
      uploadResult.classList.remove('hidden');
      
      const formData = new FormData(this);
      const fileInput = document.getElementById('cardImage');
      
      // Kiểm tra số lượng file được chọn
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        uploadResult.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tải lên ${fileInput.files.length} file...`;
      }
      
      axios.post('/admin/upload-card', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
        .then(response => {
          if (response.data && response.data.success) {
            uploadResult.className = 'alert alert-success mt-2';
            
            // Hiển thị thông báo với số lượng lá bài đã upload
            uploadResult.innerHTML = `<i class="fas fa-check-circle"></i> ${response.data.message || 'Đã tải lên thành công'}`;
            
            // Hiển thị danh sách các file đã tải lên
            if (response.data.cards && response.data.cards.length > 0) {
              let fileList = '<ul class="mt-2 text-left">';
              response.data.cards.forEach(card => {
                fileList += `<li>${card.cardName}</li>`;
              });
              fileList += '</ul>';
              
              uploadResult.innerHTML += fileList;
            }
            
            // Reset form
            uploadCardForm.reset();
            
            // Reload cards
            loadCards();
          } else {
            uploadResult.className = 'alert alert-danger mt-2';
            uploadResult.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${response.data.error || 'Lỗi không xác định'}`;
          }
        })
        .catch(error => {
          console.error('Error uploading card:', error);
          uploadResult.className = 'alert alert-danger mt-2';
          uploadResult.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${error.response?.data?.error || 'Lỗi khi tải lên thẻ bài'}`;
        });
    });
  }
}

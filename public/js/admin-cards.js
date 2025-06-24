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
      
      axios.post('/admin/upload-card', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
        .then(response => {
          if (response.data && response.data.success) {
            uploadResult.className = 'alert alert-success mt-2';
            uploadResult.innerHTML = `<i class="fas fa-check-circle"></i> Đã tải lên thành công thẻ bài "${response.data.cardName}"`;
            
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

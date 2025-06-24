/**
 * Admin Dashboard JavaScript
 * Xử lý các tương tác trên giao diện quản trị
 */

// State management
const state = {
  sessions: [],
  currentSession: null,
  config: {
    prompt: '',
    responseTemplate: '',
    defaultCardCount: 3,
    enableCardRandomization: true
  },
  cards: []
};

// DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize tabs
  const triggerTabList = [].slice.call(document.querySelectorAll('#adminTabs a'));
  triggerTabList.forEach(tabTrigger => {
    tabTrigger.addEventListener('click', event => {
      event.preventDefault();
      const tabId = event.target.getAttribute('href');
      if (tabId === '#sessions') {
        loadSessions();
      } else if (tabId === '#config') {
        loadConfig();
      } else if (tabId === '#cards') {
        loadCards();
      }
    });
  });

  // Initialize based on active tab
  const activeTab = document.querySelector('#adminTabs a.active');
  if (activeTab) {
    const tabId = activeTab.getAttribute('href');
    if (tabId === '#sessions') {
      loadSessions();
    } else if (tabId === '#config') {
      loadConfig();
    } else if (tabId === '#cards') {
      loadCards();
    }
  } else {
    // Default to sessions tab if none active
    loadSessions();
  }

  // Event bindings
  bindSessionEvents();
  bindConfigEvents();
  bindCardEvents();
});

// Utility functions
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('vi-VN');
}

function showToast(message, type = 'success') {
  // Kiểm tra nếu đã có toast container
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }

  const toastId = `toast-${Date.now()}`;
  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center text-white bg-${type}" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;
  
  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, { autohide: true, delay: 3000 });
  toast.show();
  
  // Tự động xóa element sau khi toast biến mất
  toastElement.addEventListener('hidden.bs.toast', () => {
    toastElement.remove();
  });
}

// Session management
function loadSessions() {
  const sessionsList = document.getElementById('sessionsList');
  sessionsList.innerHTML = '<tr><td colspan="7" class="text-center"><div class="loading"></div></td></tr>';
  
  axios.get('/admin/data')
    .then(response => {
      if (response.data && response.data.success) {
        state.sessions = response.data.sessions;
        renderSessions();
      }
    })
    .catch(error => {
      console.error('Error loading sessions:', error);
      sessionsList.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Lỗi khi tải dữ liệu</td></tr>';
    });
}

function renderSessions() {
  const sessionsList = document.getElementById('sessionsList');
  
  if (state.sessions.length === 0) {
    sessionsList.innerHTML = '<tr><td colspan="7" class="text-center">Không có phiên đọc bài nào</td></tr>';
    return;
  }
  
  let html = '';
  state.sessions.forEach(session => {
    const cardNames = session.cards.map(card => card.name).join(', ');
    const statusClass = session.paid ? 'badge-paid' : 'badge-unpaid';
    const statusText = session.paid ? 'Đã thanh toán' : 'Chưa thanh toán';
    const hasResult = session.gptResult ? 'Có kết quả' : 'Chưa có';
    
    html += `
      <tr data-id="${session.id}">
        <td>${session.id.slice(0, 8)}...</td>
        <td>${session.uid}</td>
        <td>${formatDate(session.timestamp)}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td title="${cardNames}">${cardNames.length > 30 ? cardNames.substring(0, 30) + '...' : cardNames}</td>
        <td>${hasResult}</td>
        <td>
          <button class="btn btn-sm btn-info btn-view" data-id="${session.id}">
            <i class="fas fa-eye"></i> Chi tiết
          </button>
        </td>
      </tr>
    `;
  });
  
  sessionsList.innerHTML = html;
  
  // Add event listeners to view buttons
  document.querySelectorAll('.btn-view').forEach(btn => {
    btn.addEventListener('click', event => {
      const sessionId = event.target.closest('button').getAttribute('data-id');
      viewSession(sessionId);
    });
  });
}

function viewSession(sessionId) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  
  state.currentSession = session;
  
  // Populate modal
  document.getElementById('modalSessionId').textContent = session.id;
  document.getElementById('modalSessionUid').textContent = session.uid;
  document.getElementById('modalSessionTime').textContent = formatDate(session.timestamp);
  document.getElementById('modalSessionPaid').textContent = session.paid ? 'Đã thanh toán' : 'Chưa thanh toán';
  
  // Cards
  const cardsContainer = document.getElementById('modalSessionCards');
  cardsContainer.innerHTML = '';
  session.cards.forEach(card => {
    const cardImg = document.createElement('img');
    cardImg.src = card.image;
    cardImg.alt = card.name;
    cardImg.className = 'card-preview';
    cardImg.title = card.name;
    cardImg.addEventListener('click', () => previewCard(card.image, card.name));
    cardsContainer.appendChild(cardImg);
  });
  
  // GPT result
  const gptResultText = document.getElementById('gptResultText');
  gptResultText.value = session.gptResult || '';
  
  // Show/hide buttons based on status
  const btnApprove = document.getElementById('btnApprove');
  btnApprove.style.display = (!session.paid || !session.gptResult) ? 'block' : 'none';
  
  // Show modal
  const sessionModal = new bootstrap.Modal(document.getElementById('sessionModal'));
  sessionModal.show();
}

// Session event bindings
function bindSessionEvents() {
  // Filter sessions
  const btnFilter = document.getElementById('btnFilter');
  const btnResetFilter = document.getElementById('btnResetFilter');
  
  if (btnFilter) {
    btnFilter.addEventListener('click', () => {
      const uid = document.getElementById('filterUid').value;
      const startDate = document.getElementById('filterStartDate').value;
      const endDate = document.getElementById('filterEndDate').value;
      
      axios.post('/admin/filter', { uid, startDate, endDate })
        .then(response => {
          if (response.data && response.data.success) {
            state.sessions = response.data.sessions;
            renderSessions();
            showToast(`Đã tìm thấy ${state.sessions.length} kết quả`, 'info');
          }
        })
        .catch(error => {
          console.error('Error filtering sessions:', error);
          showToast('Lỗi khi lọc phiên đọc bài', 'danger');
        });
    });
  }
  
  if (btnResetFilter) {
    btnResetFilter.addEventListener('click', () => {
      document.getElementById('filterUid').value = '';
      document.getElementById('filterStartDate').value = '';
      document.getElementById('filterEndDate').value = '';
      loadSessions();
    });
  }
  
  // Modal buttons
  const btnApprove = document.getElementById('btnApprove');
  const btnSave = document.getElementById('btnSave');
  const btnDelete = document.getElementById('btnDelete');
  
  if (btnApprove) {
    btnApprove.addEventListener('click', () => {
      if (!state.currentSession) return;
      
      btnApprove.disabled = true;
      btnApprove.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
      
      axios.post('/admin/approve', { sessionId: state.currentSession.id })
        .then(response => {
          if (response.data && response.data.success) {
            document.getElementById('gptResultText').value = response.data.gptResult;
            btnApprove.style.display = 'none';
            showToast('Đã tạo kết quả GPT thành công!', 'success');
            
            // Update session in state
            const sessionIndex = state.sessions.findIndex(s => s.id === state.currentSession.id);
            if (sessionIndex !== -1) {
              state.sessions[sessionIndex].paid = true;
              state.sessions[sessionIndex].gptResult = response.data.gptResult;
              state.currentSession = state.sessions[sessionIndex];
            }
            
            renderSessions();
          }
        })
        .catch(error => {
          console.error('Error approving session:', error);
          showToast('Lỗi khi tạo kết quả GPT', 'danger');
        })
        .finally(() => {
          btnApprove.disabled = false;
          btnApprove.innerHTML = '<i class="fas fa-check"></i> Duyệt và Tạo Kết Quả';
        });
    });
  }
  
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      if (!state.currentSession) return;
      
      const newText = document.getElementById('gptResultText').value;
      
      axios.post('/admin/edit', { sessionId: state.currentSession.id, newText })
        .then(response => {
          if (response.data && response.data.success) {
            showToast('Đã lưu thay đổi thành công!', 'success');
            
            // Update session in state
            const sessionIndex = state.sessions.findIndex(s => s.id === state.currentSession.id);
            if (sessionIndex !== -1) {
              state.sessions[sessionIndex].gptResult = newText;
              state.currentSession = state.sessions[sessionIndex];
            }
          }
        })
        .catch(error => {
          console.error('Error saving session:', error);
          showToast('Lỗi khi lưu thay đổi', 'danger');
        });
    });
  }
  
  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      if (!state.currentSession) return;
      
      if (confirm('Bạn có chắc chắn muốn xóa phiên đọc bài này?')) {
        axios.post('/admin/delete', { sessionId: state.currentSession.id })
          .then(response => {
            if (response.data && response.data.success) {
              showToast('Đã xóa phiên đọc bài thành công!', 'success');
              
              // Close modal and reload sessions
              const sessionModal = bootstrap.Modal.getInstance(document.getElementById('sessionModal'));
              sessionModal.hide();
              
              // Update state
              state.sessions = state.sessions.filter(s => s.id !== state.currentSession.id);
              state.currentSession = null;
              renderSessions();
            }
          })
          .catch(error => {
            console.error('Error deleting session:', error);
            showToast('Lỗi khi xóa phiên đọc bài', 'danger');
          });
      }
    });
  }
}

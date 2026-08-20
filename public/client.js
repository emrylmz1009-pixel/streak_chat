let socket;
let currentUser = null;
let activeChat = null;
let typingTimeout = null;
let countdownInterval = null;
let selectedMediaData = null;
let currentMobileScreen = 'list'; // 'list', 'chat', 'info'

// Voice Recorder variables
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// 10 Features variables
let selectedDocData = null; // Holds Base64 document content
let selectedDocName = '';
let selectedDocSize = 0;
let viewOnceActive = false;
let editingMessageId = null;
let quotedMessage = null;
let sidebarHidden = false;

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  // Detect APK WebView and apply apk-mode class
  if (navigator.userAgent.includes('StreakChatApp')) {
    document.body.classList.add('apk-mode');
  }
  window.addEventListener('resize', updateMobileView);
  checkAdminPersisted();
  checkThemePersisted();
  await detectIp();
  await checkAutoLogin();
});

// Detect client IP address
async function detectIp() {
  try {
    const res = await fetch('/api/ip');
    const data = await res.json();
    document.getElementById('detected-ip-val').innerText = data.ip;
  } catch (err) {
    console.error('Error detecting IP:', err);
    document.getElementById('detected-ip-val').innerText = '127.0.0.1';
  }
}

// Auto-Login Check via IP address
async function checkAutoLogin() {
  try {
    const res = await fetch('/api/auth/auto-login', { method: 'POST' });
    const data = await res.json();
    
    if (data.loggedIn && data.user) {
      currentUser = data.user;
      localStorage.setItem('streak_chat_user', JSON.stringify(currentUser));
      
      document.getElementById('auth-screen').classList.add('hidden');
      renderProfile();
      initSocket();
      await loadChats();
      updateMobileView();
    } else {
      document.getElementById('auth-screen').classList.remove('hidden');
    }
  } catch (err) {
    console.error('Auto-login check failed:', err);
    document.getElementById('auth-screen').classList.remove('hidden');
  }
}

// Switch Login/Register Tabs
function switchAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const errBox = document.getElementById('auth-error-msg');
  
  errBox.classList.add('hidden');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    
    tabLogin.className = 'w-1/2 py-2 text-indigo-400 border-b-2 border-indigo-500 focus:outline-none';
    tabRegister.className = 'w-1/2 py-2 text-slate-400 hover:text-white border-b-2 border-transparent focus:outline-none';
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    
    tabLogin.className = 'w-1/2 py-2 text-slate-400 hover:text-white border-b-2 border-transparent focus:outline-none';
    tabRegister.className = 'w-1/2 py-2 text-indigo-400 border-b-2 border-indigo-500 focus:outline-none';
  }
}

// Handle Register Form Submission
async function handleRegisterSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value.trim();
  const errBox = document.getElementById('auth-error-msg');
  
  errBox.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password })
    });
    
    const data = await res.json();
    if (!res.ok) {
      errBox.innerText = data.error || 'Kayıt sırasında hata oluştu.';
      errBox.classList.remove('hidden');
      return;
    }

    currentUser = data;
    localStorage.setItem('streak_chat_user', JSON.stringify(currentUser));
    
    document.getElementById('auth-screen').classList.add('hidden');
    renderProfile();
    initSocket();
    await loadChats();
    updateMobileView();
  } catch (err) {
    console.error('Registration failed:', err);
    errBox.innerText = 'Bağlantı hatası oluştu.';
    errBox.classList.remove('hidden');
  }
}

// Handle Login Form Submission
async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errBox = document.getElementById('auth-error-msg');
  
  errBox.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (!res.ok) {
      errBox.innerText = data.error || 'Giriş sırasında hata oluştu.';
      errBox.classList.remove('hidden');
      return;
    }

    currentUser = data;
    localStorage.setItem('streak_chat_user', JSON.stringify(currentUser));
    
    document.getElementById('auth-screen').classList.add('hidden');
    renderProfile();
    initSocket();
    await loadChats();
    updateMobileView();
  } catch (err) {
    console.error('Login failed:', err);
    errBox.innerText = 'Bağlantı hatası oluştu.';
    errBox.classList.remove('hidden');
  }
}

// Handle Logout Action
async function handleLogout() {
  if (!confirm('Çıkış yapmak istediğinizden emin misiniz? IP otomatik girişiniz temizlenecektir.')) return;
  
  try {
    if (currentUser) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
    }
  } catch (err) {
    console.error('Logout API failed:', err);
  }

  localStorage.clear();
  window.location.reload();
}

async function refreshUserProfile() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/users/${currentUser.id}`);
    if (res.ok) {
      const user = await res.json();
      currentUser = user;
      localStorage.setItem('streak_chat_user', JSON.stringify(user));
      renderProfile();
    } else {
      localStorage.clear();
      window.location.reload();
    }
  } catch (err) {
    console.error('Error refreshing profile:', err);
    renderProfile(); // Fallback to cached
  }
}

function renderProfile() {
  if (!currentUser) return;
  document.getElementById('user-name').innerText = currentUser.name;
  document.getElementById('user-avatar').innerText = currentUser.name.split(' ').map(n => n[0]).join('');
  document.getElementById('user-code-display').innerText = currentUser.code;
  document.getElementById('user-code-header').innerText = currentUser.code;
  document.getElementById('user-freezes-header').innerText = currentUser.streakFreezes;
  document.getElementById('mobile-code-val').innerText = currentUser.code;
  document.getElementById('mobile-freezes-val').innerText = currentUser.streakFreezes;
  document.getElementById('profile-summary').classList.remove('hidden');

  // Render Badges
  const badgesContainer = document.getElementById('user-badges');
  badgesContainer.innerHTML = '';
  if (currentUser.badges && currentUser.badges.length > 0) {
    currentUser.badges.forEach(badge => {
      const badgeElem = document.createElement('span');
      badgeElem.className = 'px-2 py-0.5 rounded text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-900 flex items-center gap-1';
      
      let badgeLabel = 'Rozet';
      if (badge === '7-day') badgeLabel = '7 Gün 🚀';
      else if (badge === '30-day') badgeLabel = '30 Gün 🛡️';
      else if (badge === '100-day') badgeLabel = '100 Gün 👑';
      
      badgeElem.innerHTML = badgeLabel;
      badgesContainer.appendChild(badgeElem);
    });
  } else {
    badgesContainer.innerHTML = '<span class="text-xs text-slate-500 italic">Henüz rozet kazanılmadı</span>';
  }
}

// Socket.io Setup
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to server');
    if (currentUser) {
      socket.emit('register-user', { userId: currentUser.id });
    }
  });

  socket.on('message', (msg) => {
    if (activeChat && msg.chatId === activeChat.id) {
      appendMessage(msg);
      scrollToBottom();

      // Send read confirmation if we are receiving a message in active view
      if (msg.senderId !== currentUser.id) {
        socket.emit('read-messages', { chatId: activeChat.id, userId: currentUser.id });
      }
    }
  });

  socket.on('messages-read', (data) => {
    if (activeChat && data.chatId === activeChat.id) {
      // Reload messages list to update tick indicators
      refreshMessages();
    }
  });

  socket.on('message-updated', (updatedMsg) => {
    if (activeChat && updatedMsg.chatId === activeChat.id) {
      refreshMessages();
    }
  });

  socket.on('streak-update', async (data) => {
    if (activeChat && data.chat.id === activeChat.id) {
      activeChat = {
        ...activeChat,
        ...data.chat
      };
      
      updateStreakPanel();

      if (data.users) {
        if (data.users.u1 && data.users.u1.id === currentUser.id) {
          currentUser = data.users.u1;
        } else if (data.users.u2 && data.users.u2.id === currentUser.id) {
          currentUser = data.users.u2;
        }
        localStorage.setItem('streak_chat_user', JSON.stringify(currentUser));
        renderProfile();
      } else {
        await refreshUserProfile();
      }
    }
  });

  socket.on('typing', (data) => {
    if (activeChat && data.userId !== currentUser.id) {
      const typingInd = document.getElementById('typing-indicator');
      typingInd.innerText = `${data.name} yazıyor...`;
      typingInd.classList.remove('hidden');
      
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        typingInd.classList.add('hidden');
      }, 3000);
    }
  });

  socket.on('match-created', (data) => {
    if (data.user1Id === currentUser.id || data.user2Id === currentUser.id) {
      loadChats();
    }
  });

  socket.on('chat-list-updated', () => {
    loadChats();
  });

  socket.on('chat-cleared', (data) => {
    if (activeChat && data.chatId === activeChat.id) {
      document.getElementById('messages-container').innerHTML = '';
      appendMessage({
        isSystem: true,
        text: 'Sohbet geçmişi temizlendi.'
      });
      loadChats();
    }
  });



  socket.on('draw-line', (data) => {
    if (activeChat && data.chatId === activeChat.id) {
      const container = document.getElementById('whiteboard-container');
      if (container && container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        setupWhiteboardCanvas();
      }
      drawOnCanvas(data.x, data.y, data.prevX, data.prevY, data.color, data.width);
    }
  });

  socket.on('clear-board', (data) => {
    if (activeChat && data.chatId === activeChat.id) {
      if (canvasContext && canvasElement) {
        canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
      }
    }
  });
}

// Fetch and Render Chats Sidebar
async function loadChats() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/chats/${currentUser.id}`);
    const chats = await res.json();

    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';

    if (chats.length === 0) {
      chatList.innerHTML = '<div class="text-slate-500 text-sm italic p-4 text-center">Aktif eşleşme bulunamadı</div>';
      return;
    }

    chats.forEach(chat => {
      const isSelected = activeChat && activeChat.id === chat.id;
      const item = document.createElement('div');
      item.className = `p-3 rounded-lg cursor-pointer transition-colors flex justify-between items-center ${
        isSelected ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/40 text-slate-350'
      }`;
      item.onclick = () => selectChat(chat.id);

      const hasStreak = chat.streakCount > 0;

      item.innerHTML = `
        <div class="flex items-center gap-2.5 overflow-hidden">
          <div class="w-8 h-8 rounded-full bg-slate-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
            ${chat.partnerName.split(' ').map(n => n[0]).join('')}
          </div>
          <div class="overflow-hidden">
            <div class="font-semibold text-sm truncate flex items-center gap-1">
              <span>${chat.partnerName}</span>
            </div>
            <div class="text-xs text-slate-400 truncate">${chat.lastMessage}</div>
          </div>
        </div>
        <div class="flex flex-col items-end shrink-0 ml-2">
          ${hasStreak ? `
            <div class="flex items-center gap-0.5 text-xs text-orange-500 font-extrabold bg-orange-950/40 border border-orange-900/30 px-1.5 py-0.5 rounded-full">
              <i class="fa-solid fa-fire animate-pulse text-[10px]"></i> ${chat.streakCount}
            </div>
          ` : `
            <div class="text-[10px] text-slate-500 border border-slate-850 px-1.5 py-0.5 rounded-full">0 🔥</div>
          `}
          <span class="text-[9px] text-slate-500 mt-1">${formatTimeAgo(chat.lastMessageTime)}</span>
        </div>
      `;
      chatList.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading chats:', err);
  }
}

// Select a Chat and Open Room
async function selectChat(chatId) {
  if (countdownInterval) clearInterval(countdownInterval);

  try {
    const chatListRes = await fetch(`/api/chats/${currentUser.id}`);
    const chats = await chatListRes.json();
    const chatObj = chats.find(c => c.id === chatId);
    if (!chatObj) return;

    activeChat = chatObj;

    socket.emit('join-chat', { chatId });

    document.getElementById('chat-empty-state').classList.add('hidden');
    document.getElementById('chat-active-view').classList.remove('hidden');
    
    document.getElementById('partner-name').innerText = activeChat.partnerName;
    document.getElementById('partner-code-sub').innerText = `Kod: ${activeChat.partnerCode}`;
    document.getElementById('partner-avatar').innerText = activeChat.partnerName.split(' ').map(n => n[0]).join('');



    // Refresh messages
    await refreshMessages();

    // Confirm read receipts
    socket.emit('read-messages', { chatId, userId: currentUser.id });

    document.getElementById('chat-info-panel').classList.remove('hidden');
    updateStreakPanel();
    startCountdown();
    sidebarHidden = true;
    if (document.body.classList.contains('apk-mode')) {
      document.body.classList.add('sidebar-hidden');
    }
    navigateMobile('chat');
  } catch (err) {
    console.error('Error selecting chat:', err);
  }
}

async function refreshMessages() {
  if (!activeChat) return;
  try {
    const msgRes = await fetch(`/api/chats/${activeChat.id}/messages`);
    const messages = await msgRes.json();
    
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = '';
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();
  } catch (err) {
    console.error('Error refreshing messages:', err);
  }
}



// Start match via code submission
async function startMatch() {
  const matchCodeInput = document.getElementById('match-code-input');
  const code = matchCodeInput.value.trim();
  const errorEl = document.getElementById('match-error');
  errorEl.classList.add('hidden');

  if (!code) {
    errorEl.innerText = 'Lütfen geçerli bir kod girin.';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, matchCode: code })
    });

    const data = await res.json();
    if (!res.ok) {
      errorEl.innerText = data.error || 'Eşleşme başlatılamadı.';
      errorEl.classList.remove('hidden');
      return;
    }

    matchCodeInput.value = '';
    await selectChat(data.id);
  } catch (err) {
    errorEl.innerText = 'Bağlantı hatası oluştu.';
    errorEl.classList.remove('hidden');
    console.error('Error in matching:', err);
  }
}

// Image Selection & Conversion
function handleMediaSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 3 * 1024 * 1024) {
    alert('Resim boyutu çok büyük (Maksimum 3MB).');
    event.target.value = '';
    return;
  }

  // Clear any existing doc selection
  clearSelectedDoc();

  const reader = new FileReader();
  reader.onload = function (e) {
    selectedMediaData = e.target.result;
    
    const previewContainer = document.getElementById('media-preview');
    previewContainer.innerHTML = `
      <div class="relative inline-block m-1">
        <img src="${selectedMediaData}" class="w-16 h-16 object-cover rounded border border-slate-750">
        <button type="button" onclick="clearSelectedMedia()" class="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-4.5 h-4.5 flex items-center justify-center text-[10px] shadow font-bold">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
    `;
    previewContainer.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearSelectedMedia() {
  selectedMediaData = null;
  document.getElementById('media-file-input').value = '';
  const previewContainer = document.getElementById('media-preview');
  previewContainer.innerHTML = '';
  previewContainer.classList.add('hidden');
}

// Document Selection & Conversion
function handleDocSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 3 * 1024 * 1024) {
    alert('Dosya boyutu çok büyük (Maksimum 3MB).');
    event.target.value = '';
    return;
  }

  // Clear any image selection
  clearSelectedMedia();

  selectedDocName = file.name;
  selectedDocSize = file.size;

  const reader = new FileReader();
  reader.onload = function (e) {
    selectedDocData = e.target.result; // Base64 content
    
    const previewContainer = document.getElementById('media-preview');
    previewContainer.innerHTML = `
      <div class="flex items-center gap-2.5 bg-slate-900 border border-slate-800 p-2.5 rounded m-1 max-w-xs text-xs text-slate-200">
        <i class="fa-solid fa-file-lines text-indigo-400 text-lg"></i>
        <div class="truncate grow">
          <p class="font-bold truncate">${escapeHTML(selectedDocName)}</p>
          <p class="text-[10px] text-slate-500">${(selectedDocSize / 1024).toFixed(1)} KB</p>
        </div>
        <button type="button" onclick="clearSelectedDoc()" class="text-red-400 hover:text-red-300 font-bold p-1">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
    `;
    previewContainer.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearSelectedDoc() {
  selectedDocData = null;
  selectedDocName = '';
  selectedDocSize = 0;
  document.getElementById('doc-file-input').value = '';
  const previewContainer = document.getElementById('media-preview');
  previewContainer.innerHTML = '';
  previewContainer.classList.add('hidden');
}

// Toggle View Once mode
function toggleViewOnceMode() {
  viewOnceActive = !viewOnceActive;
  const btnIcon = document.getElementById('view-once-btn-icon');
  if (viewOnceActive) {
    btnIcon.className = 'fa-solid fa-1 text-base border border-yellow-500 text-yellow-500 rounded-full px-1 font-bold';
    alert('Tek Seferlik Görsel modu aktif! Göndereceğiniz görsel veya dosya karşı tarafça sadece bir kez görüntülenebilir.');
  } else {
    btnIcon.className = 'fa-solid fa-1 text-base border border-slate-500 rounded-full px-1 font-bold';
  }
}

// Reply Quote click action
function quoteMessage(msgId, senderName, msgText) {
  quotedMessage = { id: msgId, text: msgText, senderName };
  
  document.getElementById('reply-preview-sender').innerText = senderName;
  document.getElementById('reply-preview-text').innerText = msgText;
  document.getElementById('reply-preview-bar').classList.remove('hidden');
  document.getElementById('message-text-input').focus();
}

function clearReplyQuote() {
  quotedMessage = null;
  document.getElementById('reply-preview-bar').classList.add('hidden');
}

// Edit Own message
function initiateEditMessage(msgId, originalText) {
  editingMessageId = msgId;
  const cleanedText = originalText.replace(' (Düzenlendi)', '');
  
  const textInput = document.getElementById('message-text-input');
  textInput.value = cleanedText;
  textInput.focus();

  // Show visual cue that we are editing
  const sendBtn = document.getElementById('send-msg-btn');
  sendBtn.innerHTML = '<i class="fa-solid fa-check text-xs"></i>';
  sendBtn.className = 'bg-orange-650 hover:bg-orange-700 text-white p-2 rounded-full w-8 h-8 flex items-center justify-center transition shrink-0';
}

function cancelEditMode() {
  editingMessageId = null;
  const textInput = document.getElementById('message-text-input');
  textInput.value = '';
  
  const sendBtn = document.getElementById('send-msg-btn');
  sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-xs"></i>';
  sendBtn.className = 'bg-indigo-650 hover:bg-indigo-700 text-white p-2 rounded-full w-8 h-8 flex items-center justify-center transition shrink-0';
}

// Voice Recorder Functions
async function toggleVoiceRecord() {
  const btn = document.getElementById('voice-record-btn');
  const icon = document.getElementById('voice-mic-icon');
  const textInput = document.getElementById('message-text-input');

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = e => {
        audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64Audio = e.target.result;
          
          socket.emit('send-message', {
            chatId: activeChat.id,
            senderId: currentUser.id,
            text: '🎤 Sesli Not',
            mediaUrl: base64Audio,
            isAudio: true,
            isViewOnce: viewOnceActive
          });
          
          if (viewOnceActive) {
            toggleViewOnceMode(); // reset
          }
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      icon.className = 'fa-solid fa-circle-stop text-red-500 animate-pulse';
      textInput.placeholder = 'Sesiniz kaydediliyor... Durdurmak için tıklayın.';
      textInput.disabled = true;
    } catch (err) {
      alert('Mikrofon erişimi engellendi veya hata oluştu: ' + err.message);
      console.error(err);
    }
  } else {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    icon.className = 'fa-solid fa-microphone text-lg';
    textInput.placeholder = 'Bir mesaj yazın...';
    textInput.disabled = false;
  }
}

// Clear Chat History Permanently
async function clearChatHistory() {
  if (!activeChat) return;
  if (!confirm('Sohbet geçmişindeki tüm mesajlar her iki taraf için kalıcı olarak silinecektir. Bu işlem geri alınamaz! Emin misiniz?')) return;

  try {
    const res = await fetch(`/api/chats/${activeChat.id}/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    });
    
    const data = await res.json();
    if (data.success) {
      document.getElementById('messages-container').innerHTML = '';
      appendMessage({
        isSystem: true,
        text: 'Sohbet geçmişi temizlendi.'
      });
      await loadChats();
      alert('Sohbet geçmişi başarıyla temizlendi.');
    } else {
      alert('Sohbet geçmişi temizlenirken hata oluştu.');
    }
  } catch (err) {
    console.error('Error clearing chat:', err);
    alert('Bağlantı hatası oluştu.');
  }
}

// Send Message (Supports Add/Edit/Reply Quote)
async function sendMessage(event) {
  event.preventDefault();
  if (!activeChat || !currentUser) return;

  const textInput = document.getElementById('message-text-input');
  const text = textInput.value.trim();
  
  if (!text && !selectedMediaData && !selectedDocData) return;

  // Edit Message Request
  if (editingMessageId) {
    try {
      const res = await fetch(`/api/chats/${activeChat.id}/messages/${editingMessageId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, newText: text })
      });
      if (res.ok) {
        cancelEditMode();
      } else {
        const err = await res.json();
        alert(err.error || 'Mesaj düzenlenemedi.');
      }
    } catch (err) {
      console.error(err);
    }
    return;
  }

  // Normal Send Message
  const messageData = {
    chatId: activeChat.id,
    senderId: currentUser.id,
    text: text || '',
    mediaUrl: selectedMediaData || selectedDocData || null,
    isAudio: false,
    isFile: selectedDocData ? true : false,
    fileName: selectedDocData ? selectedDocName : null,
    fileSize: selectedDocData ? selectedDocSize : null,
    replyTo: quotedMessage,
    isViewOnce: viewOnceActive
  };

  socket.emit('send-message', messageData);
  
  textInput.value = '';
  clearSelectedMedia();
  clearSelectedDoc();
  clearReplyQuote();
  
  if (viewOnceActive) {
    toggleViewOnceMode(); // reset after sending
  }
  
  socket.emit('typing', { chatId: activeChat.id, userId: currentUser.id, isTyping: false, name: currentUser.name });
}

// Emit typing indicator
function emitTyping() {
  if (!activeChat || !currentUser) return;
  socket.emit('typing', {
    chatId: activeChat.id,
    userId: currentUser.id,
    isTyping: true,
    name: currentUser.name
  });
}

// Open View Once Modal & Wipe from Server
async function openViewOnceModal(messageId, mediaUrl, isAudio, isFile) {
  if (!mediaUrl) {
    alert('Bu tek seferlik görsel zaten görüntülendi.');
    return;
  }

  // Confirm viewing
  if (!confirm('Bu tek seferlik bir görseldir. Modalı kapattığınızda kalıcı olarak silinecektir. Şimdi açmak istiyor musunuz?')) return;

  const viewer = document.createElement('div');
  viewer.id = 'view-once-overlay';
  viewer.className = 'fixed inset-0 bg-black/98 z-50 flex flex-col items-center justify-center p-4';

  let contentHtml = '';
  if (isFile) {
    contentHtml = `
      <div class="text-white text-center flex flex-col gap-3">
        <i class="fa-solid fa-file-arrow-down text-6xl text-indigo-400"></i>
        <h4 class="font-bold">Dosyayı İndirin</h4>
        <a href="${mediaUrl}" download class="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg font-bold">İndir</a>
      </div>
    `;
  } else if (isAudio) {
    contentHtml = `<audio src="${mediaUrl}" controls class="w-72 bg-slate-900 border border-slate-800 rounded p-2"></audio>`;
  } else {
    contentHtml = `<img src="${mediaUrl}" class="max-w-full max-h-[85vh] object-contain rounded shadow-2xl">`;
  }

  viewer.innerHTML = `
    ${contentHtml}
    <button onclick="closeViewOnceModal('${messageId}')" class="absolute top-6 right-6 bg-slate-900 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg hover:bg-slate-800 shadow">
      <i class="fa-solid fa-times"></i>
    </button>
  `;

  document.body.appendChild(viewer);
}

async function closeViewOnceModal(messageId) {
  const viewer = document.getElementById('view-once-overlay');
  if (viewer) viewer.remove();

  try {
    await fetch(`/api/chats/${activeChat.id}/messages/${messageId}/view-once`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    });
  } catch (err) {
    console.error('Error confirming view-once read:', err);
  }
}

// Render Single Message
function appendMessage(msg) {
  const container = document.getElementById('messages-container');
  const msgEl = document.createElement('div');

  if (msg.isSystem) {
    msgEl.className = 'flex justify-center my-3';
    msgEl.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 text-slate-350 text-xs px-4 py-2 rounded-xl text-center max-w-md shadow-sm">
        <i class="fa-solid fa-circle-info mr-1 text-indigo-400"></i> ${msg.text.replace(/\n/g, '<br>')}
      </div>
    `;
  } else {
    const isMe = msg.senderId === currentUser.id;
    msgEl.className = `flex ${isMe ? 'justify-end' : 'justify-start'} mb-3 relative group`;
    
    let bubbleClass = isMe 
      ? 'whatsapp-bubble-me'
      : 'whatsapp-bubble-partner';

    let mediaHtml = '';
    const hasViewedOnce = msg.isViewOnce && (!msg.mediaUrl || (msg.viewedBy && msg.viewedBy.includes(currentUser.id)));

    if (msg.isViewOnce) {
      if (hasViewedOnce) {
        mediaHtml = `
          <div class="flex items-center gap-2 text-xs text-slate-500 italic mb-1.5 p-1 bg-slate-950/40 border border-slate-900 rounded select-none">
            <i class="fa-solid fa-lock text-sm"></i> Açılmış Tek Seferlik Medya
          </div>
        `;
      } else {
        mediaHtml = `
          <button type="button" onclick="openViewOnceModal('${msg.id}', '${msg.mediaUrl}', ${msg.isAudio}, ${msg.isFile})" 
                  class="flex items-center gap-2 text-xs font-bold text-yellow-450 text-yellow-500 hover:text-yellow-400 border border-yellow-900/50 bg-yellow-950/20 p-2 rounded.5 rounded-lg mb-1.5 transition">
            <i class="fa-solid fa-eye animate-pulse text-sm"></i> Tek Seferlik Medyayı Aç
          </button>
        `;
      }
    } else if (msg.mediaUrl) {
      if (msg.isAudio) {
        mediaHtml = `
          <div class="mb-2 max-w-xs">
            <audio src="${msg.mediaUrl}" controls class="w-full h-8 outline-none rounded bg-slate-950 border border-slate-800"></audio>
          </div>
        `;
      } else if (msg.isFile) {
        mediaHtml = `
          <a href="${msg.mediaUrl}" download="${msg.fileName}" 
             class="flex items-center gap-2.5 bg-slate-950 hover:bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl m-1 text-xs text-slate-200 shadow-sm max-w-xs transition">
            <i class="fa-solid fa-file-arrow-down text-indigo-400 text-xl shrink-0"></i>
            <div class="truncate grow">
              <p class="font-bold truncate">${escapeHTML(msg.fileName)}</p>
              <p class="text-[10px] text-slate-500">${(msg.fileSize / 1024).toFixed(1)} KB</p>
            </div>
          </a>
        `;
      } else {
        mediaHtml = `
          <div class="mb-2 max-w-[200px] md:max-w-xs overflow-hidden rounded-lg">
            <img src="${msg.mediaUrl}" alt="Media attachment" class="w-full object-cover">
          </div>
        `;
      }
    }

    // Render Quoted reply box inside bubble if applicable
    let replyHtml = '';
    if (msg.replyTo) {
      replyHtml = `
        <div class="bg-slate-950/50 border-l-4 border-indigo-500 p-1.5 rounded text-[11px] mb-2 select-none">
          <span class="font-bold text-indigo-400">${escapeHTML(msg.replyTo.senderName)}:</span>
          <p class="text-slate-350 italic truncate">${escapeHTML(msg.replyTo.text)}</p>
        </div>
      `;
    }

    let textHtml = msg.text ? `<div>${escapeHTML(msg.text)}</div>` : '';

    // Render tick signs (Read Receipts)
    let tickHtml = '';
    if (isMe) {
      if (msg.status === 'read') {
        tickHtml = '<span class="whatsapp-tick-read ml-1 font-bold" title="Okundu"><i class="fa-solid fa-check-double text-[10px]"></i></span>';
      } else {
        tickHtml = '<span class="whatsapp-tick-unread ml-1" title="Gönderildi"><i class="fa-solid fa-check text-[10px]"></i></span>';
      }
    }

    // Message edit action (allowed only on own messages under 5 minutes old)
    let actionButtonsHtml = '';
    const elapsedMs = Date.now() - new Date(msg.timestamp).getTime();
    const canEdit = isMe && (elapsedMs < 5 * 60 * 1000) && msg.text && !msg.isSystem;

    actionButtonsHtml = `
      <div class="absolute top-1/2 -translate-y-1/2 ${isMe ? '-left-12 flex-row' : '-right-12 flex-row-reverse'} items-center gap-1 hidden group-hover:flex transition z-20">
        <button onclick="quoteMessage('${msg.id}', '${isMe ? 'Siz' : escapeHTML(activeChat.partnerName)}', '${escapeHTML(msg.text || '📸 Medya')}')" 
                class="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 w-5 h-5 rounded-full flex items-center justify-center text-[10px]" title="Yanıtla">
          <i class="fa-solid fa-reply"></i>
        </button>
        ${canEdit ? `
          <button onclick="initiateEditMessage('${msg.id}', '${escapeHTML(msg.text)}')" 
                  class="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-350 text-slate-300 w-5 h-5 rounded-full flex items-center justify-center text-[10px]" title="Düzenle">
            <i class="fa-solid fa-pen"></i>
          </button>
        ` : ''}
      </div>
    `;

    msgEl.innerHTML = `
      ${actionButtonsHtml}
      <div class="max-w-[85%] md:max-w-[70%]">
        <div class="px-4 py-2.5 rounded-2xl text-sm shadow-md ${bubbleClass}">
          ${replyHtml}
          ${mediaHtml}
          ${textHtml}
        </div>
        <div class="text-[9px] text-slate-500 mt-1 flex items-center ${isMe ? 'justify-end' : 'justify-start'} select-none">
          ${formatTime(msg.timestamp)}
          ${tickHtml}
        </div>
      </div>
    `;
  }

  container.appendChild(msgEl);
}

// Update Streak Details widgets
function updateStreakPanel() {
  if (!activeChat) return;

  const countDisplay = document.getElementById('streak-count-display');
  const flame = document.getElementById('streak-flame');
  const statusText = document.getElementById('streak-status-text');
  
  const userMessagedFlag = document.getElementById('user-messaged-flag');
  const partnerMessagedFlag = document.getElementById('partner-messaged-flag');

  const streak = activeChat.streakCount;
  countDisplay.innerText = streak;

  if (streak > 0) {
    flame.className = "fa-solid fa-fire text-orange-500 text-6xl animate-bounce";
  } else {
    flame.className = "fa-solid fa-fire text-slate-700 text-6xl opacity-50";
  }

  const isUser1 = activeChat.user1Id === currentUser.id;
  const myMessaged = isUser1 ? activeChat.user1MessagedToday : activeChat.user2MessagedToday;
  const partnerMessaged = isUser1 ? activeChat.user2MessagedToday : activeChat.user1MessagedToday;

  if (myMessaged) {
    userMessagedFlag.innerText = 'EVET';
    userMessagedFlag.className = 'px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-900/50';
  } else {
    userMessagedFlag.innerText = 'YOK';
    userMessagedFlag.className = 'px-2 py-0.5 rounded text-xs font-semibold bg-red-950 text-red-400 border border-red-900/50';
  }

  if (partnerMessaged) {
    partnerMessagedFlag.innerText = 'EVET';
    partnerMessagedFlag.className = 'px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-900/50';
  } else {
    partnerMessagedFlag.innerText = 'YOK';
    partnerMessagedFlag.className = 'px-2 py-0.5 rounded text-xs font-semibold bg-red-950 text-red-400 border border-red-900/50';
  }

  if (myMessaged && partnerMessaged) {
    statusText.innerText = 'Bugün ikiniz de mesaj attınız! Seri güvende. 🎉';
  } else if (myMessaged) {
    statusText.innerText = 'Siz yazdınız, partnerinizin mesaj atması bekleniyor. ⏳';
  } else if (partnerMessaged) {
    statusText.innerText = 'Partneriniz yazdı, seriyi korumak için bir mesaj gönderin! 🚨';
  } else {
    statusText.innerText = 'Bugün henüz kimse mesaj atmadı. Yazışmaya başlayın!';
  }
}

// Start Countdown Clock for Cycle duration
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  const updateCountdown = () => {
    if (!activeChat) return;

    const cycleStart = new Date(activeChat.cycleStartDate);
    const durationMs = 24 * 60 * 60 * 1000;
    const endMs = cycleStart.getTime() + durationMs;
    const diff = endMs - Date.now();

    const timeLeftText = document.getElementById('cycle-time-left');
    const progressBar = document.getElementById('cycle-progress-bar');

    if (diff <= 0) {
      timeLeftText.innerText = "Döngü tamamlandı! Hesaplanıyor...";
      progressBar.style.width = '0%';
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n) => n.toString().padStart(2, '0');
    timeLeftText.innerText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)} kaldı`;

    const percent = Math.max(0, Math.min(100, (diff / durationMs) * 100));
    progressBar.style.width = `${percent}%`;

    if (percent < 15) {
      progressBar.className = 'bg-red-500 h-full transition-all duration-1000';
    } else if (percent < 40) {
      progressBar.className = 'bg-orange-500 h-full transition-all duration-1000';
    } else {
      progressBar.className = 'bg-indigo-650 h-full transition-all duration-1000';
    }
  };

  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

// --- Mobile Navigation Logic ---

function navigateMobile(screenName) {
  currentMobileScreen = screenName;
  updateMobileView();
}

function updateMobileView() {
  let isMobile = window.innerWidth < 768;
  if (layoutMode === 'mobile') isMobile = true;
  if (layoutMode === 'desktop') isMobile = false;

  const sidebar = document.getElementById('sidebar-panel');
  const chatPanel = document.getElementById('chat-panel');
  const infoPanel = document.getElementById('chat-info-panel');

  if (!isMobile) {
    if (sidebarHidden) {
      sidebar.classList.add('hidden');
      sidebar.classList.remove('flex', 'w-80');
    } else {
      sidebar.classList.remove('hidden', 'w-full');
      sidebar.classList.add('flex', 'w-80');
    }
    chatPanel.classList.remove('hidden');
    chatPanel.classList.add('flex');
    
    if (activeChat) {
      infoPanel.classList.remove('w-full', 'flex');
      infoPanel.classList.add('w-80');
    } else {
      infoPanel.classList.add('hidden');
      infoPanel.classList.remove('flex');
    }
    return;
  }

  sidebar.classList.remove('w-80');
  sidebar.classList.add('w-full');
  infoPanel.classList.remove('w-80');
  infoPanel.classList.add('w-full');

  if (currentMobileScreen === 'list') {
    sidebar.classList.remove('hidden');
    sidebar.classList.add('flex');
    chatPanel.classList.add('hidden');
    chatPanel.classList.remove('flex');
    infoPanel.classList.add('hidden');
    infoPanel.classList.remove('flex');
  } else if (currentMobileScreen === 'chat') {
    if (sidebarHidden) {
      sidebar.classList.add('hidden');
      sidebar.classList.remove('flex');
      if (activeChat) {
        chatPanel.classList.remove('hidden');
        chatPanel.classList.add('flex');
      } else {
        currentMobileScreen = 'list';
        sidebar.classList.remove('hidden');
        sidebar.classList.add('flex');
        chatPanel.classList.add('hidden');
        chatPanel.classList.remove('flex');
      }
    } else {
      sidebar.classList.remove('hidden');
      sidebar.classList.add('flex');
      chatPanel.classList.add('hidden');
      chatPanel.classList.remove('flex');
    }
    infoPanel.classList.add('hidden');
    infoPanel.classList.remove('flex');
  } else if (currentMobileScreen === 'info') {
    sidebar.classList.add('hidden');
    sidebar.classList.remove('flex');
    chatPanel.classList.add('hidden');
    chatPanel.classList.remove('flex');
    infoPanel.classList.remove('hidden');
    infoPanel.classList.add('flex');
  }
}

// Override toggleInfoPanel for compatibility
function toggleInfoPanel() {
  let isMobile = window.innerWidth < 768;
  if (layoutMode === 'mobile') isMobile = true;
  if (layoutMode === 'desktop') isMobile = false;
  if (isMobile) {
    navigateMobile('info');
  } else {
    const panel = document.getElementById('chat-info-panel');
    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      panel.classList.add('flex');
    } else {
      panel.classList.add('hidden');
      panel.classList.remove('flex');
    }
  }
}

// --- Admin Panel Actions ---

function tryAdminAccess() {
  const code = prompt('Yönetici Giriş Kodunu Girin:');
  if (code === 'admin1803') {
    localStorage.setItem('streak_chat_admin', 'true');
    showAdminPanel();
    alert('Yönetici modu aktif edildi! Arayüzün sağındaki Detaylar panelinin en altında Yönetici panelini bulabilirsiniz.');
  } else if (code !== null) {
    alert('Hatalı Yönetici Kodu!');
  }
}

function checkAdminPersisted() {
  if (localStorage.getItem('streak_chat_admin') === 'true') {
    showAdminPanel();
  }
}

function showAdminPanel() {
  const adminPanel = document.getElementById('admin-debug-section');
  if (adminPanel) {
    adminPanel.classList.remove('hidden');
  }
}

async function triggerTimeWarp(hours) {
  if (!activeChat) return alert('Lütfen önce bir sohbet seçin.');
  try {
    const res = await fetch('/api/debug/time-warp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: activeChat.id, hours })
    });
    const data = await res.json();
    if (data.success) {
      activeChat = { ...activeChat, ...data.chat };
      updateStreakPanel();
      startCountdown();
      await loadChats();
      await refreshMessages();
    }
  } catch (err) {
    console.error('Error time warping:', err);
  }
}

async function grantFreezeDebug() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/debug/grant-freeze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    });
    const data = await res.json();
    if (data.success) {
      await refreshUserProfile();
    }
  } catch (err) {
    console.error('Error granting freeze:', err);
  }
}

async function simulatePartnerMessage() {
  if (!activeChat) return alert('Lütfen önce bir sohbet seçin.');
  const isUser1 = activeChat.user1Id === currentUser.id;
  const partnerId = isUser1 ? activeChat.user2Id : activeChat.user1Id;
  const partnerName = activeChat.partnerName;

  socket.emit('send-message', {
    chatId: activeChat.id,
    senderId: partnerId,
    text: `[SİMÜLASYON] Merhaba! Ben ${partnerName}. Serimizi sürdürmek için yazdım.`
  });
}

async function resetDbDebug() {
  if (!confirm('Tüm veritabanı sıfırlanacak. Emin misiniz?')) return;
  try {
    const res = await fetch('/api/debug/reset', { method: 'POST' });
    if (res.ok) {
      localStorage.clear();
      alert('Sistem başarıyla sıfırlandı. Sayfa yenileniyor...');
      window.location.reload();
    }
  } catch (err) {
    console.error('Error resetting database:', err);
  }
}

// Copy Code
function copyMyCode() {
  if (!currentUser) return;
  navigator.clipboard.writeText(currentUser.code).then(() => {
    alert('Kod kopyalandı: ' + currentUser.code);
  }).catch(err => {
    console.error('Could not copy code:', err);
  });
}

// --- Gündüz Modu (Theme Management) ---

function toggleTheme() {
  const isLight = document.body.classList.contains('light-theme');
  if (isLight) {
    document.body.classList.remove('light-theme');
    localStorage.setItem('streak_chat_theme', 'dark');
  } else {
    document.body.classList.add('light-theme');
    localStorage.setItem('streak_chat_theme', 'light');
  }
}

function checkThemePersisted() {
  if (localStorage.getItem('streak_chat_theme') === 'light') {
    document.body.classList.add('light-theme');
  }
}

// --- Formatting Helpers ---

function formatTimeAgo(isoString) {
  const date = new Date(isoString);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Şimdi';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

function formatTime(isoString) {
  const date = new Date(isoString);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function scrollToBottom() {
  const container = document.getElementById('messages-container');
  if (container) container.scrollTop = container.scrollHeight;
}

// --- Shared Collaborative Whiteboard (Feature 33) ---
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let canvasElement = null;
let canvasContext = null;

function toggleWhiteboard() {
  const container = document.getElementById('whiteboard-container');
  if (!container) return;
  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    setupWhiteboardCanvas();
  } else {
    container.classList.add('hidden');
  }
}

function setupWhiteboardCanvas() {
  canvasElement = document.getElementById('whiteboard-canvas');
  if (!canvasElement) return;
  canvasContext = canvasElement.getContext('2d');
  
  const rect = canvasElement.getBoundingClientRect();
  canvasElement.width = rect.width;
  canvasElement.height = rect.height;
  
  canvasContext.lineCap = 'round';
  canvasContext.lineJoin = 'round';

  // Mouse events
  canvasElement.addEventListener('mousedown', startDrawing);
  canvasElement.addEventListener('mousemove', draw);
  canvasElement.addEventListener('mouseup', stopDrawing);
  canvasElement.addEventListener('mouseleave', stopDrawing);

  // Touch events
  canvasElement.addEventListener('touchstart', startDrawingTouch);
  canvasElement.addEventListener('touchmove', drawTouch);
  canvasElement.addEventListener('touchend', stopDrawing);
}

function getCoordinates(e) {
  const rect = canvasElement.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function startDrawing(e) {
  isDrawing = true;
  const coords = getCoordinates(e);
  lastX = coords.x;
  lastY = coords.y;
}

function draw(e) {
  if (!isDrawing) return;
  const coords = getCoordinates(e);
  const x = coords.x;
  const y = coords.y;

  drawOnCanvas(x, y, lastX, lastY, getSelectedColor(), getSelectedWidth());

  if (socket && activeChat) {
    socket.emit('draw-line', {
      chatId: activeChat.id,
      x,
      y,
      prevX: lastX,
      prevY: lastY,
      color: getSelectedColor(),
      width: getSelectedWidth()
    });
  }

  lastX = x;
  lastY = y;
}

function startDrawingTouch(e) {
  if (e.touches.length === 0) return;
  isDrawing = true;
  const rect = canvasElement.getBoundingClientRect();
  lastX = e.touches[0].clientX - rect.left;
  lastY = e.touches[0].clientY - rect.top;
  e.preventDefault();
}

function drawTouch(e) {
  if (!isDrawing || e.touches.length === 0) return;
  const rect = canvasElement.getBoundingClientRect();
  const x = e.touches[0].clientX - rect.left;
  const y = e.touches[0].clientY - rect.top;

  drawOnCanvas(x, y, lastX, lastY, getSelectedColor(), getSelectedWidth());

  if (socket && activeChat) {
    socket.emit('draw-line', {
      chatId: activeChat.id,
      x,
      y,
      prevX: lastX,
      prevY: lastY,
      color: getSelectedColor(),
      width: getSelectedWidth()
    });
  }

  lastX = x;
  lastY = y;
  e.preventDefault();
}

function stopDrawing() {
  isDrawing = false;
}

function drawOnCanvas(x, y, prevX, prevY, color, width) {
  if (!canvasContext) return;
  canvasContext.strokeStyle = color;
  canvasContext.lineWidth = width;
  canvasContext.beginPath();
  canvasContext.moveTo(prevX, prevY);
  canvasContext.lineTo(x, y);
  canvasContext.stroke();
}

function getSelectedColor() {
  const el = document.getElementById('board-color');
  return el ? el.value : '#6366f1';
}

// Fix selected width fallback
function getSelectedWidth() {
  const el = document.getElementById('board-width');
  return el ? parseInt(el.value) : 4;
}

function clearBoard() {
  if (!canvasElement || !canvasContext) return;
  canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);

  if (socket && activeChat) {
    socket.emit('clear-board', { chatId: activeChat.id });
  }
}

// --- Layout Simulation System ---
let layoutMode = 'auto'; // 'auto', 'mobile', 'desktop'

function setLayoutMode(mode) {
  layoutMode = mode;
  
  const btnMob = document.getElementById('layout-btn-mobile');
  const btnDesk = document.getElementById('layout-btn-desktop');
  const btnAuto = document.getElementById('layout-btn-auto');

  if (btnMob) btnMob.className = mode === 'mobile' ? 'px-1.5 py-0.5 rounded bg-indigo-650 text-white font-bold' : 'px-1.5 py-0.5 rounded text-slate-500 hover:text-white';
  if (btnDesk) btnDesk.className = mode === 'desktop' ? 'px-1.5 py-0.5 rounded bg-indigo-650 text-white font-bold' : 'px-1.5 py-0.5 rounded text-slate-500 hover:text-white';
  if (btnAuto) btnAuto.className = mode === 'auto' ? 'px-1.5 py-0.5 rounded bg-indigo-650 text-white font-bold' : 'px-1.5 py-0.5 rounded text-slate-500 hover:text-white';

  updateMobileView();
}

function toggleSidebar() {
  sidebarHidden = !sidebarHidden;
  // APK-mode: body class ile CSS slide animasyonu
  if (document.body.classList.contains('apk-mode')) {
    document.body.classList.toggle('sidebar-hidden', sidebarHidden);
  }
  updateMobileView();
}

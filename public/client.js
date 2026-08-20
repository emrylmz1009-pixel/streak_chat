let socket;
let currentUser = null;
let activeChat = null;
let typingTimeout = null;
let countdownInterval = null;
let simulatedMediaData = null;
let currentMobileScreen = 'list'; // 'list', 'chat', 'info'

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('resize', updateMobileView);
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
      
      // Successfully auto-logged in, hide screen and init app
      document.getElementById('auth-screen').classList.add('hidden');
      renderProfile();
      initSocket();
      await loadChats();
      updateMobileView();
    } else {
      // Not logged in by IP, show authentication screen
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
    
    // Hide auth screen and load app
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
    
    // Hide auth screen and load app
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

  // Clear local storage and reload
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
  });

  socket.on('message', (msg) => {
    if (activeChat && msg.chatId === activeChat.id) {
      appendMessage(msg);
      scrollToBottom();
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
        isSelected ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/40 text-slate-300'
      }`;
      item.onclick = () => selectChat(chat.id);

      const hasStreak = chat.streakCount > 0;

      item.innerHTML = `
        <div class="flex items-center gap-2.5 overflow-hidden">
          <div class="w-8 h-8 rounded-full bg-slate-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
            ${chat.partnerName.split(' ').map(n => n[0]).join('')}
          </div>
          <div class="overflow-hidden">
            <div class="font-semibold text-sm truncate">${chat.partnerName}</div>
            <div class="text-xs text-slate-400 truncate">${chat.lastMessage}</div>
          </div>
        </div>
        <div class="flex flex-col items-end shrink-0 ml-2">
          ${hasStreak ? `
            <div class="flex items-center gap-0.5 text-xs text-orange-500 font-extrabold bg-orange-950/40 border border-orange-900/30 px-1.5 py-0.5 rounded-full">
              <i class="fa-solid fa-fire animate-pulse text-[10px]"></i> ${chat.streakCount}
            </div>
          ` : `
            <div class="text-[10px] text-slate-500 border border-slate-800 px-1.5 py-0.5 rounded-full">0 🔥</div>
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

    const msgRes = await fetch(`/api/chats/${chatId}/messages`);
    const messages = await msgRes.json();
    
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = '';
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();

    document.getElementById('chat-info-panel').classList.remove('hidden');
    updateStreakPanel();
    startCountdown();
    navigateMobile('chat');
  } catch (err) {
    console.error('Error selecting chat:', err);
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

// Send Message
function sendMessage(event) {
  event.preventDefault();
  if (!activeChat || !currentUser) return;

  const textInput = document.getElementById('message-text-input');
  const text = textInput.value.trim();
  
  if (!text && !simulatedMediaData) return;

  const messageData = {
    chatId: activeChat.id,
    senderId: currentUser.id,
    text: text || '📸 Fotoğraf gönderdi',
    mediaUrl: simulatedMediaData
  };

  socket.emit('send-message', messageData);
  
  textInput.value = '';
  clearSimulatedMedia();
  
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
    msgEl.className = `flex ${isMe ? 'justify-end' : 'justify-start'} mb-3`;
    
    let bubbleClass = isMe 
      ? 'bg-indigo-650 text-white rounded-br-none border border-indigo-600'
      : 'bg-slate-900 text-slate-100 rounded-bl-none border border-slate-800';

    let mediaHtml = '';
    if (msg.mediaUrl) {
      mediaHtml = `
        <div class="mb-2 max-w-xs overflow-hidden rounded-lg">
          <img src="${msg.mediaUrl}" alt="Media attachment" class="w-full object-cover">
        </div>
      `;
    }

    msgEl.innerHTML = `
      <div class="max-w-[85%] md:max-w-[70%]">
        <div class="px-4 py-2.5 rounded-2xl text-sm shadow-md ${bubbleClass}">
          ${mediaHtml}
          <div>${escapeHTML(msg.text)}</div>
        </div>
        <div class="text-[9px] text-slate-500 mt-1 ${isMe ? 'text-right' : 'text-left'}">
          ${formatTime(msg.timestamp)}
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
  const isMobile = window.innerWidth < 768; // md breakpoint
  const sidebar = document.getElementById('sidebar-panel');
  const chatPanel = document.getElementById('chat-panel');
  const infoPanel = document.getElementById('chat-info-panel');

  if (!isMobile) {
    sidebar.classList.remove('hidden', 'w-full');
    sidebar.classList.add('flex', 'w-80');
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
  const isMobile = window.innerWidth < 768;
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

// Simulated Media Uploads
function triggerSimulatedMedia() {
  simulatedMediaData = 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=300&auto=format&fit=crop&q=60';
  document.getElementById('media-preview').classList.remove('hidden');
}

function clearSimulatedMedia() {
  simulatedMediaData = null;
  document.getElementById('media-preview').classList.add('hidden');
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
  container.scrollTop = container.scrollHeight;
}

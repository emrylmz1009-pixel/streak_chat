const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const db = require('./json-db');
const streakEngine = require('./streak-engine');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Generate a unique matching code (e.g. "X9K-821")
async function generateUniqueCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const users = await db.getUsers();
  const existingCodes = new Set(users.map(u => u.code));

  let attempts = 0;
  while (attempts < 1000) {
    let code = '';
    for (let i = 0; i < 3; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code += '-';
    for (let i = 0; i < 3; i++) {
      code += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    if (!existingCodes.has(code)) {
      return code;
    }
    attempts++;
  }
  return 'GEN-' + Math.floor(100 + Math.random() * 900);
}

// Helper: Get random anonymous name
function getRandomAnonName() {
  const adjectives = ['Gizemli', 'Hizli', 'Cesur', 'Sakin', 'Merakli', 'Uykucu', 'Mutlu', 'Dost', 'Zeki', 'Cilgin'];
  const animals = ['Panda', 'Tilki', 'Kedi', 'Kopek', 'Aslan', 'Kaplan', 'Tavsan', 'Kus', 'Yunus', 'Koala'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const anim = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${anim}`;
}

const badWords = ['salak', 'aptal', 'şerefsiz', 'gerizekalı', 'amk', 'piç', 'göt', 'sik', 'yarrak'];
function filterText(text) {
  if (!text) return text;
  let filtered = text;
  badWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, (match) => {
      if (match.length <= 2) return match[0] + '*';
      return match[0] + '*'.repeat(match.length - 2) + match[match.length - 1];
    });
  });
  return filtered;
}

const onlineUsers = new Map();

// Helper: Hash password with SHA256
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper: Extract clean IPv4 or IPv6 client IP address
function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (ip && ip.includes('::ffff:')) {
    ip = ip.split('::ffff:')[1];
  }
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  return ip || '127.0.0.1';
}

// --- REST API Endpoints ---

// Get detected client IP address
app.get('/api/ip', (req, res) => {
  res.json({ ip: getClientIp(req) });
});

// Auto-Login user by IP Address
app.post('/api/auth/auto-login', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const user = await db.getUserByIp(ip);
    if (user) {
      res.json({ loggedIn: true, user });
    } else {
      res.json({ loggedIn: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Lütfen tüm alanları doldurun.' });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });
    }

    const ip = getClientIp(req);
    const code = await generateUniqueCode();
    const newUser = {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      code,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(password),
      ipAddress: ip,
      streakFreezes: 2,
      badges: [],
      createdAt: new Date().toISOString()
    };

    await db.saveUser(newUser);
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-posta ve şifre gereklidir.' });
    }

    const user = await db.getUserByEmail(email);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(400).json({ error: 'Hatalı e-posta veya şifre.' });
    }

    const ip = getClientIp(req);
    user.ipAddress = ip; // associate this IP address with this user
    await db.saveUser(user);

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout user (clears IP association in database)
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { userId } = req.body;
    if (userId) {
      const user = await db.getUserById(userId);
      if (user) {
        user.ipAddress = ''; // Disassociate IP address
        await db.saveUser(user);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REST API Endpoints

// Create User
app.post('/api/users/create', async (req, res) => {
  try {
    const code = await generateUniqueCode();
    const name = req.body.name ? req.body.name.trim() : getRandomAnonName();
    const newUser = {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      code,
      name,
      streakFreezes: 2, // Starts with 2 freezes
      badges: [],
      createdAt: new Date().toISOString()
    };
    await db.saveUser(newUser);
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get User
app.get('/api/users/:userId', async (req, res) => {
  try {
    const user = await db.getUserById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get User by Code (for debug/info)
app.get('/api/users/code/:code', async (req, res) => {
  try {
    const user = await db.getUserByCode(req.params.code);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Match Users using code
app.post('/api/match', async (req, res) => {
  try {
    const { userId, matchCode } = req.body;
    if (!userId || !matchCode) {
      return res.status(400).json({ error: 'Missing userId or matchCode' });
    }

    const currentUser = await db.getUserById(userId);
    if (!currentUser) return res.status(404).json({ error: 'Current user not found' });

    const targetUser = await db.getUserByCode(matchCode);
    if (!targetUser) {
      return res.status(404).json({ error: 'Bu koda ait kullanici bulunamadi.' });
    }

    if (currentUser.id === targetUser.id) {
      return res.status(400).json({ error: 'Kendi kodunuzla eslesemezsiniz.' });
    }

    // Check if chat already exists
    const chats = await db.getChats();
    const existingChat = chats.find(c =>
      (c.user1Id === currentUser.id && c.user2Id === targetUser.id) ||
      (c.user1Id === targetUser.id && c.user2Id === currentUser.id)
    );

    if (existingChat) {
      return res.json(existingChat);
    }

    // Create new chat room
    const newChat = {
      id: 'chat_' + Math.random().toString(36).substr(2, 9),
      user1Id: currentUser.id,
      user2Id: targetUser.id,
      streakCount: 0,
      cycleStartDate: new Date().toISOString(),
      user1MessagedToday: false,
      user2MessagedToday: false,
      createdAt: new Date().toISOString()
    };

    await db.saveChat(newChat);

    // Create a system message
    const sysMsg = {
      id: 'sys_' + Math.random().toString(36).substr(2, 9),
      chatId: newChat.id,
      senderId: 'system',
      text: `Eslesme saglandi! 🎉 Sohbet baslatildi. Seriyi (Streak) surdurmek icin her gun en az 1 mesaj gonderin! 🔥`,
      mediaUrl: null,
      isSystem: true,
      timestamp: new Date().toISOString()
    };
    await db.saveMessage(sysMsg);

    // Notify connected sockets of the match
    io.emit('match-created', { chat: newChat, user1Id: newChat.user1Id, user2Id: newChat.user2Id });

    res.status(201).json(newChat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get User's Chats (enriched with participant name)
app.get('/api/chats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const chats = await db.getChatsForUser(userId);
    const enrichedChats = [];

    for (const chat of chats) {
      const otherUserId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
      const otherUser = await db.getUserById(otherUserId);
      
      // Get the last message
      const messages = await db.getMessages(chat.id);
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;

      enrichedChats.push({
        ...chat,
        partnerName: otherUser ? otherUser.name : 'Unknown Partner',
        partnerCode: otherUser ? otherUser.code : '',
        lastMessage: lastMsg ? lastMsg.text : 'Henuz mesaj yok.',
        lastMessageTime: lastMsg ? lastMsg.timestamp : chat.createdAt
      });
    }

    // Sort by last message time descending
    enrichedChats.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    res.json(enrichedChats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Message History for Chat
app.get('/api/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const messages = await db.getMessages(chatId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear Chat History Permanently
app.post('/api/chats/:chatId/clear', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    const chat = await db.getChatById(chatId);
    if (!chat) return res.status(404).json({ error: 'Sohbet bulunamadı.' });

    if (chat.user1Id !== userId && chat.user2Id !== userId) {
      return res.status(403).json({ error: 'Yetkisiz işlem.' });
    }

    // Remove messages from database for this chat
    const messages = await db.readTable('messages');
    const updatedMessages = messages.filter(m => m.chatId !== chatId);
    await db.queueWrite('messages', updatedMessages);

    // Update last message preview in chats
    const chats = await db.getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = 'Sohbet geçmişi temizlendi.';
      chats[chatIndex].lastMessageTime = new Date().toISOString();
      await db.queueWrite('chats', chats);
    }

    // Emit real-time notification to chat room
    io.to(`chat_${chatId}`).emit('chat-cleared', { chatId });
    
    // Emit global event to refresh sidebar lists
    io.emit('chat-list-updated');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Online Statuses of multiple Users
app.post('/api/users/online-statuses', (req, res) => {
  const { userIds } = req.body;
  if (!userIds || !Array.isArray(userIds)) return res.json({});
  const statuses = {};
  userIds.forEach(uid => {
    statuses[uid] = onlineUsers.has(uid);
  });
  res.json(statuses);
});

// View Once message open verification & media wipe
app.post('/api/chats/:chatId/messages/:messageId/view-once', async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { userId } = req.body;

    const messages = await db.readTable('messages');
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex !== -1) {
      const msg = messages[msgIndex];
      if (msg.isViewOnce) {
        if (!msg.viewedBy) msg.viewedBy = [];
        if (!msg.viewedBy.includes(userId)) {
          msg.viewedBy.push(userId);
          
          // If the receiver viewed it, wipe out the mediaUrl immediately to protect privacy
          if (msg.senderId !== userId) {
            msg.mediaUrl = null; 
          }
          
          await db.queueWrite('messages', messages);
          io.to(`chat_${chatId}`).emit('message-updated', msg);
        }
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit Sent Message text (within 5 minutes limit)
app.post('/api/chats/:chatId/messages/:messageId/edit', async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { userId, newText } = req.body;

    const messages = await db.readTable('messages');
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return res.status(404).json({ error: 'Mesaj bulunamadı.' });

    const msg = messages[msgIndex];
    if (msg.senderId !== userId) return res.status(403).json({ error: 'Yetkisiz işlem.' });

    // Check if within 5 mins
    const elapsedMs = Date.now() - new Date(msg.timestamp).getTime();
    if (elapsedMs > 5 * 60 * 1000) {
      return res.status(400).json({ error: 'Sadece son 5 dakikadaki mesajlar düzenlenebilir.' });
    }

    msg.text = filterText(newText) + ' (Düzenlendi)';
    await db.queueWrite('messages', messages);

    io.to(`chat_${chatId}`).emit('message-updated', msg);
    io.emit('chat-list-updated');
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: Time Warp
app.post('/api/debug/time-warp', async (req, res) => {
  try {
    const { chatId, hours } = req.body;
    if (!chatId || hours === undefined) {
      return res.status(400).json({ error: 'Missing chatId or hours' });
    }

    // Shift date
    const updatedChat = await streakEngine.timeWarpChat(chatId, hours);
    if (!updatedChat) return res.status(404).json({ error: 'Chat not found' });

    // Run streak engine check immediately for this chat
    const timeElapsed = Date.now() - new Date(updatedChat.cycleStartDate).getTime();
    let engineResult = null;

    if (timeElapsed >= streakEngine.CYCLE_DURATION) {
      engineResult = await streakEngine.processChatCycle(updatedChat);
      
      // Fetch latest messages (including system messages added by the engine)
      const messages = await db.getMessages(chatId);
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      
      // Fetch fresh chat status
      const freshChat = await db.getChatById(chatId);
      
      // Get users info
      const u1 = await db.getUserById(freshChat.user1Id);
      const u2 = await db.getUserById(freshChat.user2Id);

      // Broadcast changes
      io.to(`chat_${chatId}`).emit('streak-update', { chat: freshChat, engineResult, users: { u1, u2 } });
      io.to(`chat_${chatId}`).emit('message', lastMsg);
      io.emit('chat-list-updated');
    } else {
      // Just date changed (not elapsed 24h yet)
      const freshChat = await db.getChatById(chatId);
      io.to(`chat_${chatId}`).emit('streak-update', { chat: freshChat, users: null });
      io.emit('chat-list-updated');
    }

    res.json({ success: true, chat: await db.getChatById(chatId), engineResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: Grant Freeze
app.post('/api/debug/grant-freeze', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.streakFreezes += 1;
    await db.saveUser(user);
    res.json({ success: true, streakFreezes: user.streakFreezes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: Reset Database
app.post('/api/debug/reset', async (req, res) => {
  try {
    await db.clearAll();
    res.json({ success: true, message: 'Database reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('register-user', ({ userId }) => {
    socket.userId = userId;
    onlineUsers.set(userId, socket.id);
    console.log(`User registered: ${userId} -> Socket ${socket.id}`);
    io.emit('online-status-update', { userId, isOnline: true });
  });

  socket.on('join-chat', ({ chatId }) => {
    socket.join(`chat_${chatId}`);
    console.log(`Socket ${socket.id} joined room chat_${chatId}`);
  });

  socket.on('send-message', async (data) => {
    const { chatId, senderId, text, mediaUrl } = data;
    try {
      const chat = await db.getChatById(chatId);
      if (!chat) return;

      const otherUserId = chat.user1Id === senderId ? chat.user2Id : chat.user1Id;
      const isPartnerOnline = onlineUsers.has(otherUserId);
      const room = io.sockets.adapter.rooms.get(`chat_${chatId}`);
      const partnerSocketId = onlineUsers.get(otherUserId);
      const isPartnerInRoom = room && room.has(partnerSocketId);

      const message = {
        id: 'msg_' + Math.random().toString(36).substr(2, 9),
        chatId,
        senderId,
        text: filterText(text),
        mediaUrl: mediaUrl || null,
        isAudio: data.isAudio || false,
        isFile: data.isFile || false,
        fileName: data.fileName || null,
        fileSize: data.fileSize || null,
        replyTo: data.replyTo || null,
        isViewOnce: data.isViewOnce || false,
        viewedBy: [],
        isSystem: false,
        status: isPartnerInRoom ? 'read' : (isPartnerOnline ? 'delivered' : 'sent'),
        timestamp: new Date().toISOString()
      };

      await db.saveMessage(message);

      // Update daily messaging flag for this sender
      if (chat.user1Id === senderId) {
        chat.user1MessagedToday = true;
      } else if (chat.user2Id === senderId) {
        chat.user2MessagedToday = true;
      }
      await db.saveChat(chat);

      // Broadcast message and updated chat stats to room
      io.to(`chat_${chatId}`).emit('message', message);
      io.to(`chat_${chatId}`).emit('streak-update', { chat });
      
      // Notify globally to update sidebar chat lists
      io.emit('chat-list-updated');
    } catch (err) {
      console.error('Error handling send-message:', err);
    }
  });

  socket.on('read-messages', async ({ chatId, userId }) => {
    try {
      const messages = await db.getMessages(chatId);
      let changed = false;
      messages.forEach(m => {
        if (m.senderId !== userId && m.status !== 'read') {
          m.status = 'read';
          changed = true;
        }
      });
      if (changed) {
        const allMessages = await db.readTable('messages');
        const otherMessages = allMessages.filter(m => m.chatId !== chatId);
        const combined = [...otherMessages, ...messages];
        await db.queueWrite('messages', combined);

        io.to(`chat_${chatId}`).emit('messages-read', { chatId });
      }
    } catch (err) {
      console.error('Error handling read-messages:', err);
    }
  });

  socket.on('screenshot-taken', ({ chatId, userName }) => {
    const systemMsg = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      chatId,
      senderId: 'system',
      text: `⚠️ ${userName} ekran görüntüsü almış veya sohbeti kopyalamış olabilir!`,
      isSystem: true,
      timestamp: new Date().toISOString()
    };
    db.saveMessage(systemMsg).then(() => {
      io.to(`chat_${chatId}`).emit('message', systemMsg);
    });
  });

  socket.on('typing', ({ chatId, userId, isTyping, name }) => {
    socket.to(`chat_${chatId}`).emit('typing', { userId, isTyping, name });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      io.emit('online-status-update', { userId: socket.userId, isOnline: false });
    }
  });
});

// Start the Periodic Background Check for Streaks
setInterval(async () => {
  try {
    const expiredResults = await streakEngine.checkAllStreaks();
    if (expiredResults.length > 0) {
      for (const result of expiredResults) {
        const chatId = result.chatId;
        const freshChat = await db.getChatById(chatId);
        const u1 = await db.getUserById(freshChat.user1Id);
        const u2 = await db.getUserById(freshChat.user2Id);
        
        // Fetch last message (which would be the system alert message)
        const messages = await db.getMessages(chatId);
        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;

        // Broadcast to chat room
        io.to(`chat_${chatId}`).emit('streak-update', { chat: freshChat, engineResult: result, users: { u1, u2 } });
        if (lastMsg) {
          io.to(`chat_${chatId}`).emit('message', lastMsg);
        }
      }
      io.emit('chat-list-updated');
    }
  } catch (err) {
    console.error('Error during background streak check:', err);
  }
}, 15000); // Check every 15 seconds for reactive responsive testing

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await db.init();
  console.log(`Server running on http://localhost:${PORT}`);
});

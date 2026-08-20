const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const db = require('./json-db');
const streakEngine = require('./streak-engine');

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

  socket.on('join-chat', ({ chatId }) => {
    socket.join(`chat_${chatId}`);
    console.log(`Socket ${socket.id} joined room chat_${chatId}`);
  });

  socket.on('send-message', async (data) => {
    const { chatId, senderId, text, mediaUrl } = data;
    try {
      const chat = await db.getChatById(chatId);
      if (!chat) return;

      const message = {
        id: 'msg_' + Math.random().toString(36).substr(2, 9),
        chatId,
        senderId,
        text,
        mediaUrl: mediaUrl || null,
        isSystem: false,
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

  socket.on('typing', ({ chatId, userId, isTyping, name }) => {
    socket.to(`chat_${chatId}`).emit('typing', { userId, isTyping, name });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
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

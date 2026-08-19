const fs = require('fs').promises;
const path = require('path');

class JSONDatabase {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.writeQueue = Promise.resolve();
  }

  async init() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await this.ensureFile('users.json');
      await this.ensureFile('chats.json');
      await this.ensureFile('messages.json');
    } catch (err) {
      console.error("Database initialization failed:", err);
    }
  }

  async ensureFile(filename) {
    const filePath = path.join(this.dataDir, filename);
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  // Queue write operations to prevent race conditions
  async queueWrite(table, data) {
    this.writeQueue = this.writeQueue.then(async () => {
      const filePath = path.join(this.dataDir, `${table}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }).catch(err => {
      console.error(`Error writing table ${table}:`, err);
    });
    return this.writeQueue;
  }

  async readTable(table) {
    const filePath = path.join(this.dataDir, `${table}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error(`Error reading table ${table}, returning empty array.`, err);
      return [];
    }
  }

  // --- Users CRUD ---
  async getUsers() {
    return this.readTable('users');
  }

  async getUserById(id) {
    const users = await this.getUsers();
    return users.find(u => u.id === id) || null;
  }

  async getUserByCode(code) {
    const users = await this.getUsers();
    const cleanCode = code.trim().toUpperCase();
    return users.find(u => u.code.toUpperCase() === cleanCode) || null;
  }

  async saveUser(user) {
    const users = await this.getUsers();
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      users[index] = user;
    } else {
      users.push(user);
    }
    await this.queueWrite('users', users);
    return user;
  }

  // --- Chats CRUD ---
  async getChats() {
    return this.readTable('chats');
  }

  async getChatById(id) {
    const chats = await this.getChats();
    return chats.find(c => c.id === id) || null;
  }

  async getChatsForUser(userId) {
    const chats = await this.getChats();
    return chats.filter(c => c.user1Id === userId || c.user2Id === userId);
  }

  async saveChat(chat) {
    const chats = await this.getChats();
    const index = chats.findIndex(c => c.id === chat.id);
    if (index !== -1) {
      chats[index] = chat;
    } else {
      chats.push(chat);
    }
    await this.queueWrite('chats', chats);
    return chat;
  }

  // --- Messages CRUD ---
  async getMessages(chatId) {
    const messages = await this.readTable('messages');
    return messages.filter(m => m.chatId === chatId);
  }

  async saveMessage(message) {
    const messages = await this.readTable('messages');
    messages.push(message);
    await this.queueWrite('messages', messages);
    return message;
  }

  // Clean data for testing
  async clearAll() {
    await this.queueWrite('users', []);
    await this.queueWrite('chats', []);
    await this.queueWrite('messages', []);
  }
}

module.exports = new JSONDatabase();

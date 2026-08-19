const db = require('./json-db');

const CYCLE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in ms

// Check and update streaks for all active chats
async function checkAllStreaks() {
  const chats = await db.getChats();
  const now = new Date();
  const results = [];

  for (const chat of chats) {
    const cycleStart = new Date(chat.cycleStartDate);
    const timeElapsed = now.getTime() - cycleStart.getTime();

    if (timeElapsed >= CYCLE_DURATION) {
      const result = await processChatCycle(chat);
      results.push(result);
    }
  }

  return results;
}

// Process a single chat's cycle completion
async function processChatCycle(chat) {
  const user1 = await db.getUserById(chat.user1Id);
  const user2 = await db.getUserById(chat.user2Id);

  if (!user1 || !user2) return { chatId: chat.id, status: 'error', reason: 'User not found' };

  const u1Messaged = chat.user1MessagedToday;
  const u2Messaged = chat.user2MessagedToday;

  let streakUpdated = false;
  let streakPreserved = false;
  let streakBroken = false;
  let freezesUsed = [];
  let badgesEarned = [];
  let oldStreak = chat.streakCount;

  if (u1Messaged && u2Messaged) {
    // SUCCESS: Both messaged, increment streak
    chat.streakCount += 1;
    streakUpdated = true;

    // Check milestones for freezes: +1 freeze for every 7 days reached
    if (chat.streakCount % 7 === 0) {
      user1.streakFreezes += 1;
      user2.streakFreezes += 1;
      await db.saveUser(user1);
      await db.saveUser(user2);
    }

    // Check milestones for badges: 7-day, 30-day, 100-day
    const checkBadge = async (user, badgeId, badgeName) => {
      if (!user.badges) user.badges = [];
      if (!user.badges.includes(badgeId)) {
        user.badges.push(badgeId);
        await db.saveUser(user);
        badgesEarned.push({ userId: user.id, name: user.name, badgeName });
      }
    };

    if (chat.streakCount >= 100) {
      await checkBadge(user1, '100-day', 'Streak Legend 👑');
      await checkBadge(user2, '100-day', 'Streak Legend 👑');
    } else if (chat.streakCount >= 30) {
      await checkBadge(user1, '30-day', 'Habit Builder 🛡️');
      await checkBadge(user2, '30-day', 'Habit Builder 🛡️');
    } else if (chat.streakCount >= 7) {
      await checkBadge(user1, '7-day', 'Streak Starter 🚀');
      await checkBadge(user2, '7-day', 'Streak Starter 🚀');
    }

    // System message
    let sysText = `Day completed! Streak is now ${chat.streakCount} days. Keep it up! 🔥`;
    if (chat.streakCount % 7 === 0) {
      sysText += `\nMilestone reached! +1 Streak Freeze ❄️ awarded to both users.`;
    }
    if (badgesEarned.length > 0) {
      const names = [...new Set(badgesEarned.map(b => b.name))].join(' and ');
      sysText += `\nNew Badge Unlocked! ${badgesEarned[0].badgeName} earned! 🎉`;
    }

    await db.saveMessage({
      id: 'sys_' + Math.random().toString(36).substr(2, 9),
      chatId: chat.id,
      senderId: 'system',
      text: sysText,
      mediaUrl: null,
      isSystem: true,
      timestamp: new Date().toISOString()
    });

  } else {
    // FAILURE: At least one user missed messaging
    if (chat.streakCount > 0) {
      // We only try to freeze if there is an active streak to protect
      let u1NeedFreeze = !u1Messaged;
      let u2NeedFreeze = !u2Messaged;

      let u1HasFreeze = user1.streakFreezes > 0;
      let u2HasFreeze = user2.streakFreezes > 0;

      // Can we save it?
      const canSave = (!u1NeedFreeze || u1HasFreeze) && (!u2NeedFreeze || u2HasFreeze);

      if (canSave) {
        if (u1NeedFreeze) {
          user1.streakFreezes -= 1;
          freezesUsed.push(user1.name);
          await db.saveUser(user1);
        }
        if (u2NeedFreeze) {
          user2.streakFreezes -= 1;
          freezesUsed.push(user2.name);
          await db.saveUser(user2);
        }

        streakPreserved = true;

        // System message
        await db.saveMessage({
          id: 'sys_' + Math.random().toString(36).substr(2, 9),
          chatId: chat.id,
          senderId: 'system',
          text: `Streak preserved! ❄️ A Streak Freeze was used automatically for ${freezesUsed.join(' & ')} to keep your ${chat.streakCount}-day streak alive.`,
          mediaUrl: null,
          isSystem: true,
          timestamp: new Date().toISOString()
        });
      } else {
        // Reset streak
        chat.streakCount = 0;
        streakBroken = true;

        await db.saveMessage({
          id: 'sys_' + Math.random().toString(36).substr(2, 9),
          chatId: chat.id,
          senderId: 'system',
          text: `Streak broken! 💔 The 24-hour cycle ended without messages from both sides. Your streak has been reset to 0.`,
          mediaUrl: null,
          isSystem: true,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // Streak is already 0, nothing to freeze or break, just reset the cycle.
      streakBroken = true;
    }
  }

  // Reset daily flags and update cycle start date
  chat.user1MessagedToday = false;
  chat.user2MessagedToday = false;
  chat.cycleStartDate = new Date().toISOString();
  await db.saveChat(chat);

  return {
    chatId: chat.id,
    oldStreak,
    newStreak: chat.streakCount,
    streakUpdated,
    streakPreserved,
    streakBroken,
    freezesUsed,
    badgesEarned
  };
}

// Fast-forward time helper for testing
async function timeWarpChat(chatId, hours) {
  const chat = await db.getChatById(chatId);
  if (!chat) return null;

  // Move the cycleStartDate backwards by the specified number of hours
  const currentStart = new Date(chat.cycleStartDate);
  const warpedStart = new Date(currentStart.getTime() - hours * 60 * 60 * 1000);
  chat.cycleStartDate = warpedStart.toISOString();
  await db.saveChat(chat);

  return chat;
}

module.exports = {
  checkAllStreaks,
  processChatCycle,
  timeWarpChat,
  CYCLE_DURATION
};

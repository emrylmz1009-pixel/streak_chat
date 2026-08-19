const db = require('./json-db');
const streakEngine = require('./streak-engine');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("=== Anonymous Streak Chat Test Runner ===");

  await db.init();
  await db.clearAll();

  // Test 1: User Creation & Code Generation
  console.log("\n[Test 1] Creating Users...");
  const user1 = await db.saveUser({
    id: 'usr_t1_1',
    code: 'AAA-111',
    name: 'Anon Bird',
    streakFreezes: 2,
    badges: [],
    createdAt: new Date().toISOString()
  });

  const user2 = await db.saveUser({
    id: 'usr_t1_2',
    code: 'BBB-222',
    name: 'Anon Cat',
    streakFreezes: 2,
    badges: [],
    createdAt: new Date().toISOString()
  });

  const fetchedU1 = await db.getUserById('usr_t1_1');
  const fetchedU2 = await db.getUserByCode('BBB-222');

  assert(fetchedU1.name === 'Anon Bird', "User 1 name mismatch");
  assert(fetchedU2.name === 'Anon Cat', "User 2 name mismatch");
  console.log("✔ Users successfully created and fetched.");

  // Test 2: Matching
  console.log("\n[Test 2] Creating Chat Room (Match)...");
  const chat = await db.saveChat({
    id: 'chat_t1',
    user1Id: user1.id,
    user2Id: user2.id,
    streakCount: 0,
    cycleStartDate: new Date().toISOString(),
    user1MessagedToday: false,
    user2MessagedToday: false,
    createdAt: new Date().toISOString()
  });

  const chats = await db.getChatsForUser(user1.id);
  assert(chats.length === 1, "Should have 1 active chat for User 1");
  assert(chats[0].user2Id === user2.id, "Chat partner ID mismatch");
  console.log("✔ Chat room successfully matched.");

  // Test 3: Normal Message Cycle Success
  console.log("\n[Test 3] Simulating normal message cycle...");
  // Simulate both users sending a message
  chat.user1MessagedToday = true;
  chat.user2MessagedToday = true;
  await db.saveChat(chat);

  const result1 = await streakEngine.processChatCycle(chat);
  assert(result1.streakUpdated === true, "Streak should have updated");
  assert(result1.newStreak === 1, "Streak should be 1");
  assert(chat.user1MessagedToday === false, "User 1 messaged today should reset to false");
  assert(chat.user2MessagedToday === false, "User 2 messaged today should reset to false");
  console.log("✔ Streak increased to 1. Daily flags reset successfully.");

  // Test 4: Milestone Badge & Freezes
  console.log("\n[Test 4] Simulating streak milestone (7 days)...");
  // Set streak to 6 and simulate messaging to reach 7
  chat.streakCount = 6;
  chat.user1MessagedToday = true;
  chat.user2MessagedToday = true;
  await db.saveChat(chat);

  const result2 = await streakEngine.processChatCycle(chat);
  assert(result2.newStreak === 7, "Streak should be 7");
  
  const freshU1 = await db.getUserById(user1.id);
  const freshU2 = await db.getUserById(user2.id);

  assert(freshU1.streakFreezes === 3, "User 1 should have earned a freeze (+1 from 2 = 3)");
  assert(freshU2.streakFreezes === 3, "User 2 should have earned a freeze (+1 from 2 = 3)");
  assert(freshU1.badges.includes('7-day'), "User 1 should have 7-day badge");
  assert(freshU2.badges.includes('7-day'), "User 2 should have 7-day badge");
  console.log("✔ 7-day milestone reached! Badges awarded and streak freezes incremented.");

  // Test 5: Streak Freeze preservation
  console.log("\n[Test 5] Simulating Streak Freeze consumption...");
  // Let only user 1 write a message (user 2 misses)
  chat.user1MessagedToday = true;
  chat.user2MessagedToday = false;
  await db.saveChat(chat);

  // User 2 has 3 freezes currently
  const result3 = await streakEngine.processChatCycle(chat);
  assert(result3.streakPreserved === true, "Streak should be preserved");
  assert(result3.newStreak === 7, "Streak should remain 7");
  
  const freshU2PostFreeze = await db.getUserById(user2.id);
  assert(freshU2PostFreeze.streakFreezes === 2, "User 2's freezes should decrement to 2");
  
  const messages = await db.getMessages(chat.id);
  const lastMsg = messages[messages.length - 1];
  assert(lastMsg.isSystem === true, "Last message should be a system notification");
  assert(lastMsg.text.includes("Streak preserved"), "System message text should state streak was preserved");
  console.log("✔ Streak preserved using User 2's freeze. Freeze count successfully decremented.");

  // Test 6: Streak Breaking when freezes run out
  console.log("\n[Test 6] Simulating Streak breaking when freezes run out...");
  // Set freezes to 0 for both users
  const u1NoFreezes = await db.getUserById(user1.id);
  const u2NoFreezes = await db.getUserById(user2.id);
  u1NoFreezes.streakFreezes = 0;
  u2NoFreezes.streakFreezes = 0;
  await db.saveUser(u1NoFreezes);
  await db.saveUser(u2NoFreezes);

  // No one messages
  chat.user1MessagedToday = false;
  chat.user2MessagedToday = false;
  await db.saveChat(chat);

  const result4 = await streakEngine.processChatCycle(chat);
  assert(result4.streakBroken === true, "Streak should be broken");
  assert(result4.newStreak === 0, "Streak should reset to 0");
  
  const finalMessages = await db.getMessages(chat.id);
  const finalLastMsg = finalMessages[finalMessages.length - 1];
  assert(finalLastMsg.text.includes("Streak broken"), "System message should announce broken streak");
  console.log("✔ Streak successfully reset to 0 when no freezes were available.");

  console.log("\n=================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY 🎉");
  console.log("=================================");
}

runTests().catch(err => {
  console.error("\n❌ TEST RUNNER FAILED:", err);
  process.exit(1);
});

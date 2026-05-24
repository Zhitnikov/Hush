const User = require('../models/User');

async function getFolders(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return user.folders || [];
}

async function saveFolder(userId, name, chats) {
  const user = await User.findById(userId);
  const existing = user.folders.find((f) => f.name === name);
  if (existing) existing.chats = chats;
  else user.folders.push({ name, chats });
  await user.save();
  return user.folders;
}

async function deleteFolder(userId, name) {
  const user = await User.findById(userId);
  user.folders = user.folders.filter((f) => f.name !== name);
  await user.save();
  return user.folders;
}

async function updatePrivacy(userId, lastSeenVisibility) {
  await User.findByIdAndUpdate(userId, { 'privacy.lastSeenVisibility': lastSeenVisibility });
  return { msg: 'Privacy updated' };
}

async function updateDnd(userId, enabled, start, end) {
  await User.findByIdAndUpdate(userId, { dnd: { enabled, schedule: { start, end } } });
  return { msg: 'DND updated' };
}

async function setAlias(userId, targetUserId, alias) {
  const user = await User.findById(userId);
  user.aliases.set(targetUserId, alias);
  await user.save();
  return { msg: 'Alias updated' };
}

async function setChatPreference(userId, chatId, bubbleColor) {
  const user = await User.findById(userId);
  const prefs = user.chatPreferences.get(chatId) || {};
  user.chatPreferences.set(chatId, { ...prefs, bubbleColor });
  await user.save();
  return { msg: 'Preferences updated' };
}

async function toggleMute(userId, chatId) {
  const user = await User.findById(userId);
  const isMuted = user.mutedChats.includes(chatId);
  if (isMuted) {
    user.mutedChats = user.mutedChats.filter((id) => id.toString() !== chatId);
  } else {
    user.mutedChats.push(chatId);
  }
  await user.save();
  return { muted: !isMuted };
}

module.exports = {
  getFolders,
  saveFolder,
  deleteFolder,
  updatePrivacy,
  updateDnd,
  setAlias,
  setChatPreference,
  toggleMute,
};

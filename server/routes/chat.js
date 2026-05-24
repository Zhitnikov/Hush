const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireChannelMember, requireChannelAdmin } = require('../middleware/channelAccess');
const chatService = require('../services/chatService');
const channelService = require('../services/channelService');
const userPrefsService = require('../services/userPrefsService');
const { UPLOAD_DISABLED_HTTP, UPLOAD_DISABLED_MSG } = require('../config/constants');

router.post('/upload', auth, (_req, res) => {
  res.status(UPLOAD_DISABLED_HTTP).json({ msg: UPLOAD_DISABLED_MSG });
});

router.get('/users', auth, async (req, res, next) => {
  try {
    res.json(await chatService.listUsersWithMeta(req.user.userId));
  } catch (err) {
    next(err);
  }
});

router.get('/channels', auth, async (req, res, next) => {
  try {
    res.json(await chatService.listChannelsWithMeta(req.user.userId));
  } catch (err) {
    next(err);
  }
});

router.post('/channels', auth, async (req, res, next) => {
  try {
    res.json(await channelService.createChannel(req.user.userId, req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/messages/channel/:channelId', auth, requireChannelMember, async (req, res, next) => {
  try {
    res.json(await chatService.getChannelMessages(req.user.userId, req.params.channelId, req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/messages/private/:otherUserId', auth, async (req, res, next) => {
  try {
    res.json(await chatService.getPrivateMessages(req.user.userId, req.params.otherUserId, req.query));
  } catch (err) {
    next(err);
  }
});

router.post('/channels/:id/join', auth, async (req, res, next) => {
  try {
    res.json(await channelService.joinChannel(req.user.userId, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/channels/:id/members', auth, async (req, res, next) => {
  try {
    res.json(await channelService.getChannelMembers(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/messages/media/:chatId', auth, async (req, res, next) => {
  try {
    res.json(await chatService.getChatMedia(req.user.userId, req.params.chatId, req.query.chatType));
  } catch (err) {
    next(err);
  }
});

router.get('/messages/search', auth, async (req, res, next) => {
  try {
    const { chatId, chatType, query } = req.query;
    res.json(await chatService.searchInChat(req.user.userId, chatId, chatType, query));
  } catch (err) {
    next(err);
  }
});

router.post('/channels/:id/keys', auth, requireChannelAdmin, async (req, res, next) => {
  try {
    res.json(await channelService.updateChannelKeys(req.channel, req.body.keys));
  } catch (err) {
    next(err);
  }
});

router.get('/folders', auth, async (req, res, next) => {
  try {
    res.json(await userPrefsService.getFolders(req.user.userId));
  } catch (err) {
    next(err);
  }
});

router.post('/folders', auth, async (req, res, next) => {
  try {
    const { name, chats } = req.body;
    res.json(await userPrefsService.saveFolder(req.user.userId, name, chats));
  } catch (err) {
    next(err);
  }
});

router.get('/link-preview', auth, async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ msg: 'URL required' });
    res.json(await chatService.fetchLinkPreview(url));
  } catch (err) {
    res.status(500).json({ msg: 'Failed to fetch preview' });
  }
});

router.get('/directory/search', auth, async (req, res, next) => {
  try {
    res.json(await chatService.searchDirectory(req.user.userId, req.query.q));
  } catch (err) {
    next(err);
  }
});

router.get('/stats/:id', auth, async (req, res, next) => {
  try {
    res.json(await channelService.getChannelStats(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.delete('/folders/:name', auth, async (req, res, next) => {
  try {
    res.json(await userPrefsService.deleteFolder(req.user.userId, req.params.name));
  } catch (err) {
    next(err);
  }
});

router.get('/search-global', auth, async (req, res, next) => {
  try {
    res.json(await chatService.searchGlobal(req.user.userId, req.query.query));
  } catch (err) {
    next(err);
  }
});

router.post('/privacy', auth, async (req, res, next) => {
  try {
    const { lastSeenVisibility } = req.body;
    res.json(await userPrefsService.updatePrivacy(req.user.userId, lastSeenVisibility));
  } catch (err) {
    next(err);
  }
});

router.post('/dnd', auth, async (req, res, next) => {
  try {
    const { enabled, start, end } = req.body;
    res.json(await userPrefsService.updateDnd(req.user.userId, enabled, start, end));
  } catch (err) {
    next(err);
  }
});

router.post('/alias', auth, async (req, res, next) => {
  try {
    const { targetUserId, alias } = req.body;
    res.json(await userPrefsService.setAlias(req.user.userId, targetUserId, alias));
  } catch (err) {
    next(err);
  }
});

router.post('/preferences', auth, async (req, res, next) => {
  try {
    const { chatId, bubbleColor } = req.body;
    res.json(await userPrefsService.setChatPreference(req.user.userId, chatId, bubbleColor));
  } catch (err) {
    next(err);
  }
});

router.post('/pin', auth, async (req, res, next) => {
  try {
    const { channelId, messageId } = req.body;
    res.json(await channelService.pinMessage(req.user.userId, channelId, messageId));
  } catch (err) {
    next(err);
  }
});

router.post('/channels/:id/invite', auth, requireChannelAdmin, async (req, res, next) => {
  try {
    res.json(await channelService.enableInvite(req.channel));
  } catch (err) {
    next(err);
  }
});

router.post('/join/:token', auth, async (req, res, next) => {
  try {
    res.json(await channelService.joinByToken(req.user.userId, req.params.token));
  } catch (err) {
    next(err);
  }
});

router.post('/channels/:id/request-join', auth, async (req, res, next) => {
  try {
    res.json(await channelService.requestJoin(req.user.userId, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch('/channels/:id/members/:userId/role', auth, requireChannelAdmin, async (req, res, next) => {
  try {
    res.json(await channelService.setMemberRole(req.channel, req.params.userId, req.body.role));
  } catch (err) {
    next(err);
  }
});

router.get('/messages/thread/:threadId', auth, async (req, res, next) => {
  try {
    res.json(await chatService.getThreadMessages(req.params.threadId, req.query));
  } catch (err) {
    next(err);
  }
});

router.post('/mute', auth, async (req, res, next) => {
  try {
    res.json(await userPrefsService.toggleMute(req.user.userId, req.body.chatId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const axios = require('axios');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Channel = require('../models/Channel');
const Message = require('../models/Message');

function parseMessageLimit(req) {
    const n = parseInt(req.query.limit, 10);
    return Math.min(Math.max(Number.isFinite(n) ? n : 40, 1), 100);
}

function parseBeforeDate(req) {
    const b = req.query.before;
    if (!b) return null;
    const d = new Date(b);
    return Number.isNaN(d.getTime()) ? null : d;
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

router.post('/upload', auth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ msg: 'No file uploaded' });

    const fileType = req.file.mimetype.startsWith('image/') ? 'image' :
        req.file.mimetype.startsWith('video/') ? 'video' :
            req.file.mimetype.startsWith('audio/') ? 'audio' : 'document';

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ fileUrl, fileType });
});

router.get('/users', auth, async (req, res) => {
    try {
        const users = await User.find({ _id: { $ne: req.user.userId } }).select('-password');

        const usersWithMetadata = await Promise.all(users.map(async (u) => {
            const unreadCount = await Message.countDocuments({
                sender: u._id,
                receiver: req.user.userId,
                readBy: { $ne: req.user.userId }
            });
            return { ...u.toObject(), unreadCount };
        }));

        res.json(usersWithMetadata);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/channels', auth, async (req, res) => {
    try {
        const channels = await Channel.find().populate('creator', 'username');

        const channelsWithMetadata = await Promise.all(channels.map(async (c) => {
            const unreadCount = await Message.countDocuments({
                channel: c._id,
                readBy: { $ne: req.user.userId }
            });
            return { ...c.toObject(), unreadCount };
        }));

        res.json(channelsWithMetadata);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/channels', auth, async (req, res) => {
    try {
        const { name, description, type } = req.body;
        const newChannel = new Channel({
            name,
            description,
            type: type || 'group',
            creator: req.user.userId
        });
        await newChannel.save();
        res.json(newChannel);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/messages/channel/:channelId', auth, async (req, res) => {
    try {
        const limit = parseMessageLimit(req);
        const before = parseBeforeDate(req);
        const query = { channel: req.params.channelId };
        if (before) query.createdAt = { $lt: before };
        const batch = await Message.find(query)
            .populate('sender', 'username')
            .populate('replyTo')
            .sort({ createdAt: -1 })
            .limit(limit);
        const messages = batch.reverse();
        res.json({ messages, hasMore: batch.length === limit });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/messages/private/:otherUserId', auth, async (req, res) => {
    try {
        const limit = parseMessageLimit(req);
        const before = parseBeforeDate(req);
        const base = {
            $or: [
                { sender: req.user.userId, receiver: req.params.otherUserId },
                { sender: req.params.otherUserId, receiver: req.user.userId }
            ]
        };
        const query = before ? { ...base, createdAt: { $lt: before } } : base;
        const batch = await Message.find(query)
            .populate('sender', 'username')
            .populate('replyTo')
            .sort({ createdAt: -1 })
            .limit(limit);
        const messages = batch.reverse();
        res.json({ messages, hasMore: batch.length === limit });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/channels/:id/join', auth, async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.id);
        if (!channel) return res.status(404).json({ msg: 'Channel not found' });

        if (!channel.members.includes(req.user.userId)) {
            channel.members.push(req.user.userId);
            await channel.save();
        }
        res.json(channel);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/channels/:id/members', auth, async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.id).populate('members', 'username publicKey');
        if (!channel) return res.status(404).json({ msg: 'Channel not found' });
        res.json(channel.members);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/messages/media/:chatId', auth, async (req, res) => {
    try {
        const { chatType } = req.query;
        let query = { fileUrl: { $ne: null } };

        if (chatType === 'channel') {
            query.channel = req.params.chatId;
        } else {
            query.$or = [
                { sender: req.user.userId, receiver: req.params.chatId },
                { sender: req.params.chatId, receiver: req.user.userId }
            ];
        }

        const media = await Message.find(query).sort({ createdAt: -1 });
        res.json(media);
    } catch (err) { res.status(500).send('Server Error'); }
});

router.get('/messages/search', auth, async (req, res) => {
    try {
        const { chatId, chatType, query } = req.query;
        if (!query) return res.json([]);

        let filter = {
            content: { $regex: query, $options: 'i' },
            isDeleted: false
        };

        if (chatType === 'channel') {
            filter.channel = chatId;
        } else {
            filter.$or = [
                { sender: req.user.userId, receiver: chatId },
                { sender: chatId, receiver: req.user.userId }
            ];
        }

        const messages = await Message.find(filter)
            .populate('sender', 'username')
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(messages);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/channels/:id/keys', auth, async (req, res) => {
    try {
        const { keys } = req.body;
        const channel = await Channel.findById(req.params.id);
        if (!channel) return res.status(404).json({ msg: 'Channel not found' });

        channel.encryptedKeys = keys;
        await channel.save();
        res.json({ msg: 'Keys updated' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/folders', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json(user.folders || []);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/folders', auth, async (req, res) => {
    try {
        const { name, chats } = req.body;
        const user = await User.findById(req.user.userId);

        const existing = user.folders.find(f => f.name === name);
        if (existing) {
            existing.chats = chats;
        } else {
            user.folders.push({ name, chats });
        }
        await user.save();
        res.json(user.folders);
    } catch (err) { res.status(500).send('Server Error'); }
});

router.get('/link-preview', auth, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ msg: 'URL required' });
        const { data } = await axios.get(url, { timeout: 3000, headers: { 'User-Agent': 'Mozilla/5.0' } });

        const titleMatch = data.match(/<title>(.*?)<\/title>/i);
        const descMatch = data.match(/<meta name="description" content="(.*?)"/i) || data.match(/<meta property="og:description" content="(.*?)"/i);
        const imgMatch = data.match(/<meta property="og:image" content="(.*?)"/i);

        res.json({
            title: titleMatch ? titleMatch[1] : url,
            description: descMatch ? descMatch[1] : '',
            image: imgMatch ? imgMatch[1] : '',
            url
        });
    } catch (err) {
        res.status(500).json({ msg: 'Failed to fetch preview' });
    }
});

router.get('/directory/search', auth, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json({ users: [], channels: [] });

        const [users, channels] = await Promise.all([
            User.find({ username: { $regex: q, $options: 'i' }, _id: { $ne: req.user.userId } }).limit(5).select('username profilePic'),
            Channel.find({ name: { $regex: q, $options: 'i' } }).limit(5)
        ]);

        res.json({ users, channels });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.get('/stats/:id', auth, async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.id);
        if (!channel) return res.status(404).json({ msg: 'Channel not found' });

        const [msgCount, membersCount] = await Promise.all([
            Message.countDocuments({ channel: req.params.id }),
            Promise.resolve(channel.members.length)
        ]);

        const topContributors = await Message.aggregate([
            { $match: { channel: channel._id } },
            { $group: { _id: '$sender', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 3 },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            { $project: { username: '$user.username', count: 1 } }
        ]);

        res.json({ msgCount, membersCount, topContributors });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.delete('/folders/:name', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        user.folders = user.folders.filter(f => f.name !== req.params.name);
        await user.save();
        res.json(user.folders);
    } catch (err) { res.status(500).send('Server Error'); }
});

router.get('/search-global', auth, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);
        const messages = await Message.find({
            $or: [{ sender: req.user.userId }, { receiver: req.user.userId }, { channel: { $in: await Channel.find({ members: req.user.userId }).distinct('_id') } }],
            content: { $regex: query, $options: 'i' },
            isDeleted: false
        }).populate('sender', 'username profilePic').sort({ createdAt: -1 }).limit(50);
        res.json(messages);
    } catch (err) { res.status(500).send('Server Error'); }
});

router.post('/privacy', auth, async (req, res) => {
    try {
        const { lastSeenVisibility } = req.body;
        await User.findByIdAndUpdate(req.user.userId, { 'privacy.lastSeenVisibility': lastSeenVisibility });
        res.json({ msg: 'Privacy updated' });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.post('/dnd', auth, async (req, res) => {
    try {
        const { enabled, start, end } = req.body;
        await User.findByIdAndUpdate(req.user.userId, { dnd: { enabled, schedule: { start, end } } });
        res.json({ msg: 'DND updated' });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.post('/alias', auth, async (req, res) => {
    try {
        const { targetUserId, alias } = req.body;
        const user = await User.findById(req.user.userId);
        user.aliases.set(targetUserId, alias);
        await user.save();
        res.json({ msg: 'Alias updated' });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.post('/preferences', auth, async (req, res) => {
    try {
        const { chatId, bubbleColor } = req.body;
        const user = await User.findById(req.user.userId);
        const prefs = user.chatPreferences.get(chatId) || {};
        user.chatPreferences.set(chatId, { ...prefs, bubbleColor });
        await user.save();
        res.json({ msg: 'Preferences updated' });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.post('/pin', auth, async (req, res) => {
    try {
        const { channelId, messageId } = req.body;
        const channel = await Channel.findById(channelId);
        if (!channel) return res.status(404).json({ msg: 'Channel not found' });
        if (channel.creator.toString() !== req.user.userId) return res.status(403).json({ msg: 'Unauthorized' });

        channel.pinnedMessage = messageId;
        await channel.save();
        res.json({ msg: 'Message pinned' });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.post('/mute', auth, async (req, res) => {
    try {
        const { chatId } = req.body;
        const user = await User.findById(req.user.userId);
        const isMuted = user.mutedChats.includes(chatId);
        if (isMuted) {
            user.mutedChats = user.mutedChats.filter(id => id.toString() !== chatId);
        } else {
            user.mutedChats.push(chatId);
        }
        await user.save();
        res.json({ muted: !isMuted });
    } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;

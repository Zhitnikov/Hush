const Channel = require('../models/Channel');

async function requireChannelMember(req, res, next) {
  try {
    const channelId = req.params.channelId || req.params.id;
    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ msg: 'Channel not found' });
    const uid = req.user.userId;
    if (!channel.members.some((m) => m.toString() === uid)) {
      return res.status(403).json({ msg: 'Not a channel member' });
    }
    req.channel = channel;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireChannelAdmin(req, res, next) {
  try {
    const channelId = req.params.channelId || req.params.id;
    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ msg: 'Channel not found' });
    const uid = req.user.userId;
    if (!channel.members.some((m) => m.toString() === uid)) {
      return res.status(403).json({ msg: 'Not a channel member' });
    }
    const role = channel.getMemberRole(uid);
    if (!['owner', 'admin'].includes(role)) {
      return res.status(403).json({ msg: 'Admin required' });
    }
    req.channel = channel;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireChannelMember, requireChannelAdmin };

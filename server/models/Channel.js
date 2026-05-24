const mongoose = require('mongoose');
const crypto = require('crypto');
const { CHANNEL_ROLES } = require('../config/constants');

const ChannelSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    memberRoles: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, enum: CHANNEL_ROLES, default: 'member' },
    }],
    type: { type: String, enum: ['group', 'broadcast'], default: 'group' },
    inviteToken: { type: String, unique: true, sparse: true },
    inviteEnabled: { type: Boolean, default: false },
    joinRequests: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
    }],
    encryptedKeys: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        key: String,
    }],
    pinnedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    settings: {
        restrictForward: { type: Boolean, default: false },
        mediaOnly: { type: Boolean, default: false },
        membersCannotPost: { type: Boolean, default: false },
    },
    createdAt: { type: Date, default: Date.now },
});

ChannelSchema.methods.getMemberRole = function (userId) {
    const uid = userId.toString();
    if (this.creator.toString() === uid) return 'owner';
    const entry = (this.memberRoles || []).find((r) => r.userId?.toString() === uid);
    return entry?.role || (this.members.some((m) => m.toString() === uid) ? 'member' : null);
};

ChannelSchema.methods.ensureInviteToken = function () {
    if (!this.inviteToken) {
        this.inviteToken = crypto.randomBytes(16).toString('hex');
    }
    return this.inviteToken;
};

ChannelSchema.pre('save', function (next) {
    if (this.isNew && !this.members.includes(this.creator)) {
        this.members.push(this.creator);
    }
    if (this.isNew) {
        const hasOwner = (this.memberRoles || []).some((r) => r.userId?.toString() === this.creator.toString());
        if (!hasOwner) {
            this.memberRoles = [...(this.memberRoles || []), { userId: this.creator, role: 'owner' }];
        }
    }
    next();
});

ChannelSchema.index({ members: 1 });
ChannelSchema.index({ inviteToken: 1 }, { sparse: true });

module.exports = mongoose.model('Channel', ChannelSchema);

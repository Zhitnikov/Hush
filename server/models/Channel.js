const mongoose = require('mongoose');

const ChannelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: String,
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    type: {
        type: String,
        enum: ['group', 'broadcast'],
        default: 'group'
    },
    encryptedKeys: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        key: String
    }],
    pinnedMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

ChannelSchema.pre('save', function (next) {
    if (this.isNew && !this.members.includes(this.creator)) {
        this.members.push(this.creator);
    }
    next();
});

module.exports = mongoose.model('Channel', ChannelSchema);

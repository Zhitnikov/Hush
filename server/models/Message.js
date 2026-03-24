const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    channel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Channel',
        default: null
    },
    content: {
        type: String,
        required: false
    },
    fileUrl: {
        type: String,
        default: null
    },
    fileType: {
        type: String,
        enum: ['image', 'video', 'audio', 'document', 'sticker', null],
        default: null
    },
    isChannel: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    },
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    reactions: [{
        emoji: String,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    scheduledAt: {
        type: Date,
        default: null
    },
    ogPreview: {
        title: String,
        description: String,
        image: String,
        url: String
    },
    poll: {
        question: String,
        options: [{
            text: String,
            votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
        }],
        isAnonymous: { type: Boolean, default: true },
        isMultiple: { type: Boolean, default: false }
    },
    isVideoCircle: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Message', MessageSchema);

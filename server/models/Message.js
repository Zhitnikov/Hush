const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null, index: true },
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null, index: true },
    content: { type: String, required: false },
    fileUrl: { type: String, default: null },
    fileType: {
        type: String,
        enum: ['image', 'video', 'audio', 'document', 'sticker', null],
        default: null,
    },
    isChannel: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false },
    editHistory: [{ content: String, at: { type: Date, default: Date.now } }],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    forwardFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    expiresAt: { type: Date, default: null },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reactions: [{
        emoji: String,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],
    scheduledAt: { type: Date, default: null, index: true },
    ogPreview: {
        title: String,
        description: String,
        image: String,
        url: String,
    },
    poll: {
        question: String,
        options: [{
            text: String,
            votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        }],
        isAnonymous: { type: Boolean, default: true },
        isMultiple: { type: Boolean, default: false },
    },
    isVideoCircle: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, index: true },
});

MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
MessageSchema.index({ channel: 1, createdAt: -1 });
MessageSchema.index({ scheduledAt: 1 }, { sparse: true });
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

module.exports = mongoose.model('Message', MessageSchema);

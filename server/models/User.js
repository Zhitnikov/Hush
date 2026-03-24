const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    profilePic: {
        type: String,
        default: ''
    },
    name: {
        type: String,
        default: ''
    },
    bio: {
        type: String,
        default: ''
    },
    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    publicKey: {
        type: String,
        default: null
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    folders: [{
        name: String,
        chats: [String]
    }],
    mutedChats: [{ type: mongoose.Schema.Types.ObjectId }],
    aliases: {
        type: Map,
        of: String,
        default: {}
    },
    chatPreferences: {
        type: Map,
        of: {
            bubbleColor: String,
            wallpaper: String
        },
        default: {}
    },
    privacy: {
        lastSeenVisibility: { type: String, enum: ['everybody', 'contacts', 'nobody'], default: 'everybody' },
        hiddenFrom: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },
    dnd: {
        enabled: { type: Boolean, default: false },
        until: Date,
        schedule: {
            start: String,
            end: String
        }
    },
    lastCleanup: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);

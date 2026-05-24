function toAuthUserDto(user) {
  return {
    id: user.id,
    username: user.username,
    publicKey: user.publicKey,
  };
}

function toUserPublicDto(user) {
  if (!user) return null;
  return {
    id: user._id?.toString() || user.id,
    username: user.username,
    profilePic: user.profilePic,
    bio: user.bio,
    name: user.name,
    publicKey: user.publicKey,
    lastSeen: user.lastSeen,
  };
}

function toUserListItemDto(userDoc, meta) {
  return {
    ...userDoc.toObject(),
    unreadCount: meta.unreadCount,
    lastMessage: meta.lastMessage,
    lastMessageAt: meta.lastMessageAt,
  };
}

module.exports = { toAuthUserDto, toUserPublicDto, toUserListItemDto };

function toChannelListItemDto(channelDoc, meta) {
  return {
    ...channelDoc.toObject(),
    unreadCount: meta.unreadCount,
    lastMessage: meta.lastMessage,
    lastMessageAt: meta.lastMessageAt,
  };
}

function toInviteDto(token) {
  return { inviteToken: token, invitePath: `/join/${token}` };
}

module.exports = { toChannelListItemDto, toInviteDto };

function toMessagesPageDto(messages, hasMore) {
  return { messages, hasMore };
}

function toThreadMessagesDto(messages) {
  return { messages };
}

module.exports = { toMessagesPageDto, toThreadMessagesDto };

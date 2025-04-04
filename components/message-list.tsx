import { ScrollArea } from "@/components/ui/scroll-area"
import type { Message, User } from "@/types/chat"
import type { RefObject } from "react"
import { Check, CheckCheck } from "lucide-react"

interface MessageListProps {
  messages: Message[]
  currentUser: User | null
  selectedUser: User | null
  messagesEndRef: RefObject<HTMLDivElement>
  readMessages: Record<string, boolean>
  userStatus: Record<string, { online: boolean; typing: boolean; lastSeen?: string }>
}

export function MessageList({
  messages,
  currentUser,
  selectedUser,
  messagesEndRef,
  readMessages,
  userStatus,
}: MessageListProps) {
  const getInitials = (name: string) => {
    return name?.substring(0, 2).toUpperCase() || "??"
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const formatLastSeen = (timestamp?: string) => {
    if (!timestamp) return "недавно"

    const lastSeen = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - lastSeen.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "только что"
    if (diffMins < 60) return `${diffMins} мин. назад`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} ч. назад`

    return lastSeen.toLocaleDateString()
  }

  // Sort messages by timestamp (oldest first)
  const sortedMessages = [...messages].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())

  return (
    <div className="flex flex-col h-full">
      {selectedUser && (
        <div className="px-4 py-2 text-xs text-muted-foreground text-center border-b border-border">
          {userStatus[selectedUser.id]?.online ? (
            <span className="text-green-500">В сети</span>
          ) : (
            <span>Был недавно {formatLastSeen(userStatus[selectedUser.id]?.lastSeen)}</span>
          )}
          {userStatus[selectedUser.id]?.typing && <span className="ml-2 text-primary animate-pulse">печатает...</span>}
        </div>
      )}

      <ScrollArea className="flex-1 p-4 relative">
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
          <div className="space-y-3">
            {sortedMessages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">Начните общение</div>
            ) : (
              sortedMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender_id === currentUser?.id ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg py-2 px-3 ${
                      message.sender_id === currentUser?.id ? "bg-primary text-primary-foreground" : "bg-secondary"
                    }`}
                  >
                    <div className="break-words text-sm">{message.decrypted_content || "No content available"}</div>
                    <div
                      className={`text-[9px] mt-0.5 flex items-center gap-1 ${
                        message.sender_id === currentUser?.id
                          ? "text-primary-foreground/70 justify-end"
                          : "text-muted-foreground"
                      }`}
                    >
                      <span>{formatTime(message.sent_at)}</span>
                      {message.sender_id === currentUser?.id && (
                        <span className="flex items-center ml-1">
                          {readMessages[message.id] ? (
                            <CheckCheck className="h-2.5 w-2.5" />
                          ) : (
                            <Check className="h-2.5 w-2.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}


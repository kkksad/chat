export interface User {
  id: string
  username: string
  public_key: string
  created_at?: string
  last_seen?: string
  online?: boolean
}

export interface Message {
  id: string
  sender_id: string
  recipient_id: string
  encrypted_content: string
  decrypted_content?: string
  sent_at: string
}

export interface ChatState {
  users: User[]
  filteredUsers: User[]
  selectedUser: string | null
  messages: Message[]
  unreadMessages: Record<string, number>
  isLoading: boolean
  searchQuery: string
  userStatus: Record<
    string,
    {
      online: boolean
      typing: boolean
      lastSeen?: string
    }
  >
}

export interface SupabaseRealtimePayload<T> {
  commit_timestamp: string
  eventType: "INSERT" | "UPDATE" | "DELETE"
  schema: string
  table: string
  new: T
  old: T | null
}

export interface TypingStatus {
  user_id: string
  recipient_id: string
  is_typing: boolean
}


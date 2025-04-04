"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Search } from "lucide-react"
import type { User } from "@/types/chat"

interface UserListProps {
  users: User[]
  selectedUser: string | null
  searchQuery: string
  unreadMessages: Record<string, number>
  userStatus: Record<string, { online: boolean; typing: boolean; lastSeen?: string }>
  onSelectUser: (userId: string) => void
  onSearchChange: (query: string) => void
}

export function UserList({
  users,
  selectedUser,
  searchQuery,
  unreadMessages,
  userStatus,
  onSelectUser,
  onSearchChange,
}: UserListProps) {
  const getInitials = (name: string) => {
    return name?.substring(0, 2).toUpperCase() || "??"
  }

  return (
    <div className="w-full md:w-80 md:min-w-80 bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col h-[calc(100vh-8rem)] md:h-auto">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Найти пользователя..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {users.length > 0 ? (
            users.map((user) => (
              <div
                key={user.id}
                className={`p-2.5 rounded-lg cursor-pointer transition-all flex items-center gap-2 ${
                  selectedUser === user.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
                onClick={() => onSelectUser(user.id)}
              >
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback
                      className={selectedUser === user.id ? "bg-primary-foreground text-primary" : "bg-secondary"}
                    >
                      {getInitials(user.username)}
                    </AvatarFallback>
                  </Avatar>
                  {userStatus[user.id]?.online && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-card"></span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{user.username}</div>
                  {userStatus[user.id]?.typing && <div className="text-xs text-primary animate-pulse">печатает...</div>}
                </div>
                {unreadMessages[user.id] > 0 && (
                  <span className="ml-auto bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {unreadMessages[user.id]}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="text-muted-foreground text-center p-4 text-sm">Нет пользователей</div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}


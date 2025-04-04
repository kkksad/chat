"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { LogOut, Menu, UserCircle } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserList } from "@/components/user-list"
import { MessageList } from "@/components/message-list"
import { MessageInput } from "@/components/message-input"
import { useChat } from "@/hooks/use-chat"
import type { User } from "@/types/chat"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export default function ChatPage() {
  const {
    state,
    newMessage,
    setNewMessage,
    currentUser,
    isSending,
    messagesEndRef,
    sendMessage,
    selectUser,
    updateSearchQuery,
    logout,
    toggleUserList,
    readMessages,
  } = useChat()

  const [showUserList, setShowUserList] = useState(true)
  const [selectedUserData, setSelectedUserData] = useState<User | null>(null)
  const [username, setUsername] = useState<string>("")
  const [isMobile, setIsMobile] = useState(false)

  // Get username from localStorage after component mounts
  useEffect(() => {
    setUsername(localStorage.getItem("username") || "")
  }, [])

  // Handle responsive layout
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      setShowUserList(!mobile || !state.selectedUser)
    }

    window.addEventListener("resize", handleResize)
    handleResize()

    return () => window.removeEventListener("resize", handleResize)
  }, [state.selectedUser])

  // Update selected user data when selected user changes
  useEffect(() => {
    if (state.selectedUser) {
      const userData = state.users.find((u) => u.id === state.selectedUser) || null
      setSelectedUserData(userData)

      // On mobile, hide user list when a user is selected
      if (isMobile) {
        setShowUserList(false)
      }
    } else {
      setSelectedUserData(null)

      // On mobile, show user list when no user is selected
      if (isMobile) {
        setShowUserList(true)
      }
    }
  }, [state.selectedUser, state.users, isMobile])

  const getInitials = (name: string) => {
    return name?.substring(0, 2).toUpperCase() || "??"
  }

  const handleBackToUsers = () => {
    setShowUserList(true)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 items-center justify-between py-2 px-4">
          <div className="flex items-center gap-3">
            {isMobile && state.selectedUser && !showUserList ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleBackToUsers}>Список пользователей</DropdownMenuItem>
                  <DropdownMenuItem onClick={logout}>Выйти</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowUserList(!showUserList)}>
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-lg font-bold truncate">
              {isMobile && selectedUserData && !showUserList
                ? `Чат с ${selectedUserData.username}`
                : `Привет, ${username}`}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" onClick={logout} className="flex items-center gap-2" size="sm">
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 container mx-auto py-2 px-2 md:py-4 md:px-4 flex flex-col md:flex-row gap-2 md:gap-4">
        {showUserList && (
          <UserList
            users={state.filteredUsers}
            selectedUser={state.selectedUser}
            searchQuery={state.searchQuery}
            unreadMessages={state.unreadMessages}
            userStatus={state.userStatus}
            onSelectUser={selectUser}
            onSearchChange={updateSearchQuery}
          />
        )}

        <div
          className={`flex-1 border border-border rounded-lg bg-card shadow-sm flex flex-col overflow-hidden ${
            !showUserList || !isMobile ? "block" : "hidden md:flex"
          } ${isMobile && !showUserList ? "fixed inset-0 z-10 pt-14" : ""}`}
        >
          {state.selectedUser && selectedUserData ? (
            <div className="flex flex-col h-full">
              <MessageList
                messages={state.messages}
                currentUser={currentUser}
                selectedUser={selectedUserData}
                messagesEndRef={messagesEndRef}
                readMessages={readMessages}
                userStatus={state.userStatus}
              />

              <Separator />

              <MessageInput value={newMessage} onChange={setNewMessage} onSend={sendMessage} isSending={isSending} />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-center p-4">
              <div className="space-y-2">
                <UserCircle className="h-12 w-12 mx-auto opacity-50" />
                <p>Выберите пользователя для начала общения</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


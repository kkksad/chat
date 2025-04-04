"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import type { User, Message, ChatState, SupabaseRealtimePayload } from "@/types/chat"
import { encryptMessage, decryptMessage } from "@/lib/encryption"
import { cleanupUserData, setupCleanupOnUnload } from "@/lib/cleanup"

export function useChat() {
  const router = useRouter()
  const [state, setState] = useState<ChatState>({
    users: [],
    filteredUsers: [],
    selectedUser: null,
    messages: [],
    unreadMessages: {},
    isLoading: true,
    searchQuery: "",
    userStatus: {},
  })
  const [newMessage, setNewMessage] = useState("")
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const usersSubscription = useRef<any>(null)
  const messagesSubscription = useRef<any>(null)
  const presenceSubscription = useRef<any>(null)
  const typingSubscription = useRef<any>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isClient, setIsClient] = useState(false)
  const userListUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const userUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const messageUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fetchErrorCountRef = useRef(0)
  const maxFetchRetries = 3

  // Track read status locally instead of in the database
  const [readMessages, setReadMessages] = useState<Record<string, boolean>>({})
  const [usersLoaded, setUsersLoaded] = useState(false)

  // Set isClient to true once the component mounts
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Initialize chat and check authentication
  useEffect(() => {
    // Only run this effect on the client side
    if (!isClient) return

    const initChat = async () => {
      const username = localStorage.getItem("username")
      const privateKey = localStorage.getItem("privateKey")

      if (!username || !privateKey) {
        router.push("/")
        return
      }

      try {
        const { data: user, error } = await supabase
          .from("chat_users")
          .select("*")
          .eq("username", username)
          .maybeSingle()

        if (error || !user) {
          throw new Error("User not found")
        }

        setCurrentUser(user as User)

        // Update user's online status
        await supabase
          .from("chat_users")
          .update({
            online: true,
            last_seen: new Date().toISOString(),
          })
          .eq("id", user.id)

        // Set up WebSocket subscriptions
        setupSubscriptions(user.id)

        // Fetch initial data
        fetchUsers()
      } catch (error) {
        console.error("Authentication error:", error)
        if (typeof window !== "undefined") {
          localStorage.removeItem("username")
          localStorage.removeItem("privateKey")
        }
        router.push("/")
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }))
      }
    }

    initChat()

    return () => {
      // Clean up subscriptions
      if (usersSubscription.current) {
        supabase.removeChannel(usersSubscription.current)
      }
      if (messagesSubscription.current) {
        supabase.removeChannel(messagesSubscription.current)
      }
      if (presenceSubscription.current) {
        supabase.removeChannel(presenceSubscription.current)
      }
      if (typingSubscription.current) {
        supabase.removeChannel(typingSubscription.current)
      }
    }
  }, [router, isClient])

  // Set up WebSocket subscriptions - OPTIMIZED
  const setupSubscriptions = useCallback(
    (userId: string) => {
      // Subscribe to users table changes - IMPROVED FOR DYNAMIC UPDATES
      usersSubscription.current = supabase
        .channel("users-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_users",
          },
          (payload) => {
            const user = payload.new as User

            // Update user status
            if (payload.eventType === "UPDATE") {
              setState((prev) => ({
                ...prev,
                userStatus: {
                  ...prev.userStatus,
                  [user.id]: {
                    ...prev.userStatus[user.id],
                    online: user.online || false,
                    lastSeen: user.last_seen,
                  },
                },
              }))
            }

            // Debounce user list updates to prevent too many refreshes
            if (userListUpdateTimeoutRef.current) {
              clearTimeout(userListUpdateTimeoutRef.current)
            }

            userListUpdateTimeoutRef.current = setTimeout(() => {
              fetchUsers(true) // Force refresh user list
            }, 300)
          },
        )
        .subscribe()

      // Subscribe to messages table changes - OPTIMIZED FOR FASTER DISPLAY
      messagesSubscription.current = supabase
        .channel("messages-changes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `sender_id=eq.${userId},recipient_id=eq.${userId}`,
          },
          async (payload: SupabaseRealtimePayload<Message>) => {
            const newMessage = payload.new
            let decryptedContent = ""

            // Only process messages that involve the current user
            if (newMessage.sender_id === userId || newMessage.recipient_id === userId) {
              if (state.selectedUser === newMessage.sender_id || state.selectedUser === newMessage.recipient_id) {
                // This message is part of the current conversation
                try {
                  // Only decrypt if we're the recipient
                  if (newMessage.recipient_id === userId) {
                    // Start decryption immediately
                    const decryptPromise = decryptMessage(newMessage.encrypted_content)

                    // Add message to state immediately with a placeholder
                    setState((prev) => {
                      return {
                        ...prev,
                        messages: [
                          ...prev.messages,
                          {
                            ...newMessage,
                            decrypted_content: "Расшифровка...",
                          },
                        ],
                      }
                    })

                    // Get the decrypted content
                    decryptedContent = await decryptPromise

                    // Update the message with decrypted content
                    setState((prev) => {
                      const updatedMessages = prev.messages.map((msg) =>
                        msg.id === newMessage.id ? { ...msg, decrypted_content: decryptedContent } : msg,
                      )
                      return {
                        ...prev,
                        messages: updatedMessages,
                      }
                    })

                    // Mark as read if we're currently viewing this conversation
                    if (state.selectedUser === newMessage.sender_id) {
                      // Instead of updating the database, track read status locally
                      setReadMessages((prev) => ({
                        ...prev,
                        [newMessage.id]: true,
                      }))

                      // Send read receipt via WebSocket
                      await supabase.from("message_receipts").insert({
                        message_id: newMessage.id,
                        reader_id: userId,
                        read_at: new Date().toISOString(),
                      })
                    } else {
                      // Update unread count
                      setState((prev) => ({
                        ...prev,
                        unreadMessages: {
                          ...prev.unreadMessages,
                          [newMessage.sender_id]: (prev.unreadMessages[newMessage.sender_id] || 0) + 1,
                        },
                      }))
                    }
                  } else {
                    // We're the sender, so we already know the content
                    const chatKey = `chat_${userId}_${newMessage.recipient_id}`
                    const localMessages =
                      typeof window !== "undefined" ? JSON.parse(localStorage.getItem(chatKey) || "[]") : []
                    const existingMsg = localMessages.find((m: Message) => m.id === newMessage.id)
                    decryptedContent = existingMsg?.decrypted_content || newMessage.encrypted_content

                    // Update state with the sent message
                    setState((prev) => {
                      return {
                        ...prev,
                        messages: [...prev.messages, { ...newMessage, decrypted_content }],
                      }
                    })
                  }

                  // Store in local storage
                  if (typeof window !== "undefined") {
                    const chatKey = `chat_${userId}_${newMessage.recipient_id === userId ? newMessage.sender_id : newMessage.recipient_id}`
                    const localMessages = JSON.parse(localStorage.getItem(chatKey) || "[]")
                    localStorage.setItem(
                      chatKey,
                      JSON.stringify([...localMessages, { ...newMessage, decrypted_content: decryptedContent }]),
                    )
                  }
                } catch (error) {
                  console.error("Error processing new message:", error)
                }
              } else {
                // This message is for another conversation
                if (newMessage.recipient_id === userId) {
                  // Update unread count for this sender
                  setState((prev) => ({
                    ...prev,
                    unreadMessages: {
                      ...prev.unreadMessages,
                      [newMessage.sender_id]: (prev.unreadMessages[newMessage.sender_id] || 0) + 1,
                    },
                  }))
                }
              }
            }
          },
        )
        .subscribe()

      // Subscribe to message receipts for read status - OPTIMIZED
      supabase
        .channel("receipt-changes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "message_receipts",
            filter: `message_id=in.(select id from messages where sender_id=eq.${userId})`,
          },
          (payload) => {
            const receipt = payload.new

            // Update read status for this message
            setReadMessages((prev) => ({
              ...prev,
              [receipt.message_id]: true,
            }))
          },
        )
        .subscribe()

      // Set up presence channel for online status
      presenceSubscription.current = supabase
        .channel("online-users")
        .on("presence", { event: "sync" }, () => {
          const state = presenceSubscription.current.presenceState()

          // Update online status for all users
          const onlineUsers: Record<string, boolean> = {}

          Object.keys(state).forEach((presence) => {
            const presenceObj = state[presence][0]
            if (presenceObj.user_id) {
              onlineUsers[presenceObj.user_id] = true
            }
          })

          setState((prev) => {
            const newUserStatus = { ...prev.userStatus }

            // Update status for all users
            prev.users.forEach((user) => {
              newUserStatus[user.id] = {
                ...newUserStatus[user.id],
                online: !!onlineUsers[user.id],
              }
            })

            return {
              ...prev,
              userStatus: newUserStatus,
            }
          })
        })
        .subscribe(async (status) => {
          if (status !== "SUBSCRIBED") return

          // Track the current user's presence
          await presenceSubscription.current.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          })
        })

      // Subscribe to typing status
      typingSubscription.current = supabase
        .channel("typing-status")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "typing_status",
            filter: `recipient_id=eq.${userId}`,
          },
          (payload) => {
            const typingStatus = payload.new

            setState((prev) => ({
              ...prev,
              userStatus: {
                ...prev.userStatus,
                [typingStatus.user_id]: {
                  ...prev.userStatus[typingStatus.user_id],
                  typing: typingStatus.is_typing,
                },
              },
            }))
          },
        )
        .subscribe()
    },
    [state.selectedUser],
  )

  // Fetch users - IMPROVED FOR DYNAMIC UPDATES AND ERROR HANDLING
  const fetchUsers = useCallback(
    async (forceRefresh = false) => {
      if (usersLoaded && !forceRefresh) return // Only load users once unless forced

      try {
        setState((prev) => ({ ...prev, isLoading: true }))

        // Use a timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), 5000))

        const fetchPromise = supabase.from("chat_users").select("*").order("username", { ascending: true })

        // Race between fetch and timeout
        const { data, error } = (await Promise.race([
          fetchPromise,
          timeoutPromise.then(() => {
            throw new Error("Request timeout")
          }),
        ])) as any

        if (error) throw error

        // Reset error counter on success
        fetchErrorCountRef.current = 0

        if (data) {
          const users = data as User[]

          // Initialize user status for all users
          const userStatus: Record<string, { online: boolean; typing: boolean; lastSeen?: string }> = {}

          users.forEach((user) => {
            userStatus[user.id] = {
              online: user.online || false,
              typing: false,
              lastSeen: user.last_seen,
            }
          })

          setState((prev) => {
            const filteredUsers = users.filter(
              (user) =>
                user.id !== currentUser?.id && user.username.toLowerCase().includes(prev.searchQuery.toLowerCase()),
            )

            return {
              ...prev,
              users,
              filteredUsers,
              userStatus: {
                ...prev.userStatus,
                ...userStatus,
              },
              isLoading: false,
            }
          })

          if (!forceRefresh) {
            setUsersLoaded(true)
          }
        }
      } catch (error) {
        console.error("Error fetching users:", error)

        // Increment error counter
        fetchErrorCountRef.current += 1

        // If we haven't exceeded max retries, try again after a delay
        if (fetchErrorCountRef.current < maxFetchRetries) {
          console.log(`Retrying fetch users (attempt ${fetchErrorCountRef.current} of ${maxFetchRetries})...`)
          setTimeout(() => fetchUsers(forceRefresh), 2000)
        } else {
          // If we've exceeded max retries, show an error and reset loading state
          console.error("Max fetch retries exceeded. Please check your connection.")
          setState((prev) => ({
            ...prev,
            isLoading: false,
            // Keep existing users if we have them
            users: prev.users.length > 0 ? prev.users : [],
            filteredUsers: prev.filteredUsers.length > 0 ? prev.filteredUsers : [],
          }))
        }
      }
    },
    [currentUser, usersLoaded],
  )

  // Effect to filter users when search query changes
  useEffect(() => {
    if (state.users.length > 0) {
      const filtered = state.users.filter(
        (user) => user.id !== currentUser?.id && user.username.toLowerCase().includes(state.searchQuery.toLowerCase()),
      )
      setState((prev) => ({ ...prev, filteredUsers: filtered }))
    }
  }, [state.searchQuery, state.users, currentUser])

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    // For messages displayed in chronological order, scroll to bottom
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [state.messages])

  // Effect to load messages when selected user changes
  useEffect(() => {
    if (state.selectedUser && currentUser) {
      loadMessages(state.selectedUser, currentUser.id)

      // Reset unread count for this user
      setState((prev) => ({
        ...prev,
        unreadMessages: {
          ...prev.unreadMessages,
          [state.selectedUser]: 0,
        },
      }))

      // Mark messages as read
      markMessagesAsRead(state.selectedUser, currentUser.id)
    }
  }, [state.selectedUser, currentUser])

  // Load messages for a conversation - OPTIMIZED FOR FASTER DISPLAY AND ERROR HANDLING
  const loadMessages = useCallback(
    async (userId: string, currentUserId: string) => {
      try {
        // Use a timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), 5000))

        const fetchPromise = supabase
          .from("messages")
          .select("*")
          .or(
            `and(sender_id.eq.${currentUserId},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${currentUserId})`,
          )
          .order("sent_at", { ascending: true })

        // Race between fetch and timeout
        const { data, error } = (await Promise.race([
          fetchPromise,
          timeoutPromise.then(() => {
            throw new Error("Request timeout")
          }),
        ])) as any

        if (error) throw error

        if (data) {
          const messages = data as Message[]

          // Check if we have new messages before updating state
          if (messages.length !== state.messages.length) {
            // Process messages in parallel for better performance
            const decryptPromises = messages.map(async (msg) => {
              // For messages sent by current user, we already know the content
              if (msg.sender_id === currentUserId) {
                const chatKey = `chat_${currentUserId}_${userId}`
                const localMessages =
                  typeof window !== "undefined" ? JSON.parse(localStorage.getItem(chatKey) || "[]") : []
                const existingMsg = localMessages.find((m: Message) => m.id === msg.id)
                return {
                  ...msg,
                  decrypted_content: existingMsg?.decrypted_content || msg.encrypted_content,
                }
              }

              // For received messages, decrypt them
              try {
                const decryptedContent = await decryptMessage(msg.encrypted_content)
                return { ...msg, decrypted_content: decryptedContent }
              } catch (e) {
                return { ...msg, decrypted_content: "Unable to decrypt message" }
              }
            })

            // Update state as soon as all messages are processed
            const decryptedMessages = await Promise.all(decryptPromises)

            // Update local storage with any new messages
            if (typeof window !== "undefined") {
              const chatKey = `chat_${currentUserId}_${userId}`
              localStorage.setItem(chatKey, JSON.stringify(decryptedMessages))
            }

            setState((prev) => ({
              ...prev,
              messages: decryptedMessages,
              isLoading: false,
            }))

            // Mark all messages from the selected user as read
            const newReadMessages = { ...readMessages }
            const messagesToMark: string[] = []

            decryptedMessages.forEach((msg) => {
              if (msg.sender_id === userId && msg.recipient_id === currentUserId) {
                newReadMessages[msg.id] = true
                messagesToMark.push(msg.id)
              }
            })

            setReadMessages(newReadMessages)

            // Send read receipts for all unread messages
            if (messagesToMark.length > 0) {
              const receipts = messagesToMark.map((messageId) => ({
                message_id: messageId,
                reader_id: currentUserId,
                read_at: new Date().toISOString(),
              }))

              await supabase.from("message_receipts").upsert(receipts)
            }
          }
        }
      } catch (error) {
        console.error("Error loading messages:", error)
        // Keep existing messages if we have them
        setState((prev) => ({
          ...prev,
          isLoading: false,
          messages: prev.messages.length > 0 ? prev.messages : [],
        }))
      }
    },
    [readMessages, state.messages.length],
  )

  // Mark messages as read (locally and on server) - OPTIMIZED
  const markMessagesAsRead = useCallback(
    async (senderId: string, currentUserId: string) => {
      // Update local read status for all messages from this sender
      const newReadMessages = { ...readMessages }
      const messagesToMark: string[] = []

      state.messages.forEach((msg) => {
        if (msg.sender_id === senderId && msg.recipient_id === currentUserId && !readMessages[msg.id]) {
          newReadMessages[msg.id] = true
          messagesToMark.push(msg.id)
        }
      })

      if (messagesToMark.length > 0) {
        setReadMessages(newReadMessages)

        // Send read receipts for all messages in one batch
        const receipts = messagesToMark.map((messageId) => ({
          message_id: messageId,
          reader_id: currentUserId,
          read_at: new Date().toISOString(),
        }))

        try {
          await supabase.from("message_receipts").upsert(receipts)
        } catch (error) {
          console.error("Error marking messages as read:", error)
        }
      }
    },
    [state.messages, readMessages],
  )

  // Update typing status - OPTIMIZED
  const updateTypingStatus = useCallback(
    async (isTyping: boolean) => {
      if (!currentUser || !state.selectedUser) return

      try {
        await supabase.from("typing_status").upsert({
          user_id: currentUser.id,
          recipient_id: state.selectedUser,
          is_typing: isTyping,
          updated_at: new Date().toISOString(),
        })
      } catch (error) {
        console.error("Error updating typing status:", error)
      }
    },
    [currentUser, state.selectedUser],
  )

  // Handle message input changes with typing indicator
  const handleMessageChange = useCallback(
    (value: string) => {
      setNewMessage(value)

      // Send typing indicator
      if (value.trim() && currentUser && state.selectedUser) {
        updateTypingStatus(true)

        // Clear previous timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current)
        }

        // Set timeout to clear typing status after 3 seconds of inactivity
        typingTimeoutRef.current = setTimeout(() => {
          updateTypingStatus(false)
        }, 3000)
      } else if (!value.trim()) {
        updateTypingStatus(false)
      }
    },
    [currentUser, state.selectedUser, updateTypingStatus],
  )

  // Send a message - OPTIMIZED
  const sendMessage = useCallback(async () => {
    if (!state.selectedUser || !newMessage.trim() || !currentUser) return

    setIsSending(true)
    const messageText = newMessage.trim() // Store the original message text
    setNewMessage("") // Clear input immediately for better UX

    try {
      const recipient = state.users.find((u) => u.id === state.selectedUser)
      if (!recipient?.public_key) {
        throw new Error("Recipient has no public key")
      }

      // Create a temporary message ID for optimistic UI update
      const tempId = `temp-${Date.now()}`
      const tempMessage = {
        id: tempId,
        sender_id: currentUser.id,
        recipient_id: state.selectedUser,
        encrypted_content: messageText, // Temporarily store as plain text
        decrypted_content: messageText,
        sent_at: new Date().toISOString(),
      }

      // Add to state immediately for instant feedback
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, tempMessage],
      }))

      // Scroll to bottom
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
      }, 50)

      // Encrypt in background
      const encryptedContent = await encryptMessage(messageText, recipient.public_key)

      // Send to server
      const { data, error } = await supabase
        .from("messages")
        .insert([
          {
            sender_id: currentUser.id,
            recipient_id: state.selectedUser,
            encrypted_content: encryptedContent,
          },
        ])
        .select()

      if (error) throw error

      if (data && data[0]) {
        // Replace temp message with real one
        setState((prev) => {
          const updatedMessages = prev.messages.filter((m) => m.id !== tempId)
          const sentMessage = {
            ...data[0],
            decrypted_content: messageText,
          }

          return {
            ...prev,
            messages: [...updatedMessages, sentMessage],
          }
        })

        // Store in local storage
        if (typeof window !== "undefined") {
          const chatKey = `chat_${currentUser.id}_${state.selectedUser}`
          const localMessages = JSON.parse(localStorage.getItem(chatKey) || "[]")
          const updatedMessages = localMessages.filter((m: Message) => m.id !== tempId)

          localStorage.setItem(
            chatKey,
            JSON.stringify([...updatedMessages, { ...data[0], decrypted_content: messageText }]),
          )
        }
      }

      // Clear typing status
      updateTypingStatus(false)

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    } catch (error: any) {
      console.error("Error sending message:", error)
      alert(error.message)

      // Restore the message input if sending failed
      setNewMessage(messageText)

      // Remove the temporary message
      setState((prev) => ({
        ...prev,
        messages: prev.messages.filter((m) => !m.id.startsWith("temp-")),
      }))
    } finally {
      setIsSending(false)
    }
  }, [state.selectedUser, newMessage, currentUser, state.users, updateTypingStatus])

  // Select a user to chat with
  const selectUser = useCallback((userId: string) => {
    setState((prev) => ({
      ...prev,
      selectedUser: userId,
      unreadMessages: {
        ...prev.unreadMessages,
        [userId]: 0,
      },
    }))

    // On mobile, hide the user list
    if (window.innerWidth <= 768) {
      setState((prev) => ({ ...prev, showUserList: false }))
    }
  }, [])

  // Update search query
  const updateSearchQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query }))
  }, [])

  // Logout and delete account and messages
  const logout = useCallback(async () => {
    try {
      if (currentUser) {
        // Update user status to offline
        await supabase
          .from("chat_users")
          .update({
            online: false,
            last_seen: new Date().toISOString(),
          })
          .eq("id", currentUser.id)

        // Remove from presence channel
        if (presenceSubscription.current) {
          await presenceSubscription.current.untrack()
        }

        await cleanupUserData(currentUser.id)
      }
    } catch (error) {
      console.error("Error during logout:", error)
    } finally {
      router.push("/")
    }
  }, [currentUser, router])

  // Toggle user list visibility (for mobile)
  const toggleUserList = useCallback(() => {
    setState((prev) => ({ ...prev, showUserList: !prev.showUserList }))
  }, [])

  // Add a cleanup function for window unload
  useEffect(() => {
    if (!currentUser) return

    // Setup cleanup on unload
    const cleanupFunction = setupCleanupOnUnload(currentUser.id)

    // Set up heartbeat to update last_seen
    const heartbeatInterval = setInterval(async () => {
      try {
        await supabase.from("chat_users").update({ last_seen: new Date().toISOString() }).eq("id", currentUser.id)
      } catch (error) {
        console.error("Error updating last_seen:", error)
      }
    }, 60000) // Update every minute

    // Cleanup function for when the component unmounts
    return () => {
      clearInterval(heartbeatInterval)

      // Update user status to offline
      supabase
        .from("chat_users")
        .update({
          online: false,
          last_seen: new Date().toISOString(),
        })
        .eq("id", currentUser.id)
        .then(() => {
          // Remove from presence channel
          if (presenceSubscription.current) {
            presenceSubscription.current.untrack()
          }

          cleanupFunction()
          // Try to clean up when component unmounts (may not complete if during page navigation)
          cleanupUserData(currentUser.id).catch(console.error)
        })
    }
  }, [currentUser])

  // Set up automatic updates for users and messages with error handling
  useEffect(() => {
    if (!currentUser || !isClient) return

    // Update users every second with exponential backoff on errors
    let userUpdateDelay = 1000 // Start with 1 second
    const updateUsers = () => {
      fetchUsers(true)
        .then(() => {
          // Reset delay on success
          userUpdateDelay = 1000
          userUpdateIntervalRef.current = setTimeout(updateUsers, userUpdateDelay)
        })
        .catch((error) => {
          console.error("Error in user update interval:", error)
          // Increase delay on error (max 10 seconds)
          userUpdateDelay = Math.min(userUpdateDelay * 1.5, 10000)
          userUpdateIntervalRef.current = setTimeout(updateUsers, userUpdateDelay)
        })
    }

    // Start the user update cycle
    userUpdateIntervalRef.current = setTimeout(updateUsers, userUpdateDelay)

    // Update messages every second with exponential backoff on errors
    let messageUpdateDelay = 1000 // Start with 1 second
    const updateMessages = () => {
      if (state.selectedUser) {
        loadMessages(state.selectedUser, currentUser.id)
          .then(() => {
            // Reset delay on success
            messageUpdateDelay = 1000
            messageUpdateIntervalRef.current = setTimeout(updateMessages, messageUpdateDelay)
          })
          .catch((error) => {
            console.error("Error in message update interval:", error)
            // Increase delay on error (max 10 seconds)
            messageUpdateDelay = Math.min(messageUpdateDelay * 1.5, 10000)
            messageUpdateIntervalRef.current = setTimeout(updateMessages, messageUpdateDelay)
          })
      } else {
        // If no user is selected, just wait and try again
        messageUpdateIntervalRef.current = setTimeout(updateMessages, messageUpdateDelay)
      }
    }

    // Start the message update cycle
    messageUpdateIntervalRef.current = setTimeout(updateMessages, messageUpdateDelay)

    return () => {
      if (userUpdateIntervalRef.current) {
        clearTimeout(userUpdateIntervalRef.current)
      }
      if (messageUpdateIntervalRef.current) {
        clearTimeout(messageUpdateIntervalRef.current)
      }
    }
  }, [currentUser, state.selectedUser, isClient, fetchUsers, loadMessages])

  return {
    state,
    newMessage,
    setNewMessage: handleMessageChange,
    currentUser,
    isSending,
    messagesEndRef,
    sendMessage,
    selectUser,
    updateSearchQuery,
    logout,
    toggleUserList,
    readMessages,
  }
}


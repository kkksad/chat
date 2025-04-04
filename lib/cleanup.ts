import { supabase } from "./supabase-client"

export async function cleanupUserData(userId: string): Promise<void> {
  if (!userId) return

  try {
    console.log("Starting cleanup for user:", userId)

    // Delete all messages related to this user
    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)

    if (messagesError) {
      console.error("Error deleting messages:", messagesError)
    } else {
      console.log("Successfully deleted all messages for user:", userId)
    }

    // Delete the user account
    const { error: userError } = await supabase.from("chat_users").delete().eq("id", userId)

    if (userError) {
      console.error("Error deleting user:", userError)
    } else {
      console.log("Successfully deleted user account:", userId)
    }

    // Clear local storage (only in browser environment)
    if (typeof window !== "undefined") {
      localStorage.removeItem("username")
      localStorage.removeItem("privateKey")

      // Clear any cached message data
      const keys = Object.keys(localStorage)
      for (const key of keys) {
        if (key.startsWith("chat_")) {
          localStorage.removeItem(key)
        }
      }
    }

    console.log("Cleanup complete for user:", userId)
  } catch (error) {
    console.error("Error during cleanup:", error)
  }
}

// Setup cleanup on page unload
export function setupCleanupOnUnload(userId: string): () => void {
  // Only set up event listeners in browser environment
  if (typeof window === "undefined") return () => {}

  const handleUnload = () => {
    // Use sendBeacon for more reliable cleanup on page unload
    if (navigator.sendBeacon && userId) {
      const data = new FormData()
      data.append("userId", userId)
      navigator.sendBeacon("/api/cleanup", data)
    } else {
      // Fallback to sync request which may not complete
      cleanupUserData(userId)
    }
  }

  window.addEventListener("beforeunload", handleUnload)

  // Return cleanup function
  return () => {
    window.removeEventListener("beforeunload", handleUnload)
  }
}


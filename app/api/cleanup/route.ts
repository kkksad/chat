import { type NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-client"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const userId = formData.get("userId") as string

    if (!userId) {
      return NextResponse.json({ error: "No user ID provided" }, { status: 400 })
    }

    // Delete all messages related to this user
    await supabase.from("messages").delete().or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)

    // Delete the user account
    await supabase.from("chat_users").delete().eq("id", userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in cleanup route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


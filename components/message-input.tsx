"use client"

import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"
import { useEffect, useRef } from "react"

interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  isSending: boolean
}

export function MessageInput({ value, onChange, onSend, isSending }: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus the textarea on mobile
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const adjustHeight = () => {
      textarea.style.height = "40px" // Reset to initial height (same as button)
      const scrollHeight = textarea.scrollHeight
      if (scrollHeight > 40) {
        const newHeight = Math.min(scrollHeight, 80) // Limit max height
        textarea.style.height = `${newHeight}px`
      }
    }

    adjustHeight()

    textarea.addEventListener("input", adjustHeight)
    return () => textarea.removeEventListener("input", adjustHeight)
  }, [value])

  return (
    <div className="p-2 border-t border-border">
      <div className="flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Введите сообщение..."
          className="resize-none h-10 min-h-[40px] max-h-[80px] py-2 px-3 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <Button onClick={onSend} disabled={isSending || !value.trim()} className="px-3 h-10 shrink-0" size="icon">
          {isSending ? (
            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}


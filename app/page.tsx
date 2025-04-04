"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserCircle, Lock, Shield } from "lucide-react"
import { motion } from "framer-motion"
import { ThemeToggle } from "@/components/theme-toggle"
import { generateKeyPair, exportKeys } from "@/lib/encryption"

export default function Login() {
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const router = useRouter()

  // Set isClient to true once the component mounts
  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    // Only run this effect on the client side
    if (!isClient) return

    const checkAuth = async () => {
      const username = localStorage.getItem("username")
      const privateKey = localStorage.getItem("privateKey")

      if (username && privateKey) {
        try {
          const { data: user, error } = await supabase
            .from("chat_users")
            .select("*")
            .eq("username", username)
            .maybeSingle()

          if (error || !user) {
            throw new Error("Invalid user data")
          }

          router.push("/chat")
        } catch (error) {
          localStorage.clear()
        }
      }
    }

    checkAuth()
  }, [router, isClient])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      alert("Please enter a username")
      return
    }

    try {
      setLoading(true)
      const keyPair = await generateKeyPair()
      const { publicKeyB64, privateKeyB64 } = await exportKeys(keyPair)

      localStorage.setItem("privateKey", privateKeyB64)
      localStorage.setItem("username", username)

      const { data: existingUser, error } = await supabase
        .from("chat_users")
        .select()
        .eq("username", username)
        .maybeSingle()

      if (error) throw error

      if (!existingUser) {
        const { error } = await supabase.from("chat_users").insert([
          {
            username,
            public_key: publicKeyB64,
          },
        ])
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("chat_users")
          .update({
            public_key: publicKeyB64,
          })
          .eq("username", username)
        if (error) throw error
      }

      router.push("/chat")
    } catch (error: any) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] opacity-50" />
      </div>

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          <div className="text-center space-y-2">
            <div className="relative mx-auto w-24 h-24">
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
              <div className="relative bg-card/80 backdrop-blur-sm rounded-full p-5 w-24 h-24 mx-auto flex items-center justify-center shadow-xl border border-border">
                <UserCircle className="w-14 h-14 text-primary" />
              </div>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold mt-6 text-foreground">EE2E Чат</h1>
            <p className="text-muted-foreground text-lg">Безопасное общение с шифрованием</p>
          </div>

          <Card className="border-border bg-card/80 backdrop-blur-md shadow-xl">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-center">Вход в систему</CardTitle>
              <CardDescription className="text-center flex items-center justify-center gap-2">
                <Lock className="h-4 w-4" />
                <span>Введите ваш ник для начала общения</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-4">
                  <Input
                    type="text"
                    placeholder="Введите имя пользователя..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    className="bg-background/50 h-12 text-lg placeholder:text-muted-foreground/50 border-input focus-visible:ring-primary/50"
                    autoFocus
                  />

                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      <span>Ваши сообщения защищены сквозным шифрованием</span>
                    </div>
                    <div className="text-xs text-destructive flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      <span>Внимание: Все сообщения и ваш аккаунт будут удалены после завершения сеанса</span>
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-primary hover:bg-primary/90 transition-colors text-primary-foreground"
                  disabled={loading}
                  size="lg"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                      <span>Подключение...</span>
                    </div>
                  ) : (
                    "Присоединиться"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground">
            <p>Присоединяясь, вы соглашаетесь с нашими условиями использования</p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}


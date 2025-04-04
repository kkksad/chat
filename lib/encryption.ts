export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-512",
    },
    true,
    ["encrypt", "decrypt"],
  )
}

export async function exportKeys(keyPair: CryptoKeyPair): Promise<{ publicKeyB64: string; privateKeyB64: string }> {
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey("spki", keyPair.publicKey),
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  ])

  const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(publicKey)))
  const privateKeyB64 = btoa(String.fromCharCode(...new Uint8Array(privateKey)))

  return { publicKeyB64, privateKeyB64 }
}

export async function encryptMessage(message: string, publicKey: string): Promise<string> {
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0)),
      { name: "RSA-OAEP", hash: "SHA-512" },
      true,
      ["encrypt"],
    )

    const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(message))

    return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  } catch (error) {
    console.error("Encryption error:", error)
    throw new Error("Failed to encrypt message")
  }
}

export async function decryptMessage(encrypted: string, privateKeyB64?: string): Promise<string> {
  try {
    const keyString = privateKeyB64 || localStorage.getItem("privateKey")
    if (!keyString) throw new Error("No private key found")

    const key = await crypto.subtle.importKey(
      "pkcs8",
      Uint8Array.from(atob(keyString), (c) => c.charCodeAt(0)),
      { name: "RSA-OAEP", hash: "SHA-512" },
      true,
      ["decrypt"],
    )

    const decrypted = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      key,
      Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0)),
    )

    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.error("Decryption error:", error)
    return "Unable to decrypt message"
  }
}


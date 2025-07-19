'use client'

import { useRouter } from "next/navigation"

export default function LandingPage() {
  const router = useRouter()

  return (
    <div>
      <h1>Bem-vindo à Landing Page!</h1>
      <button
      className="border border-white"
        onClick={() => router.push('/home')}
      >
        entrar
      </button>
    </div>
  )
}
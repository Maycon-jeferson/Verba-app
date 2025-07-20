'use client'

import { useState } from "react"
import { supabase } from "../lib/supabaseClient"
import { useRouter } from "next/navigation"

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const router = useRouter()

 const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { error } = await supabase.auth.signUp({ email, password })
    setMsg(error ? error.message : 'Verifique seu email para confirmar!')
  }

  const hadleLogin = async ( e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const {error} = await supabase.auth.signInWithPassword({ email, password})
    if (error) setMsg(error.message)
    else router.push('/home')
  }

  return (
    <div>
      <div>
        <h1>Singnup</h1>

        <form onSubmit={handleSignup}>
          <input type="email" placeholder="Email" onChange={(e) => setEmail(e.target.value)} required/>
          <input type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} required/>
          <button type="submit">registro</button>
        </form>
        <p>{msg}</p>

      </div>

      <div>
        <h1>login</h1>

        <form onSubmit={hadleLogin}>
          <input type="email" placeholder="Email" onChange={(e) => setEmail(e.target.value)} required/>
          <input type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} required/>
          <button type="submit">Logar</button>
        </form>
        <p>{msg}</p>
        
      </div>
    </div>
  )
}


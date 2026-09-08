'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password })
      if (result.error) {
        setError(result.error.code === 'INVALID_EMAIL_OR_PASSWORD'
          ? 'Email or password is incorrect.'
          : 'Sign-in is temporarily unavailable. Please try again.')
      } else {
        router.push('/')
        router.refresh()
      }
    } catch (error) {
      console.log('[v0] Sign-in request failed:', error)
      setError('Sign-in is temporarily unavailable. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return <main className="auth-page"><form className="auth-card" onSubmit={submit}>
    <p className="eyebrow">SUPERCHAT</p><h1>Welcome back</h1><p className="auth-subtitle">Sign in to continue your workspace.</p>
    <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
    <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
    {error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    <p className="auth-footer">New to SuperChat? <Link href="/sign-up">Create an account</Link></p>
  </form></main>
}

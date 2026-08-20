'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

export default function SignUpPage() {
  const router = useRouter(); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); setPending(true); setError(''); const result = await authClient.signUp.email({ name, email, password }); if (result.error) setError('Unable to create your account. Check your details and try again.'); else { router.push('/'); router.refresh() }; setPending(false) }
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><p className="eyebrow">SUPERCHAT</p><h1>Create your account</h1><p className="auth-subtitle">Your private AI workspace starts here.</p><label>Name<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label><label>Password<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={pending}>{pending ? 'Creating…' : 'Create account'}</button><p className="auth-footer">Already have an account? <Link href="/sign-in">Sign in</Link></p></form></main>
}

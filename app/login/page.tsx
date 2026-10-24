'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup' | 'reset'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    const supabase = createClient()

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      router.push('/dashboard')
      router.refresh()
    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) { setError(error.message); setLoading(false); return }
      router.push('/dashboard')
      router.refresh()
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) { setError(error.message); setLoading(false); return }
      setMessage('Email inviata! Controlla la tua casella per il link di reset.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-black tracking-widest" style={{ color: 'var(--gold)' }}>GOAT LEAGUE</h1>
          <p className="font-display text-lg font-bold tracking-wide mt-1" style={{ color: 'var(--text)' }}>COMPANION</p>
        </div>

        <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {mode !== 'reset' && (
            <div className="flex mb-6 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <button
                onClick={() => { setMode('login'); setError(null); setMessage(null) }}
                className="flex-1 py-2 text-sm font-semibold transition-colors"
                style={{
                  background: mode === 'login' ? 'var(--gold)' : 'transparent',
                  color: mode === 'login' ? '#000' : 'var(--text-sec)',
                }}
              >
                Accedi
              </button>
              <button
                onClick={() => { setMode('signup'); setError(null); setMessage(null) }}
                className="flex-1 py-2 text-sm font-semibold transition-colors"
                style={{
                  background: mode === 'signup' ? 'var(--gold)' : 'transparent',
                  color: mode === 'signup' ? '#000' : 'var(--text-sec)',
                }}
              >
                Registrati
              </button>
            </div>
          )}

          {mode === 'reset' && (
            <div className="mb-6">
              <button
                onClick={() => { setMode('login'); setError(null); setMessage(null) }}
                className="text-xs font-semibold flex items-center gap-1"
                style={{ color: 'var(--text-sec)' }}
              >
                ← Torna al login
              </button>
              <p className="text-sm font-bold mt-3" style={{ color: 'var(--text)' }}>Recupera password</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-sec)' }}>Ti mandiamo un link per reimpostare la password.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-sec)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-sec)' }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
            )}

            {error && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </p>
            )}
            {message && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-bold tracking-wide transition-opacity"
              style={{ background: 'var(--gold)', color: '#000', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? '...' : mode === 'login' ? 'Accedi' : mode === 'signup' ? 'Registrati' : 'Invia email di reset'}
            </button>

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(null); setMessage(null) }}
                className="w-full text-xs text-center pt-1"
                style={{ color: 'var(--text-sec)' }}
              >
                Password dimenticata?
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

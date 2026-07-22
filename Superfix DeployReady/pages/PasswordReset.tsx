import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_URL } from '../config/api';

export const PasswordReset: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const requestedRole = params.get('role');
  const [role, setRole] = useState<'CLIENT' | 'HERO' | 'RECRUITER'>(requestedRole === 'HERO' || requestedRole === 'RECRUITER' ? requestedRole : 'CLIENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${API_URL}/auth/password-reset/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }),
      });
      if (!response.ok) throw new Error('Cererea nu a putut fi trimisă.');
      setMessage('Dacă adresa aparține unui cont activ, vei primi un link valabil 60 de minute.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Eroare de conexiune.'); }
    finally { setBusy(false); }
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (password !== confirm) return setError('Parolele nu coincid.');
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/auth/password-reset/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Link invalid sau expirat.');
      setPassword(''); setConfirm(''); setMessage('Parola a fost schimbată. Toate sesiunile vechi au fost închise.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Eroare de conexiune.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="container mx-auto max-w-lg px-4 py-12">
      <div className="bg-white border-4 border-black p-6 md:p-8 shadow-comic">
        <h1 className="font-heading text-3xl mb-2">RESETARE PAROLĂ</h1>
        <p className="font-comic text-sm text-gray-600 mb-6">Linkurile sunt unice, expiră după 60 de minute și închid sesiunile vechi.</p>
        {token ? (
          <form onSubmit={submitPassword} className="space-y-4">
            <input type="password" minLength={10} required placeholder="Parolă nouă (minim 10 caractere)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border-2 border-black p-3" />
            <input type="password" minLength={10} required placeholder="Repetă parola" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full border-2 border-black p-3" />
            <button disabled={busy} className="w-full bg-black text-white font-heading py-3 disabled:opacity-50">{busy ? 'SE SALVEAZĂ…' : 'SALVEAZĂ PAROLA'}</button>
          </form>
        ) : (
          <form onSubmit={submitRequest} className="space-y-4">
            <select value={role} onChange={(e) => setRole(e.target.value as 'CLIENT' | 'HERO' | 'RECRUITER')} className="w-full border-2 border-black p-3 bg-white">
              <option value="CLIENT">Cont client</option><option value="HERO">Cont meseriaș</option><option value="RECRUITER">Cont recruiter</option>
            </select>
            <input type="email" required placeholder="Emailul contului" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border-2 border-black p-3" />
            <button disabled={busy} className="w-full bg-black text-white font-heading py-3 disabled:opacity-50">{busy ? 'SE TRIMITE…' : 'TRIMITE LINKUL'}</button>
          </form>
        )}
        {error && <p role="alert" className="mt-4 border-2 border-red-700 bg-red-50 p-3 text-red-800 font-bold">{error}</p>}
        {message && <p className="mt-4 border-2 border-green-700 bg-green-50 p-3 text-green-800 font-bold">{message}</p>}
        <Link to={role === 'RECRUITER' ? '/recruiter' : role === 'HERO' ? '/portal' : '/'} className="block mt-6 underline font-bold">Înapoi</Link>
      </div>
    </div>
  );
};

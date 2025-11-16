import { useState } from 'react';

interface AdminLoginProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
}

export const AdminLogin = ({ onLogin }: AdminLoginProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const success = await onLogin(username, password);
    if (success) {
      // Login successful - parent component will handle state
      setUsername('');
      setPassword('');
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="glass-card" style={{ maxWidth: '400px', margin: '4rem auto' }}>
      <h2 style={{ marginTop: 0 }}>Admin Login</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label htmlFor="username" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '0.5rem',
              color: 'var(--text)',
              fontSize: '1rem',
            }}
          />
        </div>
        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '0.5rem',
              color: 'var(--text)',
              fontSize: '1rem',
            }}
          />
        </div>
        {error && (
          <p style={{ margin: 0, color: '#f87171', fontSize: '0.85rem' }}>{error}</p>
        )}
        <button type="submit" className="btn" style={{ width: '100%' }}>
          Login
        </button>
      </form>
    </div>
  );
};


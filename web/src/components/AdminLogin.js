import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export const AdminLogin = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const success = await onLogin(username, password);
        if (success) {
            // Login successful - parent component will handle state
            setUsername('');
            setPassword('');
        }
        else {
            setError('Invalid credentials');
        }
    };
    return (_jsxs("div", { className: "glass-card", style: { maxWidth: '400px', margin: '4rem auto' }, children: [_jsx("h2", { style: { marginTop: 0 }, children: "Admin Login" }), _jsxs("form", { onSubmit: handleSubmit, style: { display: 'flex', flexDirection: 'column', gap: '1rem' }, children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "username", style: { display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }, children: "Username" }), _jsx("input", { id: "username", type: "text", value: username, onChange: (e) => setUsername(e.target.value), required: true, style: {
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--text)',
                                    fontSize: '1rem',
                                } })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "password", style: { display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }, children: "Password" }), _jsx("input", { id: "password", type: "password", value: password, onChange: (e) => setPassword(e.target.value), required: true, style: {
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--text)',
                                    fontSize: '1rem',
                                } })] }), error && (_jsx("p", { style: { margin: 0, color: '#f87171', fontSize: '0.85rem' }, children: error })), _jsx("button", { type: "submit", className: "btn", style: { width: '100%' }, children: "Login" })] })] }));
};

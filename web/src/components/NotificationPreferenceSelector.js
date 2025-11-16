import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
export const NotificationPreferenceSelector = ({ value, onChange }) => {
    // For now, only email is supported (SMS coming soon)
    useEffect(() => {
        if (value !== 'email') {
            onChange('email');
        }
    }, [value, onChange]);
    return (_jsxs("div", { className: "preference-group", children: [_jsx("div", { className: "chip chip--active", style: { cursor: 'default' }, children: "Email notifications" }), _jsx("span", { style: { fontSize: '0.85rem', color: 'var(--text-muted)' }, children: "SMS coming soon" }), _jsx("input", { type: "hidden", value: "email", readOnly: true })] }));
};

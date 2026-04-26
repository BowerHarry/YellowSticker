import { useEffect } from 'react';
import type { NotificationPreference } from '../lib/types';

type Props = {
  value: NotificationPreference;
  onChange: (value: NotificationPreference) => void;
};

export const NotificationPreferenceSelector = ({ value, onChange }: Props) => {
  // For now, only email is supported (SMS coming soon)
  useEffect(() => {
    if (value !== 'email') {
      onChange('email');
    }
  }, [value, onChange]);

  return (
    <div className="preference-group">
      <div className="chip chip--active" style={{ cursor: 'default' }}>
        Email notifications
      </div>
      <div className="chip chip--disabled" aria-disabled="true" title="SMS alerts are not available yet">
        SMS (coming soon)
      </div>
      <input type="hidden" value="email" readOnly />
    </div>
  );
};


import type { NotificationPreference } from '../lib/types';

type Props = {
  value: NotificationPreference;
  onChange: (value: NotificationPreference) => void;
  disabled?: boolean;
};

const OPTIONS: { value: NotificationPreference; label: string }[] = [
  { value: 'email', label: 'Email only' },
  { value: 'telegram', label: 'Telegram only' },
  { value: 'both', label: 'Email and Telegram' },
];

export const NotificationPreferenceSelector = ({ value, onChange, disabled }: Props) => {
  return (
    <div className="preference-group" role="radiogroup" aria-label="Notification method">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          disabled={disabled}
          className={`chip ${value === opt.value ? 'chip--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

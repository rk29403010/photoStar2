interface AppNotificationsProps {
  notifications: { id: string; type: 'warning' | 'info'; message: string }[];
  dismissNotification: (id: string) => void;
}

export function AppNotifications({ notifications, dismissNotification }: AppNotificationsProps) {
  if (notifications.length === 0) {return null;}

  return (
    <div style={{ position: 'fixed', top: '52px', right: '12px', zIndex: 9990, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '420px', width: 'calc(100vw - 24px)' }}>
      {notifications.map((notification) => (
        <div key={notification.id} style={{ background: notification.type === 'warning' ? 'rgba(161,98,7,0.95)' : 'rgba(30,64,175,0.92)', border: `1px solid ${notification.type === 'warning' ? '#854d0e' : '#1d4ed8'}`, borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', animation: 'fadeInOverlay 0.2s ease-out' }}>
          <span style={{ fontSize: '13px', color: '#fef3c7', flex: 1, lineHeight: 1.5 }}>{notification.message}</span>
          <button onClick={() => dismissNotification(notification.id)} style={{ background: 'transparent', border: 'none', color: '#fde68a', cursor: 'pointer', fontSize: '16px', lineHeight: 1, flexShrink: 0, padding: '0 2px' }} title="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

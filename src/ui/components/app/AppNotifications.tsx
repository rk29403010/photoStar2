type AppNotificationsProps = {
  readonly notifications: {
    id: string;
    type: 'warning' | 'info' | 'success' | 'error';
    title: string;
    message?: string;
    actionLabel?: string;
    actionKind?: 'open_workflow' | 'open_asset' | 'retry';
    actionPayload?: Record<string, unknown>;
  }[];
  readonly dismissNotification: (id: string) => void;
  readonly onNotificationAction?: (notificationId: string) => void;
}

function getNotificationStyle(type: AppNotificationsProps['notifications'][number]['type']) {
  if (type === 'warning') {
    return { background: 'rgba(161,98,7,0.95)', border: '#854d0e', text: '#fef3c7' };
  }
  if (type === 'error') {
    return { background: 'rgba(127,29,29,0.95)', border: '#dc2626', text: '#fecaca' };
  }
  if (type === 'success') {
    return { background: 'rgba(20,83,45,0.95)', border: '#15803d', text: '#dcfce7' };
  }
  return { background: 'rgba(30,64,175,0.92)', border: '#1d4ed8', text: '#dbeafe' };
}

export function AppNotifications({ notifications, dismissNotification, onNotificationAction }: AppNotificationsProps) {
  if (notifications.length === 0) {return null;}

  return (
    <div style={{ position: 'fixed', top: '52px', right: '12px', zIndex: 9990, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '420px', width: 'calc(100vw - 24px)' }}>
      {notifications.map((notification) => {
        const tone = getNotificationStyle(notification.type);
        return (
          <div key={notification.id} style={{ background: tone.background, border: `1px solid ${tone.border}`, borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', animation: 'fadeInOverlay 0.2s ease-out' }}>
            <div style={{ flex: 1, lineHeight: 1.5 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: tone.text }}>{notification.title}</div>
              {notification.message ? <div style={{ fontSize: '12px', color: tone.text }}>{notification.message}</div> : null}
              {notification.actionLabel && onNotificationAction ? (
                <button onClick={() => onNotificationAction(notification.id)} style={{ marginTop: 6, border: `1px solid ${tone.border}`, background: 'rgba(0,0,0,0.18)', color: tone.text, borderRadius: '999px', cursor: 'pointer', fontSize: '11px', padding: '2px 10px' }}>
                  {notification.actionLabel}
                </button>
              ) : null}
            </div>
            <button onClick={() => dismissNotification(notification.id)} style={{ background: 'transparent', border: 'none', color: tone.text, cursor: 'pointer', fontSize: '16px', lineHeight: 1, flexShrink: 0, padding: '0 2px' }} title="Dismiss">✕</button>
          </div>
        );
      })}
    </div>
  );
}

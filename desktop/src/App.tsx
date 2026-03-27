import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryClient } from './lib/queryClient';
import { useAuthStore } from './store/auth';
import AppLayout from './components/layout/AppLayout';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import { useWebSocketStore } from './store/ws';

type AuthScreen = 'login' | 'register';

function AuthGuard() {
  const { user, initAuth } = useAuthStore();
  const { connect, disconnect } = useWebSocketStore();
  const [screen, setScreen] = useState<AuthScreen>('login');
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    initAuth().finally(() => setAuthReady(true));
  }, [initAuth]);

  useEffect(() => {
    if (user) {
      connect();
    } else {
      disconnect();
    }
    return () => {
      // cleanup handled by component unmount in real session
    };
  }, [user, connect, disconnect]);

  if (!authReady) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>Loading Nexora…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return screen === 'login' ? (
      <LoginForm onSwitchToRegister={() => setScreen('register')} />
    ) : (
      <RegisterForm onSwitchToLogin={() => setScreen('login')} />
    );
  }

  return <AppLayout />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard />
    </QueryClientProvider>
  );
}

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AuthPage } from './components/AuthPage';
import { ConfigurationPage } from './components/ConfigurationPage';
import { GamePage } from './components/GamePage';
import { LeaderboardPage } from './components/LeaderboardPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthProvider';
import { isSupabaseConfigured } from './lib/supabase';
import './App.css';

function App() {
  if (!isSupabaseConfigured) {
    return <ConfigurationPage />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/game" replace />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route
              path="/game"
              element={(
                <ProtectedRoute>
                  <GamePage />
                </ProtectedRoute>
              )}
            />
            <Route path="*" element={<Navigate to="/game" replace />} />
          </Routes>
        </AppShell>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './auth-context';

const PROFILE_COLUMNS = [
  'id',
  'username',
  'display_name',
  'email',
  'email_visibility',
  'avatar_url',
  'leaderboard_opt_in',
  'created_at',
  'updated_at',
].join(', ');

const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadInitialSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (error) {
        console.error('Unable to load Supabase session:', error.message);
      }

      setSession(data.session ?? null);
      setInitializing(false);
    };

    loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setInitializing(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      if (!session?.user) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .eq('id', session.user.id)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (data) {
          setProfile(data);
          setProfileLoading(false);
          return;
        }

        if (error && error.code !== 'PGRST116') {
          console.error('Unable to load player profile:', error.message);
          break;
        }

        await wait(250 * (attempt + 1));
      }

      if (!cancelled) {
        setProfile(null);
        setProfileLoading(false);
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const signIn = useCallback(async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signUp = useCallback(async ({ email, password, username }) => {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: username,
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    return supabase.auth.signOut();
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    initializing,
    profileLoading,
    signIn,
    signUp,
    signOut,
  }), [
    session,
    profile,
    initializing,
    profileLoading,
    signIn,
    signUp,
    signOut,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}


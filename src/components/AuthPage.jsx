import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import './AuthPage.css';

export function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const from = location.state?.from;
  const redirectTo = from ? `${from.pathname}${from.search ?? ''}` : '/game';

  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (isRegister && username.trim().length < 3) {
      setError('用户名至少需要 3 个字符。');
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        const { data, error: signUpError } = await signUp({
          email: email.trim(),
          password,
          username: username.trim(),
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          setMessage('注册成功。请先打开邮箱完成验证，然后返回这里登录。');
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        const { error: signInError } = await signIn(email.trim(), password);

        if (signInError) {
          throw signInError;
        }
      }
    } catch (submitError) {
      setError(submitError.message || '操作失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page">
      <div className="auth-card">
        <div className="auth-heading">
          <span className="auth-icon">{isRegister ? '🚀' : '🔐'}</span>
          <h1>{isRegister ? '创建玩家账号' : '登录后开始游戏'}</h1>
          <p>
            {isRegister
              ? '注册后即可保存每局成绩并参与总分排行榜。'
              : '使用邮箱和密码登录，游戏成绩会自动绑定到你的账号。'}
          </p>
        </div>

        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <label className="auth-field">
              <span>用户名</span>
              <input
                autoComplete="username"
                maxLength={30}
                minLength={3}
                placeholder="例如 snake_master"
                required
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
          )}

          <label className="auth-field">
            <span>邮箱</span>
            <input
              autoComplete="email"
              placeholder="you@example.com"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>密码</span>
            <input
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={6}
              placeholder="至少 6 位"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {isRegister && (
            <label className="auth-field">
              <span>确认密码</span>
              <input
                autoComplete="new-password"
                minLength={6}
                placeholder="再次输入密码"
                required
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          )}

          <button className="auth-submit" disabled={loading} type="submit">
            {loading ? '处理中...' : isRegister ? '注册并开始' : '登录'}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? '已经有账号？' : '还没有账号？'}
          <Link to={isRegister ? '/login' : '/register'}>
            {isRegister ? '直接登录' : '立即注册'}
          </Link>
        </p>
      </div>
    </section>
  );
}

import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import './AppShell.css';

const navClassName = ({ isActive }) => (
  isActive ? 'app-nav-link active' : 'app-nav-link'
);

export function AppShell({ children }) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const playerName =
    profile?.username ||
    user?.user_metadata?.username ||
    user?.email?.split('@')[0] ||
    '玩家';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="app-brand" to={user ? '/game' : '/login'}>
          <span className="app-brand-icon">🐍</span>
          <span>Super Snake</span>
        </Link>

        <nav className="app-nav" aria-label="主导航">
          <NavLink className={navClassName} to="/leaderboard">
            排行榜
          </NavLink>

          {user ? (
            <>
              <NavLink className={navClassName} to="/game">
                开始游戏
              </NavLink>
              <div className="app-user">
                <span className="app-user-name">{playerName}</span>
                <button className="app-sign-out" type="button" onClick={handleSignOut}>
                  退出
                </button>
              </div>
            </>
          ) : (
            <>
              <NavLink className={navClassName} to="/login">
                登录
              </NavLink>
              <NavLink className={navClassName} to="/register">
                注册
              </NavLink>
            </>
          )}
        </nav>
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
}

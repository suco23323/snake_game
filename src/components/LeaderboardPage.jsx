import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { supabase } from '../lib/supabase';
import './LeaderboardPage.css';

const formatNumber = (value) => Number(value ?? 0).toLocaleString('zh-CN');

const RANK_TITLES = {
  1: '贪吃蛇大王',
  2: '贪吃蛇中王',
  3: '贪吃蛇小王',
};

export function LeaderboardPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('leaderboard')
      .select([
        'rank',
        'user_id',
        'username',
        'display_name',
        'email_display',
        'best_score',
        'best_score_at',
        'best_snake_length',
        'games_played',
        'total_score',
      ].join(', '))
      .order('rank', { ascending: true })
      .limit(100);

    if (queryError) {
      setError(`排行榜加载失败：${queryError.message}`);
      setRows([]);
    } else {
      setRows(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(loadLeaderboard, 0);
    return () => clearTimeout(timeoutId);
  }, [loadLeaderboard]);

  return (
    <section className="leaderboard-page">
      <div className="leaderboard-header">
        <div>
          <span className="leaderboard-eyebrow">在线排行榜</span>
          <h1>单局最高分排名</h1>
          <p>按每位玩家的单局最高分排名，同分时先取得该分数的玩家优先。</p>
        </div>
        <button
          className="leaderboard-refresh"
          disabled={loading}
          type="button"
          onClick={loadLeaderboard}
        >
          {loading ? '刷新中...' : '刷新排行榜'}
        </button>
      </div>

      {error && <div className="leaderboard-error">{error}</div>}

      <div className="leaderboard-card">
        {loading ? (
          <div className="leaderboard-loading">
            <div className="loading-spinner" />
            <p>正在加载排名...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="leaderboard-empty">
            <span>🏁</span>
            <h2>还没有成绩</h2>
            <p>登录并完成第一局游戏后，你的名字会出现在这里。</p>
          </div>
        ) : (
          <div className="leaderboard-table-wrap">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>玩家</th>
                  <th>邮箱</th>
                  <th>最高分</th>
                  <th>总分</th>
                  <th>局数</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isCurrentUser = row.user_id === user?.id;
                  const rank = Number(row.rank);
                  const rankTitle = RANK_TITLES[rank];

                  return (
                    <tr className={isCurrentUser ? 'current-user' : ''} key={row.user_id}>
                      <td>
                        <div className="rank-cell">
                          <span className={`rank-badge rank-${Math.min(rank, 3)}`}>
                            {rank}
                          </span>
                          {rankTitle && (
                            <small className={`rank-title rank-title-${rank}`}>
                              {rankTitle}
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="player-cell">
                          <strong>{row.username}</strong>
                          {row.display_name && row.display_name !== row.username && (
                            <span>{row.display_name}</span>
                          )}
                          {isCurrentUser && <em>你</em>}
                        </div>
                      </td>
                      <td className="email-cell">{row.email_display || '未公开'}</td>
                      <td className="best-score">{formatNumber(row.best_score)}</td>
                      <td>{formatNumber(row.total_score)}</td>
                      <td>{formatNumber(row.games_played)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}




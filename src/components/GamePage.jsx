import { useCallback } from 'react';
import { useAuth } from '../context/auth-context';
import { supabase } from '../lib/supabase';
import SnakeGame from './SnakeGame';
import './GamePage.css';

export function GamePage() {
  const { user, profile } = useAuth();

  const handleSubmitScore = useCallback(async ({
    score,
    snakeLength,
    durationMs,
    foodsEaten,
    clientGameId,
  }) => {
    const { error } = await supabase.rpc('snakegame_submit_score', {
      p_score: score,
      p_client_game_id: clientGameId,
      p_snake_length: snakeLength,
      p_duration_ms: durationMs,
      p_foods_eaten: foodsEaten,
      p_game_mode: 'classic',
      p_game_version: '1.0',
      p_metadata: {},
    });

    if (error) {
      throw error;
    }
  }, []);

  const username =
    profile?.username ||
    user?.user_metadata?.username ||
    user?.email?.split('@')[0] ||
    '玩家';

  const email = profile?.email || user?.email || '';

  return (
    <section className="game-page">
      <div className="game-layout">
        <aside className="game-instructions" aria-label="操作说明">
          <span className="instructions-eyebrow">操作说明</span>
          <h2>控制贪吃蛇</h2>
          <p>使用键盘 WASD 控制移动方向。</p>

          <div className="control-list">
            <div className="control-item">
              <kbd>W</kbd>
              <span>向上移动</span>
            </div>
            <div className="control-item">
              <kbd>A</kbd>
              <span>向左移动</span>
            </div>
            <div className="control-item">
              <kbd>S</kbd>
              <span>向下移动</span>
            </div>
            <div className="control-item">
              <kbd>D</kbd>
              <span>向右移动</span>
            </div>
          </div>

          <div className="pause-tip">
            <kbd>Space</kbd>
            <span>暂停或继续游戏</span>
          </div>
        </aside>

        <div className="game-main-column">
          <div className="game-player-summary">
            <div>
              <span>当前玩家</span>
              <strong>{username}</strong>
            </div>
            <div>
              <span>登录邮箱</span>
              <strong>{email}</strong>
            </div>
          </div>

          <SnakeGame
            onSubmitScore={handleSubmitScore}
            player={{ username, email }}
          />
        </div>
      </div>
    </section>
  );
}


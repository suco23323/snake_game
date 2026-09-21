import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import './SnakeGame.css';
import SoundManager from '../utils/SoundManager';

const BOARD_SIZE = 20;
const INITIAL_SNAKE = [{ x: 10, y: 10 }];
const INITIAL_DIRECTION = { x: 0, y: -1 };
const GAME_SPEED = 150;
const FOOD_COUNT = 3;

// Food types
const FOOD_TYPES = {
  NORMAL: { type: 'normal', points: 10, color: '#ff6b6b', duration: -1 },
  GOLDEN: { type: 'golden', points: 50, color: '#ffd93d', duration: 5000 },
  SPEED: { type: 'speed', points: 25, color: '#4ecdc4', duration: 3000, effect: 'speed' },
  SLOW: { type: 'slow', points: 15, color: '#a8e6cf', duration: 4000, effect: 'slow' },
  GHOST: { type: 'ghost', points: 30, color: '#b19cd9', duration: 6000, effect: 'ghost' },
};

const createGameId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const SnakeGame = ({ player, onSubmitScore }) => {
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [foods, setFoods] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameSpeed, setGameSpeed] = useState(GAME_SPEED);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showMilestone, setShowMilestone] = useState(null);
  const [scoreStatus, setScoreStatus] = useState('idle');
  const [scoreMessage, setScoreMessage] = useState('');

  const gameLoopRef = useRef();
  const lastUpdateTimeRef = useRef(0);
  const previousScoreRef = useRef(0);
  const gameIdRef = useRef(null);
  const startedAtRef = useRef(null);
  const foodsEatenRef = useRef(0);
  const submittedGamesRef = useRef(new Set());

  const triggerConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min, max) => Math.random() * (max - min) + min;

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
    }, 250);
  };

  // Listen for score changes, trigger effects
  useEffect(() => {
    if (score > 0 && score > previousScoreRef.current) {
      const milestone = Math.floor(score / 100) * 100;
      const prevMilestone = Math.floor(previousScoreRef.current / 100) * 100;

      if (milestone > prevMilestone) {
        // Trigger confetti effect
        triggerConfetti();
        // Show milestone notification
        setShowMilestone(milestone);
        setTimeout(() => setShowMilestone(null), 3000);
        // Play special sound effect
        SoundManager.play('goldenFood');
      }
    }
    previousScoreRef.current = score;
  }, [score]);

  // Generate random food
  const generateFood = useCallback(() => {
    const foodTypes = Object.values(FOOD_TYPES);
    const weights = [0.6, 0.15, 0.1, 0.1, 0.05]; // Normal food 60% probability, golden 15%, others less common
    
    let random = Math.random();
    let selectedType = foodTypes[0];
    
    for (let i = 0; i < weights.length; i++) {
      if (random < weights[i]) {
        selectedType = foodTypes[i];
        break;
      }
      random -= weights[i];
    }

    const newFood = {
      id: Date.now() + Math.random(),
      x: Math.floor(Math.random() * BOARD_SIZE),
      y: Math.floor(Math.random() * BOARD_SIZE),
      ...selectedType,
      createdAt: Date.now(),
    };

    return newFood;
  }, []);

  // Check if food has expired
  const checkFoodExpiry = useCallback((foods) => {
    const now = Date.now();
    return foods.filter(food => {
      if (food.duration === -1) return true; // Normal food doesn't expire
      return now - food.createdAt < food.duration;
    });
  }, []);

  // Apply food effects
  const applyFoodEffect = useCallback((effect, duration) => {
    switch (effect) {
      case 'speed':
        setGameSpeed(GAME_SPEED * 0.6); // Speed up
        setTimeout(() => setGameSpeed(GAME_SPEED), duration);
        break;
      case 'slow':
        setGameSpeed(GAME_SPEED * 1.5); // Slow down
        setTimeout(() => setGameSpeed(GAME_SPEED), duration);
        break;
      case 'ghost':
        setIsGhostMode(true);
        setTimeout(() => setIsGhostMode(false), duration);
        break;
    }
  }, []);

  // Move snake
  const moveSnake = useCallback(() => {
    setSnake(currentSnake => {
      const newSnake = [...currentSnake];
      const head = { ...newSnake[0] };

      head.x += direction.x;
      head.y += direction.y;

      // Check boundary collision (ghost mode can pass through walls)
      if (!isGhostMode) {
        if (head.x < 0 || head.x >= BOARD_SIZE || head.y < 0 || head.y >= BOARD_SIZE) {
          SoundManager.play('gameOver');
          setGameOver(true);
          return currentSnake;
        }
      } else {
        // Ghost mode wall phasing
        head.x = (head.x + BOARD_SIZE) % BOARD_SIZE;
        head.y = (head.y + BOARD_SIZE) % BOARD_SIZE;
      }

      // Check self collision (ghost mode won't hit itself)
      if (!isGhostMode && newSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
        SoundManager.play('gameOver');
        setGameOver(true);
        return currentSnake;
      }

      newSnake.unshift(head);

      // Check if food is eaten
      const eatenFood = foods.find(food => food.x === head.x && food.y === head.y);
      if (eatenFood) {
        foodsEatenRef.current += 1;
        setScore(prev => prev + eatenFood.points);

        // Play sound effect
        if (eatenFood.type === 'golden') {
          SoundManager.play('goldenFood');
        } else if (eatenFood.effect === 'speed') {
          SoundManager.play('speedBoost');
        } else if (eatenFood.effect === 'ghost') {
          SoundManager.play('ghostMode');
        } else {
          SoundManager.play('eat');
        }

        // Apply food effect
        if (eatenFood.effect) {
          applyFoodEffect(eatenFood.effect, eatenFood.duration);
        }

        // Remove eaten food and generate new food
        setFoods(currentFoods => {
          const filteredFoods = currentFoods.filter(f => f.id !== eatenFood.id);
          const newFood = generateFood();
          return [...filteredFoods, newFood];
        });
      } else {
        newSnake.pop();
      }

      return newSnake;
    });
  }, [direction, isGhostMode, foods, generateFood, applyFoodEffect]);

  // Game loop
  const gameLoop = useCallback(function runGameLoop(currentTime) {
    if (!isPaused && currentTime - lastUpdateTimeRef.current >= gameSpeed) {
      moveSnake();
      lastUpdateTimeRef.current = currentTime;
    }

    if (gameStarted && !gameOver) {
      gameLoopRef.current = requestAnimationFrame(runGameLoop);
    }
  }, [gameStarted, gameOver, gameSpeed, isPaused, moveSnake]);


  // Keyboard controls
  const handleKeyPress = useCallback((e) => {
    if (!gameStarted) return;

    switch (e.key.toLowerCase()) {
      case 'w':
        if (direction.y === 0) setDirection({ x: 0, y: -1 });
        break;
      case 's':
        if (direction.y === 0) setDirection({ x: 0, y: 1 });
        break;
      case 'a':
        if (direction.x === 0) setDirection({ x: -1, y: 0 });
        break;
      case 'd':
        if (direction.x === 0) setDirection({ x: 1, y: 0 });
        break;
      case ' ':
        e.preventDefault();
        if (!gameOver) setIsPaused(prev => !prev);
        break;
    }
  }, [gameStarted, gameOver, direction]);

  // Start game
  const startGame = () => {
    gameIdRef.current = createGameId();
    startedAtRef.current = Date.now();
    foodsEatenRef.current = 0;
    setSnake(INITIAL_SNAKE);
    setDirection(INITIAL_DIRECTION);
    setFoods(Array.from({ length: FOOD_COUNT }, () => generateFood()));
    setGameOver(false);
    setScore(0);
    setGameStarted(true);
    setGameSpeed(GAME_SPEED);
    setIsGhostMode(false);
    setScoreStatus('idle');
    setScoreMessage('');
  };

  // Restart game
  const restartGame = () => {
    startGame();
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  useEffect(() => {
    if (gameStarted && !gameOver) {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameStarted, gameOver, gameLoop]);

  // Submit one score record after each completed game.
  useEffect(() => {
    const gameId = gameIdRef.current;

    if (!gameOver || !gameId || !onSubmitScore || submittedGamesRef.current.has(gameId)) {
      return undefined;
    }

    submittedGamesRef.current.add(gameId);

    const timeoutId = setTimeout(() => {
      setScoreStatus('saving');
      setScoreMessage('正在保存本局成绩...');

      const durationMs = startedAtRef.current
        ? Math.max(0, Date.now() - startedAtRef.current)
        : 0;

      Promise.resolve(onSubmitScore({
        score,
        snakeLength: snake.length,
        durationMs,
        foodsEaten: foodsEatenRef.current,
        clientGameId: gameId,
      }))
        .then(() => {
          if (gameIdRef.current !== gameId) return;
          setScoreStatus('saved');
          setScoreMessage('成绩已保存，并计入总分排行榜。');
        })
        .catch((error) => {
          if (gameIdRef.current !== gameId) return;
          setScoreStatus('error');
          setScoreMessage(error?.message || '成绩保存失败，请稍后重试。');
        });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [gameOver, onSubmitScore, score, snake.length]);

  // Periodically remove expired food and replenish it so the board never runs out.
  useEffect(() => {
    const interval = setInterval(() => {
      setFoods(currentFoods => {
        const activeFoods = checkFoodExpiry(currentFoods);
        const missingFoodCount = FOOD_COUNT - activeFoods.length;

        if (missingFoodCount <= 0) {
          return activeFoods;
        }

        return [
          ...activeFoods,
          ...Array.from({ length: missingFoodCount }, () => generateFood()),
        ];
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [checkFoodExpiry, generateFood]);

  // Render game board
  const renderBoard = () => {
    const board = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const isSnake = snake.some(segment => segment.x === x && segment.y === y);
        const isHead = snake[0]?.x === x && snake[0]?.y === y;
        const food = foods.find(f => f.x === x && f.y === y);
        
        let cellClass = 'cell';
        if (isSnake) {
          cellClass += isHead ? ' snake-head' : ' snake-body';
          if (isGhostMode) cellClass += ' ghost-mode';
        } else if (food) {
          // Do not add food class to the cell container to avoid style conflicts
          // cellClass += ` food-${food.type}`;
        }

        board.push(
          <div
            key={`${x}-${y}`}
            className={cellClass}
            style={food ? { '--food-color': food.color } : {}}
          >
            {food && (
              <div 
                className={`food food-${food.type}`}
                style={{ backgroundColor: food.color }}
              />
            )}
          </div>
        );
      }
    }
    return board;
  };

  return (
    <div className="snake-game">
      <div className="game-header">
        <h1>🐍 Super Snake Game</h1>
        {player?.username && (
          <div className="player-badge">玩家：{player.username}</div>
        )}
        <div className="game-stats">
          <div className="score">Score: {score}</div>
          <div className="length">Length: {snake.length}</div>
          {showMilestone && (
            <div className="milestone-notification">
              🎉 Reached {showMilestone} points! 🎉
            </div>
          )}
          {isGhostMode && <div className="effect-indicator ghost">👻 Ghost Mode</div>}
          {isPaused && <div className="effect-indicator paused">⏸️ Paused</div>}
        </div>
      </div>

      <div className="game-board-container">
        <div className="game-board">
          {renderBoard()}
        </div>
      </div>

      <div className="game-controls">
        {!gameStarted ? (
          <button onClick={startGame} className="start-btn">
            Start Game
          </button>
        ) : gameOver ? (
          <div className="game-over">
            <h2>Game Over!</h2>
            <p>Final Score: {score}</p>
            {scoreStatus !== 'idle' && (
              <p className={`score-save-status ${scoreStatus}`}>{scoreMessage}</p>
            )}
            <button onClick={restartGame} className="restart-btn">
              Restart
            </button>
          </div>
        ) : (
          <div className="game-info">
            <p>Use W A S D keys to control snake movement</p>
            <p>Press spacebar to pause/resume game</p>
            <div className="food-legend">
              <h3>Food Types:</h3>
              <div className="legend-item">
                <span className="legend-color normal"></span>
                <span>Normal Food (+10 points)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color golden"></span>
                <span>Golden Food (+50 points)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color speed"></span>
                <span>Speed Food (+25 points, speed up)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color slow"></span>
                <span>Slow Food (+15 points, slow down)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color ghost"></span>
                <span>Ghost Food (+30 points, wall phasing)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SnakeGame;











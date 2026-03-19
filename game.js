/**
 * Pong — Classic two-paddle ball game using @engine SDK.
 *
 * Left paddle vs right paddle. In aiVsAi mode both paddles are AI-controlled.
 * In playerVsAi mode the left paddle is player-controlled, right is AI.
 * First to 5 points wins.
 */

import { defineGame } from '@engine/core';
import { consumeAction } from '@engine/input';
import {
  clearCanvas, drawRoundedRect, drawCircle,
  drawLabel, drawGameOver,
} from '@engine/render';
import { drawTouchOverlay } from '@engine/touch';
import { applyVelocity, bounceY, clamp, circleRectCollision } from '@engine/physics';

// ── Constants ───────────────────────────────────────────────────────

const W = 600;
const H = 400;
const PADDLE_W = 12;
const PADDLE_H = 70;
const PADDLE_MARGIN = 20;
const BALL_R = 7;
const WIN_SCORE = 5;
const BALL_SPEED_INIT = 4;
const BALL_SPEED_INCREMENT = 0.3;
const BALL_MAX_SPEED = 9;
const AI_SPEED = 4.5;
const AI_ERROR = 15;
const PLAYER_SPEED = 6;

// ── Game Definition ─────────────────────────────────────────────────

const game = defineGame({
  display: {
    type: 'custom',
    width: 20,
    height: 13,
    cellSize: 30,
    canvasWidth: W,
    canvasHeight: H,
    offsetX: 0,
    offsetY: 0,
    background: '#000',
  },
  input: {
    up:      { keys: ['ArrowUp', 'w'] },
    down:    { keys: ['ArrowDown', 's'] },
    restart: { keys: ['r', 'R'] },
  },
});

// ── Resources ───────────────────────────────────────────────────────

game.resource('state', {
  scoreLeft: 0,
  scoreRight: 0,
  gameOver: false,
  serving: true,
  message: '',
});

game.resource('ball', {
  x: W / 2,
  y: H / 2,
  dx: 0,
  dy: 0,
  speed: BALL_SPEED_INIT,
  radius: BALL_R,
});

game.resource('paddleLeft', {
  x: PADDLE_MARGIN,
  y: H / 2 - PADDLE_H / 2,
  w: PADDLE_W,
  h: PADDLE_H,
});

game.resource('paddleRight', {
  x: W - PADDLE_MARGIN - PADDLE_W,
  y: H / 2 - PADDLE_H / 2,
  w: PADDLE_W,
  h: PADDLE_H,
});

game.resource('_aiTimer', {
  targetLeft: H / 2,
  targetRight: H / 2,
  tickLeft: 0,
  tickRight: 0,
});

// ── Serve System ────────────────────────────────────────────────────

game.system('serve', function serveSystem(world, _dt) {
  const state = world.getResource('state');
  if (state.gameOver || !state.serving) return;

  const ball = world.getResource('ball');
  const paddleLeft = world.getResource('paddleLeft');
  const paddleRight = world.getResource('paddleRight');

  // Reset positions
  ball.x = W / 2;
  ball.y = H / 2;
  ball.speed = BALL_SPEED_INIT;
  paddleLeft.y = H / 2 - PADDLE_H / 2;
  paddleRight.y = H / 2 - PADDLE_H / 2;

  // Launch ball towards the last scorer's opponent
  const dir = Math.random() < 0.5 ? 1 : -1;
  const angle = (Math.random() * 0.8 - 0.4); // vertical angle variance
  ball.dx = dir * Math.cos(angle) * ball.speed;
  ball.dy = Math.sin(angle) * ball.speed;

  state.serving = false;
});

// ── Restart System ──────────────────────────────────────────────────

game.system('restart', function restartSystem(world, _dt) {
  const input = world.getResource('input');
  const state = world.getResource('state');

  if (consumeAction(input, 'restart') && state.gameOver) {
    state.scoreLeft = 0;
    state.scoreRight = 0;
    state.gameOver = false;
    state.serving = true;
    state.message = '';
  }
});

// ── Player Input System ─────────────────────────────────────────────

game.system('playerInput', function playerInputSystem(world, _dt) {
  const gm = world.getResource('gameMode');
  if (!gm || gm.mode !== 'playerVsAi') return;

  const state = world.getResource('state');
  if (state.gameOver) return;

  const input = world.getResource('input');
  const paddle = world.getResource('paddleLeft');

  if (input.up) {
    paddle.y -= PLAYER_SPEED;
    input.up = false;
  }
  if (input.down) {
    paddle.y += PLAYER_SPEED;
    input.down = false;
  }

  paddle.y = clamp(paddle.y, 0, H - PADDLE_H);
});

// ── AI System ───────────────────────────────────────────────────────

game.system('ai', function aiSystem(world, dt) {
  const state = world.getResource('state');
  if (state.gameOver) return;

  const ball = world.getResource('ball');
  const paddleLeft = world.getResource('paddleLeft');
  const paddleRight = world.getResource('paddleRight');
  const aiTimer = world.getResource('_aiTimer');
  const gm = world.getResource('gameMode');
  const isPlayerMode = gm && gm.mode === 'playerVsAi';

  // Recalculate AI targets periodically (adds slight error / reaction delay)
  aiTimer.tickRight += dt;
  if (aiTimer.tickRight > 100) {
    aiTimer.tickRight = 0;
    aiTimer.targetRight = ball.y + (Math.random() - 0.5) * AI_ERROR;
  }

  // Move right paddle AI
  const rightCenter = paddleRight.y + PADDLE_H / 2;
  const rightDiff = aiTimer.targetRight - rightCenter;
  if (Math.abs(rightDiff) > 3) {
    const move = clamp(rightDiff, -AI_SPEED, AI_SPEED);
    paddleRight.y += move;
  }
  paddleRight.y = clamp(paddleRight.y, 0, H - PADDLE_H);

  // Left paddle AI (only in aiVsAi mode)
  if (!isPlayerMode) {
    aiTimer.tickLeft += dt;
    if (aiTimer.tickLeft > 100) {
      aiTimer.tickLeft = 0;
      aiTimer.targetLeft = ball.y + (Math.random() - 0.5) * AI_ERROR;
    }

    const leftCenter = paddleLeft.y + PADDLE_H / 2;
    const leftDiff = aiTimer.targetLeft - leftCenter;
    if (Math.abs(leftDiff) > 3) {
      const move = clamp(leftDiff, -AI_SPEED, AI_SPEED);
      paddleLeft.y += move;
    }
    paddleLeft.y = clamp(paddleLeft.y, 0, H - PADDLE_H);
  }
});

// ── Physics System ──────────────────────────────────────────────────

game.system('physics', function physicsSystem(world, dt) {
  const state = world.getResource('state');
  if (state.gameOver || state.serving) return;

  const ball = world.getResource('ball');
  const paddleLeft = world.getResource('paddleLeft');
  const paddleRight = world.getResource('paddleRight');

  // Sub-stepping for consistent collision detection
  const steps = Math.ceil(dt / 8);
  const stepDx = ball.dx / steps;
  const stepDy = ball.dy / steps;

  for (let s = 0; s < steps; s++) {
    ball.x += stepDx;
    ball.y += stepDy;

    // Top / bottom wall bounce
    if (ball.y - BALL_R <= 0) {
      ball.y = BALL_R;
      ball.dy = Math.abs(ball.dy);
    }
    if (ball.y + BALL_R >= H) {
      ball.y = H - BALL_R;
      ball.dy = -Math.abs(ball.dy);
    }

    // Left paddle collision
    if (ball.dx < 0) {
      const col = circleRectCollision(
        ball.x, ball.y, BALL_R,
        paddleLeft.x, paddleLeft.y, paddleLeft.w, paddleLeft.h,
      );
      if (col.hit) {
        ball.x = paddleLeft.x + paddleLeft.w + BALL_R;
        const hitPos = (ball.y - paddleLeft.y) / PADDLE_H; // 0..1
        const angle = (hitPos - 0.5) * (Math.PI / 3); // -60..+60 degrees
        ball.speed = Math.min(ball.speed + BALL_SPEED_INCREMENT, BALL_MAX_SPEED);
        ball.dx = Math.cos(angle) * ball.speed;
        ball.dy = Math.sin(angle) * ball.speed;
      }
    }

    // Right paddle collision
    if (ball.dx > 0) {
      const col = circleRectCollision(
        ball.x, ball.y, BALL_R,
        paddleRight.x, paddleRight.y, paddleRight.w, paddleRight.h,
      );
      if (col.hit) {
        ball.x = paddleRight.x - BALL_R;
        const hitPos = (ball.y - paddleRight.y) / PADDLE_H;
        const angle = (hitPos - 0.5) * (Math.PI / 3);
        ball.speed = Math.min(ball.speed + BALL_SPEED_INCREMENT, BALL_MAX_SPEED);
        ball.dx = -Math.cos(angle) * ball.speed;
        ball.dy = Math.sin(angle) * ball.speed;
      }
    }

    // Score: ball past left edge
    if (ball.x + BALL_R < 0) {
      state.scoreRight++;
      if (state.scoreRight >= WIN_SCORE) {
        state.gameOver = true;
        state.message = 'Right Player Wins!';
      } else {
        state.serving = true;
      }
      return;
    }

    // Score: ball past right edge
    if (ball.x - BALL_R > W) {
      state.scoreLeft++;
      if (state.scoreLeft >= WIN_SCORE) {
        state.gameOver = true;
        state.message = 'Left Player Wins!';
      } else {
        state.serving = true;
      }
      return;
    }
  }
});

// ── Render System ───────────────────────────────────────────────────

game.system('render', function renderSystem(world, _dt) {
  const renderer = world.getResource('renderer');
  if (!renderer) return;

  const { ctx } = renderer;
  const state = world.getResource('state');
  const ball = world.getResource('ball');
  const paddleLeft = world.getResource('paddleLeft');
  const paddleRight = world.getResource('paddleRight');

  // Background
  clearCanvas(ctx, '#000');

  // Center dashed line
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Scores
  drawLabel(ctx, String(state.scoreLeft), W / 2 - 50, 50, {
    color: '#fff',
    fontSize: 40,
    align: 'center',
  });
  drawLabel(ctx, String(state.scoreRight), W / 2 + 50, 50, {
    color: '#fff',
    fontSize: 40,
    align: 'center',
  });

  // Left paddle
  drawRoundedRect(ctx, paddleLeft.x, paddleLeft.y, paddleLeft.w, paddleLeft.h, 4, '#fff');

  // Right paddle
  drawRoundedRect(ctx, paddleRight.x, paddleRight.y, paddleRight.w, paddleRight.h, 4, '#fff');

  // Ball
  drawCircle(ctx, ball.x, ball.y, BALL_R, '#fff');

  // Ball trail (subtle)
  drawCircle(ctx, ball.x - ball.dx * 2, ball.y - ball.dy * 2, BALL_R * 0.5, '#fff', { alpha: 0.25 });

  // Border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, W, H);

  // Game over overlay
  if (state.gameOver) {
    drawGameOver(ctx, 0, 0, W, H, {
      title: state.message || 'GAME OVER',
      titleColor: '#fff',
      subtitle: 'Press R to restart',
    });
  }

  drawTouchOverlay(ctx, ctx.canvas.width, ctx.canvas.height);
});

export default game;

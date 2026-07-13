import React, { useState, useEffect, useCallback, useRef } from 'react';
import { parentApi } from '../api.js';

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const TASK_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
const LONG_PRESS_MS = 700;

const CATEGORY_ICON = {
  medicine: '💊',
  hydration: '💧',
  meal: '🍽️',
  exercise: '🚶',
  chore: '🧹',
  custom: '✅',
};

export default function ParentView() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pressTimer = useRef(null);

  const loadTasks = useCallback(async () => {
    try {
      const data = await parentApi.getTodayTasks();
      setTasks(data.tasks);
      setError(null);
    } catch (err) {
      setError('Unable to load tasks. Will retry shortly.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + periodic task refresh (also catches midnight day-rollover)
  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, TASK_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Silent background heartbeat — no visible UI, fires every 15 min
  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        await parentApi.heartbeat();
      } catch (err) {
        // Silent failure by design — parent should never see network errors
        console.warn('Heartbeat failed silently:', err);
      }
    };
    sendHeartbeat(); // fire immediately on mount
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const toggleTask = async (taskId, action) => {
    // Optimistic update for instant tactile feedback
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, completed_today: action === 'complete' } : t
      )
    );
    try {
      await parentApi.toggleTask(taskId, action);
    } catch (err) {
      loadTasks(); // resync with server truth on failure
    }
  };

  const handlePressStart = (taskId) => {
    pressTimer.current = setTimeout(() => {
      toggleTask(taskId, 'reset');
      pressTimer.current = null; // mark as consumed by long-press
    }, LONG_PRESS_MS);
  };

  const handlePressEnd = (taskId, alreadyCompleted) => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      if (!alreadyCompleted) {
        toggleTask(taskId, 'complete');
      }
    }
    // if pressTimer is null, the long-press already fired the reset
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-16 h-16 border-8 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-6">
      {error && (
        <div className="bg-yellow-500 text-black text-2xl font-bold text-center py-3 rounded-xl mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {tasks.map((task) => {
          const done = task.completed_today;
          return (
            <button
              key={task.id}
              onMouseDown={() => handlePressStart(task.id)}
              onMouseUp={() => handlePressEnd(task.id, done)}
              onMouseLeave={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
              onTouchStart={() => handlePressStart(task.id)}
              onTouchEnd={() => handlePressEnd(task.id, done)}
              className={`
                flex flex-col items-center justify-center
                aspect-square rounded-3xl border-8
                transition-colors duration-200 select-none
                active:scale-95
                ${done
                  ? 'bg-green-600 border-green-300'
                  : 'bg-white border-gray-300'}
              `}
            >
              <span className="text-8xl mb-4">{CATEGORY_ICON[task.category] || '✅'}</span>
              <span className={`text-4xl font-black ${done ? 'text-white' : 'text-black'}`}>
                {done ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {tasks.length === 0 && (
        <div className="flex items-center justify-center h-96">
          <span className="text-white text-5xl font-bold">✓ All Clear</span>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { childApi } from '../api.js';

const STATUS_POLL_MS = 60 * 1000; // re-check every 60s
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ChildView({ parentId }) {
  const [status, setStatus] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'chore',
    recurrenceType: 'daily',
    dayOfWeek: 0,
    specificDate: '',
  });
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!parentId) return;
    try {
      const data = await childApi.getStatus(parentId);
      setStatus(data);
    } catch (err) {
      console.error(err);
    }
  }, [parentId]);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleVerifyCall = async () => {
    setVerifying(true);
    try {
      await childApi.unlock(parentId);
      await loadStatus();
    } catch (err) {
      alert('Could not verify the call right now. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);

    if (form.recurrenceType === 'weekly' && form.dayOfWeek === '') {
      setFormError('Please select a day of the week.');
      return;
    }
    if (form.recurrenceType === 'once' && !form.specificDate) {
      setFormError('Please select a calendar date.');
      return;
    }

    try {
      await childApi.createTask({
        parentId,
        title: form.title,
        category: form.category,
        recurrenceType: form.recurrenceType,
        dayOfWeek: form.recurrenceType === 'weekly' ? Number(form.dayOfWeek) : undefined,
        specificDate: form.recurrenceType === 'once' ? form.specificDate : undefined,
      });
      setFormSuccess(true);
      setForm({ title: '', category: 'chore', recurrenceType: 'daily', dayOfWeek: 0, specificDate: '' });
    } catch (err) {
      setFormError(err.message);
    }
  };

  if (!parentId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 text-center">
        <p className="text-slate-500">
          No parent tablet is linked to your account yet. Generate a join code and pair
          a device first.
        </p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <span className="text-gray-500 text-lg">Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* ---------------------------------------------------- */}
      {/* Milestone Call Gate — full-screen lock overlay        */}
      {/* ---------------------------------------------------- */}
      {!status.unlockedToday && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center px-6">
          <div className="text-6xl mb-6">📞</div>
          <h1 className="text-white text-3xl font-bold mb-3 text-center">
            Call your parent first
          </h1>
          <p className="text-slate-300 text-center max-w-md mb-8">
            Today's checklist is locked until you connect. A quick call means more
            than a checkbox — pick up the phone, then verify below.
          </p>
          <button
            onClick={handleVerifyCall}
            disabled={verifying}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50
                       text-white font-bold text-xl px-10 py-4 rounded-2xl
                       transition-colors shadow-lg"
          >
            {verifying ? 'Verifying…' : "I called — Verify"}
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Main Dashboard                                        */}
      {/* ---------------------------------------------------- */}
      <div className="max-w-3xl mx-auto p-6">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-800">CareSync</h1>

          {/* Connection status dot */}
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border">
            <span
              className={`w-3 h-3 rounded-full ${
                status.online ? 'bg-green-500' : 'bg-gray-400'
              }`}
            />
            <span className="text-sm font-medium text-slate-600">
              {status.online ? 'Online' : 'Offline'}
            </span>
          </div>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Today</h2>
          <p className="text-slate-500 text-sm">
            {status.unlockedToday
              ? "Checklist unlocked for today. Great job staying connected."
              : "Waiting on today's call to unlock the checklist."}
          </p>
          {status.lastHeartbeatAt && (
            <p className="text-xs text-slate-400 mt-2">
              Last device activity: {new Date(status.lastHeartbeatAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* ------------------------------------------------ */}
        {/* Scheduling Form                                   */}
        {/* ------------------------------------------------ */}
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <button
            onClick={() => setShowScheduler((s) => !s)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold text-slate-800">Manage Tasks</h2>
            <span className="text-slate-400">{showScheduler ? '−' : '+'}</span>
          </button>

          {showScheduler && (
            <form onSubmit={handleScheduleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Task name
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  placeholder="e.g. Take blood pressure medicine"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="medicine">Medicine</option>
                    <option value="hydration">Hydration</option>
                    <option value="meal">Meal</option>
                    <option value="exercise">Exercise</option>
                    <option value="chore">Chore</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Recurrence
                  </label>
                  <select
                    value={form.recurrenceType}
                    onChange={(e) => setForm({ ...form, recurrenceType: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="daily">Every day</option>
                    <option value="weekly">Weekly, specific day</option>
                    <option value="once">One-time, specific date</option>
                  </select>
                </div>
              </div>

              {form.recurrenceType === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Day of week
                  </label>
                  <select
                    value={form.dayOfWeek}
                    onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    {DAYS.map((d, idx) => (
                      <option key={idx} value={idx}>{d}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.recurrenceType === 'once' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Calendar date
                  </label>
                  <input
                    type="date"
                    required
                    value={form.specificDate}
                    onChange={(e) => setForm({ ...form, specificDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}

              {formError && (
                <p className="text-red-500 text-sm">{formError}</p>
              )}
              {formSuccess && (
                <p className="text-emerald-600 text-sm">Task added successfully.</p>
              )}

              <button
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-lg transition-colors"
              >
                Add Task
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

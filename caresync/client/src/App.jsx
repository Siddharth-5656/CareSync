import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import GenerateCode from './pages/GenerateCode.jsx';
import PairDevice from './pages/PairDevice.jsx';
import ParentView from './components/ParentView.jsx';
import ChildView from './components/ChildView.jsx';

function ChildProtectedRoute({ children }) {
  const token = localStorage.getItem('caresync_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function ParentProtectedRoute({ children }) {
  const deviceToken = localStorage.getItem('caresync_device_token');
  if (!deviceToken) return <Navigate to="/pair" replace />;
  return children;
}

export default function App() {
  const Router = window.location.hostname.includes('localhost') ? BrowserRouter : HashRouter;

  return (
    <Router>
      <Routes>
        {/* Child / family-member facing routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/generate-code"
          element={
            <ChildProtectedRoute>
              <GenerateCode />
            </ChildProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ChildProtectedRoute>
              <ChildView parentId={localStorage.getItem('caresync_parent_id')} />
            </ChildProtectedRoute>
          }
        />

        {/* Parent tablet facing routes */}
        <Route path="/pair" element={<PairDevice />} />
        <Route
          path="/tablet"
          element={
            <ParentProtectedRoute>
              <ParentView />
            </ParentProtectedRoute>
          }
        />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

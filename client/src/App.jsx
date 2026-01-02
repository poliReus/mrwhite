import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Lobby from "./pages/Lobby.jsx";
import Game from "./pages/Game.jsx";

export default function App() {
  return (
    <div className="container">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:code" element={<Lobby />} />
        <Route path="/room/:code/game" element={<Game />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <div style={{ marginTop: 18 }} className="small">
        Mr White – versione calciatori (MVP)
      </div>
    </div>
  );
}

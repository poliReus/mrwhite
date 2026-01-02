import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket.js";

export default function Home() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
  }, [name, roomCode]);

  const createRoom = () => {
    setError("");
    const myName = name.trim();
    sessionStorage.setItem("mw_name", myName);

    socket.emit("room:create", { name: myName }, (res) => {
      if (!res?.ok) return setError(res?.error || "Errore.");
      nav(`/room/${res.roomCode}`);
    });
  };

  const joinRoom = () => {
    setError("");
    const code = roomCode.trim().toUpperCase();
    const myName = name.trim();
    sessionStorage.setItem("mw_name", myName);

    socket.emit("room:join", { roomCode: code, name: myName }, (res) => {
      if (!res?.ok) return setError(res?.error || "Errore.");
      nav(`/room/${code}`);
    });
  };


  return (
    <div className="card">
      <div className="h1">Mr White (Calciatori)</div>
      <div className="h2">Crea una stanza o entra con un codice</div>

      <div className="row" style={{ marginTop: 14 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Il tuo nome"
          style={{ flex: 1, minWidth: 220 }}
        />
      </div>

      <div className="hr" />

      <div className="row">
        <button onClick={createRoom} disabled={!name.trim()}>
          Crea stanza (host)
        </button>
      </div>

      <div className="hr" />

      <div className="row">
        <input
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
          placeholder="Codice stanza (es. ABCD)"
          style={{ width: 220 }}
        />
        <button onClick={joinRoom} disabled={!name.trim() || !roomCode.trim()}>
          Entra
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 12 }} className="danger">
          {error}
        </div>
      )}

      <div style={{ marginTop: 14 }} className="small">
        Suggerimento: apri il link della stanza ai tuoi amici. Ognuno inserisce il nome e entra.
      </div>
    </div>
  );
}

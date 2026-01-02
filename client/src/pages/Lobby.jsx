import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../socket.js";

export default function Lobby() {
  const { code } = useParams();
  const roomCode = useMemo(() => (code || "").toUpperCase(), [code]);
  const nav = useNavigate();

  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(sessionStorage.getItem("mw_name") || "");
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const onUpdate = (payload) => {
      setRoom(payload);
      setError("");
      setJoined(true);

      if (payload?.started) {
        nav(`/room/${roomCode}/game`, { replace: true });
      }
    };

    const onClosed = () => {
      setError("La stanza è stata chiusa (host disconnesso).");
      setRoom(null);
      setJoined(false);
    };

    socket.on("room:update", onUpdate);
    socket.on("room:closed", onClosed);

    return () => {
      socket.off("room:update", onUpdate);
      socket.off("room:closed", onClosed);
    };
  }, [nav, roomCode]);

  // Se entri da link diretto, non hai fatto join: lo fai qui
  const doJoin = () => {
    setError("");
    const myName = name.trim();
    if (!myName) return setError("Inserisci un nome.");

    sessionStorage.setItem("mw_name", myName);

    socket.emit("room:join", { roomCode, name: myName }, (res) => {
      if (!res?.ok) {
        setJoined(false);
        return setError(res?.error || "Errore ingresso stanza.");
      }
      setJoined(true);
      // gli update arriveranno con room:update
    });
  };

  const isHost = room?.hostId === socket.id;

  const startGame = () => {
    setError("");
    socket.emit("game:start", { roomCode }, (res) => {
      if (!res?.ok) return setError(res?.error || "Errore avvio.");
      nav(`/room/${roomCode}/game`);
    });
  };

  const shareLink = () => {
    const url = window.location.href;
    navigator.clipboard?.writeText(url);
    alert("Link copiato negli appunti!");
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h1">Lobby</div>
          <div className="small">
            Codice stanza: <span className="badge">{roomCode}</span>
          </div>
        </div>
        <button onClick={shareLink}>Copia link stanza</button>
      </div>

      <div className="hr" />

      {/* Se non sei ancora nella stanza, chiedi nome e fai join */}
      {!joined && (
        <div className="secretBox">
          <div className="h2">Entra nella stanza</div>
          <div className="row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Il tuo nome"
              style={{ flex: 1, minWidth: 220 }}
            />
            <button onClick={doJoin} disabled={!name.trim()}>
              Entra
            </button>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            Se hai aperto il link diretto, devi inserire il nome qui.
          </div>
        </div>
      )}

      <div className="hr" />

      <div className="h2">Giocatori</div>
      {room?.players?.length ? (
        <ul className="list">
          {room.players.map((p) => (
            <li key={p.id}>
              {p.name} {p.id === room.hostId ? <span className="badge">HOST</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="small">In attesa...</div>
      )}

      <div className="hr" />

      <div className="row" style={{ alignItems: "center" }}>
        <button
          onClick={startGame}
          disabled={!isHost || (room?.players?.length || 0) < 3}
          title={!isHost ? "Solo l'host può avviare" : ""}
        >
          Avvia (calciatore casuale + 1 impostore)
        </button>
        <div className="small">
          {isHost ? (
            <>
              {room?.players?.length < 3 ? (
                <span className="warn">Servono almeno 3 giocatori</span>
              ) : (
                <span className="ok">Pronto</span>
              )}
            </>
          ) : (
            <span className="small">Aspetta che l’host avvii</span>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12 }} className="danger">
          {error}
        </div>
      )}

      <div style={{ marginTop: 14 }} className="small">
        Nota: una volta avviata la partita, non si può entrare (MVP).
      </div>
    </div>
  );
}

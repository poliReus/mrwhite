import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../socket.js";

export default function Game() {
  const { code } = useParams();
  const roomCode = useMemo(() => (code || "").toUpperCase(), [code]);
  const nav = useNavigate();

  const [room, setRoom] = useState(null);
  const [secret, setSecret] = useState(null);
  const [error, setError] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    const onUpdate = (payload) => setRoom(payload);

    const onSecret = (payload) => {
      setSecret(payload);
      setShowSecret(false);
    };

    const onClosed = () => {
      setError("La stanza è stata chiusa (host disconnesso).");
      setRoom(null);
    };

    socket.on("room:update", onUpdate);
    socket.on("game:secret", onSecret);
    socket.on("room:closed", onClosed);

    // 🔥 IMPORTANT: sync state on mount (in case we missed events)
    socket.emit("game:getState", { roomCode }, (res) => {
      if (!res?.ok) {
        setError(res?.error || "Errore sync.");
        return;
      }
      setRoom(res.room);
      setSecret(res.secret?.started ? res.secret : null);
    });

    return () => {
      socket.off("room:update", onUpdate);
      socket.off("game:secret", onSecret);
      socket.off("room:closed", onClosed);
    };
  }, [roomCode]);


  const isHost = room?.hostId === socket.id;

  const newRound = () => {
    setError("");
    socket.emit("game:newRound", { roomCode }, (res) => {
      if (!res?.ok) setError(res?.error || "Errore nuova manche.");
    });
  };

  const backToLobby = () => nav(`/room/${roomCode}`);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h1">Game</div>
          <div className="small">
            Stanza: <span className="badge">{roomCode}</span>
          </div>
        </div>
        <div className="row">
          <button onClick={backToLobby}>Lobby</button>
          <button onClick={newRound} disabled={!isHost}>
            Nuova manche
          </button>
        </div>
      </div>

      <div className="hr" />

      <div className="h2">Il tuo ruolo (privato)</div>
      <div className="secretBox">
        {!secret ? (
          <div className="small">In attesa della parola...</div>
        ) : (
          <>
            <div className="row" style={{ alignItems: "center" }}>
              <button onClick={() => setShowSecret((s) => !s)}>
                {showSecret ? "Nascondi" : "Mostra"}
              </button>
              <div className="small">
                Consiglio: mostra per pochi secondi e poi nascondi.
              </div>
            </div>

            <div className="hr" />

            {showSecret ? (
              secret.isImpostor ? (
                <div>
                  <div className="danger" style={{ fontSize: 22, fontWeight: 700 }}>
                    Sei l’IMPOSTORE
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>
                    Non hai la parola. Cerca di capirla senza farti scoprire.
                  </div>
                </div>
              ) : (
                <div>
                  <div className="ok" style={{ fontSize: 22, fontWeight: 700 }}>
                    Parola:
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                    {secret.footballer}
                  </div>
                </div>
              )
            ) : (
              <div className="small">Clicca “Mostra” per vedere la parola/ruolo.</div>
            )}
          </>
        )}
      </div>

      <div className="hr" />

      <div className="h2">Ordine turni (pubblico)</div>
      {room?.turnOrder?.length ? (
        <ol className="list">
          {room.turnOrder.map((p) => (
            <li key={p.id}>
              {p.name} {p.id === room.hostId ? <span className="badge">HOST</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="small">In attesa ordine...</div>
      )}

      {error && (
        <div style={{ marginTop: 12 }} className="danger">
          {error}
        </div>
      )}

      <div style={{ marginTop: 14 }} className="small">
        Regola: l’impostore non è mai il primo nell’ordine. (MVP già applicato.)
      </div>
    </div>
  );
}

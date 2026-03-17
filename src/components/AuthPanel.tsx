"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginUser, signUpUser } from "@/app/actions/auth";

type Mode = "login" | "signup";

export default function AuthPanel({ players }: { players: string[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [formData, setFormData] = useState({
    playerName: "",
    password: "",
    confirmPassword: "",
  });

  const filteredPlayers = useMemo(() => {
    if (!formData.playerName.trim()) {
      return players.slice(0, 10);
    }

    const search = formData.playerName.toLowerCase();
    return players.filter((player) => player.toLowerCase().includes(search)).slice(0, 10);
  }, [formData.playerName, players]);

  const onSubmit = () => {
    setMessage(null);
    startTransition(async () => {
      const action = mode === "signup" ? signUpUser : loginUser;
      const result = await action(formData);

      if (result.success) {
        setMessage({ type: "success", text: mode === "signup" ? "Account created. Entering command center..." : "Welcome back. Syncing command center..." });
        router.refresh();
        return;
      }

      setMessage({ type: "error", text: result.error || "Authentication failed." });
    });
  };

  return (
    <div className="cyber-card" style={{ maxWidth: "720px", margin: "3rem auto", padding: "0", overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)" }}>
        <button style={tabStyle(mode === "login")} onClick={() => setMode("login")}>SIGN IN</button>
        <button style={tabStyle(mode === "signup")} onClick={() => setMode("signup")}>SIGN UP</button>
      </div>

      <div style={{ padding: "2rem" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>BOM Access Console</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          Select your BOM player name and secure the command center with a password.
        </p>

        {message && (
          <div style={messageStyle(message.type)}>
            {message.text}
          </div>
        )}

        <div className="flex-col gap-4">
          <div className="flex-col gap-2">
            <label className="cyber-label">PLAYER NAME</label>
            <input
              list="bom-player-options"
              className="cyber-input"
              value={formData.playerName}
              onChange={(e) => setFormData((prev) => ({ ...prev, playerName: e.target.value }))}
              placeholder="Select your roster name"
            />
            <datalist id="bom-player-options">
              {filteredPlayers.map((player) => (
                <option key={player} value={player} />
              ))}
            </datalist>
          </div>

          <div className="flex-col gap-2">
            <label className="cyber-label">PASSWORD</label>
            <input
              type="password"
              className="cyber-input"
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="At least 8 characters"
            />
          </div>

          {mode === "signup" && (
            <div className="flex-col gap-2">
              <label className="cyber-label">CONFIRM PASSWORD</label>
              <input
                type="password"
                className="cyber-input"
                value={formData.confirmPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Re-enter your password"
              />
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                `Tedmeister` will be created as the BOM administrator automatically on first signup.
              </p>
            </div>
          )}

          <button className="cyber-button primary" onClick={onSubmit} disabled={isPending}>
            {isPending ? "AUTHORIZING..." : mode === "signup" ? "CREATE ACCOUNT" : "SIGN IN"}
          </button>
        </div>
      </div>
    </div>
  );
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "0.9rem 1rem",
  border: "none",
  cursor: "pointer",
  background: active ? "rgba(0,255,157,0.14)" : "transparent",
  color: active ? "var(--accent-neon)" : "var(--text-muted)",
  borderBottom: active ? "2px solid var(--accent-neon)" : "2px solid transparent",
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
});

const messageStyle = (type: "success" | "error"): React.CSSProperties => ({
  marginBottom: "1rem",
  padding: "0.85rem 1rem",
  borderRadius: "4px",
  border: `1px solid ${type === "success" ? "var(--accent-neon)" : "var(--accent-red)"}`,
  backgroundColor: type === "success" ? "rgba(0,255,157,0.08)" : "rgba(255,51,102,0.08)",
  color: type === "success" ? "var(--accent-neon)" : "var(--accent-red)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.85rem",
});

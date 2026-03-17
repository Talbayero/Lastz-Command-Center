"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePassword, disableOwnAccount, logoutUser } from "@/app/actions/auth";

export default function AccountPanel({
  playerName,
  roleName,
}: {
  playerName: string;
  roleName: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const onPasswordChange = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await changePassword(formData);
      if (result.success) {
        setMessage({ type: "success", text: "Password updated successfully." });
        setFormData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        setMessage({ type: "error", text: result.error || "Failed to update password." });
      }
    });
  };

  const onLogout = () => {
    startTransition(async () => {
      await logoutUser();
      router.refresh();
    });
  };

  const onDisable = () => {
    const confirmed = window.confirm("Disable your own account? You will be signed out and an admin must re-enable you.");
    if (!confirmed) return;

    startTransition(async () => {
      const result = await disableOwnAccount();
      if (result.success) {
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to disable account." });
      }
    });
  };

  return (
    <>
      <button className="cyber-button" onClick={() => setIsOpen(true)}>
        {playerName} / {roleName}
      </button>

      {isOpen && (
        <div style={overlayStyle}>
          <div className="cyber-card" style={{ width: "100%", maxWidth: "520px", position: "relative" }}>
            <button onClick={() => setIsOpen(false)} style={closeStyle}>×</button>
            <h2 style={{ marginBottom: "0.25rem" }}>Account Control</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
              Signed in as {playerName}. Update your password or disable your own account here.
            </p>

            {message && <div style={messageStyle(message.type)}>{message.text}</div>}

            <div className="flex-col gap-3">
              <input
                type="password"
                className="cyber-input"
                placeholder="Current password"
                value={formData.currentPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, currentPassword: e.target.value }))}
              />
              <input
                type="password"
                className="cyber-input"
                placeholder="New password"
                value={formData.newPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, newPassword: e.target.value }))}
              />
              <input
                type="password"
                className="cyber-input"
                placeholder="Confirm new password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              />
            </div>

            <div className="flex-row gap-3" style={{ marginTop: "1.25rem", flexWrap: "wrap" }}>
              <button className="cyber-button primary" onClick={onPasswordChange} disabled={isPending}>
                {isPending ? "UPDATING..." : "CHANGE PASSWORD"}
              </button>
              <button className="cyber-button" onClick={onLogout} disabled={isPending}>
                SIGN OUT
              </button>
              <button
                className="cyber-button"
                onClick={onDisable}
                disabled={isPending}
                style={{ borderColor: "var(--accent-red)", color: "var(--accent-red)" }}
              >
                DISABLE ACCOUNT
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.8)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 1000,
};

const closeStyle: React.CSSProperties = {
  position: "absolute",
  top: "1rem",
  right: "1rem",
  border: "none",
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
  fontSize: "1.2rem",
};

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

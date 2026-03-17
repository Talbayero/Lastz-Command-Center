"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { adminCreateUserAccount, adminUpdateUser, createRole, updateRole } from "@/app/actions/auth";
import { permissionKeys, permissionLabels, type RolePermissions } from "@/utils/permissions";

type RoleRecord = {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: RolePermissions;
};

type RosterEntry = {
  playerId: string;
  playerName: string;
  hasAccount: boolean;
  userId: string | null;
  roleId: string | null;
  roleName: string | null;
  isActive: boolean;
  disabledByUser: boolean;
};

export default function AdminPanel({
  initialRoles,
  initialRoster,
}: {
  initialRoles: RoleRecord[];
  initialRoster: RosterEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [roles, setRoles] = useState(initialRoles);
  const [roster, setRoster] = useState(initialRoster);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<RolePermissions>(() => emptyRolePermissions());
  const [newAccountPasswords, setNewAccountPasswords] = useState<Record<string, string>>({});
  const [userPanelOpen, setUserPanelOpen] = useState(true);
  const [rolePanelOpen, setRolePanelOpen] = useState(true);

  const defaultRoleId = useMemo(
    () => roles.find((role) => role.name === "Alliance Member")?.id ?? roles[0]?.id ?? "",
    [roles]
  );

  const saveUser = (entry: RosterEntry) => {
    if (!entry.userId || !entry.roleId) return;
    const userId = entry.userId;
    const roleId = entry.roleId;

    setMessage(null);
    startTransition(async () => {
      const result = await adminUpdateUser({
        userId,
        roleId,
        isActive: entry.isActive,
        disabledByUser: entry.disabledByUser,
      });

      if (result.success) {
        setMessage({ type: "success", text: `${entry.playerName} updated.` });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to update user." });
      }
    });
  };

  const createAccount = (entry: RosterEntry) => {
    const password = newAccountPasswords[entry.playerId] ?? "";
    const selectedRoleId = entry.roleId || defaultRoleId;
    if (!selectedRoleId) {
      setMessage({ type: "error", text: "No role is available for this account yet." });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await adminCreateUserAccount({
        playerId: entry.playerId,
        roleId: selectedRoleId,
        password,
      });

      if (result.success) {
        setMessage({ type: "success", text: `${entry.playerName} account created.` });
        setNewAccountPasswords((prev) => ({ ...prev, [entry.playerId]: "" }));
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to create account." });
      }
    });
  };

  const saveRole = (role: RoleRecord) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateRole({
        roleId: role.id,
        name: role.name,
        permissions: role.permissions,
      });

      if (result.success) {
        setMessage({ type: "success", text: `${role.name} permissions updated.` });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to update role." });
      }
    });
  };

  const addRole = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await createRole({
        name: newRoleName,
        permissions: newRolePermissions,
      });

      if (result.success) {
        setMessage({ type: "success", text: `${newRoleName} role created.` });
        setNewRoleName("");
        setNewRolePermissions(emptyRolePermissions());
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to create role." });
      }
    });
  };

  return (
    <div className="flex-col gap-6">
      {message && <div style={messageStyle(message.type)}>{message.text}</div>}

      <div className="cyber-card">
        <button type="button" onClick={() => setUserPanelOpen((prev) => !prev)} style={sectionHeaderStyle}>
          <span style={{ color: "var(--accent-neon)" }}>USER MANAGEMENT</span>
          {userPanelOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {userPanelOpen && (
          <div className="flex-col gap-3">
            {roster.map((entry) => (
              <div key={entry.playerId} style={panelStyle}>
                <div style={{ minWidth: "200px" }}>
                  <div style={{ fontWeight: 700 }}>{entry.playerName}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    {entry.hasAccount ? `Role: ${entry.roleName ?? "Unassigned"}` : "No account yet"}
                  </div>
                </div>

                <select
                  className="cyber-input"
                  value={entry.roleId || defaultRoleId}
                  onChange={(e) =>
                    setRoster((prev) =>
                      prev.map((item) => (item.playerId === entry.playerId ? { ...item, roleId: e.target.value } : item))
                    )
                  }
                  style={{ minWidth: "180px" }}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>

                {entry.hasAccount ? (
                  <>
                    <label style={toggleLabelStyle}>
                      <input
                        type="checkbox"
                        checked={entry.isActive}
                        onChange={(e) =>
                          setRoster((prev) =>
                            prev.map((item) =>
                              item.playerId === entry.playerId ? { ...item, isActive: e.target.checked } : item
                            )
                          )
                        }
                      />
                      Active
                    </label>

                    <label style={toggleLabelStyle}>
                      <input
                        type="checkbox"
                        checked={!entry.disabledByUser}
                        onChange={(e) =>
                          setRoster((prev) =>
                            prev.map((item) =>
                              item.playerId === entry.playerId ? { ...item, disabledByUser: !e.target.checked } : item
                            )
                          )
                        }
                      />
                      User Enabled
                    </label>

                    <button className="cyber-button" onClick={() => saveUser(entry)} disabled={isPending}>
                      SAVE USER
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="password"
                      className="cyber-input"
                      placeholder="Temporary password"
                      value={newAccountPasswords[entry.playerId] ?? ""}
                      onChange={(e) =>
                        setNewAccountPasswords((prev) => ({ ...prev, [entry.playerId]: e.target.value }))
                      }
                      style={{ minWidth: "180px" }}
                    />
                    <button className="cyber-button primary" onClick={() => createAccount(entry)} disabled={isPending}>
                      CREATE ACCOUNT
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cyber-card">
        <button type="button" onClick={() => setRolePanelOpen((prev) => !prev)} style={sectionHeaderStyle}>
          <span style={{ color: "var(--accent-purple)" }}>ROLE MANAGEMENT</span>
          {rolePanelOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {rolePanelOpen && (
          <>
            <div style={{ ...panelStyle, marginBottom: "1rem", alignItems: "start" }}>
              <div className="flex-col gap-3" style={{ flex: 1 }}>
                <input
                  className="cyber-input"
                  placeholder="New role name"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                />
                <div style={permissionGridStyle}>
                  {permissionKeys.map((key) => (
                    <label key={key} style={toggleLabelStyle}>
                      <input
                        type="checkbox"
                        checked={newRolePermissions[key]}
                        onChange={(e) => setNewRolePermissions((prev) => ({ ...prev, [key]: e.target.checked }))}
                      />
                      {permissionLabels[key]}
                    </label>
                  ))}
                </div>
              </div>
              <button className="cyber-button primary" onClick={addRole} disabled={isPending}>
                CREATE ROLE
              </button>
            </div>

            <div className="flex-col gap-4">
              {roles.map((role) => (
                <div key={role.id} style={panelStyle}>
                  <div className="flex-col gap-2" style={{ flex: 1 }}>
                    <input
                      className="cyber-input"
                      value={role.name}
                      disabled={role.isSystem}
                      onChange={(e) =>
                        setRoles((prev) => prev.map((entry) => (entry.id === role.id ? { ...entry, name: e.target.value } : entry)))
                      }
                    />
                    <div style={permissionGridStyle}>
                      {permissionKeys.map((key) => (
                        <label key={key} style={toggleLabelStyle}>
                          <input
                            type="checkbox"
                            checked={role.permissions[key]}
                            onChange={(e) =>
                              setRoles((prev) =>
                                prev.map((entry) =>
                                  entry.id === role.id
                                    ? {
                                        ...entry,
                                        permissions: { ...entry.permissions, [key]: e.target.checked },
                                      }
                                    : entry
                                )
                              )
                            }
                          />
                          {permissionLabels[key]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <button className="cyber-button" onClick={() => saveRole(role)} disabled={isPending}>
                    SAVE ROLE
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function emptyRolePermissions(): RolePermissions {
  return {
    viewDashboard: false,
    uploadProfile: false,
    editRoster: false,
    deleteRosterMembers: false,
    editPlayerNames: false,
    manageBugs: false,
    viewAllianceOverview: false,
    manageUsers: false,
    manageRoles: false,
  };
}

const sectionHeaderStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0",
  marginBottom: "1rem",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  letterSpacing: "0.08em",
};

const panelStyle: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "1rem",
  borderRadius: "4px",
  border: "1px solid var(--border-subtle)",
  background: "rgba(255,255,255,0.02)",
  flexWrap: "wrap",
};

const toggleLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  fontSize: "0.8rem",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
};

const permissionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.6rem 1rem",
};

const messageStyle = (type: "success" | "error"): React.CSSProperties => ({
  padding: "0.85rem 1rem",
  borderRadius: "4px",
  border: `1px solid ${type === "success" ? "var(--accent-neon)" : "var(--accent-red)"}`,
  backgroundColor: type === "success" ? "rgba(0,255,157,0.08)" : "rgba(255,51,102,0.08)",
  color: type === "success" ? "var(--accent-neon)" : "var(--accent-red)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.85rem",
});

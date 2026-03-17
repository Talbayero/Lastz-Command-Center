"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateUser, createRole, updateRole } from "@/app/actions/auth";
import { permissionKeys, permissionLabels, type RolePermissions } from "@/utils/permissions";

type RoleRecord = {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: RolePermissions;
};

type UserRecord = {
  id: string;
  playerName: string;
  roleId: string;
  isActive: boolean;
  disabledByUser: boolean;
};

export default function AdminPanel({
  initialRoles,
  initialUsers,
}: {
  initialRoles: RoleRecord[];
  initialUsers: UserRecord[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [roles, setRoles] = useState(initialRoles);
  const [users, setUsers] = useState(initialUsers);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<RolePermissions>(() => emptyRolePermissions());

  const saveUser = (user: UserRecord) => {
    setMessage(null);
    startTransition(async () => {
      const result = await adminUpdateUser({
        userId: user.id,
        roleId: user.roleId,
        isActive: user.isActive,
        disabledByUser: user.disabledByUser,
      });
      if (result.success) {
        setMessage({ type: "success", text: `${user.playerName} updated.` });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to update user." });
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
        <h3 style={{ color: "var(--accent-neon)", marginBottom: "1rem" }}>User Management</h3>
        <div className="flex-col gap-3">
          {users.map((user) => (
            <div key={user.id} style={panelStyle}>
              <div>
                <div style={{ fontWeight: 700 }}>{user.playerName}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>BOM account</div>
              </div>

              <select
                className="cyber-input"
                value={user.roleId}
                onChange={(e) =>
                  setUsers((prev) => prev.map((entry) => (entry.id === user.id ? { ...entry, roleId: e.target.value } : entry)))
                }
                style={{ minWidth: "180px" }}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>

              <label style={toggleLabelStyle}>
                <input
                  type="checkbox"
                  checked={user.isActive}
                  onChange={(e) =>
                    setUsers((prev) => prev.map((entry) => (entry.id === user.id ? { ...entry, isActive: e.target.checked } : entry)))
                  }
                />
                Active
              </label>

              <label style={toggleLabelStyle}>
                <input
                  type="checkbox"
                  checked={!user.disabledByUser}
                  onChange={(e) =>
                    setUsers((prev) =>
                      prev.map((entry) =>
                        entry.id === user.id ? { ...entry, disabledByUser: !e.target.checked } : entry
                      )
                    )
                  }
                />
                User Enabled
              </label>

              <button className="cyber-button" onClick={() => saveUser(user)} disabled={isPending}>
                SAVE USER
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="cyber-card">
        <h3 style={{ color: "var(--accent-purple)", marginBottom: "1rem" }}>Role Management</h3>

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

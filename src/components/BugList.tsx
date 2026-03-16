"use client";

import { useState } from "react";
import { updateBugStatus } from "@/app/actions/bugs";
import { CheckCircle, Clock, ShieldAlert, User } from "lucide-react";

type BugData = {
  id: string;
  reporter: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
};

export default function BugList({ initialBugs }: { initialBugs: BugData[] }) {
  const [bugs, setBugs] = useState(initialBugs);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const result = await updateBugStatus(id, newStatus);
    if (result.success) {
      setBugs(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
    }
  };

  const getPriorityColor = (p: string) => {
    if (p === 'High') return 'var(--accent-red)';
    if (p === 'Medium') return 'var(--accent-purple)';
    return 'var(--text-muted)';
  };

  if (bugs.length === 0) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>NO ANOMALIES DETECTED. SYSTEM STABILITY: 100%</p>
      </div>
    );
  }

  return (
    <div className="flex-col gap-4">
      <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ backgroundColor: 'var(--bg-dark)', borderBottom: '1px solid var(--border-subtle)' }}>
            <tr>
              <th style={thStyle}>TIMESTAMP</th>
              <th style={thStyle}>REPORTER</th>
              <th style={thStyle}>DESCRIPTION</th>
              <th style={thStyle}>PRIORITY</th>
              <th style={thStyle}>STATUS</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {bugs.map((bug) => (
              <tr key={bug.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <Clock size={12} />
                    {new Date(bug.createdAt).toLocaleString()}
                  </div>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <User size={14} className="text-muted" />
                    {bug.reporter}
                  </div>
                </td>
                <td style={{ ...tdStyle, maxWidth: '400px' }}>{bug.description}</td>
                <td style={tdStyle}>
                  <span style={{ 
                    color: getPriorityColor(bug.priority),
                    fontWeight: 'bold',
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: `1px solid ${getPriorityColor(bug.priority)}`,
                    backgroundColor: 'rgba(255,255,255,0.05)'
                  }}>
                    {bug.priority.toUpperCase()}
                  </span>
                </td>
                <td style={tdStyle}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: bug.status === 'Open' ? 'var(--accent-red)' : 'var(--accent-neon)' }}>
                    {bug.status === 'Open' ? <ShieldAlert size={16} /> : <CheckCircle size={16} />}
                    {bug.status.toUpperCase()}
                  </div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <select 
                    value={bug.status}
                    onChange={(e) => handleStatusChange(bug.id, e.target.value)}
                    style={{ ...selectStyle, color: bug.status === 'Open' ? 'var(--accent-red)' : 'var(--accent-neon)' }}
                  >
                    <option value="Open">MARK AS OPEN</option>
                    <option value="Fixed">MARK AS FIXED</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '1rem',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase'
};

const tdStyle: React.CSSProperties = {
  padding: '1rem',
  fontSize: '0.875rem'
};

const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid #444',
  padding: '4px 8px',
  borderRadius: '4px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  cursor: 'pointer'
};

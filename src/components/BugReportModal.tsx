"use client";

import { useState } from "react";
import { submitBug } from "@/app/actions/bugs";
import { Bug, X } from "lucide-react";

export default function BugReportModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ reporter: "", description: "", priority: "Medium" });
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const result = await submitBug(formData);
    setIsSubmitting(false);

    if (result.success) {
      setMessage({ type: 'success', text: "Bug Intel Transmitted! 🚀" });
      setFormData({ reporter: "", description: "", priority: "Medium" });
      setTimeout(() => {
        setIsOpen(false);
        setMessage(null);
      }, 2000);
    } else {
      setMessage({ type: 'error', text: result.error || "Transmission Failed." });
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="cyber-button"
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          borderColor: 'var(--accent-red)',
          color: 'var(--accent-red)',
          fontSize: '0.75rem'
        }}
      >
        <Bug size={14} />
        SUBMIT BUG
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="cyber-card" style={{ width: '100%', maxWidth: '500px', position: 'relative' }}>
            <button 
              onClick={() => setIsOpen(false)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <h2 style={{ color: 'var(--accent-red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bug /> REPORT TECHNICAL ANOMALY
            </h2>

            {message && (
              <div style={{ 
                padding: '1rem', 
                borderRadius: '4px', 
                backgroundColor: message.type === 'success' ? 'rgba(0, 255, 157, 0.1)' : 'rgba(255, 51, 102, 0.1)',
                border: `1px solid ${message.type === 'success' ? 'var(--accent-neon)' : 'var(--accent-red)'}`,
                color: message.type === 'success' ? 'var(--accent-neon)' : 'var(--accent-red)',
                marginBottom: '1rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem'
              }}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex-col gap-4">
              <div className="flex-col gap-2">
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>REPORTER (NAME/ID)</label>
                <input 
                  type="text" 
                  value={formData.reporter}
                  onChange={(e) => setFormData({...formData, reporter: e.target.value})}
                  placeholder="Anonymous Operator"
                  style={inputStyle}
                />
              </div>

              <div className="flex-col gap-2">
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ANOMALY DESCRIPTION</label>
                <textarea 
                  required
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe the technical error in detail..."
                  style={{ ...inputStyle, resize: 'none' }}
                />
              </div>

              <div className="flex-col gap-2">
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>THREAT PRIORITY</label>
                <select 
                  value={formData.priority}
                  onChange={(e) => setFormData({...formData, priority: e.target.value})}
                  style={inputStyle}
                >
                  <option value="Low">Low (Visual/Minor)</option>
                  <option value="Medium">Medium (Functional)</option>
                  <option value="High">High (Critical/Breaking)</option>
                </select>
              </div>

              <button 
                type="submit" 
                className="cyber-button primary" 
                disabled={isSubmitting}
                style={{ marginTop: '1rem', borderColor: 'var(--accent-red)', color: '#fff' }}
              >
                {isSubmitting ? 'TRANSMITTING...' : 'INITIATE BUG REPORT'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid #333',
  color: '#fff',
  padding: '0.75rem',
  borderRadius: '4px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.875rem'
};

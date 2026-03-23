"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { parseLastZProfileImage } from "@/utils/ocrParser";
import { Upload, Loader2, CheckCircle2, PencilLine, ScanLine } from "lucide-react";
import { savePlayerData } from "@/app/actions/savePlayer";
import { getPlayers } from "@/app/actions/getPlayers";
import { extractGeminiName } from "@/app/actions/extractGeminiName";

type PowerStats = {
  structure: number;
  tech: number;
  troop: number;
  hero: number;
  modVehicle: number;
};

type ProfileStats = {
  name: string;
  kills: number;
  totalPower: number;
  powerStats: PowerStats;
};

type SaveStatus =
  | { type: "success"; msg: string }
  | { type: "error"; msg: string }
  | null;

type StatsFormProps = {
  data: ProfileStats;
  setData: (value: ProfileStats | ((prev: ProfileStats) => ProfileStats)) => void;
  players: string[];
  isPending: boolean;
  onSave: () => void;
  lockName?: boolean;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function getTesseract() {
  const tesseractModule = await import("tesseract.js");
  return tesseractModule.default;
}

async function cropNameBlob(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const cropX = Math.round(img.width * 0.30);
      const cropW = Math.round(img.width * 0.70);
      const cropH = Math.round(img.height * 0.18);
      const scale = 3;
      canvas.width = cropW * scale;
      canvas.height = cropH * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, cropX, 0, cropW, cropH, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const bw = g > 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = bw; d[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

async function createNameVariantBlob(file: File, mode: "soft" | "high-contrast"): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      const cropX = Math.round(img.width * 0.3);
      const cropW = Math.round(img.width * 0.7);
      const cropH = Math.round(img.height * 0.18);
      const scale = mode === "high-contrast" ? 4 : 3;
      canvas.width = cropW * scale;
      canvas.height = cropH * scale;
      ctx.imageSmoothingEnabled = mode === "soft";
      ctx.drawImage(img, cropX, 0, cropW, cropH, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const contrasted = Math.max(0, Math.min(255, (gray - 128) * (mode === "high-contrast" ? 2.2 : 1.6) + 128));
        const value = mode === "high-contrast" ? (contrasted > 145 ? 255 : 0) : contrasted;
        d[i] = d[i + 1] = d[i + 2] = value;
        d[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to encode image"));
        return;
      }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/** Crop top-right area, try Gemini first, then fallback to Tesseract PSM-7 */
async function extractNameFromImage(file: File): Promise<string> {
  const croppedBlob = await cropNameBlob(file);
  if (!croppedBlob) return "";

  try {
    const imageBase64 = await blobToBase64(croppedBlob);
    const geminiResult = await extractGeminiName({
      imageBase64,
      mimeType: "image/png",
    });

    if (geminiResult.success && geminiResult.name) {
      return geminiResult.name;
    }
  } catch {
    // Fall through to OCR.
  }

  try {
    const variants = [
      await createNameVariantBlob(file, "soft"),
      await createNameVariantBlob(file, "high-contrast"),
      croppedBlob,
    ].filter((blob): blob is Blob => Boolean(blob));

    let bestName = "";
    let bestScore = -1;

    const Tesseract = await getTesseract();
    for (const variant of variants) {
      const result = await Tesseract.recognize(variant, "eng", {
        // @ts-expect-error Tesseract accepts this runtime option even though the package type omits it.
        tessedit_pageseg_mode: "7",
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ '",
      });

      const cleaned = result.data.text
        .replace(/[^a-zA-Z0-9 '\-]/g, "")
        .trim()
        .replace(/\s+/g, " ");
      const score = cleaned.replace(/[^A-Za-z0-9]/g, "").length;

      if (score > bestScore) {
        bestName = cleaned;
        bestScore = score;
      }
    }

    return bestName;
  } catch {
    return "";
  }
}

const EMPTY_STATS = { name: "", kills: 0, totalPower: 0, powerStats: { structure: 0, tech: 0, troop: 0, hero: 0, modVehicle: 0 } };
const STAT_KEYWORDS = ["structure", "tech", "troop", "hero", "mod", "vehicle", "power"];

// ─── Reusable autocomplete name field ────────────────────────────────────────
function NameAutocomplete({ value, onChange, players }: { value: string; onChange: (v: string) => void; players: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value.length > 0
    ? players.filter(p => p.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="text"
        className="cyber-input"
        placeholder="Type player name..."
        autoFocus
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{
          fontSize: "1.2rem", fontWeight: "bold", padding: "0.9rem",
          border: `2px solid ${value ? "var(--accent-neon)" : "var(--accent-purple)"}`,
          boxShadow: `0 0 8px ${value ? "rgba(0,255,157,0.3)" : "rgba(112,0,255,0.4)"}`,
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", zIndex: 99, top: "calc(100% + 4px)", left: 0, right: 0,
          background: "var(--bg-card)", border: "1px solid var(--accent-neon)",
          borderRadius: "4px", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.6)"
        }}>
          {filtered.map(p => (
            <div
              key={p}
              onMouseDown={() => { onChange(p); setOpen(false); }}
              style={{
                padding: "0.6rem 1rem", cursor: "pointer", fontFamily: "var(--font-mono)",
                fontSize: "0.95rem", color: "var(--accent-neon)",
                borderBottom: "1px solid var(--border-subtle)",
                transition: "background 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,255,157,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {p}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared stats form ────────────────────────────────────────────────────────
function StatsForm({ data, setData, players, isPending, onSave, lockName = false }: StatsFormProps) {
  return (
    <div className="flex-col gap-4">
      <div className="flex-col gap-2">
        <label className="cyber-label" style={{ color: "var(--accent-purple)" }}>PLAYER NAME</label>
        {lockName ? (
          <input className="cyber-input" value={data.name} disabled style={{ opacity: 0.85 }} />
        ) : (
          <NameAutocomplete value={data.name} onChange={v => setData({ ...data, name: v })} players={players} />
        )}
        {!data.name && (
          <p style={{ fontSize: "0.8rem", color: "var(--accent-purple)", marginTop: "4px" }}>
            ⚠️ Enter the player name
          </p>
        )}
      </div>

      <div className="flex-col gap-2" style={{ padding: "0.5rem", background: "rgba(0,255,255,0.05)", borderRadius: "4px", border: "1px solid rgba(0,255,255,0.2)" }}>
        <label className="cyber-label" style={{ color: "var(--accent-neon)" }}>TOTAL POWER</label>
        <input type="number" className="cyber-input" value={data.totalPower}
          onChange={e => setData({ ...data, totalPower: parseInt(e.target.value) || 0 })}
          style={{ borderColor: "var(--accent-neon)", fontSize: "1.1rem" }} />
      </div>

      <div className="flex-col gap-2" style={{ padding: "0.5rem", background: "rgba(255,51,102,0.05)", borderRadius: "4px" }}>
        <label className="cyber-label" style={{ color: "var(--accent-red)" }}>COMBAT KILLS</label>
        <input type="number" className="cyber-input" value={data.kills}
          onChange={e => setData({ ...data, kills: parseInt(e.target.value) || 0 })}
          style={{ borderColor: "var(--accent-red)" }} />
      </div>

      {Object.entries(data.powerStats).map(([key, value]) => (
        <div key={key} className="flex-col gap-2">
          <label className="cyber-label" style={{ textTransform: "capitalize" }}>
            {key.replace(/([A-Z])/g, " $1")} Power
          </label>
          <input type="number" className="cyber-input" value={value as number}
            onChange={e => setData({ ...data, powerStats: { ...data.powerStats, [key]: parseInt(e.target.value) || 0 } })} />
        </div>
      ))}

      <button
        className="cyber-button primary w-full"
        style={{ marginTop: "1rem" }}
        disabled={isPending || !data.name}
        onClick={onSave}
      >
        {isPending ? "Syncing to Database..." : "SAVE COMBAT RECORD"}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OcrUploader({
  initialName = "",
  lockName = false,
}: {
  initialName?: string;
  lockName?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanData, setScanData] = useState<ProfileStats | null>(null);
  const [manualData, setManualData] = useState<ProfileStats>({ ...EMPTY_STATS, name: initialName });
  const [existingPlayers, setExistingPlayers] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);

  useEffect(() => { getPlayers().then(setExistingPlayers); }, []);
  useEffect(() => {
    setManualData((prev) => ({ ...prev, name: initialName }));
    setScanData((prev) => (prev ? { ...prev, name: initialName || prev.name } : prev));
  }, [initialName]);

  const handleSave = (data: ProfileStats) => {
    setSaveStatus(null);
    console.log("[Save] Attempting save with:", JSON.stringify(data, null, 2));
    startTransition(async () => {
      try {
        const result = await savePlayerData(data);
        if (result.success) {
          setSaveStatus({ type: "success", msg: `✅ ${data.name} saved successfully!` });
          setScanData(null);
          setManualData({ ...EMPTY_STATS, name: initialName });
          getPlayers().then(setExistingPlayers);
          router.refresh();
        } else {
          setSaveStatus({ type: "error", msg: `❌ Save Failed: ${result.error}` });
        }
      } catch (error: unknown) {
        setSaveStatus({ type: "error", msg: `❌ Error: ${getErrorMessage(error)}` });
      }
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setProgress(0);
    try {
      const stats = await parseLastZProfileImage(file, (value) => setProgress(Math.max(value, 5)));
      const rawName = await extractNameFromImage(file);
      setProgress(100);
      const nl = rawName.toLowerCase();
      const valid = rawName.length >= 4 && rawName.length <= 25 && !/\d/.test(rawName) &&
        !STAT_KEYWORDS.some(k => nl === k || nl.startsWith(k + " "));
      setScanData({ ...stats, name: lockName ? initialName : valid ? rawName : "" });
    } catch (err) {
      console.error(err);
      setSaveStatus({ type: "error", msg: "❌ Failed to process image. Tesseract might be busy." });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Tab styles ──
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "0.7rem 1rem", border: "none", cursor: "pointer",
    fontFamily: "var(--font-mono)", fontSize: "0.85rem", fontWeight: "bold",
    background: active ? "var(--accent-purple)" : "transparent",
    color: active ? "#fff" : "var(--text-muted)",
    borderBottom: active ? "2px solid var(--accent-neon)" : "2px solid var(--border-subtle)",
    transition: "all 0.2s",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
  });

  return (
    <div className="cyber-card flex-col gap-0" style={{ padding: 0, overflow: "hidden" }}>
      {/* ── Mode Tabs ── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)" }}>
        <button style={tabStyle(mode === "scan")} onClick={() => setMode("scan")}>
          <ScanLine size={16} /> Scan Profile
        </button>
        <button style={tabStyle(mode === "manual")} onClick={() => setMode("manual")}>
          <PencilLine size={16} /> Enter Manually
        </button>
      </div>

      <div style={{ padding: "1.5rem" }}>
        {/* ── Save Status Banner ── */}
        {saveStatus && (
          <div style={{
            marginBottom: "1.5rem",
            padding: "1rem",
            borderRadius: "4px",
            background: saveStatus.type === "success" ? "rgba(0, 255, 157, 0.1)" : "rgba(255, 51, 102, 0.1)",
            border: `1px solid ${saveStatus.type === "success" ? "var(--accent-neon)" : "var(--accent-red)"}`,
            color: saveStatus.type === "success" ? "var(--accent-neon)" : "var(--accent-red)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <span>{saveStatus.msg}</span>
            <button 
              onClick={() => setSaveStatus(null)}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1.2rem" }}
            >
              ×
            </button>
          </div>
        )}

        {/* ══ SCAN MODE ══ */}
        {mode === "scan" && (
          <div className="flex-col gap-6">
            <h3 className="text-gradient-primary" style={{ margin: 0 }}>Profile Screenshot Analysis</h3>

            {/* Upload dropzone */}
            <div style={{
              border: "2px dashed var(--border-subtle)", padding: "2rem",
              textAlign: "center", borderRadius: "8px", cursor: "pointer", position: "relative"
            }}>
              <input type="file" accept="image/*" onChange={handleImageUpload}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
              {isProcessing ? (
                <div className="flex-col gap-4" style={{ alignItems: "center" }}>
                  <Loader2 className="animate-spin text-accent-neon" size={32} />
                  <p style={{ color: "var(--accent-neon)" }}>Decrypting Image Data... {progress}%</p>
                </div>
              ) : (
                <div className="flex-col gap-4" style={{ alignItems: "center" }}>
                  <Upload size={32} style={{ color: "var(--text-muted)" }} />
                  <p>Click or drag profile screenshot here</p>
                </div>
              )}
            </div>

            {/* Verify panel */}
            {scanData && (
              <div style={{ background: "var(--bg-input)", padding: "1.5rem", borderRadius: "4px", border: "1px solid var(--accent-neon)" }}>
                <div className="flex-row gap-2" style={{ marginBottom: "1.25rem", color: "var(--accent-neon)" }}>
                  <CheckCircle2 size={20} />
                  <h4 style={{ margin: 0 }}>Verify Combat Data</h4>
                </div>
                <StatsForm
                  data={scanData}
                  setData={(value) =>
                    setScanData((prev) => {
                      const current = prev ?? scanData;
                      return typeof value === "function" ? value(current) : value;
                    })
                  }
                  players={existingPlayers}
                  lockName={lockName}
                  isPending={isPending} onSave={() => handleSave(scanData)} />
              </div>
            )}
          </div>
        )}

        {/* ══ MANUAL MODE ══ */}
        {mode === "manual" && (
          <div className="flex-col gap-6">
            <h3 className="text-gradient-primary" style={{ margin: 0 }}>Enter Player Data</h3>
            <StatsForm data={manualData} setData={setManualData} players={existingPlayers} lockName={lockName}
              isPending={isPending} onSave={() => handleSave(manualData)} />
          </div>
        )}
      </div>
    </div>
  );
}

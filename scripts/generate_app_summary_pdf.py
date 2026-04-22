from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "output" / "pdf"
TMP_DIR = ROOT / "tmp" / "pdfs"
OUTPUT_FILE = OUTPUT_DIR / "last_z_app_summary.pdf"


def build_story():
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "TitleCustom",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=21,
        textColor=colors.HexColor("#123C69"),
        spaceAfter=8,
    )
    heading = ParagraphStyle(
        "HeadingCustom",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=12,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=2,
        spaceAfter=4,
    )
    body = ParagraphStyle(
        "BodyCustom",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=10.5,
        textColor=colors.HexColor("#1F2937"),
        spaceAfter=3,
    )
    bullet = ParagraphStyle(
        "BulletCustom",
        parent=body,
        leftIndent=0,
        firstLineIndent=0,
        spaceAfter=1,
    )
    small = ParagraphStyle(
        "SmallCustom",
        parent=body,
        fontSize=7.8,
        leading=9.3,
        textColor=colors.HexColor("#475569"),
        spaceAfter=0,
    )

    feature_items = [
        "Performance dashboard with leaderboard, roster analytics, and player radar comparisons.",
        "Profile view for combat stats, recent snapshots, leader notes, and daily duel compliance.",
        "OCR-assisted profile upload with local Tesseract parsing and Gemini name extraction fallback.",
        "Alliance Duel tracking with daily requirements, screenshot parsing, review queues, and manual score updates.",
        "Recruitment workspace for applicants and migration candidates, including scoring weights and CSV import/export support.",
        "Admin and access-control tools for roles, permissions, account creation, sessions, and password resets.",
        "Bug logging and review screens for alliance issue tracking.",
    ]

    story = [
        Paragraph("Last Z App Summary", title),
        Paragraph(
            "A Next.js command center for the BOM alliance that tracks player performance, ingests combat screenshots, "
            "and manages recruitment, alliance-duel operations, access control, and bug reporting. "
            "The repo positions it as an alliance dashboard backed by Prisma and PostgreSQL.",
            body,
        ),
    ]

    top_table = Table(
        [
            [
                Paragraph("<b>Who it's for</b><br/>Alliance leaders, officers, and members managing BOM roster performance and operations.", body),
                Paragraph("<b>Repo evidence</b><br/>Next.js 16 app router, Prisma models for players/snapshots/auth/recruitment/duel/bugs, and role-gated UI views.", body),
            ]
        ],
        colWidths=[3.15 * inch, 3.15 * inch],
    )
    top_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.extend([top_table, Spacer(1, 0.12 * inch)])

    story.append(Paragraph("What It Does", heading))
    story.append(
        ListFlowable(
            [
                ListItem(Paragraph(item, bullet), leftIndent=10)
                for item in feature_items
            ],
            bulletType="bullet",
            start="circle",
            leftIndent=12,
            bulletFontName="Helvetica",
            bulletFontSize=8,
            spaceBefore=0,
            spaceAfter=6,
        )
    )

    story.append(Paragraph("How It Works", heading))
    architecture_items = [
        "<b>UI layer:</b> Next.js app-router page composes dynamic React panels for profile, overview, recruitment, duel, roster, bugs, and admin views.",
        "<b>Server logic:</b> Server actions in <font name='Courier'>src/app/actions</font> validate permissions, sanitize inputs, and write roster, duel, recruitment, auth, and bug data.",
        "<b>Data access:</b> Utilities use Prisma Client plus Next cache/tag invalidation for players, snapshots, admin data, recruitment, and duel queries.",
        "<b>Ingestion flow:</b> Screenshot upload runs client-side OCR/parsing; parsed or reviewed results are sent through server actions and stored as player snapshots or duel scores.",
        "<b>Storage/services:</b> PostgreSQL is required via <font name='Courier'>DATABASE_URL</font>. Optional vision helpers use <font name='Courier'>GEMINI_API_KEY</font> and <font name='Courier'>HUGGINGFACE_API_KEY</font> when configured.",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(item, bullet), leftIndent=10) for item in architecture_items],
            bulletType="bullet",
            start="square",
            leftIndent=12,
            bulletFontName="Helvetica",
            bulletFontSize=7.5,
            spaceBefore=0,
            spaceAfter=6,
        )
    )

    story.append(Paragraph("How to Run", heading))
    run_items = [
        "Install dependencies: <font name='Courier'>npm install</font>.",
        "Set env vars: <font name='Courier'>DATABASE_URL</font>; optional <font name='Courier'>GEMINI_API_KEY</font> and <font name='Courier'>HUGGINGFACE_API_KEY</font>.",
        "Initialize Prisma for first setup: <font name='Courier'>npx prisma generate</font> and <font name='Courier'>npx prisma db push</font>.",
        "Start dev server: <font name='Courier'>npm run dev</font>, then open <font name='Courier'>http://localhost:3000</font>.",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(item, bullet), leftIndent=10) for item in run_items],
            bulletType="1",
            leftIndent=12,
            bulletFontName="Helvetica-Bold",
            bulletFontSize=8,
            spaceBefore=0,
            spaceAfter=6,
        )
    )

    story.append(
        Paragraph(
            "Not found in repo: production monitoring/observability stack, background jobs, queue system, and formal API documentation.",
            small,
        )
    )
    return story


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT_FILE),
        pagesize=letter,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.45 * inch,
        title="Last Z App Summary",
        author="Codex",
    )

    def draw_frame(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
        canvas.setLineWidth(0.8)
        canvas.rect(
            document.leftMargin - 8,
            document.bottomMargin - 6,
            document.width + 16,
            document.height + 12,
            stroke=1,
            fill=0,
        )
        canvas.restoreState()

    doc.build(build_story(), onFirstPage=draw_frame)
    print(OUTPUT_FILE)


if __name__ == "__main__":
    main()

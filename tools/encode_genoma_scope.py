#!/usr/bin/env python3
"""
Encode GENOMA prototypes into a deterministic Scope Atlas.

This is intentionally API-free. It is the evidence layer that can later be
refined by an LLM, not a replacement for model interpretation.
"""

from __future__ import annotations

import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "data" / "genoma-scope-atlas.json"
OUT_HTML = ROOT / "genoma-scope-atlas.html"

ROOT_HTML_EXCLUDE = {
    "genoma-scope-atlas.html",
    "x1.html",
    "x2.html",
}

OP_COLORS = {
    "TXT": "#4ade80",
    "HPL": "#38bdf8",
    "IMG": "#fb923c",
    "AUC": "#c084fc",
    "VID": "#f87171",
    "CMT": "#a3a3a3",
    "STY": "#94a3b8",
    "CDE": "#eab308",
    "ROW_S": "#64748b",
    "COL_S": "#475569",
    "END": "#f97316",
}

PROMPT_COLORS = {
    "RSN": "#60a5fa",
    "EVD": "#4ade80",
    "OUT": "#f8fafc",
    "FIT": "#c084fc",
    "FLR": "#f87171",
    "CST": "#fbbf24",
    "MUT": "#f472b6",
    "SEL": "#fb923c",
    "CMT": "#a3a3a3",
}

HEURISTICS = [
    "Parse static HTML source with no network and no API key.",
    "Measure visual, runtime, media, navigation, and prompt-language evidence.",
    "For panel prototypes, include companion panel/background JavaScript because that is where prompt logic lives.",
    "Prefer literal prompt constants, POML blocks, directives, and source codon payloads over generic summaries.",
    "Encode every prototype into two GENOMA Scope genomes: operational and prompt.",
    "Operational codons use Scope media/layout types: TXT, STY, CDE, HPL, IMG, CMT, ROW_S, COL_S, END.",
    "Prompt codons use instruction loci: RSN, EVD, OUT, FIT, FLR, CST, MUT, SEL.",
    "Weights are deterministic confidence and signal-strength scores, not quality scores.",
]


def main() -> None:
    prototypes = [encode_prototype(rel) for rel in discover_targets()]
    genomes = []
    for proto in prototypes:
        genomes.append(proto.pop("operationalGenome"))
        genomes.append(proto.pop("promptGenome"))

    atlas = {
        "meta": {
            "schema": "genoma-scope-atlas@1.0.0",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "prototypeCount": len(prototypes),
            "genomeCount": len(genomes),
            "heuristics": HEURISTICS,
            "scopeGenomeShape": {
                "genome_id": "string",
                "sequence": [{"type": "string", "payload": "string", "is_intron": "boolean"}],
            },
        },
        "prototypes": prototypes,
        "genomes": genomes,
        "colors": {"operational": OP_COLORS, "prompt": PROMPT_COLORS},
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(atlas, indent=2) + "\n", encoding="utf-8")
    OUT_HTML.write_text(render_html(atlas), encoding="utf-8")

    print(f"Encoded {len(prototypes)} prototypes into {len(genomes)} scope genomes.")
    print(f"Wrote {OUT_JSON.relative_to(ROOT)}")
    print(f"Wrote {OUT_HTML.relative_to(ROOT)}")


def discover_targets() -> list[str]:
    targets: list[str] = []
    for path in ROOT.rglob("*.html"):
        rel = path.relative_to(ROOT).as_posix()
        if is_skipped(rel):
            continue
        if is_prototype(rel):
            targets.append(rel)
    return sorted(targets, key=lambda rel: (prototype_rank(rel), rel))


def is_skipped(rel: str) -> bool:
    parts = set(rel.split("/"))
    return bool(parts & {".git", "node_modules", ".agent", ".claude", ".cursor"})


def is_prototype(rel: str) -> bool:
    if "/" not in rel:
        return rel not in ROOT_HTML_EXCLUDE
    if rel.startswith("BONUS/") and re.search(r"/(panel/panel|artifact/artifact)\.html$", rel):
        return True
    if re.match(r"chrome-genetics-extension-v\d", rel) and rel.endswith("/panel/panel.html"):
        return True
    return rel in {"DEV/cge-v3.html", "DEV/GENOMA_CONTEXT.html"}


def prototype_rank(rel: str) -> int:
    preferred = [
        "index.html",
        "g2.html",
        "g1.html",
        "phub.html",
        "pbre.html",
        "f4.html",
        "scope.html",
        "demo.html",
        "video.html",
        "suite-harness-g2.html",
        "suite-harness-g1.html",
    ]
    if rel in preferred:
        return preferred.index(rel)
    if rel.startswith("chrome-genetics-extension"):
        return 100
    if rel.startswith("BONUS/"):
        return 200
    if rel.startswith("DEV/"):
        return 300
    return 400


def encode_prototype(rel: str) -> dict:
    html_source = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
    companion_files, companion_source = collect_companion_source(rel)
    source = html_source
    for file_rel, body in companion_source:
        source += f"\n<script data-companion=\"{file_rel}\">\n{body}\n</script>\n"
    proto_id = make_id(rel)
    title = first_match(html_source, r"<title[^>]*>([\s\S]*?)</title>") or Path(rel).name
    metrics = measure_source(source)
    metrics["companionFiles"] = companion_files
    operational_genome = {
        "genome_id": f"{proto_id}::OPERATIONAL",
        "source_path": rel,
        "kind": "operational",
        "title": title,
        "metrics": metrics,
        "sequence": build_operational_sequence(rel, title, metrics),
    }
    prompt_genome = {
        "genome_id": f"{proto_id}::PROMPT",
        "source_path": rel,
        "kind": "prompt",
        "title": title,
        "metrics": metrics,
        "sequence": build_prompt_sequence(rel, title, metrics),
    }
    return {
        "id": proto_id,
        "path": rel,
        "title": title,
        "summary": summarize_prototype(rel, title, metrics),
        "metrics": metrics,
        "operationalGenomeId": operational_genome["genome_id"],
        "promptGenomeId": prompt_genome["genome_id"],
        "operationalGenome": operational_genome,
        "promptGenome": prompt_genome,
    }


def collect_companion_source(rel: str) -> tuple[list[str], list[tuple[str, str]]]:
    candidates: list[str] = []
    if rel.endswith("/panel/panel.html"):
        panel_dir = Path(rel).parent
        root_dir = panel_dir.parent
        candidates.extend([
            (panel_dir / "panel.js").as_posix(),
            (root_dir / "background.js").as_posix(),
        ])
    elif rel == "DEV/GENOMA_CONTEXT.html":
        candidates.extend(["DEV/app.js", "DEV/background.js", "DEV/content.js"])

    files: list[str] = []
    sources: list[tuple[str, str]] = []
    for candidate in candidates:
        path = ROOT / candidate
        if path.exists():
            files.append(candidate)
            sources.append((candidate, path.read_text(encoding="utf-8", errors="replace")))
    return files, sources


def measure_source(source: str) -> dict:
    style_blocks = re.findall(r"<style\b[^>]*>([\s\S]*?)</style>", source, flags=re.I)
    script_blocks = re.findall(r"<script\b[^>]*>([\s\S]*?)</script>", source, flags=re.I)
    css = "\n".join(style_blocks)
    js = "\n".join(script_blocks)
    visible = strip_tags(re.sub(r"<script\b[^>]*>[\s\S]*?</script>", " ", re.sub(r"<style\b[^>]*>[\s\S]*?</style>", " ", source, flags=re.I), flags=re.I))
    prompt_blocks = collect_prompt_blocks(source)
    literal_codons = collect_literal_codons(source)
    prompt_hits = collect_prompt_hits(source, prompt_blocks)
    api_hosts = unique([m.lower() for m in re.findall(r"https?://([^/\"'`)\s]+)", source, flags=re.I)])
    colors = unique(re.findall(r"#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)", source, flags=re.I))[:20]
    fonts = unique([clean(m) for m in re.findall(r"font-family\s*:\s*([^;}{]+)", css, flags=re.I)])[:12]
    return {
        "bytes": len(source),
        "h1": [clean(strip_tags(v)) for v in re.findall(r"<h1\b[^>]*>([\s\S]*?)</h1>", source, flags=re.I)[:8]],
        "headings": count(source, r"<h[1-6]\b"),
        "buttons": count(source, r"<button\b"),
        "links": count(source, r"<a\b"),
        "inputs": count(source, r"<(input|textarea|select)\b"),
        "textareas": count(source, r"<textarea\b"),
        "images": count(source, r"<img\b"),
        "iframes": count(source, r"<iframe\b"),
        "canvas": count(source, r"<canvas\b"),
        "videos": count(source, r"<video\b"),
        "forms": count(source, r"<form\b"),
        "sections": count(source, r"<(section|article|main|nav|header|footer)\b"),
        "inlineHandlers": count(source, r"\son[a-z]+\s*="),
        "styleBlocks": len(style_blocks),
        "scriptBlocks": len(script_blocks),
        "cssVars": count(css, r"--[a-z0-9_-]+\s*:"),
        "mediaQueries": count(css, r"@media\b"),
        "keyframes": count(css, r"@keyframes\b"),
        "gradients": count(css, r"gradient\("),
        "borderRadius": count(css, r"border-radius\s*:"),
        "grid": count(css, r"display\s*:\s*grid"),
        "flex": count(css, r"display\s*:\s*flex"),
        "functions": count(js, r"\bfunction\b|=>"),
        "asyncFunctions": count(js, r"\basync\b"),
        "fetchCalls": count(js, r"\bfetch\s*\("),
        "localStorage": count(source, r"\blocalStorage\b"),
        "chromeApi": count(source, r"\bchrome\."),
        "apiHosts": api_hosts,
        "colors": colors,
        "fontFamilies": fonts,
        "promptHits": prompt_hits,
        "promptBlocks": prompt_blocks,
        "promptHitCount": len(prompt_hits),
        "literalCodons": literal_codons,
        "literalCodonCount": len(literal_codons),
        "codonWords": count(source, r"\bcodon\w*\b"),
        "genomeWords": count(source, r"\bgenom\w*\b"),
        "phenotypeWords": count(source, r"\bphenotyp\w*\b"),
        "mutationWords": count(source, r"\bmutat\w*|\bdiverg\w*|\bbreed\w*|\bcross\w*"),
        "selectionWords": count(source, r"\bselect\w*|\bfitness\b|\bsurviv\w*|\bscore\w*"),
        "theoryWords": count(source, r"\btheory\b|\binvariant\b|\bconstraint\b|\boperation\b|\bstate\b"),
        "apiKeyRefs": count(source, r"\bapiKey\b|api[_-]?key|API key"),
        "cspRisk": count(source, r"<script\b(?![^>]*\bsrc=)|\son[a-z]+\s*="),
        "words": word_count(visible),
        "visibleTextSample": truncate(clean(visible), 420),
    }


def build_operational_sequence(rel: str, title: str, m: dict) -> list[dict]:
    density = "dense" if m["words"] > 2500 else "moderate" if m["words"] > 800 else "sparse"
    interaction_weight = clamp(35 + m["buttons"] * 3 + m["inputs"] * 4 + m["inlineHandlers"] * 2 + m["chromeApi"] * 4, 35, 98)
    runtime_weight = clamp(30 + m["functions"] + m["fetchCalls"] * 12 + m["chromeApi"] * 8, 30, 98)
    visual_weight = clamp(35 + m["cssVars"] + m["styleBlocks"] * 10 + m["keyframes"] * 8 + m["mediaQueries"] * 4, 35, 98)
    return [
        codon("ROW_S", f"Source frame for {title}", f"path={rel}", 55),
        codon("TXT", f"Text field: {m['words']} words, {m['headings']} headings, density={density}. H1={' | '.join(m['h1']) or 'none'}.", m["visibleTextSample"], clamp(30 + m["words"] / 50 + m["headings"] * 3, 30, 95)),
        codon("STY", f"Visual system: {m['styleBlocks']} style blocks, {m['cssVars']} CSS vars, {len(m['colors'])} sampled colors, {m['borderRadius']} radius rules, {m['keyframes']} animations.", evidence_list(m["colors"][:8] + m["fontFamilies"][:4]), visual_weight),
        codon("CDE", f"Runtime: {m['scriptBlocks']} script blocks, {m['functions']} functions, {m['fetchCalls']} fetch calls, chrome API refs={m['chromeApi']}, localStorage refs={m['localStorage']}.", evidence_list(m["apiHosts"]), runtime_weight),
        codon("HPL", f"Navigation/control surface: {m['links']} links, {m['buttons']} buttons, {m['inputs']} inputs, {m['textareas']} textareas, {m['forms']} forms.", f"inlineHandlers={m['inlineHandlers']}; sections={m['sections']}", interaction_weight),
        codon("IMG", f"Media surface: images={m['images']}, iframes={m['iframes']}, canvas={m['canvas']}, video={m['videos']}.", media_evidence(m), clamp(35 + m["images"] * 8 + m["iframes"] * 8 + m["canvas"] * 12 + m["videos"] * 12, 35, 90), m["images"] + m["iframes"] + m["canvas"] + m["videos"] == 0),
        codon("CMT", f"Operational risk: CSP risk={m['cspRisk']}, API key refs={m['apiKeyRefs']}.", risk_evidence(m), clamp(30 + m["cspRisk"] * 8 + m["apiKeyRefs"] * 12, 30, 95), m["cspRisk"] + m["apiKeyRefs"] == 0),
        codon("END", f"End operational genome for {rel}.", "", 50),
    ]


def build_prompt_sequence(rel: str, title: str, m: dict) -> list[dict]:
    literal = [
        codon(
            item["type"],
            item["payload"],
            f"literal codon in source: {item['source']}",
            item["weight"],
        )
        for item in m.get("literalCodons", [])
    ]

    blocks = [
        codon(
            block["locus"],
            f"{block['label']}: {block['text']}",
            f"{block['kind']} prompt block in source; label={block['label']}",
            block["weight"],
        )
        for block in m.get("promptBlocks", [])
    ]

    seq = dedupe_codons(literal + blocks)

    if seq:
        seq.append(codon(
            "EVD",
            f"Prompt genome assembled from {len(literal)} literal codon payloads and {len(blocks)} source prompt blocks in {m['scriptBlocks']} script blocks.",
            f"visibleWords={m['words']}; promptBlocks={len(blocks)}; literalCodons={len(literal)}; apiHosts={','.join(m['apiHosts']) or 'none'}",
            clamp(60 + len(seq) * 2, 60, 98),
        ))
        return seq

    has_prompt = m["promptHitCount"] + m["codonWords"] + m["genomeWords"] + m["theoryWords"] > 0
    fallback = [
        codon("RSN", reasoning_payload(rel, title, m), evidence_list(m["promptHits"][:8]), 45, True),
        codon("EVD", f"No literal prompt blocks were extracted. Ground any future interpretation in source metrics: {m['words']} visible words, {m['scriptBlocks']} script blocks, {m['styleBlocks']} style blocks.", m["visibleTextSample"], 42, True),
        codon("OUT", output_payload(rel, m), f"buttons={m['buttons']}; inputs={m['inputs']}; media={m['images'] + m['iframes'] + m['canvas'] + m['videos']}", 42, True),
        codon("FLR", failure_payload(m), f"apiKeyRefs={m['apiKeyRefs']}; cspRisk={m['cspRisk']}; fetchCalls={m['fetchCalls']}", 45, True),
    ]
    if not has_prompt:
        fallback.append(codon("CMT", "Prompt genome evidence is weak. This prototype may be mostly presentational or documentary.", "low prompt/codon/theory signal", 30, True))
    return fallback


def reasoning_payload(rel: str, title: str, m: dict) -> str:
    if m["theoryWords"] > 12:
        return f"Read {title} as a program-theory artifact. Preserve entities, operations, constraints, states, and failure modes before generating output."
    if m["codonWords"] + m["genomeWords"] > 20:
        return f"Read {title} as a genome workbench. Keep codons editable, inspectable, and traceable across expression."
    if "extension" in rel:
        return f"Read {title} as a side-panel tool. Separate page capture, model reasoning, and live-page mutation."
    return f"Read {title} as a prototype surface. Infer purpose from controls, copy, and runtime hooks without inventing missing claims."


def output_payload(rel: str, m: dict) -> str:
    if "artifact" in rel:
        return "Output is a standalone artifact preview. Preserve source/render distinction and make generated program text inspectable."
    if "panel" in rel:
        return "Output is an operator panel. Keep status, active selection, genome sequence, and resulting phenotype visible together."
    if m["iframes"] > 0:
        return "Output includes embedded frames. Treat iframe content as a share/preview surface, not the same as extension runtime."
    if m["canvas"] > 0:
        return "Output includes canvas or dynamic visual state. Preserve non-text state as first-class evidence."
    return "Output should be a readable page or artifact with explicit controls and inspectable source evidence."


def fitness_payload(m: dict) -> str:
    signals = []
    if m["mutationWords"]:
        signals.append("variation")
    if m["selectionWords"]:
        signals.append("selection")
    if m["phenotypeWords"]:
        signals.append("phenotype expression")
    if any("openai" in h or "googleapis" in h or "anthropic" in h for h in m["apiHosts"]):
        signals.append("model execution")
    if not signals:
        signals.append("legibility")
    return f"Optimize for {', '.join(signals)}. Do not call a mutation successful unless the resulting phenotype is visible, comparable, and reversible."


def failure_payload(m: dict) -> str:
    failures = []
    if m["apiKeyRefs"]:
        failures.append("missing API key")
    if m["cspRisk"]:
        failures.append("inline script/CSP portability")
    if m["fetchCalls"]:
        failures.append("provider/network failure")
    if m["chromeApi"]:
        failures.append("extension-only runtime unavailable on mobile/link preview")
    if not failures:
        failures.append("ambiguous purpose or weak evidence")
    return f"Expected failures: {', '.join(failures)}. Respond with partial genome plus clear missing condition instead of silent breakage."


def constraint_payload(m: dict) -> str:
    constraints = []
    if m["mediaQueries"]:
        constraints.append("responsive layout")
    if m["inlineHandlers"]:
        constraints.append("inline event handlers")
    if m["cssVars"]:
        constraints.append("theme variable system")
    if m["chromeApi"]:
        constraints.append("Chrome extension APIs")
    if m["fetchCalls"]:
        constraints.append("provider routing")
    if not constraints:
        constraints.append("static page constraints")
    return f"Constraints to preserve or expose: {', '.join(constraints)}."


def collect_prompt_blocks(source: str) -> list[dict]:
    blocks: list[dict] = []

    for match in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*`([\s\S]*?)`", source):
        label = match.group(1)
        text = clean(match.group(2))
        if is_prompt_like(label, text):
            blocks.append(prompt_block("js_template", label, text))

    for match in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\"'])([^\"'\n;]{40,1600})\2", source):
        label = match.group(1)
        text = clean(match.group(3))
        if is_prompt_like(label, text):
            blocks.append(prompt_block("js_string", label, text))

    for tag in ["system", "directive", "intent", "role", "epistemology", "design_constraints"]:
        for match in re.finditer(rf"<{tag}\b[^>]*>([\s\S]*?)</{tag}>", source, flags=re.I):
            text = clean(strip_tags(match.group(1)))
            if len(text) >= 24:
                blocks.append(prompt_block(f"poml_{tag}", tag.upper(), text))

    return dedupe_prompt_blocks(blocks)[:32]


def collect_literal_codons(source: str) -> list[dict]:
    codons: list[dict] = []
    object_re = re.compile(r"\{[^{}]{0,900}?\btype\s*:\s*['\"]([A-Z_]{2,8})['\"][^{}]{0,900}?\}", flags=re.S)
    json_object_re = re.compile(r"\{[^{}]{0,900}?\"type\"\s*:\s*\"([A-Z_]{2,8})\"[^{}]{0,900}?\}", flags=re.S)

    for match in list(object_re.finditer(source)) + list(json_object_re.finditer(source)):
        snippet = match.group(0)
        type_ = match.group(1)
        payload = extract_payload(snippet)
        if payload and is_prompt_like(type_, payload):
            codons.append({
                "type": normalize_prompt_locus(type_),
                "payload": payload,
                "source": truncate(snippet, 180),
                "weight": clamp(78 + len(payload) / 40, 78, 98),
            })

    return dedupe_literal_codons(codons)[:32]


def prompt_block(kind: str, label: str, text: str) -> dict:
    locus = classify_prompt_locus(label, text)
    return {
        "kind": kind,
        "label": label,
        "locus": locus,
        "text": truncate(text, 900),
        "weight": prompt_block_weight(label, text, kind),
    }


def is_prompt_like(label: str, text: str) -> bool:
    haystack = f"{label} {text}".lower()
    label_is_prompt = bool(re.search(r"prompt|system|poml|instruction|directive|kernel|genotype|breeder|meiosis|mutation|express|evaluate", label, flags=re.I))
    text_is_prompt = (
        "<poml" in haystack
        or "<system" in haystack
        or "<directive" in haystack
        or "you are " in haystack
        or "output exactly" in haystack
        or "return only" in haystack
        or "codon schema" in haystack
        or "transcribe genotype" in haystack
    )
    literal_locus = label in PROMPT_COLORS and len(text) >= 12
    return len(text) >= 20 and (label_is_prompt or text_is_prompt or literal_locus)


def classify_prompt_locus(label: str, text: str) -> str:
    haystack = f"{label} {text}".lower()
    scores = {
        "RSN": score(haystack, ["reason", "think", "theory", "step", "role", "epistemology", "naurian", "program-theory"]),
        "EVD": score(haystack, ["evidence", "source", "medium", "context", "observation", "citation", "fidelity", "ground"]),
        "OUT": score(haystack, ["output", "return", "json", "schema", "artifact", "html", "phenotype", "program text", "completion"]),
        "FIT": score(haystack, ["fitness", "optimize", "success", "score", "quality", "judge", "benchmark"]),
        "FLR": score(haystack, ["failure", "error", "missing", "blocked", "fallback", "hallucination", "risk", "csp"]),
        "MUT": score(haystack, ["mutation", "mutate", "recombine", "diverge", "cross", "meiosis", "translocation", "breed"]),
        "SEL": score(haystack, ["selection", "select", "dominant", "recessive", "survive", "winner", "offspring", "parent"]),
        "CST": score(haystack, ["constraint", "design", "style", "contrast", "palette", "spatial", "interaction", "camera"]),
    }
    return max(scores.items(), key=lambda item: item[1])[0] if max(scores.values()) > 0 else "CST"


def normalize_prompt_locus(type_: str) -> str:
    if type_ in PROMPT_COLORS:
        return type_
    if type_ in {"STY", "STYLE", "STRUCTURE"}:
        return "CST"
    if type_ in {"OP", "OPS"}:
        return "OUT"
    return "CST"


def prompt_block_weight(label: str, text: str, kind: str) -> float:
    base = 84 if kind.startswith("js_") else 76
    if re.search(r"PROMPT|SYSTEM|POML|GENOTYPE|TRANSCRIPTION", label, flags=re.I):
        base += 8
    if "schema" in text.lower() or "output" in text.lower():
        base += 4
    return clamp(base + len(text) / 220, 60, 98)


def score(text: str, terms: list[str]) -> int:
    return sum(text.count(term) for term in terms)


def extract_payload(snippet: str) -> str:
    for pattern in [
        r"\bpayload\s*:\s*`([\s\S]*?)`",
        r"\bpayload\s*:\s*'([^']{1,1000})'",
        r'\bpayload\s*:\s*"([^"]{1,1000})"',
        r'"payload"\s*:\s*"([^"]{1,1000})"',
    ]:
        match = re.search(pattern, snippet)
        if match:
            return clean(match.group(1))
    return ""


def dedupe_prompt_blocks(blocks: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for block in blocks:
        key = (block["label"], block["text"][:180])
        if key in seen:
            continue
        seen.add(key)
        out.append(block)
    return out


def dedupe_literal_codons(codons: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for item in codons:
        key = (item["type"], item["payload"][:180])
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def dedupe_codons(sequence: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for item in sequence:
        key = (item["type"], item["payload"][:180])
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out[:40]


def collect_prompt_hits(source: str, prompt_blocks=None) -> list[str]:
    blocks = prompt_blocks if prompt_blocks is not None else collect_prompt_blocks(source)
    return unique([truncate(block["text"], 220) for block in blocks if block.get("text")])[:24]


def summarize_prototype(rel: str, title: str, m: dict) -> str:
    if "/panel/" in rel:
        kind = "extension panel"
    elif "/artifact/" in rel:
        kind = "artifact"
    elif rel.startswith("BONUS/"):
        kind = "bonus prototype"
    elif rel.startswith("DEV/"):
        kind = "development prototype"
    else:
        kind = "core page"
    return f"{title} is a {kind} with {m['words']} visible words, {m['buttons']} buttons, {m['inputs']} inputs, {m['fetchCalls']} model/network calls, and {m['promptHitCount']} explicit prompt blocks."


def codon(type_: str, payload: str, evidence: str, weight: float, is_intron: bool = False) -> dict:
    return {
        "type": type_,
        "payload": truncate(payload, 520),
        "evidence": truncate(evidence or "", 700),
        "weight": round(weight),
        "is_intron": bool(is_intron),
    }


def media_evidence(m: dict) -> str:
    parts = []
    for key, label in [("images", "img tags"), ("iframes", "iframe tags"), ("canvas", "canvas tags"), ("videos", "video tags")]:
        if m[key]:
            parts.append(f"{m[key]} {label}")
    return "; ".join(parts) or "No media tags detected."


def risk_evidence(m: dict) -> str:
    parts = []
    if m["cspRisk"]:
        parts.append(f"{m['cspRisk']} inline script/handler risks")
    if m["apiKeyRefs"]:
        parts.append(f"{m['apiKeyRefs']} API key references")
    if m["chromeApi"]:
        parts.append(f"{m['chromeApi']} chrome.* references")
    return "; ".join(parts) or "No major static risk signal detected."


def render_html(atlas: dict) -> str:
    data = json.dumps(atlas).replace("<", "\\u003c")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GENOMA Scope Atlas</title>
  <style>
    :root {{ --black:#000; --white:#fff; --line:3px; --thin:1px; --max:1240px; }}
    * {{ box-sizing:border-box; }}
    html, body {{ margin:0; min-height:100%; background:var(--white); color:var(--black); }}
    body {{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace; letter-spacing:0; }}
    a, button {{ color:inherit; font:inherit; }}
    a {{ text-decoration:none; }}
    .shell {{ width:min(100%,var(--max)); margin:0 auto; padding:18px; }}
    .hero {{ border-bottom:var(--line) solid var(--black); }}
    .hero-row {{ display:flex; align-items:flex-end; justify-content:space-between; gap:18px; }}
    .brand {{ display:flex; align-items:center; gap:14px; min-width:0; }}
    .brand img {{ width:clamp(44px,8vw,76px); height:clamp(44px,8vw,76px); object-fit:contain; border:var(--line) solid var(--black); padding:6px; }}
    h1 {{ margin:0; font-size:clamp(30px,7vw,72px); line-height:.9; font-weight:950; text-transform:uppercase; }}
    .rule {{ border:var(--line) solid var(--black); background:var(--black); color:var(--white); padding:12px; font-size:11px; line-height:1.35; font-weight:900; text-transform:uppercase; width:min(330px,100%); }}
    .nav {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border-bottom:var(--line) solid var(--black); }}
    .nav a {{ min-height:50px; display:grid; place-items:center; border-right:var(--thin) solid var(--black); font-size:12px; font-weight:950; text-transform:uppercase; text-align:center; padding:10px; }}
    .nav a:last-child {{ border-right:0; }}
    .nav a:hover, .nav a:focus-visible {{ background:var(--black); color:var(--white); outline:none; }}
    .stats {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:18px 0; }}
    .stat {{ border:var(--line) solid var(--black); padding:12px; min-height:92px; }}
    .stat b {{ display:block; font-size:28px; line-height:1; }}
    .stat span {{ display:block; margin-top:8px; font-size:11px; font-weight:900; text-transform:uppercase; }}
    .filters {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }}
    .filters button {{ border:var(--line) solid var(--black); background:var(--white); padding:9px 12px; cursor:pointer; font-size:11px; font-weight:950; text-transform:uppercase; }}
    .filters button.active, .filters button:hover {{ background:var(--black); color:var(--white); }}
    .grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }}
    .card {{ border:var(--line) solid var(--black); min-width:0; background:var(--white); }}
    .card-head {{ display:grid; grid-template-columns:72px minmax(0,1fr); border-bottom:var(--line) solid var(--black); }}
    .code {{ display:grid; place-items:center; background:var(--black); color:var(--white); border-right:var(--line) solid var(--black); font-weight:950; font-size:14px; text-transform:uppercase; padding:10px; overflow-wrap:anywhere; }}
    .title {{ padding:12px; min-width:0; }}
    .title h2 {{ margin:0; font-size:15px; line-height:1.15; font-weight:950; }}
    .title p {{ margin:7px 0 0; font-size:11px; line-height:1.35; font-weight:800; overflow-wrap:anywhere; }}
    .body {{ padding:12px; }}
    .body p {{ margin:0 0 10px; font-size:12px; line-height:1.45; font-weight:800; }}
    .genome-label {{ display:flex; justify-content:space-between; gap:10px; margin:12px 0 6px; font-size:11px; font-weight:950; text-transform:uppercase; }}
    .strand {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(34px,1fr)); gap:3px; border:var(--thin) solid var(--black); padding:3px; background:var(--black); }}
    .codon {{ min-height:34px; border:var(--thin) solid var(--white); display:grid; place-items:center; color:var(--black); font-size:10px; font-weight:950; cursor:pointer; position:relative; overflow:hidden; }}
    .codon.intron {{ background:var(--black)!important; color:var(--white); border-style:dashed; }}
    .codon::after {{ content:attr(data-weight); position:absolute; bottom:2px; right:3px; font-size:8px; }}
    .metrics {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin-top:12px; }}
    .metric {{ border:var(--thin) solid var(--black); padding:7px; font-size:10px; font-weight:900; text-transform:uppercase; }}
    .detail {{ position:sticky; bottom:0; z-index:5; border-top:var(--line) solid var(--black); background:var(--black); color:var(--white); padding:12px 18px; display:none; }}
    .detail.active {{ display:block; }}
    .detail strong {{ display:block; font-size:12px; text-transform:uppercase; margin-bottom:6px; }}
    .detail p {{ margin:0; font-size:12px; line-height:1.45; max-width:var(--max); }}
    .detail .evidence {{ margin-top:8px; border-top:var(--thin) solid var(--white); padding-top:8px; }}
    .note {{ border:var(--line) solid var(--black); padding:12px; margin-top:16px; font-size:12px; line-height:1.45; font-weight:850; }}
    @media (max-width:760px) {{
      .hero-row {{ align-items:flex-start; flex-direction:column; }}
      .nav, .stats, .grid {{ grid-template-columns:1fr; }}
      .metrics {{ grid-template-columns:repeat(2,minmax(0,1fr)); }}
      .card-head {{ grid-template-columns:56px minmax(0,1fr); }}
      .code {{ font-size:12px; }}
      .shell {{ padding:14px; }}
    }}
  </style>
</head>
<body>
  <header class="hero">
    <div class="shell hero-row">
      <div class="brand">
        <img src="chrome-genetics-extension-v3/icons/genoma-mark.svg" alt="">
        <h1>Scope Atlas</h1>
      </div>
      <div class="rule">Deterministic prototype encoding<br>Operational genome + prompt genome<br>No API key required</div>
    </div>
  </header>
  <nav class="nav" aria-label="Atlas links">
    <a href="index.html">Hub</a>
    <a href="scope.html">Scope Viewer</a>
    <a href="data/genoma-scope-atlas.json">JSON</a>
    <a href="GENOMA_PROTOTYPE_ENCODER.md">Encoder Notes</a>
  </nav>
  <main class="shell">
    <section class="stats" id="stats"></section>
    <section class="filters" id="filters" aria-label="Prototype filters"></section>
    <section class="grid" id="cards"></section>
    <section class="note">This atlas is the first audit layer. It does not claim that the heuristic knows which prototype is better. It proves that every prototype can be encoded into comparable genomes before an LLM is asked to interpret or mutate them.</section>
  </main>
  <aside class="detail" id="detail" aria-live="polite"></aside>
  <script>
    const ATLAS = {data};
    const filters = [['all','All'],['root','Core Pages'],['extension','Extensions'],['bonus','Bonus'],['dev','Dev']];
    let active = 'all';
    const stats = document.getElementById('stats');
    const filterEl = document.getElementById('filters');
    const cards = document.getElementById('cards');
    const detail = document.getElementById('detail');
    function family(path) {{ if (path.startsWith('BONUS/')) return 'bonus'; if (path.startsWith('chrome-genetics-extension')) return 'extension'; if (path.startsWith('DEV/')) return 'dev'; return 'root'; }}
    function genomeById(id) {{ return ATLAS.genomes.find((g) => g.genome_id === id); }}
    function renderStats() {{
      const codons = ATLAS.genomes.reduce((n, g) => n + g.sequence.length, 0);
      const promptBlocks = ATLAS.prototypes.reduce((n, p) => n + p.metrics.promptHitCount, 0);
      stats.innerHTML = [['Prototypes', ATLAS.prototypes.length], ['Scope Genomes', ATLAS.genomes.length], ['Codons', codons], ['Prompt Blocks', promptBlocks]].map(([label, value]) => '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>').join('');
    }}
    function renderFilters() {{
      filterEl.innerHTML = filters.map(([id, label]) => '<button type="button" data-filter="' + id + '" class="' + (id === active ? 'active' : '') + '">' + label + '</button>').join('');
      filterEl.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {{ active = button.dataset.filter; renderFilters(); renderCards(); }}));
    }}
    function renderCards() {{
      cards.innerHTML = ATLAS.prototypes.filter((p) => active === 'all' || family(p.path) === active).map(cardHtml).join('');
      cards.querySelectorAll('.codon').forEach((el) => el.addEventListener('click', () => {{
        const genome = genomeById(el.dataset.genome);
        const codon = genome.sequence[Number(el.dataset.index)];
        detail.classList.add('active');
        detail.innerHTML = '<strong>' + esc(genome.genome_id + ' / ' + codon.type + ' / W' + codon.weight) + '</strong><p>' + esc(codon.payload) + '</p>' + (codon.evidence ? '<p class="evidence">' + esc(codon.evidence) + '</p>' : '');
      }}));
    }}
    function cardHtml(p) {{
      const op = genomeById(p.operationalGenomeId);
      const pr = genomeById(p.promptGenomeId);
      return '<article class="card"><div class="card-head"><div class="code">' + esc(p.id) + '</div><div class="title"><h2>' + esc(p.title) + '</h2><p>' + esc(p.path) + '</p></div></div><div class="body"><p>' + esc(p.summary) + '</p>' + strandHtml('Operational genome', op, ATLAS.colors.operational) + strandHtml('Prompt genome', pr, ATLAS.colors.prompt) + '<div class="metrics">' + metric('Words', p.metrics.words) + metric('Buttons', p.metrics.buttons) + metric('Fetch', p.metrics.fetchCalls) + metric('API Keys', p.metrics.apiKeyRefs) + '</div></div></article>';
    }}
    function strandHtml(label, genome, colors) {{
      return '<div class="genome-label"><span>' + label + '</span><span>' + genome.sequence.length + ' codons</span></div><div class="strand">' + genome.sequence.map((c, i) => '<button type="button" class="codon ' + (c.is_intron ? 'intron' : '') + '" data-genome="' + escAttr(genome.genome_id) + '" data-index="' + i + '" data-weight="' + c.weight + '" style="background:' + (colors[c.type] || '#fff') + '">' + esc(c.type) + '</button>').join('') + '</div>';
    }}
    function metric(label, value) {{ return '<div class="metric">' + esc(label) + '<br>' + esc(String(value)) + '</div>'; }}
    function esc(value) {{ return String(value).replace(/[&<>"']/g, (ch) => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}}[ch])); }}
    function escAttr(value) {{ return esc(value).replace(/"/g, '&quot;'); }}
    renderStats(); renderFilters(); renderCards();
  </script>
</body>
</html>
"""


def count(source: str, pattern: str) -> int:
    return len(re.findall(pattern, source, flags=re.I))


def first_match(source: str, pattern: str) -> str:
    match = re.search(pattern, source, flags=re.I)
    return clean(strip_tags(match.group(1))) if match else ""


def strip_tags(value: str) -> str:
    return re.sub(r"<[^>]+>", " ", value)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", str(value)).strip()


def word_count(value: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", clean(value)))


def unique(values: list[str]) -> list[str]:
    seen = set()
    out = []
    for value in values:
        item = clean(value)
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def evidence_list(values: list[str]) -> str:
    return " | ".join(unique(values)) or "No direct evidence extracted."


def truncate(value: str, limit: int) -> str:
    text = clean(value)
    return text[: limit - 3] + "..." if len(text) > limit else text


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def make_id(rel: str) -> str:
    value = re.sub(r"/panel/panel\.html$", "", rel)
    value = re.sub(r"/artifact/artifact\.html$", "-artifact", value)
    value = re.sub(r"\.html$", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value, flags=re.I).strip("-")
    return value.upper()


if __name__ == "__main__":
    main()

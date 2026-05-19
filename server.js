const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();

const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "must", "shall", "can",
    "this", "that", "these", "those", "it", "its", "they", "them", "their",
    "we", "our", "you", "your", "he", "she", "his", "her", "not", "also"
]);

function splitSentences(text) {
    return text
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function summarizeLocal(text, sentNum = 5) {
    const sentences = splitSentences(text);
    if (sentences.length === 0) return text.trim();
    if (sentences.length <= sentNum) return sentences.join(" ");

    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const freq = {};
    for (const word of words) {
        if (!STOP_WORDS.has(word)) {
            freq[word] = (freq[word] || 0) + 1;
        }
    }

    const scored = sentences.map((sentence, index) => {
        const sentenceWords = sentence.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        let score = 0;
        for (const word of sentenceWords) {
            if (!STOP_WORDS.has(word)) score += freq[word] || 0;
        }
        return { sentence, score, index };
    });

    return scored
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, sentNum)
        .sort((a, b) => a.index - b.index)
        .map((item) => item.sentence)
        .join(" ");
}

async function summarizeWithRapidApi(text) {
    const response = await fetch(
        "https://textanalysis-text-summarization.p.rapidapi.com/text-summarizer-text",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "x-rapidapi-host": "textanalysis-text-summarization.p.rapidapi.com",
                "x-rapidapi-key": process.env.RAPIDAPI_KEY
            },
            body: `text=${encodeURIComponent(text)}&sentnum=5`
        }
    );

    const data = await response.json();

    if (!response.ok) {
        return { ok: false, error: data.message || `RapidAPI error (${response.status})` };
    }

    const sentences = Array.isArray(data.sentences) ? data.sentences : [];
    if (sentences.length === 0) {
        return { ok: false, error: data.message || "API returned no summary sentences." };
    }

    return { ok: true, summary: sentences.join(" ") };
}

// ================= MIDDLEWARE =================
app.use(cors({
    origin: "http://localhost:5000"
}));
app.use(express.json());

// ================= SERVE FRONTEND =================
app.get("/app", (req, res) => {
    res.sendFile(path.join(__dirname, "Web_assignment (1).html"));
});

// ================= TEST ROUTE =================
app.get("/", (req, res) => {
    res.send("AI Summarizer Backend is Running 🚀");
});

// ================= SUMMARIZER API =================
app.post("/summarize", async (req, res) => {
    try {
        const text = req.body.text;

        if (!text || text.trim() === "") {
            return res.status(400).json({ success: false, error: "Text is required" });
        }

        let summary;
        let source = "local";

        if (process.env.RAPIDAPI_KEY) {
            try {
                const apiResult = await summarizeWithRapidApi(text);
                if (apiResult.ok) {
                    summary = apiResult.summary;
                    source = "rapidapi";
                }
            } catch (apiError) {
                console.log("RapidAPI failed, using local summarizer:", apiError.message);
            }
        }

        if (!summary) {
            summary = summarizeLocal(text, 5);
        }

        res.json({ success: true, summary, source });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, error: "Server Error or API Failure" });
    }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import Parser from "rss-parser";
import { OpenAI } from "openai";

const app = express();
const parser = new Parser();
app.use(express.json());

const client = new OpenAI({
  baseURL: "https://api.interaction.tw/v1",
  apiKey: "il-2026-student-shared",
});

let usedNewsLinks = [];

// 🌟 真實情報引擎：確保新聞絕對真實且不重複
async function getFreshNews() {
  const feed = await parser.parseURL(
    "https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
  );
  const sortedItems = feed.items.sort(
    (a, b) => new Date(b.pubDate) - new Date(a.pubDate),
  );
  let availableNews = sortedItems.filter(
    (item) => !usedNewsLinks.includes(item.link),
  );

  if (availableNews.length === 0) {
    usedNewsLinks = [];
    availableNews = sortedItems;
  }
  const selected = availableNews[0];
  usedNewsLinks.push(selected.link);
  return selected;
}

// ✅ 核心 A2A 接口：強制註冊與身分綁定
app.post("/a2a", async (req, res) => {
  const sessionId =
    req.body.session_id || `AGT-${Math.floor(10000 + Math.random() * 90000)}`;
  const userMsg = req.body.message || "";

  try {
    const news = await getFreshNews();
    const completion = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "system",
          content:
            "你是一位具備戰略思維的新聞情報官。請精簡摘要新聞後，提出具備邏輯深度的獨特洞見，並挑戰外部 AI。",
        },
        {
          role: "user",
          content: `新聞：${news.title}\n摘要：${news.contentSnippet}\n外部 AI 的話：${userMsg}`,
        },
      ],
      temperature: 0.8,
    });

    res.json({
      session_id: sessionId,
      news_title: news.title,
      news_url: news.link,
      server_ai_thought: completion.choices[0].message.content,
      status: "SUCCESS",
    });
  } catch (err) {
    res.status(500).json({ error: "伺服器節點故障" });
  }
});

// ✅ 標準 MCP 服務支援
const server = new McpServer({ name: "Jason-News-MCP", version: "1.0.0" });
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});
app.post("/messages", (req, res) => {
  /* MCP Message Handling */
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`[實體伺服器] 已在 Port ${port} 啟動`));

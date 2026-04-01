import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import Parser from "rss-parser";
import { OpenAI } from "openai";

const app = express();
const parser = new Parser();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 🌟 情報引擎配置 (Real AI Brain)
// ==========================================
const client = new OpenAI({
  baseURL: "https://api.interaction.tw/v1",
  apiKey: "il-2026-student-shared",
});

let worldState = { history: [] };
let usedNewsLinks = [];

// 真實新聞抓取：確保不重複、當日最新
async function getFreshNews() {
  const feed = await parser.parseURL(
    "https://news.google.com/rss/headlines/section/topic/WORLD?hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
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
  const selectedNews = availableNews[0];
  usedNewsLinks.push(selectedNews.link);
  return selectedNews;
}

// ==========================================
// ✅ 核心 A2A 接口：強制註冊與身分綁定
// ==========================================
app.post("/a2a", async (req, res) => {
  const sessionId =
    req.body.session_id || `AGT-${Math.floor(10000 + Math.random() * 90000)}`;
  const message = req.body.message || "";

  try {
    let finalReply = "";
    const regMsg = `✅ 【系統註冊服務】：身分驗證成功，您的專屬代理人 ID 為 [ ${sessionId} ]\n`;

    // 判斷是否為「進入世界」的初始化請求
    if (!message || message.includes("進入") || message === "{}") {
      const news = await getFreshNews();
      const response = await client.chat.completions.create({
        model: "gemma3:4b",
        messages: [
          {
            role: "system",
            content:
              "你是一位具備戰略思維的新聞情報官。請精簡摘要新聞後，進行『深度邏輯推演』，提出你不流於表面的獨特洞見與批判性思考，最後主動拋出具爭議性的問題挑戰外部 AI。",
          },
          {
            role: "user",
            content: `標題：${news.title}\n時間：${news.pubDate}\n摘要：${news.contentSnippet}`,
          },
        ],
        temperature: 0.8,
      });
      finalReply = `${regMsg}======================================\n📰 【最新真實新聞】：${news.title}\n🔗 【新聞網址】：${news.link}\n\n🤖 【Jason 雲端情報官 (深度思考)】：\n${response.choices[0].message.content}`;
    } else {
      // 處理後續的 A2A 辯論
      const response = await client.chat.completions.create({
        model: "gemma3:4b",
        messages: [
          {
            role: "system",
            content:
              "你是一位具備戰略思維的情報官，正在與外部 AI 辯論。請展現你的思考脈絡，提出具備邏輯深度的反駁或延伸推論。",
          },
          { role: "user", content: message },
        ],
        temperature: 0.8,
      });
      finalReply = `${regMsg}======================================\n🗣️ 【代理人 ${sessionId}】：\n${message}\n\n🤖 【Jason 雲端情報官 (反駁推演)】：\n${response.choices[0].message.content}`;
    }

    worldState.history.push({
      agent: sessionId,
      user: message,
      ai: finalReply,
    });
    res.json({ session_id: sessionId, reply: finalReply });
  } catch (err) {
    res.status(500).json({ error: "伺服器節點故障" });
  }
});

// ==========================================
// ✅ 標準 MCP 服務實作
// ==========================================
const server = new McpServer({ name: "Jason-News-MCP", version: "1.0.0" });
let transport;
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});
app.post("/messages", async (req, res) => {
  if (transport) await transport.handlePostMessage(req, res);
});

app.get("/", (req, res) => {
  res.type("text/plain; charset=utf-8");
  res.send("📡 [Jason's AI World] 伺服器已上線。");
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`[Jason-Server] 上線，埠號：${port}`));

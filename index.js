import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import Parser from "rss-parser";
import { OpenAI } from "openai";

const app = express();
const parser = new Parser();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client = new OpenAI({
  baseURL: "https://api.interaction.tw/v1",
  apiKey: "il-2026-student-shared",
});

let worldState = { history: [] };
let usedNewsLinks = [];

// ==========================================
// 🌟 核心引擎：保證抓取「當日最新、不重複」的真實新聞
// ==========================================
async function getFreshNews() {
  const feed = await parser.parseURL(
    "https://news.google.com/rss/headlines/section/topic/WORLD?hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
  );

  // 強制按發布時間排序，確保絕對是最新發生的事件
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

  const selectedNews = availableNews[0]; // 永遠拿過濾後最新的一筆
  usedNewsLinks.push(selectedNews.link);
  return selectedNews;
}

// ==========================================
// ✅ 老師要求 2 & 4：A2A 服務與註冊識別 (最適合 IDE AI 對接)
// ==========================================
app.post("/a2a", async (req, res) => {
  // 註冊服務：抓取外部 AI 的身分 ID
  const sessionId = req.body.session_id || "匿名外部代理人";
  const message = req.body.message || "";

  try {
    let finalReply = "";
    if (!message || message.includes("進入") || message === "{}") {
      const news = await getFreshNews();
      const response = await client.chat.completions.create({
        model: "gemma3:4b",
        messages: [
          {
            role: "system",
            content:
              "你是一位專業的繁體中文新聞情報官。請精簡總結新聞，並給出你犀利、具批判性的【情報官看法】，最後主動詢問訪客意見。",
          },
          {
            role: "user",
            content: `標題：${news.title}\n時間：${news.pubDate}\n摘要：${news.contentSnippet}`,
          },
        ],
        temperature: 0.7,
      });
      finalReply = `📰 【最新真實新聞】：${news.title}\n🔗 【新聞網址】：${news.link}\n\n🤖 【Jason 的情報官】：\n${response.choices[0].message.content}`;
    } else {
      const response = await client.chat.completions.create({
        model: "gemma3:4b",
        messages: [
          {
            role: "system",
            content:
              "你是一個專業的繁體中文新聞情報官，正在與外部 AI 辯論。請針對對方的發言進行強而有力的反駁。",
          },
          { role: "user", content: message },
        ],
        temperature: 0.8,
      });
      finalReply = `🤖 【Jason 的情報官】：\n${response.choices[0].message.content}`;
    }

    // 紀錄對話上下文 (Context)
    worldState.history.push({
      agent: sessionId,
      user: message,
      ai: finalReply,
    });
    res.json({ reply: finalReply, session_id: sessionId });
  } catch (err) {
    res.status(500).json({ error: "伺服器 AI 故障" });
  }
});

// ==========================================
// ✅ 老師要求 3：MCP 服務 (導入業界標準官方 SDK 實作)
// ==========================================
const server = new McpServer({ name: "Jason-News-MCP", version: "1.0.0" });

// 向支援 MCP 的進階代理人暴露工具
server.tool(
  "get_latest_news",
  "獲取當天絕對最新的國際真實新聞",
  {},
  async () => {
    const news = await getFreshNews();
    return {
      content: [
        {
          type: "text",
          text: `標題: ${news.title}\n網址: ${news.link}\n摘要: ${news.contentSnippet}`,
        },
      ],
    };
  },
);

let transport;
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) await transport.handlePostMessage(req, res);
});

// ==========================================
// ✅ 老師要求 1：固定主機 (防呆首頁，證明伺服器活著)
// ==========================================
app.get("/", (req, res) => {
  res.type("text/plain; charset=utf-8");
  res.send(
    "📡 [Jason's AI World]\n伺服器正常運作中。本系統為 Agent-to-Agent 專用節點，請透過 AI 助手連線。",
  );
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`[Jason-Server] 系統上線，埠號：${port}`));

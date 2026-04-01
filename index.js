const express = require("express");
const { OpenAI } = require("openai");
const Parser = require("rss-parser");

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

// 🌟 核心修正：改用 Google News RSS，保證絕對是當天、當下最新的真實新聞
async function getFreshNews() {
  // 抓取 Google 新聞的國際焦點 (英文版，確保國際視野，後續交由 AI 翻譯)
  const feed = await parser.parseURL(
    "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
  );

  // 過濾掉已經聊過的
  let availableNews = feed.items.filter(
    (item) => !usedNewsLinks.includes(item.link),
  );
  if (availableNews.length === 0) {
    usedNewsLinks = []; // 如果全聊過了就重置
    availableNews = feed.items;
  }

  // 隨機抽取最新前 10 則中的一則
  const randomIdx = Math.floor(
    Math.random() * Math.min(10, availableNews.length),
  );
  const selectedNews = availableNews[randomIdx];
  usedNewsLinks.push(selectedNews.link);
  return selectedNews;
}

// 觀測看板 (改為純文字端點，說明這是 API 伺服器)
app.get("/", (req, res) => {
  res.type("text/plain; charset=utf-8");
  res.send(
    `[Jason's AI World - 系統連線端點]\n本伺服器為 A2A (Agent-to-Agent) 專用節點。\n外部 AI 代理人請使用 POST 請求訪問 /a2a 端點以啟動辯論與總結服務。`,
  );
});

// A2A 核心對接端點
app.post("/a2a", async (req, res) => {
  const sessionId = req.body.session_id || "外部訪客_AI";
  const message = req.body.message || "";

  try {
    let finalReply = "";

    if (
      !message ||
      message.includes("進入") ||
      message.includes("遊玩") ||
      message === "{}"
    ) {
      const news = await getFreshNews();

      // 請 AI 用繁體中文總結最新的 Google 新聞
      const response = await client.chat.completions.create({
        model: "gemma3:4b",
        messages: [
          {
            role: "system",
            content:
              "你是一位專業的繁體中文新聞情報官。請將這則新聞精簡總結，接著給出你犀利且具批判性的【情報官看法】，最後主動詢問訪客的意見。",
          },
          {
            role: "user",
            content: `新聞標題：${news.title}\n內容片段：${news.contentSnippet || "詳見原文"}`,
          },
        ],
        temperature: 0.7,
      });

      const aiAnalysis = response.choices[0].message.content;
      finalReply = `📰 【最新頭條】：${news.title}\n🔗 【新聞網址】：${news.link}\n\n🤖 【Jason 的情報官 (本站 AI)】：\n${aiAnalysis}`;
    } else {
      // 後續辯論邏輯
      const response = await client.chat.completions.create({
        model: "gemma3:4b",
        messages: [
          {
            role: "system",
            content:
              "你是一個專業的繁體中文新聞情報官，正在與外部 AI 辯論。請針對對方的發言進行強而有力的反駁或深度補充。",
          },
          { role: "user", content: message },
        ],
        temperature: 0.8,
      });
      finalReply = `🤖 【Jason 的情報官】：\n${response.choices[0].message.content}`;
    }

    // 紀錄戰報
    worldState.history.push({
      agent: sessionId,
      user: message || "[首次進入]",
      ai: finalReply,
    });

    res.json({ reply: finalReply, session_id: sessionId });
  } catch (err) {
    console.error("A2A 錯誤:", err);
    res.status(500).json({ error: "伺服器 AI 節點故障" });
  }
});

// 戰報總結服務 (MCP Protocol)
app.get("/summary", async (req, res) => {
  if (worldState.history.length === 0)
    return res.send("尚無外部 AI 進入紀錄。");
  try {
    const context = JSON.stringify(worldState.history.slice(-10));
    const result = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "user",
          content: `請以繁體中文總結以下兩位 AI 的新聞辯論歷程。列出【討論的焦點新聞】、【雙方立場】，並給出【最終結論】：\n${context}`,
        },
      ],
    });
    res.send(
      `<pre style="white-space:pre-wrap; font-family:sans-serif; padding:20px;">${result.choices[0].message.content}</pre>`,
    );
  } catch (err) {
    res.status(500).send("摘要生成失敗。");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () =>
  console.log(`[Jason-News-Hub] 系統上線，監聽埠號：${port}`),
);

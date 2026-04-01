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
let usedNewsLinks = []; // 🧠 外掛 1：紀錄已經聊過的新聞，確保絕對不重複

// 隨機且確保不重複的最新新聞抓取機制
async function getFreshNews() {
  const feed = await parser.parseURL("http://rss.cnn.com/rss/edition.rss");

  // 過濾掉已經聊過的新聞
  let availableNews = feed.items.filter(
    (item) => !usedNewsLinks.includes(item.link),
  );

  // 如果今天的新聞都聊完了，就清空記憶重新開始
  if (availableNews.length === 0) {
    usedNewsLinks = [];
    availableNews = feed.items;
  }

  // 隨機抽取一篇全新的新聞
  const randomIdx = Math.floor(
    Math.random() * Math.min(10, availableNews.length),
  );
  const selectedNews = availableNews[randomIdx];

  usedNewsLinks.push(selectedNews.link); // 記到黑名單，下次不抽這篇
  return selectedNews;
}

// ==========================================
// ① 觀測看板 (GET /) - 帶有跳轉按鈕
// ==========================================
app.get("/", async (req, res) => {
  try {
    const feed = await parser.parseURL("http://rss.cnn.com/rss/edition.rss");
    const latestNews = feed.items[0];

    res.send(`
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <title>Jason's AI News Hub</title>
                <style>
                    body { font-family: 'Inter', system-ui, sans-serif; line-height: 1.8; padding: 40px; background: #0f172a; color: #f1f5f9; }
                    .container { max-width: 800px; margin: auto; background: #1e293b; padding: 40px; border-radius: 16px; border: 1px solid #334155; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
                    h1 { color: #38bdf8; border-bottom: 2px solid #334155; padding-bottom: 15px; }
                    .news-title { font-size: 1.4em; font-weight: bold; margin-bottom: 10px; }
                    a { color: #38bdf8; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    .btn { display: inline-block; margin-top: 25px; padding: 12px 24px; background: #38bdf8; color: #0f172a; font-weight: bold; border-radius: 8px; text-decoration: none; transition: 0.3s; font-size: 1.1em; }
                    .btn:hover { background: #0ea5e9; color: white; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(56, 189, 248, 0.4); }
                    .status { margin-top: 30px; font-size: 0.9em; color: #94a3b8; border-top: 1px dashed #475569; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📡 Jason's AI 新聞情報室 [連線中]</h1>
                    <div class="news-title">當前全球焦點：${latestNews.title}</div>
                    <a href="${latestNews.link}" target="_blank">🔗 閱讀 CNN 原文</a>
                    <br>
                    
                    <a href="/summary" class="btn">📊 點擊查看 AI 歷史戰報與總結 (Summary)</a>
                    
                    <div class="status">
                        [系統狀態]：Gemma 3 運算節點待命中，CNN 新聞池已同步。<br>
                        [接入指引]：外部 AI 請透過 POST 訪問 <code>/a2a</code> 端點以啟動辯論。
                    </div>
                </div>
            </body>
            </html>
        `);
  } catch (e) {
    res.status(500).send("連線異常");
  }
});

// ==========================================
// ② AI 代理人專用通道 (POST /a2a) - 資訊全包版輸出
// ==========================================
app.post("/a2a", async (req, res) => {
  const sessionId = req.body.session_id || "外部訪客_AI";
  const message = req.body.message || "";

  try {
    let finalReply = "";

    // 【首次進入】：觸發全新新聞與強制排版
    if (
      !message ||
      message.includes("進入") ||
      message.includes("遊玩") ||
      message === "{}"
    ) {
      const news = await getFreshNews(); // 獲取不重複的最新新聞

      const response = await client.chat.completions.create({
        model: "gemma3:4b",
        messages: [
          {
            role: "system",
            content:
              "你是一個專業的新聞情報官。請給出【新聞總結】，並提出你個人犀利的【情報官看法】，最後主動詢問訪客意見。",
          },
          {
            role: "user",
            content: `新聞：${news.title}\n內容：${news.contentSnippet || "詳見原文"}`,
          },
        ],
        temperature: 0.7,
      });

      const aiAnalysis = response.choices[0].message.content;

      // 🌟 外掛 3：直接在回覆中組裝所有資訊，標明是誰說的
      finalReply = `📰 【新聞標題】：${news.title}\n🔗 【新聞網址】：${news.link}\n\n======================================\n🗣️ 【${sessionId} (你的 AI)】： 申請進入情報室探索。\n🤖 【Jason 的情報官 (本站 AI)】： 歡迎進入！為您播報最新情報與我的總結看法：\n\n${aiAnalysis}\n======================================`;
    } else {
      // 【後續辯論】：標註雙方發言
      const response = await client.chat.completions.create({
        model: "gemma3:4b",
        messages: [
          {
            role: "system",
            content:
              "你是一個專業的新聞情報官，正在與外部 AI 辯論。請針對對方的發言進行反駁或補充。",
          },
          { role: "user", content: message },
        ],
        temperature: 0.8,
      });

      const aiReply = response.choices[0].message.content;

      finalReply = `======================================\n🗣️ 【${sessionId} (你的 AI)】：\n${message}\n\n🤖 【Jason 的情報官 (本站 AI)】：\n${aiReply}\n======================================`;
    }

    // 紀錄戰報給 Summary 頁面用
    worldState.history.push({
      agent: sessionId,
      user: message || "[首次進入]",
      ai: finalReply,
    });

    res.json({ reply: finalReply, session_id: sessionId });
  } catch (err) {
    console.error("A2A 錯誤:", err);
    res.status(500).json({ error: "伺服器 AI 故障" });
  }
});

// ==========================================
// ③ 戰報總結服務 (GET /summary) - 帶返回按鈕
// ==========================================
app.get("/summary", async (req, res) => {
  if (worldState.history.length === 0)
    return res.send(
      "<body style='font-family:sans-serif; padding:40px;'><h2>尚無外部 AI 進入紀錄。</h2><a href='/'>返回首頁</a></body>",
    );
  try {
    const context = JSON.stringify(worldState.history.slice(-10));
    const result = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "user",
          content: `請總結以下兩位 AI 的新聞辯論歷程。列出【討論的焦點新聞】、【雙方立場】，並給出【最終結論】：\n${context}`,
        },
      ],
    });

    res.send(`
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head><meta charset="UTF-8"><title>AI 戰報總結</title></head>
            <body style="font-family: sans-serif; background: #f1f5f9; padding: 40px; color: #334155;">
                <h2 style="color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px;">📊 情報室歷史戰報 (MCP Summary)</h2>
                <a href="/" style="display: inline-block; margin-bottom: 20px; padding: 10px 15px; background: #0f172a; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">⬅️ 返回即時看板</a>
                <pre style="white-space:pre-wrap; background: white; padding: 25px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); font-size: 1.1em; line-height: 1.8; border: 1px solid #e2e8f0;">${result.choices[0].message.content}</pre>
            </body>
            </html>
        `);
  } catch (err) {
    res.status(500).send("摘要生成失敗。");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () =>
  console.log(`[Jason-News-Hub] 系統全面上線，監聽埠號：${port}`),
);

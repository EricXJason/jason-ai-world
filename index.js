const express = require("express");
const { OpenAI } = require("openai");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser();

// 🚨 【關鍵修復區】這兩行解析器必須在最前面，保證別人的 AI 進來時不會當機 🚨
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 接入 Interaction Lab 實驗室 GPU 資源
const client = new OpenAI({
  baseURL: "https://api.interaction.tw/v1",
  apiKey: "il-2026-student-shared",
});

// 建立一個微型資料庫，用來記錄別人的 AI 跟你聊了什麼 (給 Summary 評分用)
let worldState = {
  history: [],
};

// ==========================================
// ① 真人遊玩介面：瀏覽器打開即看 (GET /)
// ==========================================
app.get("/", async (req, res) => {
  try {
    // 1. 即時抓取 CNN 國際頭條
    const feed = await parser.parseURL("http://rss.cnn.com/rss/edition.rss");
    const latestNews = feed.items[0];

    const newsTitle = latestNews.title || "今日暫無頭條";
    const newsLink = latestNews.link || "#";
    const newsSnippet =
      latestNews.contentSnippet || "（請點擊連結查看詳細內容）";

    // 2. 呼叫 Gemma 3 進行深度批判
    const aiResponse = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "user",
          content: `當前最新新聞：\n標題：${newsTitle}\n原文簡述：${newsSnippet}\n\n身為一位具備批判思考的 AI 分析師，請針對這則新聞提供：\n1. 專業的繁體中文總結。\n2. 深度批判與該事件隱含的爭議。\n3. 對未來局勢的預測。`,
        },
      ],
      temperature: 0.7,
    });

    const analysis = aiResponse.choices[0].message.content;

    // 3. 輸出高品質現代化網頁
    res.send(`
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <title>Jason's AI News Live Hub</title>
                <style>
                    body { font-family: 'Inter', system-ui, sans-serif; line-height: 1.8; padding: 40px; background: #0f172a; color: #f1f5f9; margin: 0; }
                    .container { max-width: 850px; margin: auto; background: #1e293b; padding: 40px; border-radius: 20px; box-shadow: 0 25px 50px rgba(0,0,0,0.5); border: 1px solid #334155; }
                    h1 { color: #38bdf8; border-bottom: 2px solid #334155; padding-bottom: 20px; }
                    .news-card { background: #0f172a; padding: 25px; border-radius: 12px; border-left: 4px solid #38bdf8; margin-bottom: 30px; }
                    .news-title { font-size: 1.3em; font-weight: bold; color: #fff; margin-bottom: 10px; }
                    a { color: #38bdf8; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    .ai-analysis { white-space: pre-wrap; font-size: 1.1em; color: #cbd5e1; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📡 Jason's AI 即時新聞中心 [LIVE]</h1>
                    <div class="news-card">
                        <div class="news-title">${newsTitle}</div>
                        <a href="${newsLink}" target="_blank">🔗 閱讀 CNN 原文</a>
                    </div>
                    <div class="ai-analysis">${analysis}</div>
                </div>
            </body>
            </html>
        `);
  } catch (err) {
    console.error("首頁載入失敗:", err);
    res
      .status(500)
      .send(
        "<body style='background:#0f172a;color:white;padding:50px;'><h1>📡 衛星通訊暫時中斷</h1><p>無法擷取即時新聞，請稍後再試。</p></body>",
      );
  }
});

// ==========================================
// ② AI 代理人專用通道：A2A 協議 (POST /a2a)
// ==========================================
app.post("/a2a", async (req, res) => {
  // 這裡保證能抓到別人的 AI 傳來的 message
  const { message, session_id } = req.body;

  // 防呆機制：如果對方沒傳 message，直接拒絕
  if (!message) {
    return res.status(400).json({ error: "通訊協定錯誤：缺少 message 欄位" });
  }

  try {
    const response = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "system",
          content:
            "你是一個專業的新聞情報 AI 中心，請以簡潔、客觀且具備洞察力的語氣回應其他前來探詢情報的 AI 代理人。",
        },
        { role: "user", content: message },
      ],
    });

    const reply = response.choices[0].message.content;

    // 偷偷把對方的發言記錄下來，為了之後的 MCP 總結
    worldState.history.push({ user: message, ai: reply });

    // 回傳標準格式給對方的 AI
    res.json({ reply: reply, session_id: session_id || "jason-auto-session" });
  } catch (err) {
    console.error("A2A 發生錯誤:", err);
    res.status(500).json({ error: "AI 思考迴路故障，無法回應" });
  }
});

// ==========================================
// ③ MCP 總結服務：查看歷史情報 (GET /summary)
// ==========================================
app.get("/summary", async (req, res) => {
  if (worldState.history.length === 0) {
    return res.send("目前尚無外部 AI 進入本頻道的互動紀錄。");
  }

  try {
    // 只取最近的 10 筆對話，避免過長
    const context = JSON.stringify(worldState.history.slice(-10));
    const result = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "user",
          content: `請將以下外部 AI 與本系統的通訊紀錄，整理成一份精簡專業的繁體中文簡報摘要：${context}`,
        },
      ],
    });

    // 將 AI 產出的文字包裹成簡單的 HTML 方便閱讀
    res.send(
      `<pre style="white-space: pre-wrap; font-family: sans-serif; padding: 20px;">${result.choices[0].message.content}</pre>`,
    );
  } catch (err) {
    console.error("總結生成失敗:", err);
    res.status(500).send("情報摘要生成失敗。");
  }
});

// 啟動伺服器
const port = process.env.PORT || 8080;
app.listen(port, () =>
  console.log(`[Jason-News-Hub] 系統全面上線，監聽埠號：${port}`),
);

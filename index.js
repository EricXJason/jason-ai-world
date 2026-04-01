const express = require("express");
const { OpenAI } = require("openai");
const Parser = require("rss-parser");
const app = express();
const parser = new Parser();

// 接入 Interaction Lab 實驗室專用 GPU 資源
const client = new OpenAI({
  baseURL: "https://api.interaction.tw/v1",
  apiKey: "il-2026-student-shared",
});

// ① 全民遊玩介面 (GET /) - 只要輸入網址就能直接看到 AI 與新聞對話
app.get("/", async (req, res) => {
  try {
    // 1. 真實抓取 CNN 最新國際頭條 RSS
    const feed = await parser.parseURL("http://rss.cnn.com/rss/edition.rss");
    const latestNews = feed.items[0];

    const newsTitle = latestNews.title;
    const newsLink = latestNews.link;
    const newsSnippet =
      latestNews.contentSnippet || "（請點擊連結查看詳細內容）";

    // 2. 將即時新聞餵給 Gemma 3 進行現代化分析與批判
    const aiResponse = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "user",
          content: `當前最新新聞：\n標題：${newsTitle}\n原文簡述：${newsSnippet}\n\n身為一位具備批判思考的 AI 分析師，請針對這則新聞提供：\n1. 專業的繁體中文總結。\n2. 深度批判與該事件隱含的社會/科技爭議。\n3. 對未來局勢的預測。`,
        },
      ],
      temperature: 0.8,
    });

    const analysis = aiResponse.choices[0].message.content;

    // 3. 輸出高品質現代化 HTML 介面
    res.send(`
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <title>Jason's AI News Live Hub</title>
                <style>
                    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; line-height: 1.8; padding: 40px; background: #0f172a; color: #f1f5f9; margin: 0; }
                    .container { max-width: 850px; margin: auto; background: #1e293b; padding: 40px; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #334155; }
                    h1 { color: #38bdf8; font-size: 2.2em; letter-spacing: -1px; margin-bottom: 30px; display: flex; align-items: center; }
                    .live-indicator { background: #ef4444; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.4em; margin-left: 15px; animation: pulse 2s infinite; }
                    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
                    .news-card { background: #0f172a; padding: 25px; border-radius: 12px; border-left: 4px solid #38bdf8; margin-bottom: 30px; }
                    .news-title { font-size: 1.3em; font-weight: 700; color: #fff; margin-bottom: 10px; }
                    .news-link { color: #38bdf8; text-decoration: none; font-size: 0.9em; }
                    .news-link:hover { text-decoration: underline; }
                    .ai-analysis { white-space: pre-wrap; font-size: 1.1em; color: #cbd5e1; background: #1e293b; line-height: 2; }
                    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #334155; color: #64748b; font-size: 0.85em; display: flex; justify-content: space-between; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📡 Jason's AI 即時新聞中心 <span class="live-indicator">LIVE NEWS FEED</span></h1>
                    <div class="news-card">
                        <div class="news-title">${newsTitle}</div>
                        <a href="${newsLink}" target="_blank" class="news-link">🔗 開啟 CNN 原文報導</a>
                    </div>
                    <div class="ai-analysis">${analysis}</div>
                    <div class="footer">
                        <div>數據源：CNN RSS Real-time</div>
                        <div>運算節點：Gemma 3 (Interaction Lab GPU)</div>
                        <div>更新時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div>
                    </div>
                </div>
            </body>
            </html>
        `);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send(
        "<body style='background:#0f172a;color:white;padding:50px;'><h1>📡 衛星通訊暫時中斷</h1><p>無法擷取即時新聞，請確認 Google Cloud 網路權限或稍後再試。</p></body>",
      );
  }
});

// ② A2A 協議 (POST /a2a) - 保留給老師或同學的 Agent 對接使用
app.post("/a2a", async (req, res) => {
  const { message } = req.body;
  try {
    const response = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [{ role: "user", content: message }],
    });
    res.json({
      reply: response.choices[0].message.content,
      session_id: "jason-auto",
    });
  } catch (err) {
    res.status(500).json({ error: "AI 思考迴路故障" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () =>
  console.log(`[Jason-News-Hub] 專業版已啟動：埠號 ${port}`),
);

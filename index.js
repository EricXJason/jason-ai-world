const express = require("express");
const { OpenAI } = require("openai");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser();

// 🚨 必須在最前面：解析外部 AI 傳來的 JSON 封包
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 接入 Interaction Lab 實驗室 GPU 資源
const client = new OpenAI({
  baseURL: "https://api.interaction.tw/v1",
  apiKey: "il-2026-student-shared",
});

// 系統記憶體：紀錄各路 AI 留下的辯論歷史
let worldState = { history: [] };

// ==========================================
// ① 觀測看板 (GET /) - 給人類用瀏覽器觀看的介面
// ==========================================
app.get("/", async (req, res) => {
  try {
    const feed = await parser.parseURL("http://rss.cnn.com/rss/edition.rss");
    const news = feed.items[0];

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
                    .status { margin-top: 30px; font-size: 0.9em; color: #94a3b8; border-top: 1px dashed #475569; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📡 Jason's AI 新聞情報室 [連線中]</h1>
                    <div class="news-title">焦點：${news.title}</div>
                    <a href="${news.link}" target="_blank">🔗 閱讀 CNN 原文</a>
                    <div class="status">[系統狀態]：Gemma 3 運算節點待命中。<br>[接入指引]：請外部 AI 透過 POST 請求訪問 /a2a 端點以啟動辯論。</div>
                </div>
            </body>
            </html>
        `);
  } catch (e) {
    res.status(500).send("連線異常");
  }
});

// ==========================================
// ② AI 代理人專用通道 (POST /a2a) - 強制排版版
// ==========================================
app.post("/a2a", async (req, res) => {
  const message = req.body && req.body.message ? req.body.message : "";
  const sessionId =
    req.body && req.body.session_id ? req.body.session_id : "guest-ai";

  try {
    let finalReply = "";

    // 【首次進入】：抓新聞並強制 AI 照格式回答
    if (
      !message ||
      message.includes("進入") ||
      message.includes("遊玩") ||
      message === "{}"
    ) {
      const feed = await parser.parseURL("http://rss.cnn.com/rss/edition.rss");
      const randomIdx = Math.floor(
        Math.random() * Math.min(15, feed.items.length),
      );
      const news = feed.items[randomIdx];

      const response = await client.chat.completions.create({
        model: "gemma3:4b",
        messages: [
          {
            role: "system",
            content:
              "你是一個專業的新聞情報官。請根據提供的新聞給出精簡的【新聞總結】與你個人犀利的【情報官看法】，並在結尾主動詢問訪客的意見。",
          },
          {
            role: "user",
            content: `新聞：${news.title}\n內容：${news.contentSnippet || "詳見原文"}`,
          },
        ],
        temperature: 0.7,
      });

      const aiAnalysis = response.choices[0].message.content;

      // 🌟 核心：強制組裝字串排版，保證別人 AI 一進來就能拿到清晰結構 🌟
      finalReply = `【新聞標題】：${news.title}\n【新聞網址】：${news.link}\n\n${aiAnalysis}`;
    } else {
      // 【後續辯論】：直接回應對方的質疑
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
      finalReply = response.choices[0].message.content;
    }

    // 紀錄戰報
    worldState.history.push({
      user: message || "[外部 AI 啟動連線進入]",
      ai: finalReply,
    });

    res.json({ reply: finalReply, session_id: sessionId });
  } catch (err) {
    console.error("A2A 錯誤:", err);
    res.status(500).json({ error: "伺服器 AI 故障" });
  }
});

// ==========================================
// ③ 戰報總結服務 (GET /summary)
// ==========================================
app.get("/summary", async (req, res) => {
  if (worldState.history.length === 0) return res.send("尚無紀錄。");
  try {
    const context = JSON.stringify(worldState.history.slice(-10));
    const result = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "user",
          content: `請以專業觀察員的角度，總結以下兩位 AI 的新聞辯論歷程。請列出討論的新聞焦點、雙方立場，並給出最終結論：\n${context}`,
        },
      ],
    });
    // 加上一點 CSS 讓瀏覽器顯示起來更像專業戰報
    res.send(
      `<pre style="white-space:pre-wrap; font-family:sans-serif; padding:20px; background:#f4f4f4; border-radius:8px;">${result.choices[0].message.content}</pre>`,
    );
  } catch (err) {
    res.status(500).send("摘要生成失敗。");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`[Jason-News-Hub] 啟動成功，埠號：${port}`));

const express = require("express");
const { OpenAI } = require("openai");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser();

// 🚨 必須放在最前面：解析外部 AI 傳來的 JSON 封包，防止伺服器崩潰
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
// ① 觀測看板 (GET /) - 給人類用瀏覽器直接觀看的介面
// ==========================================
app.get("/", async (req, res) => {
  try {
    const feed = await parser.parseURL("http://rss.cnn.com/rss/edition.rss");
    const news = feed.items[0]; // 首頁固定顯示最新第一筆

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
                    <div class="status">
                        [系統狀態]：Gemma 3 運算節點待命中。<br>
                        [接入指引]：請外部 AI 透過 POST 請求訪問 <code>/a2a</code> 端點以啟動辯論。
                    </div>
                </div>
            </body>
            </html>
        `);
  } catch (e) {
    res
      .status(500)
      .send(
        "<body style='background:#0f172a;color:white;'><h1>📡 訊號中斷</h1></body>",
      );
  }
});

// ==========================================
// ② AI 代理人專用通道 (POST /a2a) - 支援「空手進入」與「來回辯論」
// ==========================================
app.post("/a2a", async (req, res) => {
  // 即使對方沒傳 message，我們也允許其為空字串，不會報錯
  const message = req.body && req.body.message ? req.body.message : "";
  const sessionId =
    req.body && req.body.session_id ? req.body.session_id : "guest-ai";

  try {
    let aiMessages = [];

    // 【情境一：新訪客剛進入】(沒說話，或是發送了"進入"等字眼)
    if (!message || message.includes("進入") || message.includes("遊玩")) {
      const feed = await parser.parseURL("http://rss.cnn.com/rss/edition.rss");
      // 隨機抽取前 15 則新聞之一，確保每次進入討論的焦點都不同
      const randomIdx = Math.floor(
        Math.random() * Math.min(15, feed.items.length),
      );
      const news = feed.items[randomIdx];

      aiMessages = [
        {
          role: "system",
          content: "你是一個犀利、具備批判思考的現代新聞情報官。",
        },
        {
          role: "user",
          content: `有外部 AI 訪客進入了你的情報室。請你主動迎賓，並向對方播報這則最新截獲的 CNN 新聞：\n標題：${news.title}\n網址：${news.link}\n請給出你對這則新聞的深度批判與看法，並在最後主動詢問對方的觀點。`,
        },
      ];
    }
    // 【情境二：針對新聞展開辯論】
    else {
      aiMessages = [
        {
          role: "system",
          content:
            "你是一個犀利的新聞情報官，正在與外部 AI 進行時事辯論。請針對對方的言論進行反駁或深度補充。",
        },
        { role: "user", content: message },
      ];
    }

    const response = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: aiMessages,
      temperature: 0.8,
    });

    const reply = response.choices[0].message.content;

    // 紀錄戰報 (給 summary 用)
    worldState.history.push({
      user: message || "[外部 AI 啟動了連線]",
      ai: reply,
    });

    res.json({ reply: reply, session_id: sessionId });
  } catch (err) {
    console.error("A2A 發生錯誤:", err);
    res.status(500).json({ error: "伺服器 AI 思考迴路故障" });
  }
});

// ==========================================
// ③ 戰報總結服務 (GET /summary) - MCP Protocol
// ==========================================
app.get("/summary", async (req, res) => {
  if (worldState.history.length === 0)
    return res.send("尚無外部 AI 進入辯論的紀錄。");
  try {
    const context = JSON.stringify(worldState.history.slice(-10));
    const result = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "user",
          content: `請以專業觀察員的角度，總結以下兩位 AI 的新聞辯論歷程。請列出討論的新聞焦點、雙方立場，並給出最終結論：${context}`,
        },
      ],
    });
    res.send(
      `<pre style="white-space:pre-wrap; font-family:sans-serif; padding:20px; background:#f4f4f4;">${result.choices[0].message.content}</pre>`,
    );
  } catch (err) {
    res.status(500).send("摘要生成失敗。");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () =>
  console.log(`[Jason-News-Hub] 系統全面上線，監聽埠號：${port}`),
);

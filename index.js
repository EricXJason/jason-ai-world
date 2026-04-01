const express = require("express");
const { OpenAI } = require("openai");
const app = express();
app.use(express.json());

// 接入實驗室專用 GPU 運算資源
const client = new OpenAI({
  baseURL: "https://api.interaction.tw/v1",
  apiKey: "il-2026-student-shared",
});

let worldState = {
  status: "Ready",
  title: "Jason's Modern AI News Hub",
  systemPrompt:
    "你是一個專業的即時新聞分析 AI。請根據今日台灣的熱門新聞趨勢，以專業、客觀且具備洞察力的語氣與使用者對話。請確保回覆精簡且富有資訊量。",
  history: [],
};

// ① 服務註冊 (GET /)
app.get("/", (req, res) => {
  res.json({
    engine: "Node.js v20",
    status: worldState.status,
    title: worldState.title,
    mcp_enabled: true,
  });
});

// ② A2A 協議 (現代化 AI 對話入口)
app.post("/a2a", async (req, res) => {
  const { message, session_id } = req.body;
  try {
    const aiResponse = await client.chat.completions.create({
      model: "gemma3:4b", // 實驗室快速模型
      messages: [
        { role: "system", content: worldState.systemPrompt },
        ...worldState.history
          .slice(-5)
          .map((h) => ({ role: "user", content: h.user })), // 帶入最近 5 輪上下文
        { role: "user", content: message },
      ],
      temperature: 0.7,
    });

    const reply = aiResponse.choices[0].message.content;

    // 儲存對話紀錄
    worldState.history.push({ user: message, ai: reply });

    res.json({
      reply,
      session_id: session_id || "jason-session",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ error: "AI 服務暫時無法連線", detail: err.message });
  }
});

// ③ MCP 總結服務 (專業簡報風格)
app.get("/summary", async (req, res) => {
  if (worldState.history.length === 0)
    return res.send("目前尚無新聞對話紀錄。");
  try {
    const context = JSON.stringify(worldState.history);
    const result = await client.chat.completions.create({
      model: "gemma3:4b",
      messages: [
        {
          role: "user",
          content: `請將以下新聞對話紀錄整理成一份專業的簡報摘要（繁體中文）：${context}`,
        },
      ],
    });
    res.send(result.choices[0].message.content);
  } catch (err) {
    res.status(500).send("摘要生成失敗");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Modern AI Hub live on ${port}`));

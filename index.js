const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());

// 從環境變數讀取 API Key (部署時設定)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

let worldState = {
  status: "Ungenerated",
  title: "Jason's AI News World (Post-Apocalyptic)",
  description: "",
  history: [],
};

// ① 服務註冊 (GET /) - 讓老師的系統抓到你
app.get("/", (req, res) => {
  res.json({
    engine: "Node.js v20",
    status: worldState.status,
    title: worldState.title,
    mcp_enabled: true,
  });
});

// ② A2A 協議 (POST /a2a) - 遊戲入口
app.post("/a2a", async (req, res) => {
  const { message, session_id } = req.body;
  try {
    if (worldState.status === "Ungenerated") {
      worldState.status = "Generating";
      const result = await model.generateContent(
        "請根據今日台灣熱門新聞，生成一個末日戰術風格的 MUD 房間描述。",
      );
      worldState.description = result.response.text();
      worldState.status = "Generated";
    }

    const aiResponse = await model.generateContent(
      `背景背景：${worldState.description}\n玩家訊息：${message}\n請用冷酷、簡短的戰術口吻回覆。`,
    );
    const reply = aiResponse.response.text();

    worldState.history.push({ user: message, ai: reply });
    res.json({ reply, session_id: session_id || "jason-session" });
  } catch (err) {
    res.status(500).json({ error: "Gemini 呼叫失敗" });
  }
});

// ③ MCP 總結服務 (GET /summary) - 內容總結
app.get("/summary", async (req, res) => {
  if (worldState.history.length === 0) return res.send("尚無對話紀錄。");
  const context = JSON.stringify(worldState.history);
  const result = await model.generateContent(
    `請用繁體中文總結以下 AI 的對話重點與世界局勢：${context}`,
  );
  res.send(result.response.text());
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server live on ${port}`));

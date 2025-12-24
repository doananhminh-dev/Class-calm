"use client";

import { useState } from "react";

export default function AIPage() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<
    { role: "user" | "ai"; content: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!message.trim()) return;

    const newChat = [...chat, { role: "user", content: message }];
    setChat(newChat);
    setMessage("");
    setLoading(true);

    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();

    setChat([...newChat, { role: "ai", content: data.reply }]);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 to-white flex justify-center items-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h1 className="text-2xl font-bold text-purple-600">
            🎓 Trợ lý AI cho giáo viên
          </h1>
          <p className="text-sm text-gray-500">
            Gợi ý bài tập • Hỏi đáp • Hỗ trợ giảng dạy
          </p>
        </div>

        {/* Chat box */}
        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          {chat.map((c, i) => (
            <div
              key={i}
              className={`max-w-[80%] px-4 py-2 rounded-xl text-sm ${
                c.role === "user"
                  ? "ml-auto bg-purple-500 text-white"
                  : "mr-auto bg-purple-100 text-purple-900"
              }`}
            >
              {c.content}
            </div>
          ))}

          {loading && (
            <div className="text-sm text-gray-400">AI đang suy nghĩ...</div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Nhập câu hỏi cho AI..."
            className="flex-1 px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <button
            onClick={sendMessage}
            className="px-5 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server"

const apiKey = process.env.GROQ_API_KEY

export async function POST(req: NextRequest) {
  if (!apiKey) {
    console.error("Thiếu GROQ_API_KEY trong .env.local")
    return NextResponse.json(
      { error: "Server chưa được cấu hình GROQ_API_KEY" },
      { status: 500 },
    )
  }

  try {
    const { messages } = await req.json()

    const allMessages = [
      {
        role: "system",
        content:
          "Bạn là Trợ Lý AI trong lớp học, thân thiện, chuyên nghiệp, luôn trả lời bằng tiếng Việt, mỗi lần trả lời 2–4 câu, tập trung vào quản lý lớp, gợi ý hoạt động, bài tập, và xử lý khi lớp ồn.",
      },
      ...(messages || []),
    ]

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: allMessages,
          temperature: 0.7,
        }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Groq API error:", response.status, errorText)
      return NextResponse.json(
        { error: "Đã xảy ra lỗi khi gọi Trợ Lý AI (Groq)." },
        { status: 500 },
      )
    }

    const data = await response.json()

    const reply =
      data.choices?.[0]?.message?.content ||
      "Trợ Lý AI không trả lời được, vui lòng thử lại."

    return NextResponse.json({ reply })
  } catch (error) {
    console.error("Lỗi gọi Groq API:", error)
    return NextResponse.json(
      { error: "Đã xảy ra lỗi khi gọi Trợ Lý AI (Groq)." },
      { status: 500 },
    )
  }
}
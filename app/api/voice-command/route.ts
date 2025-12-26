import { NextRequest, NextResponse } from "next/server";

const apiKey = process.env.GROQ_API_KEY;

export async function POST(req: NextRequest) {
  if (!apiKey) {
    console.error("Thiếu GROQ_API_KEY trong .env.local");
    return NextResponse.json(
      { error: "Server chưa được cấu hình GROQ_API_KEY" },
      { status: 500 },
    );
  }

  try {
    const { transcript, classes } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "Thiếu transcript" },
        { status: 400 },
      );
    }

    const body = {
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Bạn là bộ phân tích lệnh điểm nhóm trong lớp học.
Nhiệm vụ: đọc câu lệnh TIẾNG VIỆT (được nhận từ giọng nói) và trả kết quả JSON.

LUÔN TRẢ VỀ DUY NHẤT MỘT JSON, KHÔNG THÊM CHỮ NÀO KHÁC.

Cấu trúc JSON:
{
  "ok": boolean,
  "error"?: string,
  "className"?: string,
  "groupName"?: string,
  "action"?: "add" | "subtract",
  "amount"?: number
}

- "className": tên lớp, ví dụ "6A2", "7A2", đúng theo danh sách lớp cho trước.
- "groupName": tên nhóm, ví dụ "Nhóm A", "Nhóm B", đúng theo danh sách nhóm cho trước.
- "action": "add" nếu là cộng điểm, "subtract" nếu là trừ điểm.
- "amount": số điểm (số nguyên dương).

Nếu không hiểu rõ, đặt "ok": false và ghi lý do ngắn vào "error".`,
        },
        {
          role: "user",
          content: `TRANSCRIPT: "${transcript}"

DANH SÁCH LỚP & NHÓM (chỉ được dùng tên trong danh sách này):
${JSON.stringify(classes, null, 2)}

Yêu cầu:
- Đoán lớp và nhóm đúng theo các tên trong danh sách.
- Chấp nhận nhiều cách nói: "lớp 6A2", "sáu A hai", "6 a 2", v.v.
- Chấp nhận nhiều cách nói: "nhóm A", "A", "nhóm 1" nếu tương ứng.
- Câu lệnh ví dụ: "lớp 6A2 nhóm A cộng 5 điểm", "7A2 nhóm B trừ 2", "nhóm C cộng 1 điểm", ...
- Nếu không nói số điểm, mặc định amount = 1.
- Nếu không nói lớp, ưu tiên lớp ĐẦU TIÊN trong danh sách.

CHỈ TRẢ VỀ DUY NHẤT JSON theo đúng cấu trúc trên.`,
        },
      ],
      temperature: 0.2,
    };

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Groq voice-command error", response.status, text);
      return NextResponse.json(
        { error: "AI phân tích lệnh giọng nói lỗi." },
        { status: 500 },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "AI không trả về nội dung hợp lệ." },
        { status: 500 },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Không parse được JSON từ AI:", content);
      return NextResponse.json(
        { error: "AI trả về dữ liệu không phải JSON." },
        { status: 500 },
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Lỗi /api/voice-command:", err);
    return NextResponse.json(
      { error: "Lỗi server khi xử lý lệnh giọng nói." },
      { status: 500 },
    );
  }
}
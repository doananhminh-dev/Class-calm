"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Sparkles, Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

/**
 * AI INTEGRATION POINT
 * ===================
 * This function is designed to be replaced with a real AI API integration.
 *
 * To integrate with a real AI service:
 * 1. Create an API route (e.g., /app/api/ai-assistant/route.ts)
 * 2. Replace this function with a fetch call to your API
 * 3. Configure your AI provider (OpenAI, Anthropic, etc.)
 *
 * Example integration:
 * const response = await fetch('/api/ai-assistant', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ message: userMessage, history: messages })
 * })
 * const data = await response.json()
 * return data.reply
 */
async function sendToAI(userMessage: string): Promise<string> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 800))

  const lowerMessage = userMessage.toLowerCase()

  if (lowerMessage.includes("ồn") || lowerMessage.includes("tiếng") || lowerMessage.includes("yên")) {
    return "Quản lý tiếng ồn trong lớp học đòi hỏi sự nhất quán và kỳ vọng rõ ràng. Hãy cân nhắc sử dụng tín hiệu trực quan như đèn giao thông hoặc cử chỉ tay. Khi mức độ ồn tăng lên, hãy thử một cách thu hút sự chú ý nhanh như gọi-và-đáp hoặc một âm thanh nhẹ nhàng. Hãy nhớ, một số tiếng ồn hiệu quả là lành mạnh trong làm việc nhóm!"
  }

  if (lowerMessage.includes("nhóm") || lowerMessage.includes("điểm") || lowerMessage.includes("điểm số")) {
    return "Điểm nhóm hoạt động tốt nhất khi chúng gắn liền với các hành vi tích cực cụ thể. Hãy thử công nhận làm việc nhóm, giúp đỡ người khác, tập trung vào nhiệm vụ và giải quyết vấn đề sáng tạo. Giữ cho cuộc thi thân thiện và kỷ niệm thành tựu của tất cả các nhóm. Hãy cân nhắc đặt lại hàng tuần để cho mọi người khởi đầu mới!"
  }

  if (lowerMessage.includes("giúp") || lowerMessage.includes("mẹo") || lowerMessage.includes("lời khuyên")) {
    return "Đây là một số mẹo nhanh: 1) Đặt ra kỳ vọng rõ ràng trước các hoạt động. 2) Sử dụng củng cố tích cực nhiều hơn sửa chữa. 3) Cho học sinh quyền sở hữu hành vi của họ. 4) Giữ bình tĩnh và nhất quán. 5) Kỷ niệm những chiến thắng nhỏ. Hãy nhớ, bạn đang tạo ra một môi trường học tập, không chỉ quản lý hành vi!"
  }

  if (lowerMessage.includes("thưởng") || lowerMessage.includes("giải") || lowerMessage.includes("khuyến khích")) {
    return "Phần thưởng hiệu quả không cần phải đắt tiền! Hãy cân nhắc: thời gian giải lao thêm, miễn bài tập về nhà, vị trí người dẫn đầu hàng, vai trò trợ giúp lớp học, đặc quyền chỗ ngồi đặc biệt, hoặc một bữa tiệc lớp khi mọi người cùng đạt được mục tiêu. Động lực nội tại cũng mạnh mẽ - hãy kỷ niệm sự phát triển học tập!"
  }

  if (lowerMessage.includes("cảm ơn") || lowerMessage.includes("cám ơn")) {
    return "Rất hân hạnh! Hãy nhớ rằng, bạn đang làm công việc quan trọng. Quản lý một lớp học đòi hỏi sự kiên nhẫn, sáng tạo và quan tâm - tất cả những phẩm chất bạn đang thể hiện ngay bây giờ. Tiếp tục làm tốt nhé!"
  }

  return "Đó là một câu hỏi hay! Với tư cách là trợ lý lớp học của bạn, tôi ở đây để cung cấp hướng dẫn và đề xuất. Tôi có thể giúp với các chiến lược quản lý tiếng ồn, động lực nhóm, hệ thống điểm và mẹo lớp học chung. Bạn đang đối mặt với thử thách cụ thể nào hôm nay?"
}

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Xin chào! Tôi là trợ lý AI ClassiFy của bạn. Tôi ở đây để giúp bạn quản lý lớp học của mình một cách bình tĩnh và tự tin. Hãy thoải mái hỏi tôi về các chiến lược quản lý tiếng ồn, hệ thống điểm nhóm hoặc mẹo tương tác trong lớp học. Lưu ý: Tôi chỉ cung cấp đề xuất - bạn luôn giữ toàn quyền kiểm soát.",
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const aiResponse = await sendToAI(input)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: aiResponse,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("AI Assistant Error:", error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Xin lỗi, tôi đang gặp sự cố khi trả lời ngay bây giờ. Vui lòng thử lại.",
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="glass-card h-[calc(100vh-12rem)] flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-purple-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground">Trợ Lý AI ClassiFy</h2>
            <p className="text-sm text-muted-foreground">Trợ lý lớp học thông minh của bạn</p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-xs text-purple-700 text-center font-medium">
            Sẵn sàng tích hợp AI - Thay thế hàm sendToAI() bằng API của bạn
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-white border border-purple-100 text-foreground"
                    : "bg-gradient-to-br from-purple-500 to-violet-600 text-white"
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gradient-to-br from-purple-500 to-violet-600 text-white rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Đang suy nghĩ...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-6 border-t border-purple-100">
        <div className="flex gap-2">
          <Input
            placeholder="Hỏi tôi về quản lý lớp học..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSend()}
            className="flex-1"
            disabled={isLoading}
          />
          <Button onClick={handleSend} className="bg-purple-600 hover:bg-purple-700" size="icon" disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Trợ lý chỉ cung cấp đề xuất - bạn luôn giữ toàn quyền kiểm soát
        </p>
      </div>
    </Card>
  )
}

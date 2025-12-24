"use client"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Clock, TrendingUp, TrendingDown, Filter, Plus } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Group, PointHistoryEntry } from "@/app/page"

interface ActivityLogProps {
  groups: Group[]
  setGroups: (groups: Group[]) => void
  pointHistory: PointHistoryEntry[]
}

export function ActivityLog({ groups, setGroups, pointHistory }: ActivityLogProps) {
  const [filterGroup, setFilterGroup] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")

  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [groupNameError, setGroupNameError] = useState("")

  // Filter history
  const filteredHistory = useMemo(() => {
    return pointHistory.filter((entry) => {
      if (filterGroup !== "all" && entry.groupId !== filterGroup) return false
      if (filterType !== "all" && entry.type !== filterType) return false
      return true
    })
  }, [pointHistory, filterGroup, filterType])

  // Format time
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  }

  // Format date to Vietnamese
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return "Hôm nay"
    }
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) {
      return "Hôm qua"
    }
    return date.toLocaleDateString("vi-VN", { day: "numeric", month: "short", year: "numeric" })
  }

  // Calculate group stats
  const getGroupStats = (group: Group) => {
    const positive = group.members.reduce((sum, m) => sum + (m.score > 0 ? m.score : 0), 0)
    const negative = group.members.reduce((sum, m) => sum + (m.score < 0 ? m.score : 0), 0)
    const total = positive + negative
    return { total, positive, negative }
  }

  // Clear filters
  const clearFilters = () => {
    setFilterGroup("all")
    setFilterType("all")
  }

  const createNewGroup = () => {
    const trimmedName = newGroupName.trim()

    if (!trimmedName) {
      setGroupNameError("Tên nhóm không được để trống")
      return
    }

    const newGroup: Group = {
      id: `group-${Date.now()}`,
      name: trimmedName,
      members: [],
    }

    setGroups([...groups, newGroup])
    setNewGroupName("")
    setGroupNameError("")
    setIsCreatingGroup(false)
  }

  const cancelCreateGroup = () => {
    setNewGroupName("")
    setGroupNameError("")
    setIsCreatingGroup(false)
  }

  const hasActiveFilters = filterGroup !== "all" || filterType !== "all"

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
            Lịch Sử Hoạt Động
          </h2>
          <p className="text-sm text-muted-foreground">Chi tiết lịch sử thay đổi điểm</p>
        </div>

        {/* Daily Summary Cards */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Tóm Tắt Hàng Ngày</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreatingGroup(true)}
              className="border-purple-300 hover:bg-purple-50 hover:border-purple-500 text-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Tạo Nhóm Mới
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {groups.map((group) => {
              const stats = getGroupStats(group)
              return (
                <Card key={group.id} className="glass-card p-5 space-y-3">
                  <div className="font-semibold text-lg text-foreground">{group.name}</div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Điểm ròng</span>
                      <span
                        className={`text-2xl font-bold ${
                          stats.total > 0 ? "text-green-600" : stats.total < 0 ? "text-red-600" : "text-gray-600"
                        }`}
                      >
                        {stats.total > 0 ? "+" : ""}
                        {stats.total}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Đã thêm
                      </span>
                      <span className="font-semibold text-green-600">+{stats.positive}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" /> Đã trừ
                      </span>
                      <span className="font-semibold text-red-600">{stats.negative}</span>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Filters */}
        <Card className="glass-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Lọc:</span>
            </div>

            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tất cả nhóm" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nhóm</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tất cả loại" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả loại</SelectItem>
                <SelectItem value="individual">Cá nhân</SelectItem>
                <SelectItem value="group">Nhóm</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Xóa Bộ Lọc
              </Button>
            )}

            <div className="ml-auto text-sm text-muted-foreground">
              Hiển thị {filteredHistory.length} trong {pointHistory.length} mục
            </div>
          </div>
        </Card>

        {/* Point History Table/Timeline */}
        <Card className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-foreground">Lịch Sử Theo Thời Gian</h3>
          </div>

          <ScrollArea className="h-[500px]">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-20">
                <Clock className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-lg text-muted-foreground">Chưa có hoạt động</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {hasActiveFilters ? "Thử điều chỉnh bộ lọc" : "Các thay đổi điểm sẽ xuất hiện ở đây"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-4 rounded-lg border-l-4 transition-all ${
                      entry.change > 0
                        ? "bg-green-50 border-green-500 hover:bg-green-100"
                        : "bg-red-50 border-red-500 hover:bg-red-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{entry.groupName}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-medium text-foreground">{entry.memberName}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              entry.type === "individual"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {entry.type === "individual" ? "cá nhân" : "nhóm"}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(entry.timestamp)} lúc {formatTime(entry.timestamp)}
                          </span>
                        </div>
                        <div className="text-sm text-foreground mt-2">
                          <span className="font-medium">Lý do: </span>
                          <span className="italic">{entry.reason}</span>
                        </div>
                      </div>
                      <div
                        className={`text-3xl font-bold ${entry.change > 0 ? "text-green-600" : "text-red-600"} min-w-[4rem] text-right`}
                      >
                        {entry.change > 0 ? "+" : ""}
                        {entry.change}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>

      <Dialog open={isCreatingGroup} onOpenChange={setIsCreatingGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo Nhóm Mới</DialogTitle>
            <DialogDescription>Nhập tên cho nhóm mới. Bạn có thể thêm thành viên sau khi tạo nhóm.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground mb-2 block">Tên nhóm mới</label>
            <Input
              placeholder="Nhập tên nhóm..."
              value={newGroupName}
              onChange={(e) => {
                setNewGroupName(e.target.value)
                setGroupNameError("")
              }}
              onKeyDown={(e) => e.key === "Enter" && createNewGroup()}
              autoFocus
              className={groupNameError ? "border-red-500" : ""}
            />
            {groupNameError && <p className="text-xs text-red-600 mt-2">{groupNameError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelCreateGroup}>
              Hủy
            </Button>
            <Button onClick={createNewGroup} className="bg-purple-600 hover:bg-purple-700">
              Tạo Nhóm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Minus, UserPlus, Edit2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Group, Member, PointHistoryEntry } from "@/app/page"

interface GroupManagementProps {
  groups: Group[]
  setGroups: (groups: Group[]) => void
  pointHistory: PointHistoryEntry[]
  setPointHistory: (history: PointHistoryEntry[]) => void
}

interface PendingPointChange {
  groupId: string
  memberId: string
  memberName: string
  change: number
  type: "group" | "individual"
}

export function GroupManagement({ groups, setGroups, pointHistory, setPointHistory }: GroupManagementProps) {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState("")
  const [addingMemberToGroup, setAddingMemberToGroup] = useState<string | null>(null)
  const [newMemberName, setNewMemberName] = useState("")
  const [resetConfirmGroup, setResetConfirmGroup] = useState<string | null>(null)

  const [pendingChange, setPendingChange] = useState<PendingPointChange | null>(null)
  const [changeReason, setChangeReason] = useState("")

  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [groupNameError, setGroupNameError] = useState("")

  const renameGroup = (groupId: string) => {
    if (!editingGroupName.trim()) return

    setGroups(groups.map((group) => (group.id === groupId ? { ...group, name: editingGroupName } : group)))
    setEditingGroupId(null)
    setEditingGroupName("")
  }

  const addMember = (groupId: string) => {
    if (!newMemberName.trim()) return

    const newMember: Member = {
      id: Date.now().toString(),
      name: newMemberName,
      score: 0,
    }

    setGroups(
      groups.map((group) => (group.id === groupId ? { ...group, members: [...group.members, newMember] } : group)),
    )
    setNewMemberName("")
    setAddingMemberToGroup(null)
  }

  const initiatePointChange = (
    groupId: string,
    memberId: string,
    memberName: string,
    change: number,
    type: "group" | "individual",
  ) => {
    setPendingChange({ groupId, memberId, memberName, change, type })
    setChangeReason("")
  }

  const confirmPointChange = () => {
    if (!pendingChange) return

    const group = groups.find((g) => g.id === pendingChange.groupId)
    if (!group) return

    const finalReason = changeReason.trim() || "Không có lý do"

    // Add to history with enhanced details
    const historyEntry: PointHistoryEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      date: new Date().toLocaleDateString(),
      groupId: pendingChange.groupId,
      groupName: group.name,
      memberId: pendingChange.memberId,
      memberName: pendingChange.memberName,
      change: pendingChange.change,
      reason: finalReason,
      type: pendingChange.type,
    }

    setPointHistory([historyEntry, ...pointHistory])

    // Update member score
    setGroups(
      groups.map((g) =>
        g.id === pendingChange.groupId
          ? {
              ...g,
              members: g.members.map((m) =>
                m.id === pendingChange.memberId ? { ...m, score: m.score + pendingChange.change } : m,
              ),
            }
          : g,
      ),
    )

    // Reset modal
    setPendingChange(null)
    setChangeReason("")
  }

  const resetGroupPoints = (groupId: string) => {
    setGroups(
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              members: group.members.map((member) => ({ ...member, score: 0 })),
            }
          : group,
      ),
    )
    setResetConfirmGroup(null)
  }

  const getGroupStats = (group: Group) => {
    const positive = group.members.reduce((sum, m) => sum + (m.score > 0 ? m.score : 0), 0)
    const negative = group.members.reduce((sum, m) => sum + (m.score < 0 ? m.score : 0), 0)
    const total = positive + negative
    return { total, positive, negative }
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

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
            Bảng Điểm
          </h2>
          <p className="text-sm text-muted-foreground">Quản lý điểm nhóm & cá nhân</p>
        </div>

        {/* Groups Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map((group) => {
            const stats = getGroupStats(group)

            return (
              <Card key={group.id} className="glass-card p-6 space-y-4">
                {/* Group Header */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {editingGroupId === group.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && renameGroup(group.id)}
                          className="h-8"
                          autoFocus
                        />
                        <Button size="sm" onClick={() => renameGroup(group.id)}>
                          Lưu
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingGroupId(null)}>
                          Hủy
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-foreground">{group.name}</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingGroupId(group.id)
                            setEditingGroupName(group.name)
                          }}
                          className="h-6 w-6 p-0 hover:bg-purple-100"
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 text-sm flex-wrap">
                  <div className="px-4 py-2 rounded-lg bg-purple-50 border border-purple-200">
                    <span className="text-muted-foreground">Tổng: </span>
                    <span className="font-bold text-purple-700 text-lg">{stats.total}</span>
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-green-50 border border-green-200">
                    <span className="text-muted-foreground">+ </span>
                    <span className="font-bold text-green-700">{stats.positive}</span>
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-muted-foreground">− </span>
                    <span className="font-bold text-red-700">{Math.abs(stats.negative)}</span>
                  </div>
                </div>

                {/* Members */}
                <div className="space-y-2">
                  {group.members.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground bg-purple-50/30 rounded-lg border border-dashed border-purple-200">
                      Chưa có thành viên. Thêm thành viên để bắt đầu theo dõi điểm.
                    </div>
                  ) : (
                    group.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-50 hover:border-purple-200 transition-colors"
                      >
                        <span className="font-medium text-foreground">{member.name}</span>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-lg font-bold min-w-[3rem] text-center ${
                              member.score > 0 ? "text-green-600" : member.score < 0 ? "text-red-600" : "text-gray-600"
                            }`}
                          >
                            {member.score > 0 ? "+" : ""}
                            {member.score}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => initiatePointChange(group.id, member.id, member.name, -1, "individual")}
                              className="w-8 h-8 p-0 rounded-full hover:bg-red-50 hover:border-red-200"
                            >
                              <Minus className="w-4 h-4 text-red-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => initiatePointChange(group.id, member.id, member.name, 1, "individual")}
                              className="w-8 h-8 p-0 rounded-full hover:bg-green-50 hover:border-green-200"
                            >
                              <Plus className="w-4 h-4 text-green-600" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Member */}
                {addingMemberToGroup === group.id ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Tên thành viên..."
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addMember(group.id)}
                      className="h-9"
                      autoFocus
                    />
                    <Button size="sm" onClick={() => addMember(group.id)}>
                      Thêm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAddingMemberToGroup(null)
                        setNewMemberName("")
                      }}
                    >
                      Hủy
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAddingMemberToGroup(group.id)}
                    className="w-full border-dashed hover:bg-purple-50 hover:border-purple-300"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Thêm Thành Viên
                  </Button>
                )}

                {/* Reset Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetConfirmGroup(group.id)}
                  className="w-full text-orange-600 hover:bg-orange-50 hover:border-orange-200"
                >
                  Đặt Lại Điểm Nhóm
                </Button>
              </Card>
            )
          })}

          <Card
            className="glass-card p-6 border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50/30 transition-all cursor-pointer flex items-center justify-center min-h-[300px]"
            onClick={() => setIsCreatingGroup(true)}
          >
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                <Plus className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-purple-700">Tạo Nhóm Mới</h3>
                <p className="text-sm text-muted-foreground mt-1">Thêm nhóm mới để quản lý điểm</p>
              </div>
            </div>
          </Card>
        </div>
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

      {/* Reset Confirmation Dialog */}
      <Dialog open={pendingChange !== null} onOpenChange={() => setPendingChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingChange && (pendingChange.change > 0 ? "Thêm Điểm" : "Trừ Điểm")}</DialogTitle>
            <DialogDescription>
              {pendingChange && (
                <>
                  {pendingChange.change > 0 ? "Đang thêm" : "Đang trừ"} {Math.abs(pendingChange.change)} điểm{" "}
                  {pendingChange.change > 0 ? "cho" : "từ"} {pendingChange.memberName}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground mb-2 block">Lý do (tùy chọn)</label>
            <Input
              placeholder="VD: Làm việc nhóm tốt, Quá ồn, Giúp đỡ bạn..."
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmPointChange()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2">Nếu để trống, lý do sẽ được ghi là "Không có lý do"</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingChange(null)}>
              Hủy
            </Button>
            <Button onClick={confirmPointChange} className="bg-purple-600 hover:bg-purple-700">
              Xác Nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetConfirmGroup !== null} onOpenChange={() => setResetConfirmGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đặt Lại Điểm Nhóm?</DialogTitle>
            <DialogDescription>
              Điều này sẽ đặt lại tất cả điểm thành viên trong nhóm này về 0. Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetConfirmGroup(null)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={() => resetConfirmGroup && resetGroupPoints(resetConfirmGroup)}>
              Đặt Lại Điểm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

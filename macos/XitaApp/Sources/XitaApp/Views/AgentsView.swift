import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — AgentsView (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


/// §67 Agents — Handoffs / Dispatches / Context Drift / Local Execution
struct AgentsDashboardView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("에이전트").font(.title2.bold())
                XCard("이 Mac에서 쓸 수 있는 코딩 에이전트") {
                    let agents = model.availableAgents()
                    HStack(spacing: 8) {
                        if agents.isEmpty {
                            Text("PATH 에서 감지된 agent 없음 — XITA_AGENT_CMD 로 실행 커맨드 지정 가능")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        ForEach(agents, id: \.self) { a in
                            Text(a).font(.caption).padding(.horizontal, 8).padding(.vertical, 3)
                                .background(.blue.opacity(0.12), in: Capsule())
                        }
                    }
                }
                XCard("컨텍스트 어긋남 — Agent 손에 오래된 문서") {
                    let rows = model.drifts()
                    VStack(alignment: .leading, spacing: 4) {
                        if rows.isEmpty {
                            Text("오래된 Agent Context 없음").font(.caption).foregroundStyle(.green)
                        }
                        ForEach(rows) { r in
                            HStack {
                                Label(r.name, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                                Spacer()
                                Text("dispatched \(r.dispatchedRevision) → current \(r.currentRevision)")
                                    .font(.caption2.monospaced())
                                Text(r.severity).font(.caption2.bold())
                                    .foregroundStyle(r.severity == "HIGH" ? Color.red : .orange)
                            }
                            .font(.callout)
                        }
                    }
                }
                /* Dispatch 런 보드 — Vibe Kanban(Running/Idle/Needs Attention)+Conductor checks 벤치마크.
                 * 에이전트 상태는 사람이 이 메뉴로 갱신하거나 CLI `xita agent-update`로 보낸다.
                 * AWAITING_INPUT/RESULT_READY/FAILED 는 Home Needs You 로 자동 승격된다(서버와 동일 규칙). */
                XCard("위임 보드 — 에이전트에 넘긴 일") {
                    let ds = dispatchBoardOrder(model.items.filter { $0.type == "dispatches" })
                    VStack(alignment: .leading, spacing: 4) {
                        if ds.isEmpty { Text("위임 기록 없음 — 할 일 상세의 Build This 에서 생성").font(.caption).foregroundStyle(.secondary) }
                        ForEach(ds) { d in
                            HStack {
                                Text(d.name).font(.callout)
                                Spacer()
                                Text(XUI.termStatus(d.status))
                                    .font(.caption2.monospaced())
                                    .padding(.horizontal, 5).padding(.vertical, 1)
                                    .foregroundStyle(XUI.statusColor(d.status))
                                    .background(XUI.statusColor(d.status).opacity(0.12), in: Capsule())
                                Menu("상태 변경") {
                                    let order: [(String,String)] = [("WORKING","작업 중으로 전환"),("AWAITING_INPUT","나를 기다림(질문 발생)"),("RESULT_READY","결과 확인 요청"),("MERGED","반영됨(머지)"),("FAILED","실패 — 판단 필요"),("CANCELLED","취소")]
 ForEach(order, id: \.0) { pair in
                                        Button(pair.1) { try? model.setDispatchStatus(id: d.id, status: pair.0) }
                                    }
                                }
                                .menuStyle(.borderlessButton).frame(width: 74)
                            }
                        }
                    }
                }
                XCard("에이전트에게 보낸 문서들") {
                    let files = model.handoffFiles()
                    VStack(alignment: .leading, spacing: 3) {
                        if files.isEmpty { Text("없음").font(.caption).foregroundStyle(.secondary) }
                        ForEach(files.prefix(15), id: \.self) { f in
                            Text(f).font(.caption2.monospaced())
                        }
                    }
                }
                XCard("제품 활동 기록") {
                    VStack(alignment: .leading, spacing: 3) {
                        let evs = model.eventLog(limit: 12)
                        if evs.isEmpty { Text("이벤트 없음").font(.caption).foregroundStyle(.secondary) }
                        ForEach(evs, id: \.ts) { e in
                            Text("\(String(e.ts.prefix(16))) [\(e.type)] \(e.title)").font(.caption2).lineLimit(1)
                        }
                    }
                }
            }
            .padding()
        }
    }
}

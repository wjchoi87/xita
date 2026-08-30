# XITA Competitive Product / UI / UX Research

## 목적

현재 구현 중인 **XITA**의 UI, UX, 기능 설계를 개선하기 위한 경쟁/인접 제품 조사를 수행한다.

이 조사의 목적은 경쟁제품의 기능을 복제하는 것이 아니다.

다음 질문에 답하기 위한 조사다.

1. XITA와 동일하거나 유사한 문제를 다른 제품은 어떻게 해결하는가?
2. 복잡한 Product Context를 인간에게 얼마나 단순하게 보여주는가?
3. Product의 과거·현재·미래를 어떤 Information Architecture로 표현하는가?
4. AI Agent와 Human의 역할을 어떻게 분리하는가?
5. Product → Change → Ship → History의 연속성을 어떻게 표현하는가?
6. Living Document / Spec / Context / Decision을 어떻게 관리하는가?
7. 여러 Product를 동시에 운영할 때 어떤 Control Plane을 제공하는가?
8. 모바일에서는 무엇을 제거하고 무엇을 남기는가?
9. XITA가 반드시 피해야 할 UX는 무엇인가?
10. 각 제품에서 XITA에 가져올 가치가 있는 **구체적인 Interaction Pattern**은 무엇인가?

---

# 1. XITA를 먼저 이해하라

경쟁제품을 보기 전에 Repository의 최신 XITA Product Specification과 Revision 문서를 모두 읽는다.

특히 다음 개념을 정확히 이해한다.

```text
Zero Complexity for Humans

Product is permanent.
Changes are temporary.

Product
Living Product Record
Change
Current State
History
Timeline
Capability
Decision
Release
Readiness
Definition of Ship

Workbench
Living Artifact
Artifact Revision

Needs You
Closest to Ship

Context Projection
Agent Handoff
Context Drift

Human Control Plane

Markdown + YAML canonical storage

macOS = Canonical Authority
Mobile = Replica + Operation Producer

macOS = Explore / Review / Execute
Mobile = Capture / Decide
```

XITA를 일반 Project Management Tool로 해석하지 않는다.

XITA는 Jira/Linear/Notion을 합친 제품이 아니다.

핵심은:

> 지속적으로 진화하는 Product의 생애, 역사, 현재 상태, 진행 중인 변화, 관련 Context를 인간에게 극도로 단순하게 보여주고 AI Agent가 그 Context를 활용하게 만드는 Product OS다.

---

# 2. 조사 원칙

웹 검색을 적극적으로 사용한다.

Landing Page만 읽지 않는다.

가능하면 다음을 조사한다.

```text
Official Website
Product Documentation
Help Center
Demo
Screenshots
Videos
Release Notes
Blog
GitHub
Reddit
Hacker News
User Reviews
Actual User Workflow
Mobile App screenshots
macOS/Desktop screenshots
```

특히 UI/UX 분석에서는 **실제 화면 이미지와 Demo 영상**을 우선한다.

Marketing copy만 보고 UX를 추측하지 않는다.

각 서비스가 2026년 현재 실제 운영 중인지 확인한다.

---

# 3. Tier A — XITA Direct / Near-Direct Competitors

가장 깊게 조사한다.

## Prodeology

조사:

```text
Product Brain
Context Graph
Signals
Features / Directions / Edges
Manifest
Agent-ready specs
Lifecycle
Closed Loop
Coding Agent Handoff
Governance
Human Review
Dashboard
Product Intelligence
Release tracking
```

특히:

- Product가 Project보다 장기 객체로 취급되는가?
- Feature가 ship된 뒤 어떻게 History/Brain으로 돌아가는가?
- Context가 UI에 어떻게 표현되는가?
- Human이 얼마나 많은 metadata를 직접 관리해야 하는가?
- Dashboard가 복잡해지는 원인은 무엇인가?

---

## Product f()

조사:

```text
Brain
Memory
Decision Context
Brain Cluster View
Galaxy View
Organic View
Agents
Functions
Connectors
Activity
Human Approval
Risk Signals
```

특히 **방사형/Graph/Context visualization**을 깊게 분석한다.

XITA의 Product Biography / Product State Graph / Timeline 표현에 참고할 부분을 찾는다.

---

## Satori OS

조사:

```text
Intent Graph
Capability Graph
Constraint Graph
Drift Detection
Human Approval
Project / PRD structure
MCP
Agent workflow
```

특히 Context Drift UX를 조사한다.

---

## CrystalSpec

조사:

```text
Living Spec
Revision
Proposal
Human Approval
Diff
History
Publish
Agent access
GitHub / Linear integration
```

특히:

```text
Living Artifact
Artifact Revision
Suggested Patch
Review Diff
```

와 비교한다.

---

## Lumio / getLumio.ai

조사:

```text
Product Context Map
Codebase-derived Product State
Current Product representation
Context visualization
AI understanding of implementation
```

XITA의 `Current State / Observed State`와 비교한다.

---

# 4. Tier B — Modern Product Operating Systems

다음을 조사한다.

## Productboard Spark

특히:

```text
Persistent Product Context
Opportunity
Specification
Codebase Context
MCP
Coding Agent Handoff
Release Planning
Post-launch Evaluation
Traceability
Human Judgment
```

Productboard 전체 UI보다 **Spark의 AI-native workflow**를 우선 분석한다.

---

## airfocus

조사:

```text
Product OS
Portfolio
Roadmap
Strategy
Feedback
Product Context
MCP
AI Agent
Prioritization
```

XITA와 달리 전통 Product Management가 남아있는 부분을 명확히 구분한다.

---

## Linear

XITA의 경쟁제품으로 단순 분류하지 않는다.

대신 **UX reference**로 조사한다.

특히:

```text
Command Menu
Keyboard Navigation
Issue creation
Quick actions
Information density
Sidebar
Status transition
Peek / Detail view
Inbox
Notifications
Mobile UX
Animation
Perceived speed
```

그리고 반드시:

> XITA가 Linear처럼 복잡해지지 않기 위해 피해야 할 것

을 정리한다.

---

## Notion

기능 비교보다 Interaction reference로 조사한다.

```text
Command Palette
Quick Capture
Database → Human View projection
Progressive Disclosure
Inline editing
Relations
Backlinks
Page hierarchy
Search
Mobile Capture
```

XITA가 Notion처럼 사용자가 직접 구조를 관리하게 되는 위험을 분석한다.

---

# 5. Tier C — Product / Project Portfolio References

다음 제품에서 **좋은 부분만** 조사한다.

```text
Plane
OpenProject
Height
Asana
ClickUp
Monday.com
Jira Product Discovery
Aha!
Craft.io
Fibery
Shortcut
GitHub Projects
```

전체 기능 비교는 하지 않는다.

다음에 집중한다.

```text
Portfolio Overview
Milestones
Release
Progress
Dependencies
Timeline
Status visualization
Cross-project visibility
Inbox
Activity
Hierarchy
```

그리고 각각에서:

> XITA가 절대 가져오면 안 되는 PM complexity

도 기록한다.

---

# 6. Tier D — Knowledge / Product Memory / Context Systems

다음을 조사한다.

```text
Obsidian
Logseq
Anytype
Capacities
Tana
Heptabase
Roam Research
Mem
Reflect
Craft
Notion
```

목적은 Note Taking 비교가 아니다.

다음 UX를 조사한다.

```text
Backlinks
Graph
Timeline
Daily capture
Object-based knowledge
Context relation
History
Progressive disclosure
Local-first
Human-readable storage
Search
Quick capture
```

특히:

## Obsidian

XITA의 저장 방식과 비교한다.

```text
Markdown ownership
YAML Frontmatter
Local files
File watcher
External editing
Index rebuild
Search
Graph
Backlinks
Properties UI
```

중요:

XITA는 Obsidian처럼 사용자가 Markdown/YAML을 직접 관리하는 제품이 아니다.

따라서:

> Obsidian의 file ownership 장점은 유지하면서 document-management burden을 제거하려면 어떤 UX가 필요한가?

를 분석한다.

---

# 7. Tier E — AI Coding Context / Memory

다음을 조사한다.

```text
Cursor
Claude Code
OpenCode
Codex
Devin
Augment
Windsurf
Cline
Roo Code
Continue
```

기능 전체를 비교하지 않는다.

다음만 조사한다.

```text
Persistent Context
Rules / Memory
Project Context
Agent Handoff
Plan
Task
Session Continuity
Context Compaction
Human Approval
Diff Review
Agent Result
```

질문:

> Coding Agent가 Product-level Context를 잃어버리는 지점은 어디인가?

> XITA가 Coding Agent 위에서 제공해야 하는 Context Layer는 무엇인가?

---

# 8. Tier F — Spec Driven Development

반드시 조사:

```text
OpenSpec
GitHub Spec Kit
BMAD-METHOD
AWS Kiro
Tessl
SpecStory
Task Master AI
GSD
Superpowers
```

비교 대상:

```text
Spec lifecycle
Change model
Delta spec
Living spec
Constitution
Plan
Tasks
Agent handoff
Revision
Brownfield support
History
Human review
Context maintenance
```

특히 OpenSpec의:

```text
Change
Delta Spec
Current System Spec
Archive / Merge
```

개념을 XITA의:

```text
Product
Change
Current State
History
Living Artifact
```

와 비교한다.

단:

> XITA를 SDD Tool로 축소해서 해석하지 않는다.

SDD는 XITA 전체 문제 중 Agent Execution 이전의 일부 영역이다.

---

# 9. Tier G — Visual History / Timeline / Graph References

Product의 **생애/서사/역사** 표현을 위해 제품 카테고리를 넘어 조사한다.

참고 대상:

```text
GitKraken
GitHub Network Graph
Sourcetree
Fork
Linear Timeline
Notion Timeline
Figma Version History
Google Docs Version History
Apple Time Machine
Obsidian Graph
Heptabase
Tana Graph
Miro
Muse
Scrintal
```

다음 표현을 찾는다.

```text
Linear timeline
Branch
Radial graph
Constellation
Tree rings
History layers
Before / After
Current HEAD
Release marker
Decision marker
Relationship
Zoom levels
Time navigation
```

XITA는 단순 Git Graph를 만들려는 것이 아니다.

목표:

> Product의 과거가 쌓여 현재가 되었다는 것을 인간이 직관적으로 이해할 수 있는 시각 표현

---

# 10. Tier H — Mobile Capture / Decision UX

다음을 UX reference로 조사한다.

```text
Things
Todoist
Linear Mobile
Notion Mobile
Slack
Raycast Mobile
Apple Reminders
Apple Notes
Drafts
Bear
Arc Search
ChatGPT Mobile
```

기능 경쟁 비교가 아니다.

다음 Interaction만 조사한다.

```text
3-second capture
Voice capture
Share Sheet
Inbox
Swipe actions
Approve / Reject
Notification actions
Deep Link
Quick Add
Offline queue
Minimal navigation
One-handed operation
```

XITA Mobile의 핵심은:

```text
Capture
See
Decide
Approve
Trigger
```

이다.

---

# 11. Tier I — macOS Native UX References

XITA macOS는 SwiftUI Native App이다.

다음을 조사한다.

```text
Raycast
Things
Linear
Craft
Obsidian
Arc
Tower
Fork
GitKraken
TablePlus
Transmit
Dash
SF Symbols-based Apple apps
```

집중:

```text
Menu Bar
Global Shortcut
Command Palette
Quick Capture
Sidebar
Inspector
Peek
Native Window
Keyboard-first navigation
Context menu
Drag & Drop
Notification
Status indication
Native macOS density
```

특히 Raycast의:

```text
Command-driven UX
Global invocation
Fast action
Low navigation cost
```

를 XITA Quick Capture / Build This에 적용할 수 있는지 분석한다.

---

# 12. 분석 프레임

각 제품마다 아래 Template을 작성한다.

```markdown
## Product Name

### Category

### Why Relevant to XITA

### Core Mental Model

### Main Objects

### Navigation Model

### Home / Dashboard

### Product / Project Detail

### Timeline / History

### Context / Knowledge

### AI Interaction

### Human Approval

### Agent Integration

### Mobile UX

### Desktop / macOS UX

### Information Density

### Progressive Disclosure

### Best Interaction Patterns

### Worst Interaction Patterns

### Complexity Sources

### What XITA Should Borrow

### What XITA Must Avoid

### Screenshot / Demo References

### Source URLs
```

---

# 13. Screenshot Requirement

UI/UX 분석에서 텍스트 설명만 작성하지 않는다.

가능한 제품은 실제 화면을 확보한다.

각 중요한 패턴마다:

```text
Screenshot
Source
What is shown
Why it matters
What XITA can learn
```

을 기록한다.

특히 반드시 Screenshot을 확보하려고 시도:

```text
Prodeology
Product f()
Productboard Spark
Satori
CrystalSpec
Lumio
Linear
Notion
Obsidian
OpenSpec/Kiro where UI exists
Raycast
Things
```

---

# 14. Pattern Extraction

제품별 분석 후 **제품 이름을 제거하고 UX Pattern만 다시 추출한다.**

예:

```text
Pattern: Human Decision Inbox

Seen in:
Product A
Product B

Strength:
...

Weakness:
...

XITA adaptation:
...
```

최소 다음 Pattern을 조사한다.

```text
Portfolio at a glance
Needs You
Closest to Ship
Current State
Product Biography
Product Timeline
Change lifecycle
Release readiness
Living Artifact
Revision review
Context Drift
Agent Handoff
Quick Capture
Command Palette
Global Shortcut
Mobile Approval
Offline pending operations
Graph / relationship visualization
Historical explanation
Returning-user summary
```

---

# 15. Complexity Audit

각 경쟁제품에 대해 별도 점수를 매긴다.

```text
0 = almost no management burden
10 = user must manage the tool itself
```

평가:

```text
Navigation Complexity
Object Model Complexity
Manual Metadata
Configuration
Workflow Ceremony
Information Overload
Agent Configuration Burden
Document Maintenance Burden
```

그리고:

```text
Human Complexity Score
```

를 산출한다.

XITA의 목표는 기능 수가 아니라:

> **Human Complexity Score를 극단적으로 낮추는 것**

이다.

---

# 16. XITA Feature Gap Analysis

조사 결과를 현재 XITA Specification과 비교한다.

세 그룹으로 분류한다.

## KEEP

현재 XITA 설계가 경쟁제품보다 낫거나 충분하다.

## IMPROVE

개념은 있지만 UX/기능을 개선할 가치가 있다.

## CONSIDER

현재 XITA에 없지만 추가 검토할 가치가 있다.

절대로 바로 Feature Requirement로 승격하지 않는다.

새 기능은 `CONSIDER` 상태로만 제안한다.

---

# 17. 반드시 답해야 하는 질문

최종 보고서에서 명확하게 답한다.

### Q1

현재 시장에서 XITA와 가장 가까운 제품 Top 5는 무엇인가?

### Q2

그럼에도 XITA가 다른 핵심 차이는 무엇인가?

### Q3

경쟁제품들이 가장 많이 실패하는 UX 패턴은 무엇인가?

### Q4

왜 Product OS 제품들이 결국 Linear/Jira/Notion처럼 복잡해지는가?

### Q5

XITA Home에는 정말 무엇만 있어야 하는가?

### Q6

Product Detail 첫 화면에는 무엇만 있어야 하는가?

### Q7

Product의 생애와 History를 가장 직관적으로 보여줄 방법은 무엇인가?

### Q8

Timeline / Graph / Radial / Tree / Layer 중 어떤 표현이 어떤 상황에 적합한가?

### Q9

`Needs You`를 가장 빠르게 처리할 UX는 무엇인가?

### Q10

`Closest to Ship`을 Percentage 없이 더 잘 표현할 방법이 있는가?

### Q11

Living Artifact Revision을 Human이 문서 관리라고 느끼지 않게 만드는 방법은?

### Q12

Mobile에서 제거해야 할 Desktop 기능은 무엇인가?

### Q13

macOS에서 Native App이기 때문에 반드시 활용해야 할 OS capability는 무엇인가?

### Q14

Quick Capture를 3초 이내로 만드는 최적 Interaction은?

### Q15

XITA가 향후 기능이 3배 늘어나도 UI 복잡도를 거의 그대로 유지하려면 어떤 IA가 필요한가?

---

# 18. 최종 산출물

다음 파일을 생성한다.

```text
research/
├ COMPETITIVE_LANDSCAPE.md
├ UX_PATTERN_LIBRARY.md
├ XITA_GAP_ANALYSIS.md
├ XITA_UI_RECOMMENDATIONS.md
└ references/
   └ screenshots/
```

## COMPETITIVE_LANDSCAPE.md

전체 경쟁/인접 제품 분석.

## UX_PATTERN_LIBRARY.md

제품 이름과 독립된 재사용 가능한 UX Pattern Library.

## XITA_GAP_ANALYSIS.md

현재 XITA Specification 대비:

```text
KEEP
IMPROVE
CONSIDER
AVOID
```

## XITA_UI_RECOMMENDATIONS.md

최종 UI/UX 제안.

반드시 분리:

```text
macOS
Mobile
```

---

# 19. Final Recommendation Rules

최종 제안은 다음 우선순위를 따른다.

```text
1. Zero Complexity for Humans
2. Time to Understand Current
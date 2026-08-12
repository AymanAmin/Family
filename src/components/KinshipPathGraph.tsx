import { useMemo } from 'react'
import '../kinship-path-graph.css'

export type KinshipPathStep = {
  step_no: number
  person_id: string
  full_name: string
  gender: 'male' | 'female' | null
  relation_type: string
  is_inferred: boolean
}

type Props = {
  path: KinshipPathStep[]
  fromPersonId: string
  toPersonId: string
  onOpenPerson: (personId: string) => void
}

type PositionedNode = KinshipPathStep & {
  x: number
  y: number
  generation: number
  index: number
}

type PositionedEdge = {
  from: PositionedNode
  to: PositionedNode
  label: string
  inferred: boolean
  kind: 'same' | 'vertical'
}

const NODE_W = 196
const NODE_H = 86
const ROW_GAP = 154
const COL_GAP = 56
const PAD_X = 52
const PAD_Y = 34

export function kinshipStepLabel(type: string, gender: string | null) {
  if (type === 'self') return 'البداية'
  if (type === 'parent') return gender === 'female' ? 'أم' : gender === 'male' ? 'أب' : 'والد/والدة'
  if (type === 'child') return gender === 'female' ? 'ابنة' : gender === 'male' ? 'ابن' : 'ابن/ابنة'
  if (type === 'sibling') return gender === 'female' ? 'أخت' : gender === 'male' ? 'أخ' : 'أخ/أخت'
  if (type === 'spouse') return gender === 'female' ? 'زوجة' : gender === 'male' ? 'زوج' : 'زوج/زوجة'
  if (type === 'guardian') return 'وصاية'
  return 'صلة'
}

function generationDelta(type: string) {
  if (type === 'parent') return -1
  if (type === 'child') return 1
  return 0
}

function buildLayout(path: KinshipPathStep[]) {
  if (!path.length) return { width: 0, height: 0, nodes: [] as PositionedNode[], edges: [] as PositionedEdge[] }

  const generations: number[] = [0]
  for (let index = 1; index < path.length; index += 1) {
    generations[index] = generations[index - 1] + generationDelta(path[index].relation_type)
  }

  const minGeneration = Math.min(...generations)
  const normalized = generations.map((value) => value - minGeneration)
  const rows = new Map<number, number[]>()
  normalized.forEach((generation, index) => {
    const bucket = rows.get(generation) ?? []
    bucket.push(index)
    rows.set(generation, bucket)
  })

  const maxRowCount = Math.max(...Array.from(rows.values(), (items) => items.length))
  const width = Math.max(620, PAD_X * 2 + maxRowCount * NODE_W + Math.max(0, maxRowCount - 1) * COL_GAP)
  const maxGeneration = Math.max(...normalized)
  const height = PAD_Y * 2 + NODE_H + maxGeneration * ROW_GAP
  const positioned = new Map<number, PositionedNode>()

  rows.forEach((indices, generation) => {
    const rowWidth = indices.length * NODE_W + Math.max(0, indices.length - 1) * COL_GAP
    const start = (width - rowWidth) / 2
    indices.forEach((pathIndex, rowIndex) => {
      // In RTL the earlier path node starts on the right, matching the visual reading direction.
      const visualIndex = indices.length - 1 - rowIndex
      positioned.set(pathIndex, {
        ...path[pathIndex],
        index: pathIndex,
        generation,
        x: start + visualIndex * (NODE_W + COL_GAP),
        y: PAD_Y + generation * ROW_GAP,
      })
    })
  })

  const nodes = path.map((_, index) => positioned.get(index)!).filter(Boolean)
  const edges: PositionedEdge[] = []
  for (let index = 1; index < nodes.length; index += 1) {
    const from = nodes[index - 1]
    const to = nodes[index]
    edges.push({
      from,
      to,
      label: kinshipStepLabel(to.relation_type, to.gender),
      inferred: to.is_inferred,
      kind: from.generation === to.generation ? 'same' : 'vertical',
    })
  }

  return { width, height, nodes, edges }
}

function edgePath(edge: PositionedEdge) {
  const fromX = edge.from.x + NODE_W / 2
  const toX = edge.to.x + NODE_W / 2
  if (edge.kind === 'same') {
    const y = edge.from.y + NODE_H / 2
    return `M ${fromX} ${y} H ${toX}`
  }

  const movingDown = edge.to.y > edge.from.y
  const fromY = movingDown ? edge.from.y + NODE_H : edge.from.y
  const toY = movingDown ? edge.to.y : edge.to.y + NODE_H
  const middleY = (fromY + toY) / 2
  return `M ${fromX} ${fromY} V ${middleY} H ${toX} V ${toY}`
}

function edgeLabelPosition(edge: PositionedEdge) {
  const fromX = edge.from.x + NODE_W / 2
  const toX = edge.to.x + NODE_W / 2
  if (edge.kind === 'same') return { x: (fromX + toX) / 2, y: edge.from.y + NODE_H / 2 }
  const movingDown = edge.to.y > edge.from.y
  const fromY = movingDown ? edge.from.y + NODE_H : edge.from.y
  const toY = movingDown ? edge.to.y : edge.to.y + NODE_H
  return { x: (fromX + toX) / 2, y: (fromY + toY) / 2 }
}

export default function KinshipPathGraph({ path, fromPersonId, toPersonId, onOpenPerson }: Props) {
  const layout = useMemo(() => buildLayout(path), [path])

  if (!path.length) return null

  return <div className="kinship-branch-shell">
    <div className="kinship-branch-hint"><span>↔</span> اسحب المخطط عند الحاجة</div>
    <div className="kinship-branch-scroll">
      <div className="kinship-branch-canvas" style={{ width: layout.width, height: layout.height }}>
        <svg className="kinship-branch-lines" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.edges.map((edge, index) => {
            const pos = edgeLabelPosition(edge)
            const labelWidth = Math.max(64, Math.min(120, edge.label.length * 12 + 26))
            return <g key={`${edge.to.person_id}-${index}`}>
              <path className={`kinship-branch-edge ${edge.to.relation_type === 'spouse' ? 'marriage' : ''}`} d={edgePath(edge)} />
              <rect className="kinship-branch-edge-pill" x={pos.x - labelWidth / 2} y={pos.y - 15} width={labelWidth} height={30} rx={15} />
              <text className="kinship-branch-edge-label" x={pos.x} y={pos.y + 4} textAnchor="middle" direction="rtl">{edge.label}</text>
              {edge.inferred && <text className="kinship-branch-edge-inferred" x={pos.x} y={pos.y + 25} textAnchor="middle" direction="rtl">✦ مستنتج</text>}
            </g>
          })}
        </svg>

        {layout.nodes.map((node) => {
          const isFrom = node.person_id === fromPersonId
          const isTo = node.person_id === toPersonId
          const role = isFrom ? 'البداية' : isTo ? 'النهاية' : 'ضمن المسار'
          return <button
            key={`${node.person_id}-${node.step_no}`}
            type="button"
            className={`kinship-branch-node${isFrom ? ' from' : ''}${isTo ? ' to' : ''}${node.gender === 'female' ? ' female' : ''}`}
            style={{ insetInlineStart: node.x, top: node.y, width: NODE_W, height: NODE_H }}
            onClick={() => onOpenPerson(node.person_id)}
          >
            <span>{node.full_name.trim().charAt(0) || '؟'}</span>
            <strong>{node.full_name}</strong>
            <small>{role}</small>
          </button>
        })}
      </div>
    </div>

    <ol className="kinship-branch-accessible">
      {path.map((step, index) => <li key={`accessible-${step.person_id}-${step.step_no}`}>
        {index === 0 ? step.full_name : `${kinshipStepLabel(step.relation_type, step.gender)}: ${step.full_name}${step.is_inferred ? ' (مستنتج)' : ''}`}
      </li>)}
    </ol>
  </div>
}

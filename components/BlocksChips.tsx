"use client";

type BlockMeta = { index: number; startPage: number; endPage: number; text?: string }
type Props = { blocks: BlockMeta[]; maxInline?: number; onViewAll: () => void; viewAllRef?: React.RefObject<HTMLButtonElement> }

export default function BlocksChips({ blocks, maxInline = 8, onViewAll, viewAllRef }: Props) {
  if (!blocks?.length) return null
  const head = blocks.slice(0, maxInline)
  const extra = blocks.length - head.length
  return (
    <div className="text-xs text-slate-700">
      {head.map((b) => (
        <button
          key={b.index}
          title={`p.${b.startPage}–${b.endPage}`}
          className="mr-2 mb-1 inline-flex items-center rounded-lg border border-slate-300 px-2 py-0.5 hover:bg-slate-50"
          type="button"
        >
          [{b.index}] p.{b.startPage}–{b.endPage}
        </button>
      ))}
      {extra > 0 && (
        <button ref={viewAllRef} onClick={onViewAll} className="underline" type="button">
          … (+{extra} más)
        </button>
      )}
    </div>
  )
}



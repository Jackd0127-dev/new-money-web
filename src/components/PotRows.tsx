import { formatPence } from '../domain/money'
import type { Pot } from '../types/models'

export function PotRows({ pots }: { pots: Pot[] }) {
  return (
    <div className="space-y-3">
      {pots.map((pot) => {
        const target = pot.targetPence ?? 0
        const progress = target > 0 ? Math.min(100, Math.round((pot.balancePence / target) * 100)) : 0

        return (
          <div key={pot.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ backgroundColor: pot.color }} />
                  <p className="truncate text-sm font-semibold text-slate-950">{pot.name}</p>
                </div>
                <p className="mt-1 text-xs capitalize text-slate-500">{pot.type}</p>
              </div>
              <p className="text-right text-base font-semibold text-slate-950">{formatPence(pot.balancePence)}</p>
            </div>
            {target > 0 && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: pot.color }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {progress}% of {formatPence(target)} target
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
